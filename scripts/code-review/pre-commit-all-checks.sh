#!/bin/bash

# Pre-commit All Checks - コミット前の包括的チェック
# このスクリプトは、実際のコミット前にすべてのチェックを実行し、
# エラーを事前に発見することで、コミットの成功率を高めます。

echo "🚀 Pre-commit チェックを開始します..."
echo "=================================="

# 実行結果を保持する変数
TOTAL_ERRORS=0
FAILED_CHECKS=()

# カラー定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# チェック関数
run_check() {
    local check_name=$1
    local check_command=$2
    
    echo -e "\n🔍 ${check_name} を実行中..."
    
    if eval "$check_command"; then
        echo -e "${GREEN}✅ ${check_name} 成功${NC}"
        return 0
    else
        echo -e "${RED}❌ ${check_name} 失敗${NC}"
        FAILED_CHECKS+=("$check_name")
        ((TOTAL_ERRORS++))
        return 1
    fi
}

# 1. TypeScriptビルドチェック
run_check "TypeScriptビルド" "npm run build"

# 2. テスト実行（順次実行モードで安定性確保）
echo -e "\n${YELLOW}📝 テストを順次実行モードで実行します（安定性優先）${NC}"
run_check "テスト実行" "npm run test:sequential || npm test -- --runInBand"

# 3. 統合テスト（問題がある場合は個別実行）
if [ -d "src/__tests__/integration" ]; then
    run_check "統合テスト" "npm run test:integration:sequential || npm run test:integration -- --runInBand"
fi

# 4. コード品質チェック
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 各品質チェックスクリプトを実行
if [ -f "$SCRIPT_DIR/console-usage-check.sh" ]; then
    run_check "console使用チェック" "$SCRIPT_DIR/console-usage-check.sh"
fi

if [ -f "$SCRIPT_DIR/type-safety-check.sh" ]; then
    run_check "型安全性チェック" "$SCRIPT_DIR/type-safety-check.sh"
fi

if [ -f "$SCRIPT_DIR/srp-violation-check.sh" ]; then
    run_check "SRP違反チェック" "$SCRIPT_DIR/srp-violation-check.sh"
fi

if [ -f "$SCRIPT_DIR/layer-separation-check.sh" ]; then
    run_check "レイヤ分離チェック" "$SCRIPT_DIR/layer-separation-check.sh"
fi

if [ -f "$SCRIPT_DIR/todo-comment-check.sh" ]; then
    # ripgrepベースの新しい実装で安定動作
    run_check "TODO/FIXMEコメントチェック" "$SCRIPT_DIR/todo-comment-check.sh"
fi

if [ -f "$SCRIPT_DIR/file-size-check.sh" ]; then
    run_check "ファイルサイズチェック" "$SCRIPT_DIR/file-size-check.sh"
fi

if [ -f "$SCRIPT_DIR/dependency-injection-check.sh" ]; then
    run_check "依存性注入チェック" "$SCRIPT_DIR/dependency-injection-check.sh"
fi

# 5. データベースパスチェック
if command -v npm &> /dev/null && npm run | grep -q "check:database-paths"; then
    run_check "データベースパスチェック" "npm run check:database-paths"
fi

# 結果サマリー
echo -e "\n=================================="
echo "📊 チェック結果サマリー"
echo "=================================="

if [ $TOTAL_ERRORS -eq 0 ]; then
    echo -e "${GREEN}✅ すべてのチェックが成功しました！${NC}"
    echo -e "${GREEN}🎉 コミットの準備が整いました。${NC}"
    echo ""
    echo "次のコマンドでコミットしてください："
    echo "  git add ."
    echo "  git commit -m \"feat: 機能説明\""
    exit 0
else
    echo -e "${RED}❌ ${TOTAL_ERRORS} 個のチェックが失敗しました${NC}"
    echo ""
    echo "失敗したチェック:"
    for check in "${FAILED_CHECKS[@]}"; do
        echo "  - $check"
    done
    echo ""
    echo -e "${YELLOW}💡 ヒント:${NC}"
    echo "1. 個別のチェックを実行して詳細を確認してください"
    echo "2. テストが不安定な場合は、順次実行モードを使用してください:"
    echo "   npm run test:sequential"
    echo "3. 特定のテストファイルのみ実行:"
    echo "   npm test -- path/to/specific.test.ts"
    exit 1
fi