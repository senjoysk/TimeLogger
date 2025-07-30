#!/bin/bash

# TODO・FIXMEコメント検出スクリプト
# Issue #58対応: TODO・FIXMEコメントの放置禁止と定期的な棚卸し・issue化の徹底

set -euo pipefail

# 設定
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_FILE="$PROJECT_ROOT/todo-comments-report.txt"

# カラー設定
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ログ関数
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

# TODO・FIXMEコメントの検出パターン
TODO_PATTERNS=(
    "//\s*(TODO|FIXME|HACK|未実装|BUG|NOTE|OPTIMIZE)"
    "#\s*(TODO|FIXME|HACK|未実装|BUG|NOTE|OPTIMIZE)"
    "/\*\s*(TODO|FIXME|HACK|未実装|BUG|NOTE|OPTIMIZE)"
)

# 例外許可コメントのパターン
ALLOW_PATTERNS=(
    "ALLOW_TODO"
    "ALLOW_FIXME"
    "ALLOW_HACK"
)

# 検出除外パターン（機能名やドキュメント内の正当な使用）
EXCLUDE_PATTERNS=(
    "TODO型定義"
    "TODO機能"
    "TODO管理"
    "TODOコマンド"
    "TODO一覧"
    "TODO作成"
    "TODO編集"
    "TODO削除"
    "TODO検索"
    "TODO統計"
    "TODOハンドラー"
    "TODOサービス"
    "TODOリポジトリ"
    "TODO分類"
    "TODOアクション"
    "TODOボタン"
    "TodoTask"
    "CreateTodo"
    "UpdateTodo"
    "todo_tasks"
    "todoId"
    "todoService"
    "todoHandler"
    "TODO追加ボタンをシミュレート"
    "TODOが実際に登録されたか確認"
    "TODOが実際に作成されたことを確認"
    "TODOが作成されていることを確認"
    "# TODO管理コマンド"
    "## ✅ TODO管理コマンド"
    "### \`!todo\`"
    "!todo"
    "ClassificationResult.*TODO"
    "MessageClassification.*TODO"
    "todo.ts"
    "todos.ts"
    "todo-"
    "Todo"
    "import.*todo"
    "export.*todo"
    "interface.*Todo"
    "class.*Todo"
    "type.*Todo"
    "enum.*Todo"
)

# 関数: 例外許可の確認
check_allow_comment() {
    local file="$1"
    local line_num="$2"
    local context_lines=3

    # 前後数行を確認して例外許可コメントがあるかチェック
    local start_line=$((line_num - context_lines))
    local end_line=$((line_num + context_lines))
    
    if [ $start_line -lt 1 ]; then
        start_line=1
    fi

    for pattern in "${ALLOW_PATTERNS[@]}"; do
        if sed -n "${start_line},${end_line}p" "$file" | grep -q "$pattern"; then
            return 0  # 例外許可あり
        fi
    done
    
    return 1  # 例外許可なし
}

# 関数: 除外パターンの確認
check_exclude_pattern() {
    local line="$1"
    
    for pattern in "${EXCLUDE_PATTERNS[@]}"; do
        if echo "$line" | grep -q "$pattern"; then
            return 0  # 除外対象
        fi
    done
    
    return 1  # 除外対象ではない
}

# 関数: TODO・FIXMEコメントの検出
detect_todo_comments() {
    log_info "TODO・FIXMEコメントを検出中..."
    
    local violations=0
    local total_found=0
    
    # 検索対象ファイルの指定（テストファイル、node_modules、distディレクトリを除外）
    local search_files
    search_files=$(find "$PROJECT_ROOT" -type f \( -name "*.ts" -o -name "*.js" -o -name "*.md" -o -name "*.json" \) \
        -not -path "*/node_modules/*" \
        -not -path "*/dist/*" \
        -not -path "*/.git/*" \
        -not -path "*/coverage/*" \
        -not -path "*/test-reports/*" \
        2>/dev/null || true)

    # レポートファイルの初期化
    {
        echo "TODO・FIXMEコメント検出レポート"
        echo "生成日時: $(date)"
        echo "=========================================="
        echo ""
    } > "$LOG_FILE"

    for pattern in "${TODO_PATTERNS[@]}"; do
        while IFS= read -r file; do
            if [ -f "$file" ]; then
                while IFS=: read -r line_num line_content; do
                    if [ -n "$line_num" ] && [ -n "$line_content" ]; then
                        total_found=$((total_found + 1))
                        
                        # 除外パターンのチェック
                        if check_exclude_pattern "$line_content"; then
                            continue
                        fi
                        
                        # 例外許可コメントのチェック
                        if check_allow_comment "$file" "$line_num"; then
                            {
                                echo "✅ 例外許可: $file:$line_num"
                                echo "   $line_content"
                                echo ""
                            } >> "$LOG_FILE"
                            continue
                        fi
                        
                        # 違反として記録
                        violations=$((violations + 1))
                        local relative_file="${file#$PROJECT_ROOT/}"
                        
                        {
                            echo "❌ 違反: $relative_file:$line_num"
                            echo "   $line_content"
                            echo ""
                        } >> "$LOG_FILE"
                        
                        log_error "TODO・FIXMEコメント発見: $relative_file:$line_num"
                        echo "   $line_content"
                    fi
                done < <(grep -n -E "$pattern" "$file" 2>/dev/null || true)
            fi
        done <<< "$search_files"
    done

    # サマリー情報をレポートに追加
    {
        echo "=========================================="
        echo "検出サマリー:"
        echo "- 総検出数: $total_found"
        echo "- 違反数: $violations"
        echo "- 例外許可数: $((total_found - violations))"
        echo ""
        echo "対応が必要な項目数: $violations"
    } >> "$LOG_FILE"

    log_info "レポートファイル: $LOG_FILE"
    
    return $violations
}

# 関数: 改善提案の表示
show_improvement_suggestions() {
    log_info "TODO・FIXMEコメント管理の改善提案:"
    echo ""
    echo "1. 例外許可の使用方法:"
    echo "   // ALLOW_TODO: 理由を明記"
    echo "   // TODO: 実装予定の機能"
    echo ""
    echo "2. 推奨される対応方法:"
    echo "   - 即座に実装可能 → すぐに実装"
    echo "   - 時間が必要 → GitHub Issueとして登録"
    echo "   - 不要になった → コメント削除"
    echo ""
    echo "3. GitHub Issue作成コマンド例:"
    echo "   gh issue create --title \"TODO実装: 機能名\" --body \"詳細な説明\""
    echo ""
}

# メイン処理
main() {
    log_info "TODO・FIXMEコメント検出を開始します..."
    
    cd "$PROJECT_ROOT"
    
    # TODO・FIXMEコメントの検出
    if detect_todo_comments; then
        log_success "TODO・FIXMEコメントチェック完了: 問題なし"
        show_improvement_suggestions
        exit 0
    else
        local violations=$?
        log_error "TODO・FIXMEコメントが ${violations} 件検出されました"
        echo ""
        log_warning "対応方法:"
        echo "1. コメントを削除または実装"
        echo "2. GitHub Issueとして管理"
        echo "3. 例外許可コメント (ALLOW_TODO等) を追加"
        echo ""
        show_improvement_suggestions
        exit 1
    fi
}

# スクリプト実行
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi