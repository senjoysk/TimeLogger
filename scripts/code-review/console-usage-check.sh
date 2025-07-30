#!/bin/bash

# Console使用チェックスクリプト
# console.log, console.error, console.warn, console.info の使用を検出
# 標準的なgrepコマンドを使用（ripgrep不要）

echo "🔍 Console使用チェックを開始します..."

# 一時ファイルを作成
TEMP_FILE=$(mktemp)
trap "rm -f $TEMP_FILE" EXIT

# console使用を検出（テストファイルとlogger自体を除外）
find src -name "*.ts" -o -name "*.js" | \
  grep -v "__tests__" | \
  grep -v "test\." | \
  grep -v "spec\." | \
  grep -v "logger\.ts" | \
  grep -v "mockLogger\.ts" | \
  grep -v "/factories/" | \
  xargs grep -n "console\.\(log\|error\|warn\|info\)" 2>/dev/null > "$TEMP_FILE" || true

# 結果をカウント
CONSOLE_USAGE_COUNT=$(cat "$TEMP_FILE" | wc -l | tr -d ' ')

if [ "$CONSOLE_USAGE_COUNT" -gt 0 ]; then
  echo ""
  echo "❌ エラー: $CONSOLE_USAGE_COUNT 箇所でconsole使用が検出されました"
  echo ""
  
  # 最初の10件を表示
  echo "📍 検出箇所（最初の10件）:"
  head -10 "$TEMP_FILE" | while IFS=: read -r file line content; do
    echo "  $file:$line - $content"
  done
  
  if [ "$CONSOLE_USAGE_COUNT" -gt 10 ]; then
    echo "  ... 他 $((CONSOLE_USAGE_COUNT - 10)) 箇所"
  fi
  
  echo ""
  echo "📝 修正方法:"
  echo "1. import { logger } from './utils/logger'; を追加"
  echo "2. console.log() → logger.info() または logger.debug()"
  echo "3. console.error() → logger.error()"
  echo "4. console.warn() → logger.warn()"
  echo ""
  echo "例:"
  echo "  console.log('メッセージ') → logger.info('COMPONENT', 'メッセージ')"
  echo "  console.error('エラー', error) → logger.error('COMPONENT', 'エラー', error)"
  echo ""
  exit 1
else
  echo "✅ console使用チェック: 問題なし"
  exit 0
fi