#!/bin/bash

# Production環境デプロイスクリプト
# 使用方法: ./scripts/production/deploy.sh [app-name] [--dry-run] [--skip-tests] [--force]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_DIR"

# オプション初期化
DRY_RUN=false
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
APP_NAME=""
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --force)
            FORCE_DEPLOY=true
            shift
            ;;
        -*)
            echo "❌ 不明なオプション: $1"
            echo "使用方法: $0 [app-name] [--dry-run] [--skip-tests] [--force]"
            exit 1
            ;;
        *)
            APP_NAME="$1"
            shift
            ;;
    esac
done

if [ "$DRY_RUN" = true ]; then
    echo "🧪 ドライランモード: 実際のコマンドは実行されません"
fi

# アプリ名の取得（引数または環境変数から）
APP_NAME=${APP_NAME:-$FLY_APP_NAME}
APP_NAME=${APP_NAME:-"timelogger-bitter-resonance-9585"}

if [ -z "$APP_NAME" ]; then
    log_error "アプリ名を指定してください"
    echo "使用方法: $0 [app-name] [--dry-run] [--skip-tests] [--force]"
    exit 1
fi

echo "🚀 Production環境デプロイを開始します..."
echo "📱 アプリ: $APP_NAME"
echo "🧪 ドライランモード: $DRY_RUN"
echo "🧪 テストスキップ: $SKIP_TESTS"
echo "💪 強制デプロイ: $FORCE_DEPLOY"
echo "🌐 URL: https://$APP_NAME.fly.dev"

# 本番環境デプロイの確認
if [ "$FORCE_DEPLOY" = false ] && [ "$DRY_RUN" = false ]; then
    log_warning "🔒 本番環境へのデプロイを実行します"
    log_warning "この操作は実際のユーザーに影響を与える可能性があります"
    echo ""
    read -p "本番環境にデプロイしますか？ (yes/no): " -r
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        log_error "デプロイを中止しました"
        exit 1
    fi
fi

# 前提条件チェック
if [ "$FORCE_DEPLOY" = false ]; then
    log_info "前提条件チェック中..."
    
    # flyctlコマンドの存在確認
    if ! command -v flyctl &> /dev/null; then
        log_error "flyctl コマンドが見つかりません"
        exit 1
    fi
    
    # ログイン状態確認
    if ! flyctl auth whoami &> /dev/null; then
        log_error "Fly.ioにログインしていません"
        exit 1
    fi
    
    if [ "$DRY_RUN" = false ]; then
        # Gitの状態確認
        if [ -n "$(git status --porcelain)" ]; then
            log_error "未コミットの変更があります"
            git status --short
            exit 1
        fi
        
        # ブランチ確認
        CURRENT_BRANCH=$(git branch --show-current)
        if [ "$CURRENT_BRANCH" != "main" ]; then
            log_error "現在のブランチ: $CURRENT_BRANCH (必須: main)"
            log_error "本番環境はmainブランチからのみデプロイ可能です"
            log_info "正しいブランチに切り替えてください: git checkout main"
            exit 1
        fi
    fi
    
    log_success "前提条件チェック完了"
fi

# 品質チェック（テストスキップ時を除く）
if [ "$SKIP_TESTS" = false ] && [ "$DRY_RUN" = false ]; then
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
    
    # テスト実行（安定版を使用）
    log_info "テスト実行中..."
    if ! npm run test:stable; then
        log_error "テストに失敗しました"
        exit 1
    fi
    
    log_success "品質チェック完了"
else
    log_warning "テストをスキップしています"
fi

# .env.productionファイルの存在確認（シークレット管理機能）
if [ ! -f ".env.production" ]; then
    log_warning ".env.productionファイルが見つかりません"
    log_info "シークレット設定をスキップします"
    SKIP_SECRETS=true
else
    SKIP_SECRETS=false
fi

# シークレットの一括設定（ステージング）
if [ "$SKIP_SECRETS" = false ]; then
    log_info "シークレットをステージング中..."
    while IFS='=' read -r key value; do
        # コメント行と空行をスキップ
        [[ $key =~ ^#.*$ ]] && continue
        [[ -z $key ]] && continue
        
        # シークレットを設定（ステージングのみ）
        if [ "$DRY_RUN" = true ]; then
            echo "  [DRY-RUN] flyctl secrets set \"$key=***\" --app \"$APP_NAME\" --stage"
        else
            flyctl secrets set "$key=$value" --app "$APP_NAME" --stage
        fi
    done < .env.production
    log_success "シークレット設定完了"
fi

# アプリのデプロイ（シークレットも同時に適用される）
log_info "アプリをビルド・デプロイ中（シークレットも適用）..."
if [ "$DRY_RUN" = true ]; then
    echo "  [DRY-RUN] flyctl deploy --app \"$APP_NAME\""
    log_success "ドライランモード: デプロイ完了（実際の実行なし）"
else
    if flyctl deploy --app "$APP_NAME"; then
        log_success "デプロイ成功"
    else
        log_error "デプロイ失敗"
        log_info "ログを確認してください: flyctl logs --app $APP_NAME"
        exit 1
    fi
fi

# デプロイ後確認
if [ "$DRY_RUN" = false ]; then
    log_info "デプロイ後確認中..."
    
    # 起動確認
    log_info "アプリケーション起動確認中..."
    sleep 10
    
    if flyctl status --app "$APP_NAME" | grep -q "started"; then
        log_success "アプリケーションが正常に起動しました"
    else
        log_warning "アプリケーションの起動確認ができませんでした"
    fi
fi

# 完了レポート
echo ""
log_success "🎉 Production環境デプロイ完了！"
echo "=================================="
echo "📱 アプリ: $APP_NAME"
echo "🌐 URL: https://$APP_NAME.fly.dev"
echo "🕐 デプロイ時刻: $(date)"
echo ""
echo "📖 次のステップ:"
echo "• ステータス確認: flyctl status --app $APP_NAME"
echo "• ログ確認: flyctl logs --app $APP_NAME"
echo "• ヘルスチェック: https://$APP_NAME.fly.dev/health"
echo "• Discord Bot動作確認"