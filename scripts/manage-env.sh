#!/bin/bash

# 環境変数ファイル管理スクリプト
# .envファイルの同期、バックアップ、復元を行う

set -e

# 色付きログ用の設定
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ログ関数
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 環境変数ファイルのリスト
ENV_FILES=(".env" ".env.local" ".env.development" ".env.production" ".env.test" ".env.example")

# メインリポジトリのパスを取得
MAIN_REPO_PATH=$(git rev-parse --show-toplevel)

# 使用方法
show_usage() {
    cat << EOF
環境変数ファイル管理スクリプト

使用方法: $0 <command> [options]

コマンド:
  sync-from-main   メインリポジトリから環境変数ファイルをコピー
  sync-to-main     現在の環境変数ファイルをメインリポジトリにコピー
  backup           環境変数ファイルをバックアップ
  restore          バックアップから環境変数ファイルを復元
  diff             メインリポジトリとの差分を表示
  list             環境変数ファイルの一覧を表示
  validate         環境変数ファイルの内容を検証

オプション:
  --dry-run        実際のファイル操作を行わず、予定操作のみ表示
  --force          確認なしで操作を実行
  --backup-dir     バックアップディレクトリ（デフォルト: .env-backups）

例:
  $0 sync-from-main
  $0 sync-to-main --dry-run
  $0 backup
  $0 diff .env
EOF
}

# 現在のディレクトリがworktreeかチェック
check_worktree() {
    local current_path=$(pwd)
    local main_path=$(realpath "$MAIN_REPO_PATH")
    
    if [ "$current_path" = "$main_path" ]; then
        log_warning "現在のディレクトリはメインリポジトリです"
        return 1
    fi
    
    if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
        log_error "現在のディレクトリはGitワークツリーではありません"
        return 1
    fi
    
    return 0
}

# ファイルの差分を表示
show_diff() {
    local file="$1"
    local main_file="$MAIN_REPO_PATH/$file"
    local current_file="./$file"
    
    if [ ! -f "$main_file" ] && [ ! -f "$current_file" ]; then
        log_info "$file: 両方のファイルが存在しません"
        return
    fi
    
    if [ ! -f "$main_file" ]; then
        log_info "$file: メインリポジトリにファイルが存在しません（新しいファイル）"
        return
    fi
    
    if [ ! -f "$current_file" ]; then
        log_info "$file: 現在のディレクトリにファイルが存在しません（削除されたファイル）"
        return
    fi
    
    if diff -q "$main_file" "$current_file" > /dev/null; then
        log_success "$file: 差分なし"
    else
        log_warning "$file: 差分あり"
        echo "--- メインリポジトリ: $main_file"
        echo "+++ 現在のディレクトリ: $current_file"
        diff -u "$main_file" "$current_file" || true
        echo ""
    fi
}

# ファイルの内容を検証
validate_env_file() {
    local file="$1"
    
    if [ ! -f "$file" ]; then
        log_warning "$file: ファイルが存在しません"
        return 1
    fi
    
    local errors=0
    local line_num=0
    
    while IFS= read -r line; do
        ((line_num++))
        
        # 空行やコメント行はスキップ
        if [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]]; then
            continue
        fi
        
        # 環境変数の形式をチェック
        if [[ ! "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then
            log_error "$file:$line_num 無効な形式: $line"
            ((errors++))
        fi
        
        # 値が引用符で囲まれているかチェック（推奨）
        if [[ "$line" =~ = ]] && [[ ! "$line" =~ =[\"\'].*[\"\']$ ]] && [[ ! "$line" =~ =[^[:space:]]*$ ]]; then
            log_warning "$file:$line_num 値を引用符で囲むことを推奨: $line"
        fi
        
    done < "$file"
    
    if [ $errors -eq 0 ]; then
        log_success "$file: 検証OK"
        return 0
    else
        log_error "$file: $errors 個のエラーが見つかりました"
        return 1
    fi
}

# メインリポジトリから同期
sync_from_main() {
    local dry_run="$1"
    local force="$2"
    
    if ! check_worktree; then
        return 1
    fi
    
    log_info "メインリポジトリから環境変数ファイルを同期中..."
    
    for env_file in "${ENV_FILES[@]}"; do
        local main_file="$MAIN_REPO_PATH/$env_file"
        local current_file="./$env_file"
        
        if [ -f "$main_file" ]; then
            if [ -f "$current_file" ] && [ "$force" != "true" ]; then
                if ! diff -q "$main_file" "$current_file" > /dev/null; then
                    log_warning "$env_file: ファイルが存在し、内容が異なります"
                    if [ "$dry_run" != "true" ]; then
                        read -p "上書きしますか？ (y/N): " -n 1 -r
                        echo
                        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                            log_info "$env_file: スキップしました"
                            continue
                        fi
                    fi
                fi
            fi
            
            if [ "$dry_run" = "true" ]; then
                log_info "[DRY-RUN] $env_file をコピーします"
            else
                cp "$main_file" "$current_file"
                log_success "$env_file: コピー完了"
            fi
        else
            log_warning "$env_file: メインリポジトリにファイルが存在しません"
        fi
    done
}

# メインリポジトリに同期
sync_to_main() {
    local dry_run="$1"
    local force="$2"
    
    if ! check_worktree; then
        return 1
    fi
    
    log_info "メインリポジトリに環境変数ファイルを同期中..."
    
    for env_file in "${ENV_FILES[@]}"; do
        local main_file="$MAIN_REPO_PATH/$env_file"
        local current_file="./$env_file"
        
        if [ -f "$current_file" ]; then
            if [ -f "$main_file" ] && [ "$force" != "true" ]; then
                if ! diff -q "$main_file" "$current_file" > /dev/null; then
                    log_warning "$env_file: メインファイルが存在し、内容が異なります"
                    if [ "$dry_run" != "true" ]; then
                        read -p "上書きしますか？ (y/N): " -n 1 -r
                        echo
                        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                            log_info "$env_file: スキップしました"
                            continue
                        fi
                    fi
                fi
            fi
            
            if [ "$dry_run" = "true" ]; then
                log_info "[DRY-RUN] $env_file をメインリポジトリにコピーします"
            else
                cp "$current_file" "$main_file"
                log_success "$env_file: メインリポジトリにコピー完了"
            fi
        else
            log_warning "$env_file: 現在のディレクトリにファイルが存在しません"
        fi
    done
}

# バックアップ作成
create_backup() {
    local backup_dir="${1:-.env-backups}"
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    local backup_path="$backup_dir/$timestamp"
    
    mkdir -p "$backup_path"
    
    local backed_up=0
    for env_file in "${ENV_FILES[@]}"; do
        if [ -f "$env_file" ]; then
            cp "$env_file" "$backup_path/"
            log_success "$env_file: バックアップ完了"
            ((backed_up++))
        fi
    done
    
    if [ $backed_up -gt 0 ]; then
        log_success "バックアップ作成完了: $backup_path"
        echo "復元方法: $0 restore $backup_path"
    else
        log_warning "バックアップするファイルが見つかりませんでした"
        rmdir "$backup_path" 2>/dev/null || true
    fi
}

# バックアップから復元
restore_backup() {
    local backup_path="$1"
    
    if [ ! -d "$backup_path" ]; then
        log_error "バックアップディレクトリが見つかりません: $backup_path"
        return 1
    fi
    
    log_info "バックアップから復元中: $backup_path"
    
    for env_file in "${ENV_FILES[@]}"; do
        local backup_file="$backup_path/$env_file"
        if [ -f "$backup_file" ]; then
            cp "$backup_file" "./"
            log_success "$env_file: 復元完了"
        fi
    done
}

# メイン処理
main() {
    local command="$1"
    shift
    
    local dry_run="false"
    local force="false"
    local backup_dir=".env-backups"
    
    # オプション解析
    while [[ $# -gt 0 ]]; do
        case $1 in
            --dry-run)
                dry_run="true"
                shift
                ;;
            --force)
                force="true"
                shift
                ;;
            --backup-dir)
                backup_dir="$2"
                shift 2
                ;;
            *)
                break
                ;;
        esac
    done
    
    case "$command" in
        sync-from-main)
            sync_from_main "$dry_run" "$force"
            ;;
        sync-to-main)
            sync_to_main "$dry_run" "$force"
            ;;
        backup)
            create_backup "$backup_dir"
            ;;
        restore)
            restore_backup "$1"
            ;;
        diff)
            if [ -n "$1" ]; then
                show_diff "$1"
            else
                for env_file in "${ENV_FILES[@]}"; do
                    show_diff "$env_file"
                done
            fi
            ;;
        list)
            log_info "環境変数ファイル一覧:"
            for env_file in "${ENV_FILES[@]}"; do
                if [ -f "$env_file" ]; then
                    echo "  ✅ $env_file"
                else
                    echo "  ❌ $env_file (存在しません)"
                fi
            done
            ;;
        validate)
            local all_valid=true
            for env_file in "${ENV_FILES[@]}"; do
                if [ -f "$env_file" ]; then
                    if ! validate_env_file "$env_file"; then
                        all_valid=false
                    fi
                fi
            done
            if [ "$all_valid" = "true" ]; then
                log_success "すべての環境変数ファイルが有効です"
            else
                log_error "一部の環境変数ファイルにエラーがあります"
                exit 1
            fi
            ;;
        *)
            show_usage
            exit 1
            ;;
    esac
}

# 引数チェック
if [ $# -eq 0 ] || [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    show_usage
    exit 0
fi

main "$@"