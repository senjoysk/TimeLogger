#!/bin/bash

# =============================================================================
# エラーハンドリング重複検知スクリプト (Issue #62対応)
# =============================================================================
# 冗長なtry-catch・エラーハンドリング重複を検知し、共通ハンドラの使用を推進する
# 
# 検知対象:
# - 同じcatch節やエラーハンドリング処理の重複
# - 統一エラーハンドラを使わずに直接try-catchを使用
# - console.error等の直接使用（Loggerサービス未使用）
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# カラー設定
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 検査結果カウンタ
VIOLATIONS_COUNT=0
ERRORS_COUNT=0

# =============================================================================
# ヘルパー関数
# =============================================================================

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
    ((VIOLATIONS_COUNT++))
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
    ((ERRORS_COUNT++))
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

# =============================================================================
# 重複エラーハンドリングパターンの検知
# =============================================================================

check_duplicate_error_patterns() {
    log_info "重複エラーハンドリングパターンを検知中..."
    
    local temp_file=$(mktemp)
    local patterns_file=$(mktemp)
    
    # 共通的なcatch節のパターンを検索
    find "$PROJECT_ROOT/src" -name "*.ts" -type f ! -path "*/node_modules/*" ! -path "*/__tests__/*" | while IFS= read -r file; do
        # catch節のパターンを抽出
        grep -n "catch.*error.*{" "$file" 2>/dev/null | while IFS= read -r line; do
            local line_num=$(echo "$line" | cut -d: -f1)
            local next_lines=$(sed -n "${line_num},$((line_num+5))p" "$file" 2>/dev/null)
            echo "FILE:$file:$line_num" >> "$temp_file"
            echo "$next_lines" >> "$temp_file"
            echo "---" >> "$temp_file"
        done
    done
    
    # 重複パターンを分析
    if [[ -s "$temp_file" ]]; then
        # logger.error使用チェック
        local logger_error_count=$(grep -c "logger\.error" "$temp_file" || echo "0")
        local console_error_count=$(grep -c "console\.error" "$temp_file" || echo "0")
        local throw_new_error_count=$(grep -c "throw new.*Error" "$temp_file" || echo "0")
        
        if [[ $console_error_count -gt 0 ]]; then
            log_warning "console.errorの直接使用が ${console_error_count} 箇所で検出されました"
            log_warning "→ logger.errorを使用してください（統一ログ管理）"
        fi
        
        if [[ $throw_new_error_count -gt 3 ]]; then
            log_warning "直接的なError作成が ${throw_new_error_count} 箇所で検出されました"
            log_warning "→ AppErrorまたは専用エラークラスの使用を検討してください"
        fi
    fi
    
    rm -f "$temp_file" "$patterns_file"
}

# =============================================================================
# 統一エラーハンドラの未使用検知
# =============================================================================

check_unified_error_handler_usage() {
    log_info "統一エラーハンドラーの使用状況を確認中..."
    
    local files_with_try_catch=0
    local files_with_unified_handler=0
    
    find "$PROJECT_ROOT/src" -name "*.ts" -type f ! -path "*/node_modules/*" ! -path "*/__tests__/*" ! -path "*/utils/errorHandler.ts" ! -path "*/utils/expressErrorHandler.ts" ! -path "*/utils/errors.ts" | while IFS= read -r file; do
        # try-catch使用をチェック
        if grep -q "try\s*{" "$file"; then
            files_with_try_catch=$((files_with_try_catch + 1))
            
            # 統一エラーハンドラの使用をチェック
            if grep -q "withErrorHandling\|withApiErrorHandling\|withDatabaseErrorHandling\|withDiscordErrorHandling" "$file"; then
                files_with_unified_handler=$((files_with_unified_handler + 1))
            else
                # 直接try-catchを使用している箇所を報告
                local try_catch_lines=$(grep -n "try\s*{" "$file" | head -3)
                if [[ -n "$try_catch_lines" ]]; then
                    log_warning "統一エラーハンドラー未使用: $(basename "$file")"
                    echo "$try_catch_lines" | while IFS= read -r line; do
                        echo "    $line"
                    done
                    log_warning "→ withErrorHandling系の関数を使用してください"
                fi
            fi
        fi
    done
}

# =============================================================================
# 冗長なPromise.rejectパターンの検知
# =============================================================================

check_redundant_promise_patterns() {
    log_info "冗長なPromise.rejectパターンを検知中..."
    
    find "$PROJECT_ROOT/src" -name "*.ts" -type f ! -path "*/node_modules/*" ! -path "*/__tests__/*" | xargs grep -l "new Promise.*reject" | while IFS= read -r file; do
        local reject_patterns=$(grep -n "reject.*new.*Error\|reject.*AppError" "$file" | wc -l)
        if [[ $reject_patterns -gt 2 ]]; then
            log_warning "Promise.reject重複パターン: $(basename "$file") (${reject_patterns}箇所)"
            log_warning "→ createPromiseErrorHandlerの使用を検討してください"
        fi
    done
}

# =============================================================================
# Express用エラーハンドリングの検知
# =============================================================================

check_express_error_handling() {
    log_info "Express用エラーハンドリングの使用状況を確認中..."
    
    find "$PROJECT_ROOT/src/web-admin" -name "*.ts" -type f | while IFS= read -r file; do
        if grep -q "try\s*{" "$file" && ! grep -q "asyncHandler\|expressErrorHandler\|next(" "$file"; then
            log_warning "Express用統一エラーハンドラー未使用: $(basename "$file")"
            log_warning "→ asyncHandler または expressErrorHandler を使用してください"
        fi
    done
}

# =============================================================================
# 推奨パターンの使用チェック
# =============================================================================

check_recommended_patterns() {
    log_info "推奨エラーハンドリングパターンの使用状況を確認中..."
    
    # withErrorHandling系の使用状況
    local with_error_handling_count=$(find "$PROJECT_ROOT/src" -name "*.ts" -type f ! -path "*/__tests__/*" -exec grep -l "withErrorHandling\|withApiErrorHandling\|withDatabaseErrorHandling" {} \; | wc -l)
    
    # AppError / 専用エラークラスの使用状況
    local app_error_usage=$(find "$PROJECT_ROOT/src" -name "*.ts" -type f ! -path "*/__tests__/*" -exec grep -l "AppError\|DatabaseError\|ApiError\|ValidationError" {} \; | wc -l)
    
    # Express統一ハンドラーの使用状況
    local express_handler_usage=$(find "$PROJECT_ROOT/src/web-admin" -name "*.ts" -type f -exec grep -l "asyncHandler\|expressErrorHandler" {} \; | wc -l)
    
    log_info "統一エラーハンドラー使用ファイル数: ${with_error_handling_count}"
    log_info "AppError系使用ファイル数: ${app_error_usage}"
    log_info "Express統一ハンドラー使用ファイル数: ${express_handler_usage}"
    
    if [[ $with_error_handling_count -lt 5 ]]; then
        log_warning "統一エラーハンドラーの使用が少ない可能性があります"
    fi
}

# =============================================================================
# メイン実行
# =============================================================================

main() {
    echo "=============================================================================="
    echo "🔍 エラーハンドリング重複検知スクリプト (Issue #62対応)"
    echo "=============================================================================="
    echo ""
    
    cd "$PROJECT_ROOT" || exit 1
    
    # 各チェック実行
    check_duplicate_error_patterns
    echo ""
    
    check_unified_error_handler_usage
    echo ""
    
    check_redundant_promise_patterns
    echo ""
    
    check_express_error_handling
    echo ""
    
    check_recommended_patterns
    echo ""
    
    # 結果サマリー
    echo "=============================================================================="
    echo "📊 検査結果サマリー"
    echo "=============================================================================="
    
    if [[ $ERRORS_COUNT -eq 0 && $VIOLATIONS_COUNT -eq 0 ]]; then
        log_success "エラーハンドリング重複は検出されませんでした！"
        echo ""
        log_success "✅ 統一エラーハンドラーが適切に使用されています"
        echo ""
    else
        if [[ $ERRORS_COUNT -gt 0 ]]; then
            log_error "重大な問題: ${ERRORS_COUNT} 件"
        fi
        
        if [[ $VIOLATIONS_COUNT -gt 0 ]]; then
            log_warning "改善提案: ${VIOLATIONS_COUNT} 件"
            echo ""
            echo "💡 改善方法:"
            echo "   - withErrorHandling系の関数を使用してtry-catch処理を統一"
            echo "   - AppError/専用エラークラスを使用してエラー情報を構造化"
            echo "   - Express用にはasyncHandlerとexpressErrorHandlerを使用"
            echo "   - console.error直接使用をlogger.errorに変更"
        fi
        
        echo ""
        echo "📚 詳細情報: /docs/error-handling-guideline.md"
    fi
    
    echo "=============================================================================="
    
    # 終了コード
    if [[ $ERRORS_COUNT -gt 0 ]]; then
        exit 1
    elif [[ $VIOLATIONS_COUNT -gt 0 ]]; then
        exit 0  # 警告レベルは成功扱い（pre-commitを止めない）
    else
        exit 0
    fi
}

# スクリプト実行
main "$@"