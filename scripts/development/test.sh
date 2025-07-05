#!/bin/bash

# 開発環境用 テスト・ビルド確認スクリプト
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_DIR"

echo "🧪 開発環境でのテスト・ビルド確認を開始します..."

# 1. TypeScript型チェック
echo "📝 TypeScript型チェック中..."
npm run build
if [ $? -ne 0 ]; then
    echo "❌ TypeScript型チェックに失敗しました"
    exit 1
fi
echo "✅ TypeScript型チェック完了"

# 2. テスト実行
echo "🧪 テスト実行中..."
npm test
if [ $? -ne 0 ]; then
    echo "❌ テストに失敗しました"
    exit 1
fi
echo "✅ テスト完了"

# 3. カバレッジ確認（オプション）
if [ "$1" = "--coverage" ]; then
    echo "📊 テストカバレッジ確認中..."
    npm run test:coverage
fi

echo "🎉 すべてのチェックが完了しました！"
echo "💡 Bot起動は以下のコマンドで："
echo "   npm run dev:start"