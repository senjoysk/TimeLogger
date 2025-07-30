#!/bin/bash

##############################################
# 型安全性チェックスクリプト
# 
# 目的: TypeScriptコードのany型使用と型注釈不足を検出
# 使用方法: ./scripts/code-review/type-safety-check.sh
##############################################

# カラー定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# カウンタ初期化
ANY_COUNT=0
ISSUES_FOUND=0

echo -e "${BLUE}=== TypeScript 型安全性チェック ===${NC}"
echo ""

# 1. any型の使用チェック（テストファイル以外）
echo -e "${YELLOW}1. any型使用箇所の検出...${NC}"
echo ""

# any型の許可リスト（ALLOW_ANYコメント付きの行を除外）
ANY_FILES=$(find src -name "*.ts" -not -path "src/__tests__/*" -type f)

for file in $ANY_FILES; do
    # ALLOW_ANYコメントがない行でany型を使用している箇所を検出
    ANY_LINES=$(grep -n "\bany\b" "$file" 2>/dev/null | grep -v "// ALLOW_ANY" | grep -v "// @ts-ignore")
    
    if [[ ! -z "$ANY_LINES" ]]; then
        echo -e "${RED}❌ any型使用: $file${NC}"
        echo "$ANY_LINES" | while IFS= read -r line; do
            echo "   $line"
        done
        echo ""
        ((ANY_COUNT++))
        ((ISSUES_FOUND++))
    fi
done

if [[ $ANY_COUNT -eq 0 ]]; then
    echo -e "${GREEN}✅ any型の使用は検出されませんでした${NC}"
fi

echo ""

# 2. 型注釈チェックのための準備
echo -e "${YELLOW}2. 型注釈の不足チェック...${NC}"
echo ""

# TypeScriptコンパイラを使用した詳細な型チェック
COMPILE_OUTPUT=$(npx tsc --noEmit --strict 2>&1)

# noImplicitAny関連のエラーを抽出
IMPLICIT_ANY_ERRORS=$(echo "$COMPILE_OUTPUT" | grep -E "has an implicit 'any' type|implicitly has an 'any' type")

if [[ ! -z "$IMPLICIT_ANY_ERRORS" ]]; then
    echo -e "${RED}❌ 暗黙的なany型が検出されました:${NC}"
    echo "$IMPLICIT_ANY_ERRORS"
    ((ISSUES_FOUND++))
else
    echo -e "${GREEN}✅ 暗黙的なany型は検出されませんでした${NC}"
fi

echo ""

# 3. 関数の戻り値型チェック
echo -e "${YELLOW}3. 関数の戻り値型チェック...${NC}"
echo ""

# 明示的な戻り値型がない関数を検出（簡易チェック）
RETURN_TYPE_ISSUES=$(echo "$COMPILE_OUTPUT" | grep -E "Missing return type on function")

if [[ ! -z "$RETURN_TYPE_ISSUES" ]]; then
    echo -e "${RED}❌ 戻り値型が不足している関数が検出されました:${NC}"
    echo "$RETURN_TYPE_ISSUES"
    ((ISSUES_FOUND++))
else
    echo -e "${GREEN}✅ 全ての関数に戻り値型が明示されています${NC}"
fi

echo ""

# 4. 結果サマリー
echo -e "${BLUE}=== チェック結果 ===${NC}"
echo ""

if [[ $ISSUES_FOUND -eq 0 ]]; then
    echo -e "${GREEN}✅ すべての型安全性チェックに合格しました！${NC}"
    exit 0
else
    echo -e "${RED}❌ ${ISSUES_FOUND}個の型安全性の問題が検出されました${NC}"
    echo ""
    echo -e "${YELLOW}対処方法:${NC}"
    echo "1. any型の使用箇所には具体的な型を指定してください"
    echo "2. やむを得ずany型を使用する場合は、以下のコメントを追加:"
    echo "   // ALLOW_ANY: [理由を記載]"
    echo "3. 関数には必ず戻り値型を明示してください"
    echo "4. パラメータには型注釈を追加してください"
    echo ""
    echo -e "${BLUE}詳細は CLAUDE.md の型安全性ガイドラインを参照してください${NC}"
    exit 1
fi