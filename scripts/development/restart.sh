#!/bin/bash

# 開発環境用 簡単再起動スクリプト
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "🔄 開発環境を再起動します..."

# Bot停止
./scripts/development/bot-manager.sh stop

# ビルド
echo "🏗️ プロジェクトをビルド中..."
cd "$PROJECT_DIR"
npm run build

if [ $? -eq 0 ]; then
    echo "✅ ビルド完了"
    
    # Bot起動
    ./scripts/development/bot-manager.sh start
    
    echo "🎉 開発環境の再起動が完了しました"
else
    echo "❌ ビルドに失敗しました。Bot起動をスキップします。"
    exit 1
fi