#!/bin/bash

# worktree セットアップスクリプト
# 新しいworktreeを作成し、メインリポジトリから環境変数ファイルをコピーする

set -e  # エラー時に停止

# 色付きログ用の設定
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# 使用方法の表示
show_usage() {
    cat << EOF
使用方法: $0 <branch-name> [worktree-path]

引数:
  branch-name    作成するブランチ名
  worktree-path  worktreeを作成するパス（省略時: ../<branch-name>）

例:
  $0 feature/new-feature
  $0 hotfix/bug-fix ../my-hotfix
  $0 feature/test-branch /tmp/test-workspace

このスクリプトは以下を実行します:
1. 新しいブランチとworktreeを作成
2. メインリポジトリから環境変数ファイルをコピー
3. 依存関係をインストール
4. 開発準備完了の確認
EOF
}

# 引数チェック
if [ $# -lt 1 ] || [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    show_usage
    exit 0
fi

BRANCH_NAME="$1"
WORKTREE_PATH="${2:-../$BRANCH_NAME}"

# 現在の作業ディレクトリがGitリポジトリかチェック
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    log_error "現在のディレクトリはGitリポジトリではありません"
    exit 1
fi

# メインリポジトリのパスを取得
MAIN_REPO_PATH=$(git rev-parse --show-toplevel)
log_info "メインリポジトリ: $MAIN_REPO_PATH"

# 環境変数ファイルのリスト（優先度順）
ENV_FILES=(
    ".env"
    ".env.local"
    ".env.development"
    ".env.production"
    ".env.test"
    ".env.example"
)

# 既存のworktreeをチェック
if [ -d "$WORKTREE_PATH" ]; then
    log_error "worktreeパスが既に存在します: $WORKTREE_PATH"
    exit 1
fi

log_info "新しいworktreeを作成中: $BRANCH_NAME -> $WORKTREE_PATH"

# ブランチが既に存在するかチェック
if git show-ref --verify --quiet refs/heads/"$BRANCH_NAME"; then
    log_warning "ブランチ '$BRANCH_NAME' は既に存在します。既存ブランチを使用します。"
    git worktree add "$WORKTREE_PATH" "$BRANCH_NAME"
else
    log_info "新しいブランチ '$BRANCH_NAME' を作成します"
    git worktree add -b "$BRANCH_NAME" "$WORKTREE_PATH"
fi

log_success "worktree作成完了: $WORKTREE_PATH"

# 環境変数ファイルをコピー
log_info "環境変数ファイルをコピー中..."

COPIED_FILES=()
for env_file in "${ENV_FILES[@]}"; do
    source_file="$MAIN_REPO_PATH/$env_file"
    dest_file="$WORKTREE_PATH/$env_file"
    
    if [ -f "$source_file" ]; then
        cp "$source_file" "$dest_file"
        log_success "コピー完了: $env_file"
        COPIED_FILES+=("$env_file")
    else
        log_warning "ファイルが見つかりません: $env_file"
    fi
done

# コピー結果のサマリー
if [ ${#COPIED_FILES[@]} -eq 0 ]; then
    log_warning "環境変数ファイルが見つかりませんでした"
    log_info "手動で以下のファイルを作成してください:"
    for env_file in "${ENV_FILES[@]}"; do
        echo "  - $env_file"
    done
else
    log_success "環境変数ファイルのコピーが完了しました:"
    for copied_file in "${COPIED_FILES[@]}"; do
        echo "  ✅ $copied_file"
    done
fi

# package.jsonが存在する場合は依存関係をインストール
if [ -f "$WORKTREE_PATH/package.json" ]; then
    log_info "依存関係をインストール中..."
    cd "$WORKTREE_PATH"
    
    # npmかyarnかを判定
    if [ -f "package-lock.json" ]; then
        npm install
    elif [ -f "yarn.lock" ]; then
        yarn install
    else
        npm install
    fi
    
    log_success "依存関係のインストール完了"
    cd - > /dev/null
else
    log_warning "package.jsonが見つかりません。依存関係のインストールをスキップします。"
fi

# セットアップ完了メッセージ
echo ""
echo "🎉 worktreeセットアップ完了!"
echo ""
echo "📁 作業ディレクトリ: $WORKTREE_PATH"
echo "🌿 ブランチ: $BRANCH_NAME"
echo ""
echo "次のステップ:"
echo "  1. cd $WORKTREE_PATH"
echo "  2. 環境変数ファイルの内容を確認・編集"
if [ ${#COPIED_FILES[@]} -gt 0 ]; then
    echo "     コピーされたファイル: ${COPIED_FILES[*]}"
fi
echo "  3. 開発開始: npm run dev"
echo ""
echo "worktreeの削除方法:"
echo "  git worktree remove $WORKTREE_PATH"
echo "  git branch -D $BRANCH_NAME  # ブランチも削除する場合"