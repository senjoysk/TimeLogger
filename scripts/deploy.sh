#!/bin/bash

# このスクリプトはプロジェクトのビルドとボットの再起動を自動化します。
# 実行前に、このスクリプトに実行権限を与えてください: chmod +x scripts/deploy.sh

set -e # いずれかのコマンドが失敗したらスクリプトを終了する

# スクリプトの場所を基準にプロジェクトルートへ移動
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

echo "🚀 プロジェクトのビルドを開始します..."
npm run build

echo "✅ ビルドが正常に完了しました。"
echo "🔄 ボットを再起動します..."

# bot-manager.sh を使って再起動
./scripts/bot-manager.sh restart

echo "🎉 デプロイが完了しました。"
