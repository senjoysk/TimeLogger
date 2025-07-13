#!/bin/bash

# Git フック自動インストールスクリプト
# worktree自動セットアップ機能を有効化

set -e

# 色付きログ用の設定
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ログ関数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 使用方法
show_usage() {
    cat << EOF
Git フック自動インストールスクリプト

使用方法: $0 [command] [options]

コマンド:
  install     Gitフックをインストール（デフォルト）
  uninstall   Gitフックをアンインストール
  status      Gitフック設定状況を表示
  test        Gitフックの動作テスト

オプション:
  --force     既存のフックがある場合も強制的に上書き
  --global    グローバルGit設定を変更（全リポジトリに適用）
  --dry-run   実際のファイル操作を行わず、予定操作のみ表示

例:
  $0 install
  $0 install --force
  $0 uninstall
  $0 status

このスクリプトは以下を実行します:
1. Git フックディレクトリの設定
2. post-checkout フックの有効化
3. worktree作成時の自動環境セットアップ機能の有効化
EOF
}

# 現在のディレクトリがGitリポジトリかチェック
check_git_repo() {
    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        log_error "現在のディレクトリはGitリポジトリではありません"
        return 1
    fi
    return 0
}

# Gitフックディレクトリのパスを取得
get_hooks_path() {
    echo "$(git rev-parse --git-dir)/hooks"
}

# カスタムフックディレクトリのパスを取得
get_custom_hooks_path() {
    echo "$(git rev-parse --show-toplevel)/.githooks"
}

# Gitフックの状態をチェック
check_hook_status() {
    local hooks_path=$(get_hooks_path)
    local custom_hooks_path=$(get_custom_hooks_path)
    
    echo "📋 Git フック設定状況:"
    echo ""
    
    # Git フックディレクトリの設定確認
    local current_hooks_path=$(git config core.hooksPath 2>/dev/null || echo "デフォルト")
    echo "🔧 Gitフックディレクトリ: $current_hooks_path"
    
    # post-checkout フックの存在確認
    local post_checkout_hook
    if [ "$current_hooks_path" != "デフォルト" ]; then
        # カスタムフックパスが設定されている場合
        post_checkout_hook="$current_hooks_path/post-checkout"
    else
        # デフォルトのフックパスを使用
        post_checkout_hook="$hooks_path/post-checkout"
    fi
    
    if [ -f "$post_checkout_hook" ]; then
        if [ -x "$post_checkout_hook" ]; then
            echo "✅ post-checkout フック: 有効"
        else
            echo "⚠️  post-checkout フック: 存在するが実行権限なし"
        fi
    else
        echo "❌ post-checkout フック: 無効"
    fi
    
    # カスタムフックファイルの存在確認
    local custom_post_checkout="$custom_hooks_path/post-checkout"
    if [ -f "$custom_post_checkout" ]; then
        echo "✅ カスタムpost-checkoutフック: 存在"
    else
        echo "❌ カスタムpost-checkoutフック: 存在しません"
    fi
    
    # 設定ファイルの存在確認
    local config_file="$custom_hooks_path/config"
    if [ -f "$config_file" ]; then
        echo "✅ フック設定ファイル: 存在"
        echo ""
        echo "📝 現在の設定:"
        grep -v '^#' "$config_file" | grep -v '^$' | sed 's/^/  /'
    else
        echo "❌ フック設定ファイル: 存在しません"
    fi
    
    echo ""
}

# Gitフックをインストール
install_hooks() {
    local force="$1"
    local global="$2"
    local dry_run="$3"
    
    local custom_hooks_path=$(get_custom_hooks_path)
    
    log_info "Git フックをインストール中..."
    
    # カスタムフックディレクトリの存在確認
    if [ ! -d "$custom_hooks_path" ]; then
        log_error "カスタムフックディレクトリが見つかりません: $custom_hooks_path"
        return 1
    fi
    
    # post-checkout フックの存在確認
    local post_checkout_source="$custom_hooks_path/post-checkout"
    if [ ! -f "$post_checkout_source" ]; then
        log_error "post-checkout フックファイルが見つかりません: $post_checkout_source"
        return 1
    fi
    
    # Gitフックディレクトリの設定
    if [ "$global" = "true" ]; then
        if [ "$dry_run" = "true" ]; then
            log_info "[DRY-RUN] グローバルGit設定を変更: git config --global core.hooksPath $custom_hooks_path"
        else
            git config --global core.hooksPath "$custom_hooks_path"
            log_success "グローバルGit設定を変更しました"
        fi
    else
        if [ "$dry_run" = "true" ]; then
            log_info "[DRY-RUN] ローカルGit設定を変更: git config core.hooksPath $custom_hooks_path"
        else
            git config core.hooksPath "$custom_hooks_path"
            log_success "ローカルGit設定を変更しました"
        fi
    fi
    
    # フックファイルの実行権限を確認・設定
    if [ ! -x "$post_checkout_source" ]; then
        if [ "$dry_run" = "true" ]; then
            log_info "[DRY-RUN] 実行権限を追加: chmod +x $post_checkout_source"
        else
            chmod +x "$post_checkout_source"
            log_success "post-checkout フックに実行権限を追加しました"
        fi
    fi
    
    log_success "Git フックのインストールが完了しました"
    echo ""
    echo "🎉 worktree自動セットアップ機能が有効になりました！"
    echo ""
    echo "次のコマンドでworktreeを作成すると、自動的にセットアップが実行されます:"
    echo "  git worktree add ../feature-branch feature/new-feature"
    echo ""
    echo "設定を変更したい場合:"
    echo "  $custom_hooks_path/config を編集してください"
    echo ""
}

# Gitフックをアンインストール
uninstall_hooks() {
    local global="$1"
    local dry_run="$2"
    
    log_info "Git フックをアンインストール中..."
    
    if [ "$global" = "true" ]; then
        if [ "$dry_run" = "true" ]; then
            log_info "[DRY-RUN] グローバルGit設定を削除: git config --global --unset core.hooksPath"
        else
            git config --global --unset core.hooksPath 2>/dev/null || true
            log_success "グローバルGit設定を削除しました"
        fi
    else
        if [ "$dry_run" = "true" ]; then
            log_info "[DRY-RUN] ローカルGit設定を削除: git config --unset core.hooksPath"
        else
            git config --unset core.hooksPath 2>/dev/null || true
            log_success "ローカルGit設定を削除しました"
        fi
    fi
    
    log_success "Git フックのアンインストールが完了しました"
    log_info "worktree自動セットアップ機能が無効になりました"
}

# Gitフックの動作テスト
test_hooks() {
    local custom_hooks_path=$(get_custom_hooks_path)
    local post_checkout_hook="$custom_hooks_path/post-checkout"
    
    log_info "Git フックの動作テストを実行中..."
    
    if [ ! -f "$post_checkout_hook" ]; then
        log_error "post-checkout フックが見つかりません"
        return 1
    fi
    
    if [ ! -x "$post_checkout_hook" ]; then
        log_error "post-checkout フックに実行権限がありません"
        return 1
    fi
    
    # テスト用のパラメータでフックを実行
    log_info "post-checkout フックをテスト実行中..."
    
    # 環境変数を設定してテスト実行
    VERBOSE_LOGGING=true "$post_checkout_hook" "dummy_old_head" "dummy_new_head" "0"
    
    if [ $? -eq 0 ]; then
        log_success "post-checkout フックのテストが正常に完了しました"
    else
        log_error "post-checkout フックのテストに失敗しました"
        return 1
    fi
}

# メイン処理
main() {
    local command="${1:-install}"
    shift 2>/dev/null || true
    
    local force="false"
    local global="false"
    local dry_run="false"
    
    # オプション解析
    while [[ $# -gt 0 ]]; do
        case $1 in
            --force)
                force="true"
                shift
                ;;
            --global)
                global="true"
                shift
                ;;
            --dry-run)
                dry_run="true"
                shift
                ;;
            *)
                log_error "不明なオプション: $1"
                show_usage
                exit 1
                ;;
        esac
    done
    
    # Gitリポジトリかチェック
    if ! check_git_repo; then
        exit 1
    fi
    
    case "$command" in
        install)
            install_hooks "$force" "$global" "$dry_run"
            ;;
        uninstall)
            uninstall_hooks "$global" "$dry_run"
            ;;
        status)
            check_hook_status
            ;;
        test)
            test_hooks
            ;;
        *)
            log_error "不明なコマンド: $command"
            show_usage
            exit 1
            ;;
    esac
}

# 引数チェック
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    show_usage
    exit 0
fi

main "$@"