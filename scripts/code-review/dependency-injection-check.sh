#!/bin/bash

# 依存性注入とany型使用の自動チェックスクリプト
# コミット前に実行して、コード品質を保証する

set -e

echo "🔍 依存性注入とany型使用の自動チェックを開始..."

# 色付きの出力設定
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# チェック結果を格納する変数
issues_found=0

# 1. any型の使用チェック
echo "📋 1. any型使用箇所をチェック中..."
any_usage=$(find src -name "*.ts" -not -path "*/node_modules/*" -not -path "*/dist/*" -not -path "*/__tests__/*" | xargs grep -n ":\s*any\b" || true)

if [ -n "$any_usage" ]; then
    echo -e "${RED}❌ any型の使用を検出:${NC}"
    echo "$any_usage" | while IFS= read -r line; do
        echo -e "  ${YELLOW}$line${NC}"
    done
    issues_found=$((issues_found + 1))
else
    echo -e "${GREEN}✅ any型の使用は検出されませんでした${NC}"
fi

# 2. オプショナル依存関係の型チェック
echo "📋 2. オプショナル依存関係の型チェック中..."
optional_any=$(find src -name "*.ts" -not -path "*/node_modules/*" -not -path "*/dist/*" -not -path "*/__tests__/*" | xargs grep -n "private.*\?\s*:\s*any\|public.*\?\s*:\s*any\|protected.*\?\s*:\s*any" || true)

if [ -n "$optional_any" ]; then
    echo -e "${RED}❌ オプショナル依存関係でany型を検出:${NC}"
    echo "$optional_any" | while IFS= read -r line; do
        echo -e "  ${YELLOW}$line${NC}"
    done
    issues_found=$((issues_found + 1))
else
    echo -e "${GREEN}✅ オプショナル依存関係の型は適切です${NC}"
fi

# 3. コンストラクタ引数のany型チェック
echo "📋 3. コンストラクタ引数のany型チェック中..."
constructor_any=$(find src -name "*.ts" -not -path "*/node_modules/*" -not -path "*/dist/*" -not -path "*/__tests__/*" | xargs grep -A 5 -B 2 "constructor" | grep -n ":\s*any" || true)

if [ -n "$constructor_any" ]; then
    echo -e "${RED}❌ コンストラクタ引数でany型を検出:${NC}"
    echo "$constructor_any" | while IFS= read -r line; do
        echo -e "  ${YELLOW}$line${NC}"
    done
    issues_found=$((issues_found + 1))
else
    echo -e "${GREEN}✅ コンストラクタ引数の型は適切です${NC}"
fi

# 4. メソッド戻り値のany型チェック
echo "📋 4. メソッド戻り値のany型チェック中..."
method_return_any=$(find src -name "*.ts" -not -path "*/node_modules/*" -not -path "*/dist/*" -not -path "*/__tests__/*" | xargs grep -n ".*\(\)\s*:\s*any\s*{" || true)

if [ -n "$method_return_any" ]; then
    echo -e "${RED}❌ メソッド戻り値でany型を検出:${NC}"
    echo "$method_return_any" | while IFS= read -r line; do
        echo -e "  ${YELLOW}$line${NC}"
    done
    issues_found=$((issues_found + 1))
else
    echo -e "${GREEN}✅ メソッド戻り値の型は適切です${NC}"
fi

# 5. 依存性注入パターンのチェック
echo "📋 5. 依存性注入パターンをチェック中..."
di_pattern_issues=$(find src -name "*.ts" -not -path "*/node_modules/*" -not -path "*/dist/*" -not -path "*/__tests__/*" | xargs grep -n "setDependency\|setService\|setRepository" | grep -v "I[A-Z]" || true)

if [ -n "$di_pattern_issues" ]; then
    echo -e "${YELLOW}⚠️  依存性注入パターンで改善の余地があります:${NC}"
    echo "$di_pattern_issues" | while IFS= read -r line; do
        echo -e "  ${YELLOW}$line${NC}"
    done
fi

# 6. インターフェース未使用の依存関係チェック
echo "📋 6. インターフェース未使用の依存関係をチェック中..."
concrete_dependency=$(find src -name "*.ts" -not -path "*/node_modules/*" -not -path "*/dist/*" -not -path "*/__tests__/*" | xargs grep -n "private.*:\s*[A-Z][a-zA-Z]*Service\|private.*:\s*[A-Z][a-zA-Z]*Repository" | grep -v "private.*:\s*I[A-Z]" || true)

if [ -n "$concrete_dependency" ]; then
    echo -e "${YELLOW}⚠️  インターフェースではなく具象クラスへの依存を検出:${NC}"
    echo "$concrete_dependency" | while IFS= read -r line; do
        echo -e "  ${YELLOW}$line${NC}"
    done
fi

# 結果のサマリー
echo ""
echo "📊 チェック結果サマリー:"
if [ $issues_found -eq 0 ]; then
    echo -e "${GREEN}✅ 依存性注入とany型使用のチェックをパスしました${NC}"
    exit 0
else
    echo -e "${RED}❌ $issues_found 件の問題が検出されました${NC}"
    echo ""
    echo "🔧 修正ガイド:"
    echo "  1. any型の使用を避け、適切な型やインターフェースを定義してください"
    echo "  2. 依存関係は具象クラスではなくインターフェースに依存させてください"
    echo "  3. コンストラクタやメソッドの型注釈を明確にしてください"
    echo ""
    echo "詳細については、依存性注入のベストプラクティスドキュメントを参照してください。"
    exit 1
fi