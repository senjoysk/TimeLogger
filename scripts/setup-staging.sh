#!/bin/bash

# Staging環境セットアップスクリプト
# Usage: ./scripts/setup-staging.sh

set -e  # エラー時に停止

# カラー定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ログ関数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 必要コマンドの確認
check_requirements() {
    log_info "必要なコマンドをチェックしています..."
    
    if ! command -v flyctl &> /dev/null; then
        log_error "flyctl コマンドが見つかりません"
        log_info "https://fly.io/docs/hands-on/install-flyctl/ からインストールしてください"
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        log_error "npm コマンドが見つかりません"
        exit 1
    fi
    
    log_success "必要なコマンドが揃っています"
}

# Fly.io認証確認
check_fly_auth() {
    log_info "Fly.io認証状況を確認しています..."
    
    if ! flyctl auth whoami &> /dev/null; then
        log_warning "Fly.ioにログインしていません"
        log_info "Fly.ioにログインしてください:"
        flyctl auth login
    else
        local user=$(flyctl auth whoami)
        log_success "Fly.ioにログイン済み: $user"
    fi
}

# Staging アプリケーション作成
create_staging_app() {
    log_info "Staging アプリケーションを作成しています..."
    
    local app_name="timelogger-staging"
    
    # アプリが既に存在するかチェック
    if flyctl apps list | grep -q "$app_name"; then
        log_warning "アプリ '$app_name' は既に存在します"
        return 0
    fi
    
    # アプリ作成
    flyctl apps create "$app_name" --org personal
    log_success "Staging アプリケーション '$app_name' を作成しました"
}

# ボリューム作成
create_volume() {
    log_info "Staging用データボリュームを作成しています..."
    
    local app_name="timelogger-staging"
    local volume_name="timelogger_staging_data"
    
    # ボリュームが既に存在するかチェック
    if flyctl volumes list --app "$app_name" | grep -q "$volume_name"; then
        log_warning "ボリューム '$volume_name' は既に存在します"
        return 0
    fi
    
    # ボリューム作成
    flyctl volumes create "$volume_name" --size 1 --app "$app_name" --region nrt --yes
    log_success "データボリューム '$volume_name' を作成しました"
}

# 環境変数ファイル準備
setup_env_file() {
    log_info "環境変数ファイルを準備しています..."
    
    if [ ! -f ".env.staging" ]; then
        if [ -f ".env.staging.example" ]; then
            cp .env.staging.example .env.staging
            log_success ".env.staging ファイルを作成しました"
            log_warning "⚠️  .env.staging ファイルを編集してトークンを設定してください:"
            log_info "   - DISCORD_TOKEN (Staging用Discord Bot Token)"
            log_info "   - DISCORD_CLIENT_ID (Staging用Discord Client ID)"
            log_info "   - GOOGLE_API_KEY (Google Gemini API Key)"
        else
            log_error ".env.staging.example ファイルが見つかりません"
            exit 1
        fi
    else
        log_success ".env.staging ファイルは既に存在します"
    fi
}

# シークレット設定確認
check_secrets() {
    log_info "必要なシークレットを確認しています..."
    
    local app_name="timelogger-staging"
    local required_secrets=("DISCORD_TOKEN" "GOOGLE_API_KEY" "DISCORD_CLIENT_ID")
    local missing_secrets=()
    
    for secret in "${required_secrets[@]}"; do
        if ! flyctl secrets list --app "$app_name" | grep -q "$secret"; then
            missing_secrets+=("$secret")
        fi
    done
    
    if [ ${#missing_secrets[@]} -eq 0 ]; then
        log_success "すべての必要なシークレットが設定されています"
    else
        log_warning "以下のシークレットが不足しています:"
        for secret in "${missing_secrets[@]}"; do
            log_warning "  - $secret"
        done
        log_info "シークレットを設定してください:"
        log_info "  flyctl secrets set --app $app_name DISCORD_TOKEN=xxx"
        log_info "  flyctl secrets set --app $app_name GOOGLE_API_KEY=xxx"
        log_info "  flyctl secrets set --app $app_name DISCORD_CLIENT_ID=xxx"
    fi
}

# 初回デプロイ
initial_deploy() {
    log_info "初回デプロイを実行しますか？ (y/N)"
    read -r response
    
    if [[ "$response" =~ ^[Yy]$ ]]; then
        log_info "Staging環境に初回デプロイを実行しています..."
        
        if [ -f "fly-staging.toml" ]; then
            flyctl deploy --app timelogger-staging --config fly-staging.toml
            log_success "初回デプロイが完了しました"
        else
            log_error "fly-staging.toml ファイルが見つかりません"
            exit 1
        fi
    else
        log_info "初回デプロイをスキップしました"
        log_info "後でデプロイする場合は以下のコマンドを実行してください:"
        log_info "  npm run staging:deploy"
    fi
}

# ヘルスチェック
health_check() {
    if [[ "$1" == "skip_deploy" ]]; then
        return 0
    fi
    
    log_info "Staging環境のヘルスチェックを実行しています..."
    
    local app_name="timelogger-staging"
    local staging_url="https://$app_name.fly.dev"
    
    # アプリの起動を待機
    for i in {1..6}; do
        if flyctl status --app "$app_name" | grep -q "started"; then
            log_success "アプリが正常に起動しています"
            break
        fi
        
        if [ $i -eq 6 ]; then
            log_warning "アプリの起動確認に時間がかかっています"
            return 0
        fi
        
        log_info "起動確認中... ($i/6)"
        sleep 10
    done
    
    # ヘルスチェックエンドポイント確認
    for i in {1..3}; do
        if curl -f -s "$staging_url/health" > /dev/null 2>&1; then
            log_success "ヘルスチェック成功: $staging_url/health"
            break
        fi
        
        if [ $i -eq 3 ]; then
            log_warning "ヘルスチェックエンドポイントに接続できません"
            log_info "手動で確認してください: $staging_url/health"
        fi
        
        sleep 5
    done
}

# セットアップ完了報告
setup_complete() {
    log_success "🎉 Staging環境のセットアップが完了しました！"
    echo ""
    log_info "📖 次のステップ:"
    log_info "1. 🔐 .env.staging ファイルでトークンを設定"
    log_info "2. 🔑 Fly.ioシークレットを設定"
    log_info "   flyctl secrets set --app timelogger-staging DISCORD_TOKEN=xxx"
    log_info "   flyctl secrets set --app timelogger-staging GOOGLE_API_KEY=xxx"
    log_info "3. 🚀 デプロイ実行"
    log_info "   npm run staging:deploy"
    log_info "4. 🧪 動作確認"
    log_info "   https://timelogger-staging.fly.dev/health"
    echo ""
    log_info "📊 便利なコマンド:"
    log_info "  npm run staging:status   - ステータス確認"
    log_info "  npm run staging:logs     - ログ確認"
    log_info "  npm run staging:test     - テスト実行"
}

# メイン処理
main() {
    echo "🚀 TimeLogger Staging環境セットアップ"
    echo "======================================="
    echo ""
    
    check_requirements
    check_fly_auth
    create_staging_app
    create_volume
    setup_env_file
    check_secrets
    
    # 初回デプロイはオプション
    if [[ "$1" != "--no-deploy" ]]; then
        initial_deploy
        
        if [[ "$?" -eq 0 ]]; then
            health_check
        else
            health_check "skip_deploy"
        fi
    fi
    
    setup_complete
}

# スクリプト実行
main "$@"