# 運用スクリプト詳細設計

## 📋 概要

staging環境導入に伴う運用スクリプトの詳細設計。開発効率とシステム品質を両立する自動化スクリプト群を構築する。

## 🗂️ スクリプト構成

### 新規追加スクリプト構成
```
scripts/staging/
├── setup-staging.sh                 # Staging環境初期セットアップ
├── deploy-to-staging.sh             # Staging環境デプロイ
├── validate-staging.sh              # Staging環境検証
├── smoke-test.sh                    # 煙幕テスト
├── generate-test-data.js            # テストデータ生成
├── clone-production-data.sh         # 本番データクローン
├── pre-production-check.sh          # 本番デプロイ前チェック
└── cleanup-staging.sh               # Staging環境クリーンアップ
```

## 📝 スクリプト詳細設計

### 1. setup-staging.sh
```bash
#!/bin/bash

# Staging環境初期セットアップスクリプト
# 使用方法: ./scripts/staging/setup-staging.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_DIR"

STAGING_APP_NAME="timelogger-staging"
STAGING_REGION="nrt"

echo "🚀 Staging環境初期セットアップを開始します..."

# 1. 前提条件チェック
echo "🔍 前提条件をチェック中..."

# flyctlコマンドの存在確認
if ! command -v fly &> /dev/null; then
    echo "❌ エラー: flyctlコマンドが見つかりません"
    echo "📝 https://fly.io/docs/hands-on/install-flyctl/ からインストールしてください"
    exit 1
fi

# ログイン状態確認
if ! fly auth whoami &> /dev/null; then
    echo "❌ エラー: Fly.ioにログインしていません"
    echo "📝 'fly auth login' を実行してください"
    exit 1
fi

# 設定ファイル存在確認
if [ ! -f "fly-staging.toml" ]; then
    echo "❌ エラー: fly-staging.tomlが見つかりません"
    echo "📝 note/fly-io-configuration-design.md を参考に作成してください"
    exit 1
fi

echo "✅ 前提条件チェック完了"

# 2. Staging用Discordアプリケーション確認
echo "🤖 Discord Bot設定確認中..."

if [ ! -f ".env.staging" ]; then
    echo "⚠️ .env.stagingファイルが見つかりません"
    echo "📝 .env.staging.exampleをコピーして設定してください"
    
    if [ -f ".env.staging.example" ]; then
        cp .env.staging.example .env.staging
        echo "✅ .env.staging.exampleを.env.stagingにコピーしました"
        echo "📝 必要な環境変数を設定してください"
    else
        echo "❌ .env.staging.exampleも見つかりません"
        exit 1
    fi
fi

# 3. Fly.ioアプリケーション作成
echo "🛩️ Fly.ioアプリケーション作成中..."

if fly apps list | grep -q "$STAGING_APP_NAME"; then
    echo "✅ アプリ '$STAGING_APP_NAME' は既に存在します"
else
    echo "📱 新しいアプリ '$STAGING_APP_NAME' を作成中..."
    fly apps create "$STAGING_APP_NAME" --org personal
    echo "✅ アプリ作成完了"
fi

# 4. ボリューム作成
echo "💾 データボリューム作成中..."

VOLUME_NAME="timelogger_staging_data"
if fly volumes list --app "$STAGING_APP_NAME" | grep -q "$VOLUME_NAME"; then
    echo "✅ ボリューム '$VOLUME_NAME' は既に存在します"
else
    echo "💾 新しいボリューム '$VOLUME_NAME' を作成中..."
    fly volumes create "$VOLUME_NAME" \
        --region "$STAGING_REGION" \
        --size 1 \
        --app "$STAGING_APP_NAME"
    echo "✅ ボリューム作成完了"
fi

# 5. 環境変数・シークレット設定
echo "🔐 環境変数・シークレット設定中..."

if [ -f ".env.staging" ]; then
    echo "📝 .env.stagingから環境変数を設定中..."
    
    # 重要なシークレットのみ個別設定
    IMPORTANT_SECRETS=("DISCORD_TOKEN" "GEMINI_API_KEY" "INTERNAL_API_KEY")
    
    for secret in "${IMPORTANT_SECRETS[@]}"; do
        value=$(grep "^$secret=" .env.staging | cut -d'=' -f2- | tr -d '"' || echo "")
        if [ -n "$value" ] && [ "$value" != "your_${secret,,}_here" ]; then
            echo "🔐 設定中: $secret"
            fly secrets set "$secret=$value" --app "$STAGING_APP_NAME" --stage
        else
            echo "⚠️ 未設定: $secret (.env.stagingで設定してください)"
        fi
    done
    
    echo "✅ 重要なシークレット設定完了"
else
    echo "⚠️ .env.stagingが見つかりません。手動でシークレットを設定してください"
fi

# 6. 初回デプロイ
echo "🚀 初回デプロイ実行中..."

if fly deploy --app "$STAGING_APP_NAME" --config fly-staging.toml; then
    echo "✅ 初回デプロイ成功"
else
    echo "❌ 初回デプロイ失敗"
    echo "📝 ログを確認してください: fly logs --app $STAGING_APP_NAME"
    exit 1
fi

# 7. 初期データセットアップ
echo "📊 初期テストデータ生成中..."

if [ -f "scripts/staging/generate-test-data.js" ]; then
    node scripts/staging/generate-test-data.js
    echo "✅ テストデータ生成完了"
else
    echo "⚠️ テストデータ生成スクリプトが見つかりません"
fi

# 8. 動作確認
echo "🔍 Staging環境動作確認中..."

STAGING_URL="https://$STAGING_APP_NAME.fly.dev"
for i in {1..6}; do
    if curl -f -s "$STAGING_URL/health" > /dev/null; then
        echo "✅ Staging環境が正常に稼働しています"
        break
    fi
    if [ $i -eq 6 ]; then
        echo "❌ Staging環境の動作確認に失敗しました"
        echo "📝 ログを確認してください: fly logs --app $STAGING_APP_NAME"
        exit 1
    fi
    echo "⏳ 起動確認中... ($i/6)"
    sleep 10
done

# 9. セットアップ完了レポート
echo ""
echo "🎉 Staging環境セットアップ完了！"
echo "=================================="
echo "📱 アプリ名: $STAGING_APP_NAME"
echo "🌍 URL: $STAGING_URL"
echo "💾 ボリューム: $VOLUME_NAME"
echo "📋 ステータス確認: fly status --app $STAGING_APP_NAME"
echo "📝 ログ確認: fly logs --app $STAGING_APP_NAME"
echo ""
echo "📖 次のステップ:"
echo "1. .env.stagingの環境変数を確認・設定"
echo "2. Discord Bot設定の確認"
echo "3. npm run staging:test でテスト実行"
echo "4. npm run staging:smoke で煙幕テスト実行"
```

### 2. deploy-to-staging.sh
```bash
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
    echo "🔍 前提条件チェック中..."
    
    # Gitの状態確認
    if [ -n "$(git status --porcelain)" ]; then
        echo "⚠️ 未コミットの変更があります"
        git status --short
        
        if [ "$FORCE_DEPLOY" = false ]; then
            read -p "続行しますか？ (y/N): " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                echo "❌ デプロイを中止しました"
                exit 1
            fi
        fi
    fi
    
    # ブランチ確認
    CURRENT_BRANCH=$(git branch --show-current)
    if [ "$CURRENT_BRANCH" != "develop" ] && [ "$FORCE_DEPLOY" = false ]; then
        echo "⚠️ 現在のブランチ: $CURRENT_BRANCH (推奨: develop)"
        read -p "続行しますか？ (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "❌ デプロイを中止しました"
            exit 1
        fi
    fi
fi

# 2. 品質チェック（テストスキップ時を除く）
if [ "$SKIP_TESTS" = false ]; then
    echo "🧪 品質チェック実行中..."
    
    # 依存関係インストール
    echo "📦 依存関係確認中..."
    npm ci
    
    # TypeScriptビルド
    echo "🏗️ TypeScriptビルド中..."
    if ! npm run build; then
        echo "❌ TypeScriptビルドに失敗しました"
        exit 1
    fi
    
    # テスト実行
    echo "🧪 テスト実行中..."
    if ! npm test; then
        echo "❌ テストに失敗しました"
        exit 1
    fi
    
    # 統合テスト
    echo "🔗 統合テスト実行中..."
    if ! npm run test:integration; then
        echo "❌ 統合テストに失敗しました"
        exit 1
    fi
    
    echo "✅ 品質チェック完了"
else
    echo "⚠️ テストをスキップしています"
fi

# 3. デプロイ前ステータス確認
echo "📊 デプロイ前ステータス確認中..."
fly status --app "$STAGING_APP_NAME" || echo "⚠️ アプリがまだ存在しないか、停止しています"

# 4. デプロイ実行
echo "🚀 Staging環境デプロイ実行中..."

if fly deploy --app "$STAGING_APP_NAME" --config fly-staging.toml; then
    echo "✅ デプロイ成功"
else
    echo "❌ デプロイ失敗"
    echo "📝 ログを確認してください: fly logs --app $STAGING_APP_NAME"
    exit 1
fi

# 5. デプロイ後確認
echo "🔍 デプロイ後確認中..."

# アプリケーション起動待機
echo "⏳ アプリケーション起動待機中..."
for i in {1..12}; do
    if fly status --app "$STAGING_APP_NAME" | grep -q "started"; then
        echo "✅ アプリケーションが起動しました"
        break
    fi
    if [ $i -eq 12 ]; then
        echo "❌ アプリケーションの起動に失敗しました"
        fly logs --app "$STAGING_APP_NAME"
        exit 1
    fi
    echo "⏳ 起動確認中... ($i/12)"
    sleep 10
done

# ヘルスチェック
echo "🏥 ヘルスチェック実行中..."
STAGING_URL="https://$STAGING_APP_NAME.fly.dev"
for i in {1..6}; do
    if curl -f -s "$STAGING_URL/health" > /dev/null; then
        echo "✅ ヘルスチェック成功"
        break
    fi
    if [ $i -eq 6 ]; then
        echo "❌ ヘルスチェック失敗"
        fly logs --app "$STAGING_APP_NAME"
        exit 1
    fi
    echo "⏳ ヘルスチェック中... ($i/6)"
    sleep 5
done

# 6. デプロイ完了レポート
echo ""
echo "🎉 Staging環境デプロイ完了！"
echo "=============================="
echo "📱 アプリ: $STAGING_APP_NAME"
echo "🌍 URL: $STAGING_URL"
echo "🕐 デプロイ時刻: $(date)"
echo "🌿 ブランチ: $CURRENT_BRANCH"
echo "📝 コミット: $(git rev-parse --short HEAD)"
echo ""
echo "📖 次のステップ:"
echo "1. npm run staging:test で動作確認"
echo "2. npm run staging:smoke で煙幕テスト"
echo "3. 手動で重要機能の動作確認"
echo "4. 問題なければmainブランチへマージ"
```

### 3. validate-staging.sh
```bash
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

echo "🔍 Staging環境検証を開始します..."
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
echo "🏥 基本ヘルスチェック実行中..."
if curl -f -s "$STAGING_URL/health" > /dev/null; then
    echo "✅ ヘルスチェック成功"
    echo "✅ ヘルスチェック: 成功" >> "$REPORT_FILE"
else
    echo "❌ ヘルスチェック失敗"
    echo "❌ ヘルスチェック: 失敗" >> "$REPORT_FILE"
    VALIDATION_SUCCESS=false
fi

# 2. アプリケーション詳細ステータス
echo "📊 アプリケーションステータス確認中..."
APP_STATUS=$(fly status --app "$STAGING_APP_NAME" 2>/dev/null || echo "ERROR")
if echo "$APP_STATUS" | grep -q "started"; then
    echo "✅ アプリケーション稼働中"
    echo "✅ アプリケーションステータス: 稼働中" >> "$REPORT_FILE"
else
    echo "❌ アプリケーションが稼働していません"
    echo "❌ アプリケーションステータス: 停止/エラー" >> "$REPORT_FILE"
    VALIDATION_SUCCESS=false
fi

# 3. 煙幕テスト（基本機能）
if [ "$TEST_TYPE" = "smoke" ] || [ "$TEST_TYPE" = "full" ]; then
    echo "🚨 煙幕テスト実行中..."
    
    # API疎通確認
    API_ENDPOINTS=("/health" "/api/status")
    for endpoint in "${API_ENDPOINTS[@]}"; do
        echo "🔍 テスト中: $endpoint"
        if curl -f -s "$STAGING_URL$endpoint" > /dev/null; then
            echo "✅ $endpoint: 成功"
            echo "✅ API疎通 ($endpoint): 成功" >> "$REPORT_FILE"
        else
            echo "❌ $endpoint: 失敗"
            echo "❌ API疎通 ($endpoint): 失敗" >> "$REPORT_FILE"
            VALIDATION_SUCCESS=false
        fi
    done
    
    # データベース接続確認
    echo "🗄️ データベース接続確認中..."
    if curl -f -s "$STAGING_URL/debug/database" > /dev/null; then
        echo "✅ データベース接続成功"
        echo "✅ データベース接続: 成功" >> "$REPORT_FILE"
    else
        echo "❌ データベース接続失敗"
        echo "❌ データベース接続: 失敗" >> "$REPORT_FILE"
        VALIDATION_SUCCESS=false
    fi
fi

# 4. パフォーマンステスト
if [ "$TEST_TYPE" = "performance" ] || [ "$TEST_TYPE" = "full" ]; then
    echo "⚡ パフォーマンステスト実行中..."
    
    # 応答時間測定
    RESPONSE_TIME=$(curl -w "%{time_total}" -s -o /dev/null "$STAGING_URL/health")
    echo "📊 応答時間: ${RESPONSE_TIME}秒"
    echo "📊 ヘルスチェック応答時間: ${RESPONSE_TIME}秒" >> "$REPORT_FILE"
    
    # 応答時間判定（2秒以内）
    if (( $(echo "$RESPONSE_TIME <= 2.0" | bc -l) )); then
        echo "✅ パフォーマンステスト成功"
        echo "✅ パフォーマンス: 合格 (${RESPONSE_TIME}s <= 2.0s)" >> "$REPORT_FILE"
    else
        echo "❌ パフォーマンステスト失敗（応答時間: ${RESPONSE_TIME}秒）"
        echo "❌ パフォーマンス: 不合格 (${RESPONSE_TIME}s > 2.0s)" >> "$REPORT_FILE"
        VALIDATION_SUCCESS=false
    fi
    
    # メモリ使用量確認
    if curl -f -s "$STAGING_URL/debug/memory" > /tmp/memory_usage 2>/dev/null; then
        MEMORY_USAGE=$(cat /tmp/memory_usage | jq -r '.heapUsed' 2>/dev/null || echo "unknown")
        echo "💾 メモリ使用量: $MEMORY_USAGE"
        echo "💾 メモリ使用量: $MEMORY_USAGE" >> "$REPORT_FILE"
    fi
fi

# 5. 統合テスト（フルテスト時のみ）
if [ "$TEST_TYPE" = "full" ]; then
    echo "🔗 統合テスト実行中..."
    
    # Node.jsテストスイート実行（staging環境向け）
    if npm run test:staging 2>/dev/null; then
        echo "✅ 統合テスト成功"
        echo "✅ 統合テスト: 成功" >> "$REPORT_FILE"
    else
        echo "❌ 統合テスト失敗"
        echo "❌ 統合テスト: 失敗" >> "$REPORT_FILE"
        VALIDATION_SUCCESS=false
    fi
fi

# 6. ログ確認
echo "📝 最新ログ確認中..."
RECENT_LOGS=$(fly logs --app "$STAGING_APP_NAME" -n 50 2>/dev/null || echo "ログ取得失敗")
ERROR_COUNT=$(echo "$RECENT_LOGS" | grep -i "error\|exception\|fail" | wc -l || echo "0")

echo "🔍 最近のエラーログ数: $ERROR_COUNT"
echo "📝 最近のエラーログ数: $ERROR_COUNT" >> "$REPORT_FILE"

if [ "$ERROR_COUNT" -gt 5 ]; then
    echo "⚠️ エラーログが多すぎます"
    echo "⚠️ エラーログ警告: 多数のエラーが検出されました" >> "$REPORT_FILE"
    VALIDATION_SUCCESS=false
fi

# 7. 検証結果サマリー
echo "" >> "$REPORT_FILE"
echo "## 検証結果サマリー" >> "$REPORT_FILE"
echo "==================" >> "$REPORT_FILE"

if [ "$VALIDATION_SUCCESS" = true ]; then
    echo "✅ 全体結果: 成功" >> "$REPORT_FILE"
    echo "💡 本番デプロイ準備完了" >> "$REPORT_FILE"
    echo ""
    echo "🎉 Staging環境検証成功！"
    echo "========================"
    echo "✅ すべての検証項目が合格しました"
    echo "💡 本番環境へのデプロイ準備完了です"
    echo ""
    echo "📋 検証レポート: $REPORT_FILE"
    echo "📖 次のステップ: mainブランチマージ → 本番デプロイ"
    
    exit 0
else
    echo "❌ 全体結果: 失敗" >> "$REPORT_FILE"
    echo "⚠️ 問題を修正してから再検証してください" >> "$REPORT_FILE"
    echo ""
    echo "❌ Staging環境検証失敗"
    echo "====================="
    echo "⚠️ 一部の検証項目が失敗しました"
    echo "🔧 問題を修正してから再度検証してください"
    echo ""
    echo "📋 検証レポート: $REPORT_FILE"
    echo "📝 ログ確認: fly logs --app $STAGING_APP_NAME"
    
    exit 1
fi
```

### 4. smoke-test.sh
```bash
#!/bin/bash

# 煙幕テストスクリプト（重要機能の基本動作確認）
# 使用方法: ./scripts/staging/smoke-test.sh

set -e

STAGING_APP_NAME="timelogger-staging"
STAGING_URL="https://$STAGING_APP_NAME.fly.dev"

echo "🚨 煙幕テスト開始..."
echo "🌍 対象: $STAGING_URL"

TEST_SUCCESS=true

# テスト結果ログ
TEST_LOG="/tmp/smoke-test-$(date +%s).log"
echo "🚨 煙幕テスト結果 - $(date)" > "$TEST_LOG"
echo "=============================" >> "$TEST_LOG"

# 1. ヘルスチェックAPI
echo "🏥 ヘルスチェックAPI テスト中..."
if HEALTH_RESPONSE=$(curl -f -s "$STAGING_URL/health"); then
    echo "✅ ヘルスチェック成功"
    echo "✅ ヘルスチェック: 成功" >> "$TEST_LOG"
    
    # レスポンス内容確認
    if echo "$HEALTH_RESPONSE" | jq -e '.status == "ok"' > /dev/null 2>&1; then
        echo "✅ ヘルスチェック応答内容: 正常"
        echo "  - ステータス: $(echo "$HEALTH_RESPONSE" | jq -r '.status')"
        echo "  - 環境: $(echo "$HEALTH_RESPONSE" | jq -r '.environment')"
    else
        echo "⚠️ ヘルスチェック応答内容に問題があります"
        TEST_SUCCESS=false
    fi
else
    echo "❌ ヘルスチェック失敗"
    echo "❌ ヘルスチェック: 失敗" >> "$TEST_LOG"
    TEST_SUCCESS=false
fi

# 2. Discord Bot ステータスAPI（デバッグ用）
echo "🤖 Discord Bot ステータス テスト中..."
if DISCORD_STATUS=$(curl -f -s "$STAGING_URL/debug/discord-status" 2>/dev/null); then
    echo "✅ Discord Bot ステータス取得成功"
    echo "✅ Discord Bot ステータス: 成功" >> "$TEST_LOG"
    
    if echo "$DISCORD_STATUS" | jq -e '.connected == true' > /dev/null 2>&1; then
        echo "✅ Discord Bot接続: 正常"
    else
        echo "⚠️ Discord Bot接続に問題があります"
        TEST_SUCCESS=false
    fi
else
    echo "⚠️ Discord Bot ステータス取得失敗（デバッグAPI無効の可能性）"
    echo "⚠️ Discord Bot ステータス: スキップ" >> "$TEST_LOG"
fi

# 3. データベース接続テスト
echo "🗄️ データベース接続 テスト中..."
if DB_STATUS=$(curl -f -s "$STAGING_URL/debug/database" 2>/dev/null); then
    echo "✅ データベース接続テスト成功"
    echo "✅ データベース接続: 成功" >> "$TEST_LOG"
    
    if echo "$DB_STATUS" | jq -e '.connected == true' > /dev/null 2>&1; then
        echo "✅ データベース接続: 正常"
    else
        echo "⚠️ データベース接続に問題があります"
        TEST_SUCCESS=false
    fi
else
    echo "❌ データベース接続テスト失敗"
    echo "❌ データベース接続: 失敗" >> "$TEST_LOG"
    TEST_SUCCESS=false
fi

# 4. Gemini API接続テスト
echo "🧠 Gemini API接続 テスト中..."
if GEMINI_STATUS=$(curl -f -s "$STAGING_URL/debug/gemini-status" 2>/dev/null); then
    echo "✅ Gemini API接続テスト成功"
    echo "✅ Gemini API接続: 成功" >> "$TEST_LOG"
    
    if echo "$GEMINI_STATUS" | jq -e '.available == true' > /dev/null 2>&1; then
        echo "✅ Gemini API: 利用可能"
    else
        echo "⚠️ Gemini API利用に問題があります"
        TEST_SUCCESS=false
    fi
else
    echo "⚠️ Gemini API接続テスト失敗"
    echo "⚠️ Gemini API接続: 失敗" >> "$TEST_LOG"
    TEST_SUCCESS=false
fi

# 5. 基本APIエンドポイントテスト
echo "🔌 基本APIエンドポイント テスト中..."
API_ENDPOINTS=(
    "/api/status"
    "/api/version"
)

for endpoint in "${API_ENDPOINTS[@]}"; do
    echo "🔍 テスト中: $endpoint"
    if curl -f -s "$STAGING_URL$endpoint" > /dev/null; then
        echo "✅ $endpoint: 成功"
        echo "✅ API $endpoint: 成功" >> "$TEST_LOG"
    else
        echo "❌ $endpoint: 失敗"
        echo "❌ API $endpoint: 失敗" >> "$TEST_LOG"
        TEST_SUCCESS=false
    fi
done

# 6. パフォーマンス基本チェック
echo "⚡ パフォーマンス基本チェック中..."
RESPONSE_TIME=$(curl -w "%{time_total}" -s -o /dev/null "$STAGING_URL/health")
echo "📊 ヘルスチェック応答時間: ${RESPONSE_TIME}秒"
echo "📊 応答時間: ${RESPONSE_TIME}秒" >> "$TEST_LOG"

if (( $(echo "$RESPONSE_TIME <= 3.0" | bc -l) )); then
    echo "✅ 応答時間: 合格"
else
    echo "⚠️ 応答時間が遅いです（3秒超過）"
    TEST_SUCCESS=false
fi

# 7. テスト結果サマリー
echo ""
echo "🚨 煙幕テスト完了"
echo "================"

if [ "$TEST_SUCCESS" = true ]; then
    echo "✅ すべての煙幕テストが成功しました"
    echo ""
    echo "✅ 全体結果: 成功" >> "$TEST_LOG"
    echo "💡 重要機能は正常に動作しています" >> "$TEST_LOG"
    echo ""
    echo "📋 テストログ: $TEST_LOG"
    echo "💡 staging環境は正常に動作しています"
    echo "📖 次のステップ: 詳細な機能テストまたは本番デプロイ準備"
    
    exit 0
else
    echo "❌ 一部の煙幕テストが失敗しました"
    echo ""
    echo "❌ 全体結果: 失敗" >> "$TEST_LOG"
    echo "⚠️ 重要機能に問題があります" >> "$TEST_LOG"
    echo ""
    echo "📋 テストログ: $TEST_LOG"
    echo "🔧 問題を修正してから再度テストしてください"
    echo "📝 詳細ログ: fly logs --app $STAGING_APP_NAME"
    
    exit 1
fi
```

### 5. generate-test-data.js
```javascript
#!/usr/bin/env node

/**
 * テストデータ生成スクリプト
 * Staging環境用の匿名化されたテストデータを生成する
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const STAGING_APP_NAME = 'timelogger-staging';
const TEST_DATA_SIZE = process.env.TEST_DATA_SIZE || 'medium'; // small, medium, large

console.log('📊 テストデータ生成を開始します...');
console.log(`📱 対象: ${STAGING_APP_NAME}`);
console.log(`📈 データサイズ: ${TEST_DATA_SIZE}`);

// データサイズ設定
const DATA_SIZES = {
    small: { users: 2, activities: 50, days: 7 },
    medium: { users: 5, activities: 200, days: 30 },
    large: { users: 10, activities: 500, days: 90 }
};

const config = DATA_SIZES[TEST_DATA_SIZE] || DATA_SIZES.medium;

// テストユーザーデータ
const generateTestUsers = () => {
    const users = [];
    for (let i = 1; i <= config.users; i++) {
        users.push({
            discord_id: `test_user_${String(i).padStart(3, '0')}`,
            username: `TestUser${i}`,
            timezone: ['Asia/Tokyo', 'America/New_York', 'Europe/London'][i % 3],
            created_at: new Date(Date.now() - (Math.random() * 30 * 24 * 60 * 60 * 1000)).toISOString()
        });
    }
    return users;
};

// テスト活動データ
const generateTestActivities = (users) => {
    const activities = [];
    const activityTemplates = [
        'プロジェクト開発作業',
        'ミーティング参加',
        'ドキュメント作成',
        '調査・研究作業',
        'コードレビュー',
        'テスト実行',
        '設計作業',
        'デバッグ作業',
        '学習・勉強',
        'その他の作業'
    ];

    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() - config.days);

    for (let day = 0; day < config.days; day++) {
        const currentDate = new Date(baseDate);
        currentDate.setDate(currentDate.getDate() + day);

        const activitiesPerDay = Math.floor(config.activities / config.days) + Math.floor(Math.random() * 3);

        for (let i = 0; i < activitiesPerDay; i++) {
            const user = users[Math.floor(Math.random() * users.length)];
            const template = activityTemplates[Math.floor(Math.random() * activityTemplates.length)];
            
            const activityDate = new Date(currentDate);
            activityDate.setHours(
                9 + Math.floor(Math.random() * 10), // 9-18時の間
                Math.floor(Math.random() * 60),     // ランダムな分
                0, 0
            );

            activities.push({
                id: `test_activity_${Date.now()}_${i}`,
                discord_id: user.discord_id,
                content: `${template} (テストデータ)`,
                timestamp: activityDate.toISOString(),
                analysis: {
                    category: ['開発', '会議', 'ドキュメント', '調査'][Math.floor(Math.random() * 4)],
                    productive: Math.random() > 0.2, // 80%の確率で生産的
                    confidence: 0.8 + Math.random() * 0.2
                },
                created_at: activityDate.toISOString()
            });
        }
    }

    return activities.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
};

// API使用履歴データ
const generateApiUsageData = () => {
    const usage = [];
    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() - config.days);

    for (let day = 0; day < config.days; day++) {
        const currentDate = new Date(baseDate);
        currentDate.setDate(currentDate.getDate() + day);

        // 日別のAPI使用量（ランダム）
        const dailyRequests = Math.floor(Math.random() * 100) + 10;
        const dailyCost = dailyRequests * 0.001; // $0.001 per request

        usage.push({
            date: currentDate.toISOString().split('T')[0],
            requests: dailyRequests,
            cost: dailyCost,
            model: 'gemini-1.5-flash',
            created_at: currentDate.toISOString()
        });
    }

    return usage;
};

// SQLファイル生成
const generateSQLFile = (users, activities, apiUsage) => {
    let sql = '-- テストデータ生成SQL\n';
    sql += '-- 生成日時: ' + new Date().toISOString() + '\n';
    sql += '-- データサイズ: ' + TEST_DATA_SIZE + '\n\n';

    // 既存のテストデータクリーンアップ
    sql += '-- 既存のテストデータクリーンアップ\n';
    sql += "DELETE FROM activity_logs WHERE discord_id LIKE 'test_user_%';\n";
    sql += "DELETE FROM api_costs WHERE created_at >= date('now', '-" + (config.days + 1) + " days');\n\n";

    // ユーザー設定データ（timezone_settings テーブル）
    sql += '-- ユーザー設定データ\n';
    users.forEach(user => {
        sql += `INSERT OR REPLACE INTO timezone_settings (discord_id, timezone, updated_at) VALUES ('${user.discord_id}', '${user.timezone}', '${user.created_at}');\n`;
    });
    sql += '\n';

    // 活動ログデータ
    sql += '-- 活動ログデータ\n';
    activities.forEach(activity => {
        const escapedContent = activity.content.replace(/'/g, "''");
        const analysisJson = JSON.stringify(activity.analysis).replace(/'/g, "''");
        
        sql += `INSERT INTO activity_logs (discord_id, content, timestamp, analysis, created_at) VALUES ('${activity.discord_id}', '${escapedContent}', '${activity.timestamp}', '${analysisJson}', '${activity.created_at}');\n`;
    });
    sql += '\n';

    // API使用履歴データ
    sql += '-- API使用履歴データ\n';
    apiUsage.forEach(usage => {
        sql += `INSERT INTO api_costs (date, requests, cost, model, created_at) VALUES ('${usage.date}', ${usage.requests}, ${usage.cost}, '${usage.model}', '${usage.created_at}');\n`;
    });
    sql += '\n';

    return sql;
};

// メイン実行
async function main() {
    try {
        console.log('👤 テストユーザー生成中...');
        const users = generateTestUsers();
        console.log(`✅ ${users.length}人のテストユーザーを生成しました`);

        console.log('📝 テスト活動データ生成中...');
        const activities = generateTestActivities(users);
        console.log(`✅ ${activities.length}件の活動データを生成しました`);

        console.log('💰 API使用履歴データ生成中...');
        const apiUsage = generateApiUsageData();
        console.log(`✅ ${apiUsage.length}日分のAPI使用履歴を生成しました`);

        console.log('📄 SQLファイル生成中...');
        const sql = generateSQLFile(users, activities, apiUsage);
        
        const outputPath = path.join(__dirname, '../../temp/test-data.sql');
        
        // tempディレクトリ作成
        const tempDir = path.dirname(outputPath);
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        
        fs.writeFileSync(outputPath, sql);
        console.log(`✅ SQLファイルを生成しました: ${outputPath}`);

        // Staging環境にテストデータを適用
        console.log('🚀 Staging環境にテストデータを適用中...');
        
        try {
            // fly.ioのssh経由でSQLファイルを実行
            execSync(`fly ssh console --app ${STAGING_APP_NAME} --command "sqlite3 /app/data/activity_logs.db" < ${outputPath}`, {
                stdio: 'inherit'
            });
            console.log('✅ テストデータの適用が完了しました');
        } catch (error) {
            console.log('⚠️ 自動適用に失敗しました。手動で適用してください:');
            console.log(`📝 SQLファイル: ${outputPath}`);
            console.log(`🔧 手動適用コマンド: fly ssh console --app ${STAGING_APP_NAME} --command "sqlite3 /app/data/activity_logs.db" < ${outputPath}`);
        }

        // サマリーレポート
        console.log('\n📊 テストデータ生成完了レポート');
        console.log('================================');
        console.log(`👤 テストユーザー数: ${users.length}`);
        console.log(`📝 活動ログ数: ${activities.length}`);
        console.log(`💰 API使用履歴: ${apiUsage.length}日分`);
        console.log(`📅 データ期間: ${config.days}日間`);
        console.log(`📄 SQLファイル: ${outputPath}`);
        
        // テストユーザー一覧
        console.log('\n👤 生成されたテストユーザー:');
        users.forEach(user => {
            console.log(`  - ${user.discord_id} (${user.username}) - ${user.timezone}`);
        });

        console.log('\n💡 テストデータの確認方法:');
        console.log(`   - Discord Bot経由: !logs コマンドでテストユーザーの活動を確認`);
        console.log(`   - API経由: https://${STAGING_APP_NAME}.fly.dev/debug/test-data`);
        console.log(`   - ログ確認: fly logs --app ${STAGING_APP_NAME}`);

    } catch (error) {
        console.error('❌ テストデータ生成に失敗しました:', error);
        process.exit(1);
    }
}

// スクリプト実行
if (require.main === module) {
    main();
}

module.exports = {
    generateTestUsers,
    generateTestActivities,
    generateApiUsageData,
    generateSQLFile
};
```

### 6. pre-production-check.sh
```bash
#!/bin/bash

# 本番デプロイ前チェックスクリプト
# 使用方法: ./scripts/staging/pre-production-check.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_DIR"

STAGING_APP_NAME="timelogger-staging"
PRODUCTION_APP_NAME="timelogger-bitter-resonance-9585"

echo "🔍 本番デプロイ前チェックを開始します..."

CHECK_SUCCESS=true
REPORT_FILE="/tmp/pre-production-check-$(date +%s).md"

# レポート初期化
echo "# 本番デプロイ前チェックレポート" > "$REPORT_FILE"
echo "================================" >> "$REPORT_FILE"
echo "🕐 チェック時刻: $(date)" >> "$REPORT_FILE"
echo "🌿 対象ブランチ: $(git branch --show-current)" >> "$REPORT_FILE"
echo "📝 対象コミット: $(git rev-parse --short HEAD)" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# 1. Git状態チェック
echo "📋 Git状態チェック中..."
if [ -n "$(git status --porcelain)" ]; then
    echo "❌ 未コミットの変更があります"
    echo "❌ Git状態: 未コミットの変更あり" >> "$REPORT_FILE"
    CHECK_SUCCESS=false
else
    echo "✅ Git状態: クリーン"
    echo "✅ Git状態: クリーン" >> "$REPORT_FILE"
fi

# ブランチ確認
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
    echo "⚠️ 現在のブランチ: $CURRENT_BRANCH (推奨: main)"
    echo "⚠️ ブランチ警告: mainブランチではありません ($CURRENT_BRANCH)" >> "$REPORT_FILE"
fi

# 2. Staging環境検証状況確認
echo "🔍 Staging環境検証状況確認中..."
STAGING_URL="https://$STAGING_APP_NAME.fly.dev"

if curl -f -s "$STAGING_URL/health" > /dev/null; then
    echo "✅ Staging環境: 稼働中"
    echo "✅ Staging環境稼働状況: 正常" >> "$REPORT_FILE"
    
    # 最新の検証結果確認
    if [ -f "/tmp/staging-validation-*.md" ]; then
        LATEST_VALIDATION=$(ls -t /tmp/staging-validation-*.md | head -1)
        VALIDATION_TIME=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "$LATEST_VALIDATION" 2>/dev/null || echo "不明")
        echo "📊 最新のStaging検証: $VALIDATION_TIME"
        echo "📊 最新のStaging検証: $VALIDATION_TIME" >> "$REPORT_FILE"
        
        if grep -q "✅ 全体結果: 成功" "$LATEST_VALIDATION" 2>/dev/null; then
            echo "✅ Staging検証: 成功"
            echo "✅ Staging検証結果: 成功" >> "$REPORT_FILE"
        else
            echo "❌ Staging検証: 失敗または不完全"
            echo "❌ Staging検証結果: 失敗" >> "$REPORT_FILE"
            CHECK_SUCCESS=false
        fi
    else
        echo "⚠️ Staging検証履歴が見つかりません"
        echo "⚠️ Staging検証履歴: なし" >> "$REPORT_FILE"
        CHECK_SUCCESS=false
    fi
else
    echo "❌ Staging環境にアクセスできません"
    echo "❌ Staging環境稼働状況: アクセス不可" >> "$REPORT_FILE"
    CHECK_SUCCESS=false
fi

# 3. 重要機能の最終確認
echo "🧪 重要機能最終確認中..."

# 煙幕テスト実行
if ./scripts/staging/smoke-test.sh > /dev/null 2>&1; then
    echo "✅ 煙幕テスト: 成功"
    echo "✅ 煙幕テスト: 成功" >> "$REPORT_FILE"
else
    echo "❌ 煙幕テスト: 失敗"
    echo "❌ 煙幕テスト: 失敗" >> "$REPORT_FILE"
    CHECK_SUCCESS=false
fi

# 4. 品質メトリクス確認
echo "📊 品質メトリクス確認中..."

# テストカバレッジ確認
if npm run test:coverage > /tmp/coverage_output 2>&1; then
    COVERAGE=$(grep -o "[0-9]*\.[0-9]*%" /tmp/coverage_output | head -1 | sed 's/%//' || echo "0")
    echo "📈 テストカバレッジ: ${COVERAGE}%"
    echo "📈 テストカバレッジ: ${COVERAGE}%" >> "$REPORT_FILE"
    
    if (( $(echo "$COVERAGE >= 45.5" | bc -l) )); then
        echo "✅ カバレッジ: 合格"
        echo "✅ カバレッジ判定: 合格" >> "$REPORT_FILE"
    else
        echo "❌ カバレッジ: 不合格（${COVERAGE}% < 45.5%）"
        echo "❌ カバレッジ判定: 不合格" >> "$REPORT_FILE"
        CHECK_SUCCESS=false
    fi
else
    echo "❌ カバレッジ測定失敗"
    echo "❌ カバレッジ測定: 失敗" >> "$REPORT_FILE"
    CHECK_SUCCESS=false
fi

# 5. 本番環境現状確認
echo "🏭 本番環境現状確認中..."

PRODUCTION_STATUS=$(fly status --app "$PRODUCTION_APP_NAME" 2>/dev/null || echo "ERROR")
if echo "$PRODUCTION_STATUS" | grep -q "started"; then
    echo "✅ 本番環境: 稼働中"
    echo "✅ 本番環境状態: 稼働中" >> "$REPORT_FILE"
else
    echo "⚠️ 本番環境: 停止中またはエラー"
    echo "⚠️ 本番環境状態: 停止/エラー" >> "$REPORT_FILE"
fi

# 6. バックアップ状況確認
echo "💾 バックアップ状況確認中..."

if [ -f "scripts/production/backup.sh" ]; then
    LAST_BACKUP=$(ls -t data/backups/ 2>/dev/null | head -1 || echo "")
    if [ -n "$LAST_BACKUP" ]; then
        echo "✅ 最新バックアップ: $LAST_BACKUP"
        echo "✅ バックアップ状況: 最新 ($LAST_BACKUP)" >> "$REPORT_FILE"
    else
        echo "⚠️ バックアップファイルが見つかりません"
        echo "⚠️ バックアップ状況: バックアップなし" >> "$REPORT_FILE"
    fi
else
    echo "⚠️ バックアップスクリプトが見つかりません"
    echo "⚠️ バックアップスクリプト: なし" >> "$REPORT_FILE"
fi

# 7. 依存関係・セキュリティチェック
echo "🔒 セキュリティチェック中..."

# 高リスクの依存関係チェック
if npm audit --audit-level high > /tmp/audit_output 2>&1; then
    echo "✅ セキュリティ監査: 問題なし"
    echo "✅ セキュリティ監査: 問題なし" >> "$REPORT_FILE"
else
    HIGH_VULNS=$(grep "high" /tmp/audit_output | wc -l || echo "0")
    if [ "$HIGH_VULNS" -gt 0 ]; then
        echo "❌ 高リスクの脆弱性: ${HIGH_VULNS}件"
        echo "❌ セキュリティ監査: 高リスク脆弱性あり (${HIGH_VULNS}件)" >> "$REPORT_FILE"
        CHECK_SUCCESS=false
    else
        echo "✅ セキュリティ監査: 軽微な問題のみ"
        echo "✅ セキュリティ監査: 軽微な問題のみ" >> "$REPORT_FILE"
    fi
fi

# 8. 環境変数・設定ファイル確認
echo "⚙️ 設定ファイル確認中..."

REQUIRED_FILES=("fly.toml" ".env.production" "package.json")
for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ 設定ファイル: $file"
        echo "✅ 設定ファイル ($file): 存在" >> "$REPORT_FILE"
    else
        echo "❌ 設定ファイル: $file が見つかりません"
        echo "❌ 設定ファイル ($file): 不存在" >> "$REPORT_FILE"
        CHECK_SUCCESS=false
    fi
done

# 9. チェック結果サマリー
echo "" >> "$REPORT_FILE"
echo "## チェック結果サマリー" >> "$REPORT_FILE"
echo "====================" >> "$REPORT_FILE"

if [ "$CHECK_SUCCESS" = true ]; then
    echo "✅ 全体結果: 合格" >> "$REPORT_FILE"
    echo "🚀 本番デプロイ準備完了" >> "$REPORT_FILE"
    echo ""
    echo "🎉 本番デプロイ前チェック合格！"
    echo "================================"
    echo "✅ すべてのチェック項目が合格しました"
    echo "🚀 本番環境への安全なデプロイが可能です"
    echo ""
    echo "📋 詳細レポート: $REPORT_FILE"
    echo "📖 次のステップ:"
    echo "   1. npm run prod:backup で本番データバックアップ"
    echo "   2. mainブランチにプッシュして本番デプロイ実行"
    echo "   3. デプロイ後に重要機能の動作確認"
    
    exit 0
else
    echo "❌ 全体結果: 不合格" >> "$REPORT_FILE"
    echo "⚠️ 問題を修正してから本番デプロイを実行してください" >> "$REPORT_FILE"
    echo ""
    echo "❌ 本番デプロイ前チェック不合格"
    echo "==============================="
    echo "⚠️ 一部のチェック項目が失敗しました"
    echo "🔧 すべての問題を修正してから本番デプロイを実行してください"
    echo ""
    echo "📋 詳細レポート: $REPORT_FILE"
    echo "🔧 修正が必要な項目を確認してください"
    
    exit 1
fi
```

## 📋 スクリプト実装チェックリスト

### 初期セットアップ
- [ ] scripts/staging/ ディレクトリ作成
- [ ] 各スクリプトファイル作成・実行権限付与
- [ ] .env.staging.example 作成
- [ ] package.json スクリプトエントリ確認

### 動作確認
- [ ] setup-staging.sh でStaging環境作成
- [ ] deploy-to-staging.sh でデプロイテスト
- [ ] validate-staging.sh で検証テスト
- [ ] smoke-test.sh で煙幕テスト
- [ ] generate-test-data.js でテストデータ生成

### 運用確認
- [ ] GitHub Actions統合
- [ ] エラーハンドリング確認
- [ ] ログ出力確認
- [ ] レポート生成確認

---

## 📈 継続的改善

### 監視項目
- スクリプト実行成功率
- 検証項目の有効性
- 実行時間の最適化
- エラー率の改善

### 拡張計画
1. **Phase 1**: 基本スクリプト実装・動作確認
2. **Phase 2**: 監視・レポート機能強化
3. **Phase 3**: 自動化・統合の拡張