#!/bin/bash

# Staging環境検証スクリプト
# 使用方法: ./scripts/staging/validate-staging.sh [--type smoke|full|performance]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_DIR"

STAGING_APP_NAME="timelogger-staging"
STAGING_URL="https://$STAGING_APP_NAME.fly.dev"
TEST_TYPE="full"

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
        --type)
            TEST_TYPE="$2"
            shift 2
            ;;
        *)
            echo "❌ 不明なオプション: $1"
            echo "使用方法: $0 [--type smoke|full|performance]"
            exit 1
            ;;
    esac
done

log_info "🔍 Staging環境検証を開始します..."
echo "📱 アプリ: $STAGING_APP_NAME"
echo "🌍 URL: $STAGING_URL"
echo "🧪 テストタイプ: $TEST_TYPE"

# 検証結果レポート初期化
REPORT_FILE="/tmp/staging-validation-$(date +%s).md"
echo "# Staging環境検証レポート" > "$REPORT_FILE"
echo "=========================" >> "$REPORT_FILE"
echo "🕐 検証時刻: $(date)" >> "$REPORT_FILE"
echo "🌍 環境URL: $STAGING_URL" >> "$REPORT_FILE"
echo "🧪 テストタイプ: $TEST_TYPE" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

VALIDATION_SUCCESS=true

# 1. 基本ヘルスチェック
log_info "基本ヘルスチェック実行中..."
if curl -f -s "$STAGING_URL/health" > /dev/null; then
    log_success "ヘルスチェック成功"
    echo "✅ ヘルスチェック: 成功" >> "$REPORT_FILE"
else
    log_error "ヘルスチェック失敗"
    echo "❌ ヘルスチェック: 失敗" >> "$REPORT_FILE"
    VALIDATION_SUCCESS=false
fi

# 2. アプリケーション詳細ステータス
log_info "アプリケーションステータス確認中..."
APP_STATUS=$(flyctl status --app "$STAGING_APP_NAME" 2>/dev/null || echo "ERROR")
if echo "$APP_STATUS" | grep -q "started"; then
    log_success "アプリケーション稼働中"
    echo "✅ アプリケーションステータス: 稼働中" >> "$REPORT_FILE"
else
    log_error "アプリケーションが稼働していません"
    echo "❌ アプリケーションステータス: 停止/エラー" >> "$REPORT_FILE"
    VALIDATION_SUCCESS=false
fi

# 3. 煙幕テスト（基本機能）
if [ "$TEST_TYPE" = "smoke" ] || [ "$TEST_TYPE" = "full" ]; then
    log_info "煙幕テスト実行中..."
    
    # API疎通確認
    API_ENDPOINTS=("/health")
    for endpoint in "${API_ENDPOINTS[@]}"; do
        log_info "テスト中: $endpoint"
        if curl -f -s "$STAGING_URL$endpoint" > /dev/null; then
            log_success "$endpoint: 成功"
            echo "✅ API疎通 ($endpoint): 成功" >> "$REPORT_FILE"
        else
            log_error "$endpoint: 失敗"
            echo "❌ API疎通 ($endpoint): 失敗" >> "$REPORT_FILE"
            VALIDATION_SUCCESS=false
        fi
    done
fi

# 4. パフォーマンステスト
if [ "$TEST_TYPE" = "performance" ] || [ "$TEST_TYPE" = "full" ]; then
    log_info "パフォーマンステスト実行中..."
    
    # 応答時間測定
    RESPONSE_TIME=$(curl -w "%{time_total}" -s -o /dev/null "$STAGING_URL/health")
    log_info "応答時間: ${RESPONSE_TIME}秒"
    echo "📊 ヘルスチェック応答時間: ${RESPONSE_TIME}秒" >> "$REPORT_FILE"
    
    # 応答時間判定（2秒以内）
    if (( $(echo "$RESPONSE_TIME <= 2.0" | bc -l) )); then
        log_success "パフォーマンステスト成功"
        echo "✅ パフォーマンス: 合格 (${RESPONSE_TIME}s <= 2.0s)" >> "$REPORT_FILE"
    else
        log_error "パフォーマンステスト失敗（応答時間: ${RESPONSE_TIME}秒）"
        echo "❌ パフォーマンス: 不合格 (${RESPONSE_TIME}s > 2.0s)" >> "$REPORT_FILE"
        VALIDATION_SUCCESS=false
    fi
fi

# 5. ログ確認
log_info "最新ログ確認中..."
RECENT_LOGS=$(flyctl logs --app "$STAGING_APP_NAME" -n 50 2>/dev/null || echo "ログ取得失敗")
ERROR_COUNT=$(echo "$RECENT_LOGS" | grep -i "error\|exception\|fail" | wc -l || echo "0")

log_info "最近のエラーログ数: $ERROR_COUNT"
echo "📝 最近のエラーログ数: $ERROR_COUNT" >> "$REPORT_FILE"

if [ "$ERROR_COUNT" -gt 5 ]; then
    log_warning "エラーログが多すぎます"
    echo "⚠️ エラーログ警告: 多数のエラーが検出されました" >> "$REPORT_FILE"
    VALIDATION_SUCCESS=false
fi

# 6. 検証結果サマリー
echo "" >> "$REPORT_FILE"
echo "## 検証結果サマリー" >> "$REPORT_FILE"
echo "==================" >> "$REPORT_FILE"

if [ "$VALIDATION_SUCCESS" = true ]; then
    echo "✅ 全体結果: 成功" >> "$REPORT_FILE"
    echo "💡 本番デプロイ準備完了" >> "$REPORT_FILE"
    echo ""
    log_success "🎉 Staging環境検証成功！"
    echo "========================"
    echo "✅ すべての検証項目が合格しました"
    echo "💡 本番環境へのデプロイ準備完了です"
    echo ""
    echo "📋 検証レポート: $REPORT_FILE"
    log_info "📖 次のステップ: mainブランチマージ → 本番デプロイ"
    
    exit 0
else
    echo "❌ 全体結果: 失敗" >> "$REPORT_FILE"
    echo "⚠️ 問題を修正してから再検証してください" >> "$REPORT_FILE"
    echo ""
    log_error "❌ Staging環境検証失敗"
    echo "====================="
    echo "⚠️ 一部の検証項目が失敗しました"
    echo "🔧 問題を修正してから再度検証してください"
    echo ""
    echo "📋 検証レポート: $REPORT_FILE"
    log_info "📝 ログ確認: flyctl logs --app $STAGING_APP_NAME"
    
    exit 1
fi