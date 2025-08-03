#!/bin/bash

# TODO・FIXMEコメント検出スクリプト（ripgrepベース）
# Issue #58対応: TODO・FIXMEコメントの放置禁止と定期的な棚卸し・issue化の徹底
# Segmentation fault問題を解決するためのripgrep実装

# 設定
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_FILE="$PROJECT_ROOT/todo-comments-report.txt"
RG_CMD=""  # ripgrepコマンドパス（check_ripgrepで設定）

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

# ripgrepの存在確認
check_ripgrep() {
    # Claude Code環境でのripgrepパス
    local claude_rg="/opt/homebrew/lib/node_modules/@anthropic-ai/claude-code/vendor/ripgrep/arm64-darwin/rg"
    
    # 複数の場所からripgrepを探す
    if [ -x "$claude_rg" ]; then
        RG_CMD="$claude_rg"
    elif command -v rg &> /dev/null; then
        RG_CMD="rg"
    elif [ -x "/opt/homebrew/bin/rg" ]; then
        RG_CMD="/opt/homebrew/bin/rg"
    elif [ -x "/usr/local/bin/rg" ]; then
        RG_CMD="/usr/local/bin/rg"
    else
        log_error "ripgrepが必要です。"
        echo "インストール方法:"
        echo "  macOS: brew install ripgrep"
        echo "  Ubuntu/Debian: sudo apt install ripgrep"
        exit 1
    fi
    
    log_info "使用するripgrep: $RG_CMD"
}

# 除外パターンのファイル作成
create_exclude_patterns_file() {
    local exclude_file="$SCRIPT_DIR/.rg-exclude-patterns"
    
    cat > "$exclude_file" << 'EOF'
# 機能名やドキュメント内の正当な使用
TODO型定義
TODO機能
TODO管理
TODOコマンド
TODO一覧
TODO作成
TODO編集
TODO削除
TODO検索
TODO統計
TODOハンドラー
TODOサービス
TODOリポジトリ
TODO分類
TODOアクション
TODOボタン
TodoTask
CreateTodo
UpdateTodo
todo_tasks
todoId
todoService
todoHandler
TODO追加ボタンをシミュレート
TODOが実際に登録されたか確認
TODOが実際に作成されたことを確認
TODOが作成されていることを確認
!todo
ClassificationResult.*TODO
MessageClassification.*TODO
todo\.ts
todos\.ts
todo-
import.*todo
export.*todo
interface.*Todo
class.*Todo
type.*Todo
enum.*Todo
EOF
    
    echo "$exclude_file"
}

# TODO・FIXMEコメントの検出（ripgrep使用）
detect_todo_comments_rg() {
    log_info "TODO・FIXMEコメントを検出中（ripgrep使用）..."
    
    local violations=0
    local total_found=0
    local allowed_count=0
    
    # レポートファイルの初期化
    {
        echo "TODO・FIXMEコメント検出レポート (ripgrep版)"
        echo "生成日時: $(date)"
        echo "=========================================="
        echo ""
    } > "$LOG_FILE"
    
    # 一時ファイルで検出結果を保存
    local temp_results="$SCRIPT_DIR/.todo-results-temp"
    
    # ripgrepで検索
    # TypeScriptとJavaScriptファイルのみを対象にする（マークダウンは除外）
    # NOTEは設計上の注記なので除外
    $RG_CMD '(//|#|/\*)\s*(TODO|FIXME|HACK|未実装|BUG|OPTIMIZE)' \
        --type-add 'src:*.{ts,js}' \
        --type src \
        -g '!node_modules' \
        -g '!dist' \
        -g '!coverage' \
        -g '!test-reports' \
        -g '!.git' \
        -g '!*.md' \
        -g '!*.json' \
        --line-number \
        --with-filename \
        --no-heading \
        "$PROJECT_ROOT" 2>/dev/null | \
    # 除外パターンをフィルタリング（TODO機能関連の正当な使用を除外）
    grep -v -E '(TODO管理|TODO機能|TODO分類|TODO一覧|TODO作成|TODO編集|TODO削除|TODO検索|TODOハンドラー|TODOサービス|TODOリポジトリ|TODOボタン|TODOコマンド|TODO統計|TODOアクション|TODO項目|TODO詳細|TODO固有|TODO完了|TODO関連|TODO追加|TODO絵文字|TODOルーター|TODOのクリーン|TODO自動検出|TODO型定義|TODO・FIXME|TODOを追加|TODOが|TODO基本操作|TODO判定|TODO概要|TODOエラー|TODO\sパターン|TodoTask|CreateTodo|UpdateTodo|todo_tasks|todoId|todoService|todoHandler|!todo|todo\.ts|todos\.ts|todo-|import.*todo|export.*todo|interface.*Todo|class.*Todo|type.*Todo|enum.*Todo)' | \
    # ドキュメント内の例示パターンを除外（「- `// TODO:`」など）
    grep -v -E '^\s*(-|`)\s*(//|#|/\*)?\s*(TODO|FIXME|HACK|BUG|NOTE|OPTIMIZE|未実装):?`?\s*$' | \
    # 「NotImplementedError // 未実装」のような説明も除外
    grep -v -E 'NotImplementedError.*//.*未実装' > "$temp_results" || true
    
    # 除外パターンファイルを作成
    local exclude_patterns_file=$(create_exclude_patterns_file)
    
    # 結果を処理
    while IFS=: read -r file line_num content; do
        if [ -z "$file" ] || [ -z "$line_num" ] || [ -z "$content" ]; then
            continue
        fi
        
        total_found=$((total_found + 1))
        
        # 例外許可コメントのチェック（前後3行を確認）
        local context_start=$((line_num - 3))
        local context_end=$((line_num + 3))
        if [ $context_start -lt 1 ]; then
            context_start=1
        fi
        
        local has_allow=false
        if sed -n "${context_start},${context_end}p" "$file" 2>/dev/null | $RG_CMD -q "(ALLOW_TODO|ALLOW_FIXME|ALLOW_HACK)"; then
            has_allow=true
            allowed_count=$((allowed_count + 1))
            {
                echo "✅ 例外許可: ${file#$PROJECT_ROOT/}:$line_num"
                echo "   $content"
                echo ""
            } >> "$LOG_FILE"
            continue
        fi
        
        # 違反として記録
        violations=$((violations + 1))
        local relative_file="${file#$PROJECT_ROOT/}"
        
        {
            echo "❌ 違反: $relative_file:$line_num"
            echo "   $content"
            echo ""
        } >> "$LOG_FILE"
        
        log_error "TODO・FIXMEコメント発見: $relative_file:$line_num"
        echo "   $content"
        
    done < "$temp_results"
    
    # 一時ファイルのクリーンアップ
    rm -f "$temp_results" "$exclude_patterns_file"
    
    # サマリー情報をレポートに追加
    {
        echo "=========================================="
        echo "検出サマリー:"
        echo "- 総検出数: $total_found"
        echo "- 違反数: $violations"
        echo "- 例外許可数: $allowed_count"
        echo ""
        echo "対応が必要な項目数: $violations"
    } >> "$LOG_FILE"
    
    log_info "レポートファイル: $LOG_FILE"
    
    return $violations
}

# 改善提案の表示
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
    log_info "TODO・FIXMEコメント検出を開始します（ripgrep版）..."
    
    # ripgrepの存在確認
    check_ripgrep
    
    cd "$PROJECT_ROOT"
    
    # TODO・FIXMEコメントの検出
    if detect_todo_comments_rg; then
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