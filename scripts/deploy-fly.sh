#!/bin/bash

# Fly.ioデプロイスクリプト
# 使用方法: ./scripts/deploy-fly.sh [app-name]

set -e

# アプリ名の取得（引数または環境変数から）
APP_NAME=${1:-$FLY_APP_NAME}

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

# シークレットの一括設定
echo "🔐 シークレットを設定中..."
while IFS='=' read -r key value; do
    # コメント行と空行をスキップ
    [[ $key =~ ^#.*$ ]] && continue
    [[ -z $key ]] && continue
    
    # シークレットを設定
    fly secrets set "$key=$value" --app "$APP_NAME" --stage
done < .env.fly

# シークレットをデプロイ
echo "📤 シークレットをデプロイ中..."
fly secrets deploy --app "$APP_NAME"

# アプリのデプロイ
echo "🏗️ アプリをビルド・デプロイ中..."
fly deploy --app "$APP_NAME"

echo "✅ デプロイが完了しました！"
echo "📊 ステータス確認: fly status --app $APP_NAME"
echo "📝 ログ確認: fly logs --app $APP_NAME"