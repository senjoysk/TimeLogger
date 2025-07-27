#!/bin/bash

# SRP（単一責任原則）違反検出スクリプト
# ファイルの責務肥大化を自動検出し、コミット時に警告・阻止する

set -e

echo "🔍 SRP違反チェックを開始します..."

# 設定: 閾値定義
MAX_LINES=500              # ファイル最大行数
MAX_METHODS=20             # クラス最大メソッド数
MAX_INTERFACES=3           # 最大実装インターフェース数
MAX_IMPORTS=30             # 最大import数（複雑度の指標）

# 色付きログ用の定数
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 違反カウンター
violation_count=0

# ヘルパー関数: 例外チェック
check_srp_exception() {
    local file="$1"
    if grep -q "@SRP-EXCEPTION\|// SRP-IGNORE" "$file" 2>/dev/null; then
        return 0  # 例外として許可
    fi
    return 1  # 例外なし
}

# ヘルパー関数: 行数チェック
check_file_lines() {
    local file="$1"
    local lines=$(wc -l < "$file")
    
    if [ "$lines" -gt "$MAX_LINES" ]; then
        if ! check_srp_exception "$file"; then
            echo -e "${RED}❌ ファイル行数超過:${NC} $file ($lines 行 > $MAX_LINES 行)"
            echo -e "   ${YELLOW}対策:${NC} ファイルを責務ごとに分割してください"
            return 1
        else
            echo -e "${YELLOW}⚠️  例外許可:${NC} $file ($lines 行) - @SRP-EXCEPTION により許可"
        fi
    fi
    return 0
}

# ヘルパー関数: メソッド数チェック
check_method_count() {
    local file="$1"
    
    # TypeScriptファイルのみチェック
    if [[ "$file" != *.ts ]]; then
        return 0
    fi
    
    local method_count=$(grep -c "^\s*\(public\|private\|protected\)\s.*(" "$file" 2>/dev/null | head -1 || echo "0")
    
    if [ "$method_count" -gt "$MAX_METHODS" ]; then
        if ! check_srp_exception "$file"; then
            echo -e "${RED}❌ メソッド数超過:${NC} $file ($method_count メソッド > $MAX_METHODS メソッド)"
            echo -e "   ${YELLOW}対策:${NC} クラスを責務ごとに分割してください"
            return 1
        else
            echo -e "${YELLOW}⚠️  例外許可:${NC} $file ($method_count メソッド) - @SRP-EXCEPTION により許可"
        fi
    fi
    return 0
}

# ヘルパー関数: インターフェース実装数チェック
check_interface_count() {
    local file="$1"
    
    # TypeScriptファイルのみチェック
    if [[ "$file" != *.ts ]]; then
        return 0
    fi
    
    local implements_line=$(grep "implements" "$file" 2>/dev/null || echo "")
    if [ -n "$implements_line" ]; then
        # カンマで区切られたインターフェース数を数える
        local interface_count=$(echo "$implements_line" | grep -o "," | wc -l)
        interface_count=$((interface_count + 1))  # カンマ数 + 1 = インターフェース数
        
        if [ "$interface_count" -gt "$MAX_INTERFACES" ]; then
            if ! check_srp_exception "$file"; then
                echo -e "${RED}❌ インターフェース実装数超過:${NC} $file ($interface_count 実装 > $MAX_INTERFACES 実装)"
                echo -e "   ${YELLOW}対策:${NC} 責務ごとに個別クラスに分割してください"
                echo -e "   ${BLUE}実装中:${NC} $implements_line"
                return 1
            else
                echo -e "${YELLOW}⚠️  例外許可:${NC} $file ($interface_count 実装) - @SRP-EXCEPTION により許可"
            fi
        fi
    fi
    return 0
}

# ヘルパー関数: import数チェック（複雑度の指標）
check_import_count() {
    local file="$1"
    
    # TypeScriptファイルのみチェック
    if [[ "$file" != *.ts ]]; then
        return 0
    fi
    
    local import_count=$(grep "^import" "$file" 2>/dev/null | wc -l)
    
    if [ "$import_count" -gt "$MAX_IMPORTS" ]; then
        if ! check_srp_exception "$file"; then
            echo -e "${YELLOW}⚠️  import数多数:${NC} $file ($import_count imports > $MAX_IMPORTS imports)"
            echo -e "   ${BLUE}情報:${NC} 複雑度が高い可能性があります。分割を検討してください"
            # import数はwarningのみで、違反カウンターは増やさない
        fi
    fi
    return 0
}

# メインチェック関数
check_file() {
    local file="$1"
    local file_violations=0
    
    echo -e "${BLUE}📄 チェック中:${NC} $file"
    
    if ! check_file_lines "$file"; then
        file_violations=$((file_violations + 1))
    fi
    
    if ! check_method_count "$file"; then
        file_violations=$((file_violations + 1))
    fi
    
    if ! check_interface_count "$file"; then
        file_violations=$((file_violations + 1))
    fi
    
    check_import_count "$file"  # warningのみなので違反カウントには含めない
    
    if [ "$file_violations" -eq 0 ]; then
        echo -e "${GREEN}✅ OK${NC}"
    fi
    
    return $file_violations
}

# 現在のコミット対象ファイルを取得
if [ -n "$(git diff --cached --name-only)" ]; then
    # コミット対象ファイルがある場合
    files_to_check=$(git diff --cached --name-only | grep -E '\.(ts|js)$' | grep -v node_modules | grep -v dist || echo "")
else
    # 初回コミットなど、コミット対象ファイルがない場合は全ファイルをチェック
    files_to_check=$(find src -name "*.ts" -o -name "*.js" | grep -v node_modules | grep -v __tests__)
fi

if [ -z "$files_to_check" ]; then
    echo -e "${GREEN}✅ チェック対象のTypeScript/JavaScriptファイルがありません${NC}"
    exit 0
fi

echo -e "${BLUE}📋 チェック対象ファイル数:${NC} $(echo "$files_to_check" | wc -l)"
echo ""

# 各ファイルをチェック
for file in $files_to_check; do
    if [ -f "$file" ]; then
        if ! check_file "$file"; then
            violation_count=$((violation_count + 1))
        fi
        echo ""
    fi
done

# 結果レポート
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}📊 SRP違反チェック結果${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$violation_count" -eq 0 ]; then
    echo -e "${GREEN}✅ SRP違反は検出されませんでした${NC}"
    echo -e "${GREEN}✅ 全ファイルが単一責任原則を遵守しています${NC}"
    exit 0
else
    echo -e "${RED}❌ $violation_count 件のSRP違反が検出されました${NC}"
    echo ""
    echo -e "${YELLOW}🛠️  対策手順:${NC}"
    echo "1. 違反ファイルを責務ごとに分割"
    echo "2. 一時的に継続する場合は @SRP-EXCEPTION コメントを追加"
    echo "3. 例外理由を @SRP-REASON で説明"
    echo ""
    echo -e "${BLUE}💡 例外指定例:${NC}"
    echo "// @SRP-EXCEPTION: 統合リポジトリとして複数インターフェース実装が必要"
    echo "// @SRP-REASON: 既存システムとの互換性維持のため段階的分割中"
    echo ""
    exit 1
fi