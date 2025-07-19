#!/bin/bash
# Claude Code対応 Git Worktree管理スクリプト
# 使用方法:
#   ./scripts/worktree.sh new <新ブランチ名>          # 新ブランチ作成＋worktree作成
#   ./scripts/worktree.sh add <ブランチ名> [フォルダ名]
#   ./scripts/worktree.sh list
#   ./scripts/worktree.sh remove <フォルダ名>

set -e  # エラー時即座に終了

COMMAND=${1}
WORKTREE_BASE_DIR="./worktrees"

# 現在のブランチを記憶
ORIGINAL_BRANCH=$(git rev-parse --abbrev-ref HEAD)

# ヘルプ表示
show_help() {
    echo "Git Worktree管理スクリプト (Claude Code対応)"
    echo ""
    echo "使用方法:"
    echo "  $0 new <新ブランチ名>              # 新ブランチ作成＋worktree作成"
    echo "  $0 add <ブランチ名> [フォルダ名]    # worktree作成"
    echo "  $0 list                          # worktree一覧"
    echo "  $0 remove <フォルダ名>            # worktree削除"
    echo ""
    echo "例:"
    echo "  $0 new feature/issue-15"
    echo "  $0 add feature/issue-15 issue-15"
    echo "  $0 add develop staging"
    echo "  $0 list"
    echo "  $0 remove issue-15"
}

# 新ブランチ作成＋worktree作成
worktree_new() {
    NEW_BRANCH_NAME=${1}
    
    if [ -z "$NEW_BRANCH_NAME" ]; then
        echo "❌ 新ブランチ名が必要です"
        show_help
        exit 1
    fi
    
    # ブランチ名をフォルダ名として使用（スラッシュをハイフンに変換）
    FOLDER_NAME=$(echo "$NEW_BRANCH_NAME" | sed 's/\//-/g')
    
    echo "🌱 Creating new branch and worktree..."
    echo "   📍 Original branch: $ORIGINAL_BRANCH"
    echo "   🌿 New branch: $NEW_BRANCH_NAME"
    echo "   📁 Folder: $WORKTREE_BASE_DIR/$FOLDER_NAME"
    echo ""
    
    # 元のブランチに確実に戻る
    echo "🔄 Ensuring we're on the original branch: $ORIGINAL_BRANCH"
    git checkout "$ORIGINAL_BRANCH"
    
    # 新ブランチを作成（現在のブランチから分岐）
    echo "🌱 Creating new branch: $NEW_BRANCH_NAME"
    git checkout -b "$NEW_BRANCH_NAME"
    
    # 元のブランチに戻る
    echo "🔄 Returning to original branch: $ORIGINAL_BRANCH"
    git checkout "$ORIGINAL_BRANCH"
    
    # worktreesディレクトリ作成
    mkdir -p "$WORKTREE_BASE_DIR"
    
    # worktree作成（新ブランチを指定）
    echo "🌿 Creating worktree: $WORKTREE_BASE_DIR/$FOLDER_NAME -> $NEW_BRANCH_NAME"
    git worktree add "$WORKTREE_BASE_DIR/$FOLDER_NAME" "$NEW_BRANCH_NAME"
    
    # 環境ファイルコピー
    echo "📄 Copying environment files..."
    for file in .env.local .env.development .env.production .env; do
        if [ -f "$file" ]; then
            cp "$file" "$WORKTREE_BASE_DIR/$FOLDER_NAME/"
            echo "   ✅ Copied: $file"
        fi
    done
    
    # 依存関係インストール
    echo "📦 Installing dependencies..."
    (cd "$WORKTREE_BASE_DIR/$FOLDER_NAME" && npm install --silent)
    
    echo ""
    echo "🎉 New branch and worktree created successfully!"
    echo "📁 Path: $WORKTREE_BASE_DIR/$FOLDER_NAME"
    echo "🌿 Branch: $NEW_BRANCH_NAME"
    echo "🔄 To switch: cd $WORKTREE_BASE_DIR/$FOLDER_NAME"
    echo "📍 Original branch preserved: $ORIGINAL_BRANCH"
}

# worktree作成
worktree_add() {
    BRANCH_NAME=${1}
    FOLDER_NAME=${2:-$1}
    
    if [ -z "$BRANCH_NAME" ]; then
        echo "❌ ブランチ名が必要です"
        show_help
        exit 1
    fi
    
    # worktreesディレクトリ作成
    mkdir -p "$WORKTREE_BASE_DIR"
    
    # worktree作成
    echo "🌿 Creating worktree: $WORKTREE_BASE_DIR/$FOLDER_NAME -> $BRANCH_NAME"
    git worktree add "$WORKTREE_BASE_DIR/$FOLDER_NAME" "$BRANCH_NAME"
    
    # 環境ファイルコピー
    echo "📄 Copying environment files..."
    for file in .env.local .env.development .env.production .env; do
        if [ -f "$file" ]; then
            cp "$file" "$WORKTREE_BASE_DIR/$FOLDER_NAME/"
            echo "   ✅ Copied: $file"
        fi
    done
    
    # 依存関係インストール
    echo "📦 Installing dependencies..."
    (cd "$WORKTREE_BASE_DIR/$FOLDER_NAME" && npm install --silent)
    
    echo ""
    echo "🎉 Worktree created successfully!"
    echo "📁 Path: $WORKTREE_BASE_DIR/$FOLDER_NAME"
    echo "🔄 To switch: cd $WORKTREE_BASE_DIR/$FOLDER_NAME"
}

# worktree一覧
worktree_list() {
    echo "📋 Current worktrees:"
    git worktree list
}

# worktree削除
worktree_remove() {
    FOLDER_NAME=${1}
    
    if [ -z "$FOLDER_NAME" ]; then
        echo "❌ フォルダ名が必要です"
        show_help
        exit 1
    fi
    
    echo "🗑️  Removing worktree: $WORKTREE_BASE_DIR/$FOLDER_NAME"
    git worktree remove "$WORKTREE_BASE_DIR/$FOLDER_NAME"
    echo "✅ Worktree removed successfully!"
}

# メインロジック
case "$COMMAND" in
    "new")
        worktree_new "$2"
        ;;
    "add")
        worktree_add "$2" "$3"
        ;;
    "list")
        worktree_list
        ;;
    "remove")
        worktree_remove "$2"
        ;;
    "help"|"-h"|"--help"|"")
        show_help
        ;;
    *)
        echo "❌ 不明なコマンド: $COMMAND"
        show_help
        exit 1
        ;;
esac