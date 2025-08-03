#!/bin/bash

# TODO・FIXMEコメント検出スクリプト（ripgrepベース版へのラッパー）
# Issue #58対応: TODO・FIXMEコメントの放置禁止と定期的な棚卸し・issue化の徹底
# Segmentation fault問題を解決するためripgrepベース版を使用

# スクリプトディレクトリの取得
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ripgrepベース版のスクリプトを実行
"$SCRIPT_DIR/todo-comment-check-rg.sh" "$@"