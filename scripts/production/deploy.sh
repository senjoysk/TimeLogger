#!/bin/bash

# Fly.ioデプロイスクリプト
# 使用方法: ./scripts/deploy-fly.sh [app-name] [--dry-run]

set -e

# ドライランモードの確認
DRY_RUN=false
if [[ "$2" == "--dry-run" ]] || [[ "$1" == "--dry-run" ]]; then
    DRY_RUN=true
    echo "🧪 ドライランモード: 実際のコマンドは実行されません"
fi

# アプリ名の取得（引数または環境変数から）
APP_NAME=${1:-$FLY_APP_NAME}
if [[ "$APP_NAME" == "--dry-run" ]]; then
    APP_NAME=${2:-$FLY_APP_NAME}
fi

if [ -z "$APP_NAME" ]; then
    echo "❌ エラー: アプリ名を指定してください"
    echo "使用方法: $0 <app-name>"
    exit 1
fi

# .env.flyファイルの存在確認
if [ ! -f ".env.fly" ]; then
    echo "❌ エラー: .env.flyファイルが見つかりません"
    echo "📝 .env.fly.exampleをコピーして設定してください"
    exit 1
fi

echo "🚀 Fly.ioへのデプロイを開始します..."
echo "📱 アプリ: $APP_NAME"

# 事前チェック
echo "🔍 事前チェック実行中..."

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

echo "✅ 事前チェック完了"

# シークレットの一括設定（ステージング）
echo "🔐 シークレットをステージング中..."
while IFS='=' read -r key value; do
    # コメント行と空行をスキップ
    [[ $key =~ ^#.*$ ]] && continue
    [[ -z $key ]] && continue
    
    # シークレットを設定（ステージングのみ）
    if [ "$DRY_RUN" = true ]; then
        echo "  [DRY-RUN] fly secrets set \"$key=***\" --app \"$APP_NAME\" --stage"
    else
        fly secrets set "$key=$value" --app "$APP_NAME" --stage
    fi
done < .env.fly

# アプリのデプロイ（シークレットも同時に適用される）
echo "🏗️ アプリをビルド・デプロイ中（シークレットも適用）..."
if [ "$DRY_RUN" = true ]; then
    echo "  [DRY-RUN] fly deploy --app \"$APP_NAME\""
else
    fly deploy --app "$APP_NAME"
fi

echo "✅ デプロイが完了しました！"
echo "📊 ステータス確認: fly status --app $APP_NAME"
echo "📝 ログ確認: fly logs --app $APP_NAME"