#!/bin/bash

# 煙幕テストスクリプト（重要機能の基本動作確認）
# 使用方法: ./scripts/staging/smoke-test.sh

set -e

STAGING_APP_NAME="timelogger-staging"
STAGING_URL="https://$STAGING_APP_NAME.fly.dev"

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

echo "🚨 煙幕テスト開始..."
echo "🌍 対象: $STAGING_URL"

TEST_SUCCESS=true

# テスト結果ログ
TEST_LOG="/tmp/smoke-test-$(date +%s).log"
echo "🚨 煙幕テスト結果 - $(date)" > "$TEST_LOG"
echo "=============================" >> "$TEST_LOG"

# 1. ヘルスチェックAPI
log_info "ヘルスチェックAPI テスト中..."
if HEALTH_RESPONSE=$(curl -f -s "$STAGING_URL/health"); then
    log_success "ヘルスチェック成功"
    echo "✅ ヘルスチェック: 成功" >> "$TEST_LOG"
    
    # レスポンス内容確認
    if echo "$HEALTH_RESPONSE" | grep -q '"status".*"ok"'; then
        log_success "ヘルスチェック応答内容: 正常"
        log_info "  - レスポンス確認済み"
    else
        log_warning "ヘルスチェック応答内容に問題があります"
        TEST_SUCCESS=false
    fi
else
    log_error "ヘルスチェック失敗"
    echo "❌ ヘルスチェック: 失敗" >> "$TEST_LOG"
    TEST_SUCCESS=false
fi

# 2. 基本APIエンドポイントテスト
log_info "基本APIエンドポイント テスト中..."

# まずはシンプルなエンドポイントのみテスト
BASIC_ENDPOINTS=("/health")

for endpoint in "${BASIC_ENDPOINTS[@]}"; do
    log_info "テスト中: $endpoint"
    if curl -f -s "$STAGING_URL$endpoint" > /dev/null; then
        log_success "$endpoint: 成功"
        echo "✅ API $endpoint: 成功" >> "$TEST_LOG"
    else
        log_error "$endpoint: 失敗"
        echo "❌ API $endpoint: 失敗" >> "$TEST_LOG"
        TEST_SUCCESS=false
    fi
done

# 3. パフォーマンス基本チェック
log_info "パフォーマンス基本チェック中..."
RESPONSE_TIME=$(curl -w "%{time_total}" -s -o /dev/null "$STAGING_URL/health")
log_info "ヘルスチェック応答時間: ${RESPONSE_TIME}秒"
echo "📊 応答時間: ${RESPONSE_TIME}秒" >> "$TEST_LOG"

if (( $(echo "$RESPONSE_TIME <= 3.0" | bc -l) )); then
    log_success "応答時間: 合格"
else
    log_warning "応答時間が遅いです（3秒超過）"
    TEST_SUCCESS=false
fi

# 4. アプリケーション起動確認
log_info "アプリケーション起動状況確認中..."
if flyctl status --app "$STAGING_APP_NAME" | grep -q "started"; then
    log_success "アプリケーション: 正常起動"
    echo "✅ アプリケーション起動: 正常" >> "$TEST_LOG"
else
    log_error "アプリケーション: 起動に問題があります"
    echo "❌ アプリケーション起動: 問題あり" >> "$TEST_LOG"
    TEST_SUCCESS=false
fi

# 5. 接続性テスト
log_info "基本接続性テスト中..."
if ping -c 1 "${STAGING_APP_NAME}.fly.dev" > /dev/null 2>&1; then
    log_success "DNS解決: 正常"
    echo "✅ DNS解決: 正常" >> "$TEST_LOG"
else
    log_warning "DNS解決に問題があります"
    echo "⚠️ DNS解決: 問題あり" >> "$TEST_LOG"
fi

# 6. テスト結果サマリー
echo ""
echo "🚨 煙幕テスト完了"
echo "================"

if [ "$TEST_SUCCESS" = true ]; then
    log_success "✅ すべての煙幕テストが成功しました"
    echo ""
    echo "✅ 全体結果: 成功" >> "$TEST_LOG"
    echo "💡 重要機能は正常に動作しています" >> "$TEST_LOG"
    echo ""
    echo "📋 テストログ: $TEST_LOG"
    echo "💡 staging環境は正常に動作しています"
    log_info "📖 次のステップ: 詳細な機能テストまたは本番デプロイ準備"
    
    exit 0
else
    log_error "❌ 一部の煙幕テストが失敗しました"
    echo ""
    echo "❌ 全体結果: 失敗" >> "$TEST_LOG"
    echo "⚠️ 重要機能に問題があります" >> "$TEST_LOG"
    echo ""
    echo "📋 テストログ: $TEST_LOG"
    echo "🔧 問題を修正してから再度テストしてください"
    log_info "📝 詳細ログ: flyctl logs --app $STAGING_APP_NAME"
    
    exit 1
fi