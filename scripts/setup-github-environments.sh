#!/bin/bash

# GitHub環境保護ルール設定スクリプト
# Usage: ./scripts/setup-github-environments.sh

set -e

# カラー定義
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

# GitHub情報の取得
get_repo_info() {
    if ! command -v gh &> /dev/null; then
        log_error "GitHub CLI (gh) が見つかりません"
        log_info "https://cli.github.com/ からインストールしてください"
        exit 1
    fi
    
    if ! gh auth status &> /dev/null; then
        log_error "GitHub CLI にログインしていません"
        log_info "gh auth login を実行してください"
        exit 1
    fi
    
    REPO_OWNER=$(gh repo view --json owner --jq '.owner.login' 2>/dev/null || echo "")
    REPO_NAME=$(gh repo view --json name --jq '.name' 2>/dev/null || echo "")
    
    if [ -z "$REPO_OWNER" ] || [ -z "$REPO_NAME" ]; then
        log_error "リポジトリ情報を取得できません"
        log_info "Gitリポジトリのルートディレクトリで実行してください"
        exit 1
    fi
    
    log_success "リポジトリ情報を取得しました: $REPO_OWNER/$REPO_NAME"
}

# staging環境の作成
create_staging_environment() {
    log_info "staging環境を作成中..."
    
    # staging環境の作成
    if gh api repos/$REPO_OWNER/$REPO_NAME/environments/staging -q '.name' &> /dev/null; then
        log_warning "staging環境は既に存在します"
    else
        log_info "新しいstaging環境を作成中..."
        gh api repos/$REPO_OWNER/$REPO_NAME/environments/staging -X PUT \
            --field name="staging" \
            --field wait_timer=0 \
            --field prevent_self_review=false \
            --field reviewers='[]' \
            --field deployment_branch_policy='{"protected_branches":false,"custom_branch_policies":true}' \
            > /dev/null
        
        log_success "staging環境を作成しました"
    fi
    
    # staging環境のブランチポリシー設定
    log_info "staging環境のデプロイブランチを設定中..."
    gh api repos/$REPO_OWNER/$REPO_NAME/environments/staging/deployment-branch-policies -X POST \
        --field name="develop" \
        --field type="branch" \
        > /dev/null 2>&1 || log_warning "ブランチポリシー設定に失敗しました（既に存在する可能性）"
    
    log_success "staging環境の基本設定が完了しました"
}

# production環境の作成
create_production_environment() {
    log_info "production環境を作成中..."
    
    # production環境の作成（保護ルール付き）
    if gh api repos/$REPO_OWNER/$REPO_NAME/environments/production -q '.name' &> /dev/null; then
        log_warning "production環境は既に存在します"
    else
        log_info "新しいproduction環境を作成中..."
        
        # 現在のユーザー情報を取得
        CURRENT_USER=$(gh api user --jq '.login')
        
        gh api repos/$REPO_OWNER/$REPO_NAME/environments/production -X PUT \
            --field name="production" \
            --field wait_timer=60 \
            --field prevent_self_review=false \
            --field reviewers="[{\"type\":\"User\",\"id\":$(gh api users/$CURRENT_USER --jq '.id')}]" \
            --field deployment_branch_policy='{"protected_branches":false,"custom_branch_policies":true}' \
            > /dev/null
        
        log_success "production環境を作成しました（1分待機 + レビュー必須）"
    fi
    
    # production環境のブランチポリシー設定
    log_info "production環境のデプロイブランチを設定中..."
    gh api repos/$REPO_OWNER/$REPO_NAME/environments/production/deployment-branch-policies -X POST \
        --field name="main" \
        --field type="branch" \
        > /dev/null 2>&1 || log_warning "ブランチポリシー設定に失敗しました（既に存在する可能性）"
    
    log_success "production環境の保護設定が完了しました"
}

# 環境変数・シークレットの設定ガイド
setup_environment_secrets() {
    log_info "環境変数・シークレット設定ガイドを表示します..."
    
    echo ""
    log_info "🔐 必要なシークレット設定"
    echo "================================"
    echo ""
    echo "📋 共通シークレット（両環境共通）:"
    echo "  FLY_API_TOKEN        - Fly.io API Token"
    echo ""
    echo "🧪 staging環境専用シークレット:"
    echo "  STAGING_DISCORD_TOKEN      - Staging用Discord Bot Token"
    echo "  STAGING_GEMINI_API_KEY     - Staging用Gemini API Key"
    echo "  STAGING_DISCORD_CLIENT_ID  - Staging用Discord Client ID"
    echo ""
    echo "🏭 production環境専用シークレット:"
    echo "  DISCORD_TOKEN         - 本番Discord Bot Token"
    echo "  GEMINI_API_KEY        - 本番Gemini API Key"
    echo "  DISCORD_CLIENT_ID     - 本番Discord Client ID"
    echo ""
    echo "💡 シークレット設定コマンド例:"
    echo "  gh secret set FLY_API_TOKEN -e staging"
    echo "  gh secret set STAGING_DISCORD_TOKEN -e staging"
    echo "  gh secret set FLY_API_TOKEN -e production"
    echo "  gh secret set DISCORD_TOKEN -e production"
    echo ""
}

# ブランチ保護ルールの設定確認
check_branch_protection() {
    log_info "ブランチ保護ルールを確認中..."
    
    # mainブランチ保護確認
    if gh api repos/$REPO_OWNER/$REPO_NAME/branches/main/protection &> /dev/null; then
        log_success "mainブランチの保護ルールが設定されています"
    else
        log_warning "mainブランチの保護ルールが設定されていません"
        echo ""
        log_info "📋 推奨されるmainブランチ保護設定:"
        echo "  1. GitHub Web UI → Settings → Branches"
        echo "  2. main ブランチの 'Add rule' または 'Edit'"
        echo "  3. 以下の設定を有効化:"
        echo "     ✅ Require pull request reviews before merging"
        echo "     ✅ Require review from code owners"
        echo "     ✅ Require status checks to pass before merging"
        echo "     ✅ Require branches to be up to date before merging"
        echo "     ✅ Include administrators"
        echo ""
    fi
    
    # developブランチ確認
    if gh api repos/$REPO_OWNER/$REPO_NAME/branches/develop &> /dev/null; then
        log_success "developブランチが存在します"
        
        if gh api repos/$REPO_OWNER/$REPO_NAME/branches/develop/protection &> /dev/null; then
            log_success "developブランチの保護ルールが設定されています"
        else
            log_info "developブランチの保護ルール設定は任意です（個人開発）"
        fi
    else
        log_warning "developブランチが存在しません"
        log_info "git checkout -b develop && git push origin develop で作成してください"
    fi
}

# GitHub Actions ワークフロー確認
check_workflows() {
    log_info "GitHub Actions ワークフローを確認中..."
    
    STAGING_WORKFLOW=".github/workflows/staging-deploy.yml"
    PRODUCTION_WORKFLOW=".github/workflows/production-deploy.yml"
    
    if [ -f "$STAGING_WORKFLOW" ]; then
        log_success "staging-deploy.yml が存在します"
    else
        log_error "staging-deploy.yml が見つかりません"
        log_info "note/staging-environment/github-actions-workflows-design.md を参考に作成してください"
    fi
    
    if [ -f "$PRODUCTION_WORKFLOW" ]; then
        log_success "production-deploy.yml が存在します"
    else
        log_error "production-deploy.yml が見つかりません"
        log_info "既存のfly-deploy.ymlをproduction-deploy.ymlにリネームしてください"
    fi
}

# 設定完了の確認
verify_setup() {
    log_info "設定完了状況を確認中..."
    
    echo ""
    echo "🔍 環境設定確認結果"
    echo "=================="
    
    # staging環境確認
    if gh api repos/$REPO_OWNER/$REPO_NAME/environments/staging &> /dev/null; then
        echo "✅ staging環境: 設定済み"
    else
        echo "❌ staging環境: 未設定"
    fi
    
    # production環境確認
    if gh api repos/$REPO_OWNER/$REPO_NAME/environments/production &> /dev/null; then
        echo "✅ production環境: 設定済み"
    else
        echo "❌ production環境: 未設定"
    fi
    
    # ワークフロー確認
    if [ -f ".github/workflows/staging-deploy.yml" ] && [ -f ".github/workflows/production-deploy.yml" ]; then
        echo "✅ GitHub Actions ワークフロー: 設定済み"
    else
        echo "❌ GitHub Actions ワークフロー: 未完了"
    fi
    
    # シークレット確認
    STAGING_SECRETS=$(gh secret list -e staging 2>/dev/null | wc -l || echo "0")
    PRODUCTION_SECRETS=$(gh secret list -e production 2>/dev/null | wc -l || echo "0")
    
    echo "🔐 シークレット設定状況:"
    echo "   staging: ${STAGING_SECRETS}個"
    echo "   production: ${PRODUCTION_SECRETS}個"
    
    if [ "$STAGING_SECRETS" -gt 0 ] && [ "$PRODUCTION_SECRETS" -gt 0 ]; then
        echo "✅ 環境シークレット: 設定済み"
    else
        echo "⚠️ 環境シークレット: 要設定"
    fi
}

# セットアップ完了レポート
setup_complete() {
    log_success "🎉 GitHub環境保護ルール設定が完了しました！"
    echo ""
    log_info "📖 次のステップ:"
    echo "1. 🔐 環境シークレットを設定"
    echo "   gh secret set FLY_API_TOKEN -e staging"
    echo "   gh secret set STAGING_DISCORD_TOKEN -e staging"
    echo "   gh secret set FLY_API_TOKEN -e production"
    echo "   gh secret set DISCORD_TOKEN -e production"
    echo ""
    echo "2. 🛡️ ブランチ保護ルールを設定（推奨）"
    echo "   GitHub Web UI → Settings → Branches → main"
    echo ""
    echo "3. 🧪 Staging環境のテスト"
    echo "   git push origin develop"
    echo "   → staging環境への自動デプロイを確認"
    echo ""
    echo "4. 🚀 本番デプロイテスト"
    echo "   git checkout main && git merge develop && git push origin main"
    echo "   → production環境への安全なデプロイを確認"
    echo ""
    log_info "📊 設定確認:"
    echo "   gh api repos/$REPO_OWNER/$REPO_NAME/environments"
    echo "   gh secret list -e staging"
    echo "   gh secret list -e production"
}

# メイン処理
main() {
    echo "🛡️ GitHub環境保護ルールセットアップ"
    echo "===================================="
    echo ""
    
    get_repo_info
    create_staging_environment
    create_production_environment
    setup_environment_secrets
    check_branch_protection
    check_workflows
    verify_setup
    setup_complete
}

# スクリプト実行
main "$@"