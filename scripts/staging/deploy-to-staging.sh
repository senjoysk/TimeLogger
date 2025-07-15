#!/bin/bash

# Staging環境デプロイスクリプト
# 使用方法: ./scripts/staging/deploy-to-staging.sh [--skip-tests] [--force]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_DIR"

STAGING_APP_NAME="timelogger-staging"
SKIP_TESTS=false
FORCE_DEPLOY=false

# カラー定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 引数解析
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --force)
            FORCE_DEPLOY=true
            shift
            ;;
        *)
            echo "❌ 不明なオプション: $1"
            echo "使用方法: $0 [--skip-tests] [--force]"
            exit 1
            ;;
    esac
done

echo "🚀 Staging環境デプロイを開始します..."
echo "📱 アプリ: $STAGING_APP_NAME"
echo "🧪 テストスキップ: $SKIP_TESTS"
echo "💪 強制デプロイ: $FORCE_DEPLOY"

# 1. 前提条件チェック
if [ "$FORCE_DEPLOY" = false ]; then
    log_info "前提条件チェック中..."
    
    # flyctl確認
    if ! command -v flyctl &> /dev/null; then
        log_error "flyctl コマンドが見つかりません"
        exit 1
    fi
    
    # ログイン確認
    if ! flyctl auth whoami &> /dev/null; then
        log_error "Fly.ioにログインしていません"
        exit 1
    fi
    
    # Gitの状態確認
    if [ -n "$(git status --porcelain)" ]; then
        log_warning "未コミットの変更があります"
        git status --short
        
        read -p "続行しますか？ (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_error "デプロイを中止しました"
            exit 1
        fi
    fi
    
    # ブランチ確認
    CURRENT_BRANCH=$(git branch --show-current)
    if [ "$CURRENT_BRANCH" != "develop" ] && [ "$FORCE_DEPLOY" = false ]; then
        log_warning "現在のブランチ: $CURRENT_BRANCH (推奨: develop)"
        read -p "続行しますか？ (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_error "デプロイを中止しました"
            exit 1
        fi
    fi
fi

# 2. 品質チェック（テストスキップ時を除く）
if [ "$SKIP_TESTS" = false ]; then
    log_info "品質チェック実行中..."
    
    # 依存関係インストール
    log_info "依存関係確認中..."
    npm ci
    
    # TypeScriptビルド
    log_info "TypeScriptビルド中..."
    if ! npm run build; then
        log_error "TypeScriptビルドに失敗しました"
        exit 1
    fi
    
    # テスト実行
    log_info "テスト実行中..."
    if ! npm test; then
        log_error "テストに失敗しました"
        exit 1
    fi
    
    # 統合テスト
    log_info "統合テスト実行中..."
    if ! npm run test:integration; then
        log_error "統合テストに失敗しました"
        exit 1
    fi
    
    log_success "品質チェック完了"
else
    log_warning "テストをスキップしています"
fi

# 3. アプリ・マシン状態確認・自動復旧
log_info "アプリ・マシン状態確認・自動復旧中..."

# まずアプリ自体がsuspended状態でないか確認
APP_STATUS=$(flyctl apps list --json 2>/dev/null | jq -r '.[] | select(.Name == "'$STAGING_APP_NAME'") | .Status' 2>/dev/null || echo "unknown")
log_info "アプリ状態: $APP_STATUS"

if [[ "$APP_STATUS" == "suspended" ]]; then
    log_warning "アプリが suspended 状態です。復旧中..."
    if flyctl apps resume "$STAGING_APP_NAME"; then
        log_success "アプリが復旧しました"
        # アプリ復旧後の待機時間
        log_info "アプリ復旧完了を待機中..."
        sleep 10
    else
        log_error "アプリの復旧に失敗しました"
        exit 1
    fi
elif [[ "$APP_STATUS" == "deployed" ]]; then
    log_info "アプリは正常に動作中です"
else
    log_warning "アプリ状態の確認に失敗しました (状態: $APP_STATUS)"
fi

# マシンレベルの状態確認・起動
log_info "マシン状態確認中..."

# jqの存在確認
if ! command -v jq &> /dev/null; then
    log_warning "jq が見つかりません。簡易的なマシン起動処理を実行します"
    
    # 簡易的なマシン起動
    if flyctl machines list --app "$STAGING_APP_NAME" | grep -q "stopped"; then
        log_warning "停止中のマシンを検出しました。全マシンを起動します..."
        flyctl machines start --app "$STAGING_APP_NAME" || log_warning "一部のマシンの起動に失敗しました"
        
        # 起動完了待機
        log_info "マシン起動完了を待機中..."
        sleep 20
    else
        log_info "すべてのマシンが実行中です"
    fi
else
    # jqが利用可能な場合の詳細処理
    MACHINES=$(flyctl machines list --app "$STAGING_APP_NAME" --json 2>/dev/null || echo "[]")
    
    if [[ "$MACHINES" != "[]" ]] && [[ "$MACHINES" != "" ]]; then
        STOPPED_MACHINES=$(echo "$MACHINES" | jq -r '.[] | select(.state == "stopped") | .id' 2>/dev/null || echo "")
        
        if [[ -n "$STOPPED_MACHINES" ]]; then
            log_warning "停止中のマシンを検出しました"
            echo "$STOPPED_MACHINES" | while read -r machine_id; do
                if [[ -n "$machine_id" ]]; then
                    log_info "マシン $machine_id を起動中..."
                    if flyctl machine start "$machine_id" --app "$STAGING_APP_NAME"; then
                        log_success "マシン $machine_id が起動しました"
                    else
                        log_error "マシン $machine_id の起動に失敗しました"
                    fi
                fi
            done
            
            # 起動完了待機（より長い待機時間）
            log_info "マシン起動完了を待機中..."
            sleep 30
            
            # 起動状態の確認
            log_info "マシン起動状態の確認中..."
            for i in {1..6}; do
                if flyctl status --app "$STAGING_APP_NAME" | grep -q "started"; then
                    log_success "マシンが正常に起動しました"
                    break
                fi
                if [ $i -eq 6 ]; then
                    log_warning "マシンの起動確認に失敗しました（続行します）"
                fi
                log_info "起動確認中... ($i/6)"
                sleep 10
            done
        else
            log_info "すべてのマシンが実行中です"
        fi
    else
        log_warning "マシン情報の取得に失敗しました（アプリ復旧直後のため正常な可能性があります）"
    fi
fi

# 最終ステータス確認
log_info "デプロイ前最終ステータス確認中..."
flyctl status --app "$STAGING_APP_NAME" || log_warning "ステータス確認に失敗しました"

# 4. デプロイ実行
log_info "Staging環境デプロイ実行中..."

if flyctl deploy --app "$STAGING_APP_NAME" --config fly-staging.toml; then
    log_success "デプロイ成功"
else
    log_error "デプロイ失敗"
    
    # デプロイ失敗時の詳細診断
    log_info "デプロイ失敗の詳細診断を実行中..."
    echo "=== App Status ==="
    flyctl status --app "$STAGING_APP_NAME" || echo "Status取得失敗"
    echo "=== Machines List ==="
    flyctl machines list --app "$STAGING_APP_NAME" || echo "Machines一覧取得失敗"
    echo "=== Recent Logs ==="
    flyctl logs --app "$STAGING_APP_NAME" --limit 50 || echo "ログ取得失敗"
    
    # 再度マシンが停止していないか確認
    if flyctl machines list --app "$STAGING_APP_NAME" | grep -q "stopped"; then
        log_warning "デプロイ後にマシンが停止状態になっています。再起動を試みます..."
        flyctl machines start --app "$STAGING_APP_NAME" || true
        sleep 10
        
        # 再デプロイを試行
        log_info "マシン再起動後、デプロイを再試行中..."
        if flyctl deploy --app "$STAGING_APP_NAME" --config fly-staging.toml; then
            log_success "再デプロイ成功"
        else
            log_error "再デプロイも失敗しました"
            exit 1
        fi
    else
        log_info "詳細確認は上記のログを参照してください"
        exit 1
    fi
fi

# 5. デプロイ後確認
log_info "デプロイ後確認中..."

# アプリケーション起動待機
log_info "アプリケーション起動待機中..."
for i in {1..12}; do
    if flyctl status --app "$STAGING_APP_NAME" | grep -q "started"; then
        log_success "アプリケーションが起動しました"
        break
    fi
    if [ $i -eq 12 ]; then
        log_error "アプリケーションの起動に失敗しました"
        flyctl logs --app "$STAGING_APP_NAME"
        exit 1
    fi
    log_info "起動確認中... ($i/12)"
    sleep 10
done

# ヘルスチェック
log_info "ヘルスチェック実行中..."
STAGING_URL="https://$STAGING_APP_NAME.fly.dev"
for i in {1..6}; do
    if curl -f -s "$STAGING_URL/health" > /dev/null; then
        log_success "ヘルスチェック成功"
        break
    fi
    if [ $i -eq 6 ]; then
        log_error "ヘルスチェック失敗"
        flyctl logs --app "$STAGING_APP_NAME"
        exit 1
    fi
    log_info "ヘルスチェック中... ($i/6)"
    sleep 5
done

# 6. デプロイ完了レポート
echo ""
log_success "🎉 Staging環境デプロイ完了！"
echo "=============================="
echo "📱 アプリ: $STAGING_APP_NAME"
echo "🌍 URL: $STAGING_URL"
echo "🕐 デプロイ時刻: $(date)"
echo "🌿 ブランチ: $CURRENT_BRANCH"
echo "📝 コミット: $(git rev-parse --short HEAD)"
echo ""
log_info "📖 次のステップ:"
echo "1. npm run staging:test で動作確認"
echo "2. npm run staging:smoke で煙幕テスト"
echo "3. 手動で重要機能の動作確認"
echo "4. 問題なければmainブランチへマージ"