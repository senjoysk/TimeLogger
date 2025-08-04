#!/bin/bash

# SRP（単一責任原則）違反検出スクリプト v2
# 設定ファイル対応版 - ファイルタイプ別に異なる基準を適用

set -e

echo "🔍 SRP違反チェック v2 を開始します..."

# 色付きログ用の定数
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 設定ファイルのパス
CONFIG_FILE=".srpconfig.json"

# デフォルト値（設定ファイルがない場合）
DEFAULT_MAX_LINES=400
DEFAULT_MAX_METHODS=15

# 違反カウンター
violation_count=0
checked_files=0

# 設定ファイルの存在確認
if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${YELLOW}⚠️  設定ファイル ($CONFIG_FILE) が見つかりません。デフォルト値を使用します。${NC}"
fi

# ファイルタイプを判定する関数
get_file_type() {
    local file="$1"
    
    # 設定ファイルが存在する場合、パターンマッチング
    if [ -f "$CONFIG_FILE" ]; then
        # 統合クラス
        if [[ "$file" == *"/integration/"* ]] || [[ "$file" == *Integration.ts ]]; then
            echo "integration"
            return
        fi
        
        # サービス
        if [[ "$file" == *"/services/"* ]] || [[ "$file" == *Service.ts ]]; then
            echo "service"
            return
        fi
        
        # リポジトリ
        if [[ "$file" == *"/repositories/"* ]] || [[ "$file" == *Repository.ts ]]; then
            echo "repository"
            return
        fi
        
        # ハンドラー
        if [[ "$file" == *"/handlers/"* ]] || [[ "$file" == *Handler.ts ]]; then
            echo "handler"
            return
        fi
        
        # 設定
        if [[ "$file" == *"/config/"* ]] || [[ "$file" == *config.ts ]] || [[ "$file" == *Config.ts ]]; then
            echo "config"
            return
        fi
        
        # テスト
        if [[ "$file" == *"__tests__"* ]] || [[ "$file" == *.test.ts ]] || [[ "$file" == *.spec.ts ]]; then
            echo "test"
            return
        fi
        
        # インターフェース
        if [[ "$file" == *"/interfaces/"* ]] || [[ "$file" == *interfaces.ts ]]; then
            echo "interface"
            return
        fi
    fi
    
    echo "default"
}

# ファイルタイプ別の最大行数を取得
get_max_lines() {
    local file_type="$1"
    
    case "$file_type" in
        "integration")
            echo 700
            ;;
        "service")
            echo 400
            ;;
        "repository")
            echo 500
            ;;
        "handler")
            echo 300
            ;;
        "config")
            echo 600
            ;;
        "test")
            echo 800
            ;;
        "interface")
            echo 300
            ;;
        *)
            echo $DEFAULT_MAX_LINES
            ;;
    esac
}

# ファイルタイプ別の最大メソッド数を取得
get_max_methods() {
    local file_type="$1"
    
    case "$file_type" in
        "integration")
            echo 30
            ;;
        "service")
            echo 15
            ;;
        "repository")
            echo 20
            ;;
        "handler")
            echo 10
            ;;
        "config")
            echo 5
            ;;
        "test")
            echo 50
            ;;
        "interface")
            echo 0
            ;;
        *)
            echo $DEFAULT_MAX_METHODS
            ;;
    esac
}

# ファイルタイプの説明を取得
get_type_description() {
    local file_type="$1"
    
    case "$file_type" in
        "integration")
            echo "統合クラス"
            ;;
        "service")
            echo "サービス"
            ;;
        "repository")
            echo "リポジトリ"
            ;;
        "handler")
            echo "ハンドラー"
            ;;
        "config")
            echo "設定"
            ;;
        "test")
            echo "テスト"
            ;;
        "interface")
            echo "インターフェース"
            ;;
        *)
            echo "一般"
            ;;
    esac
}

# 例外チェック
check_srp_exception() {
    local file="$1"
    if grep -q "@SRP-EXCEPTION\|// SRP-IGNORE" "$file" 2>/dev/null; then
        return 0  # 例外として許可
    fi
    return 1  # 例外なし
}

# ファイルチェック関数
check_file() {
    local file="$1"
    local file_type=$(get_file_type "$file")
    local type_desc=$(get_type_description "$file_type")
    local max_lines=$(get_max_lines "$file_type")
    local max_methods=$(get_max_methods "$file_type")
    
    echo -e "${BLUE}📄 チェック中:${NC} $file ${CYAN}[${type_desc}]${NC}"
    
    # 例外チェック
    if check_srp_exception "$file"; then
        echo -e "${YELLOW}⚠️  例外許可:${NC} $file - @SRP-EXCEPTION により許可"
        return 0
    fi
    
    # 行数チェック
    local lines=$(wc -l < "$file")
    if [ "$lines" -gt "$max_lines" ]; then
        echo -e "${RED}❌ 行数超過:${NC} $file (${lines}行 > ${max_lines}行)"
        echo -e "   ${YELLOW}タイプ:${NC} ${type_desc}"
        echo -e "   ${YELLOW}対策:${NC} ファイルを責務ごとに分割してください"
        ((violation_count++))
        return 1
    fi
    
    # メソッド数チェック（インターフェースファイルはスキップ）
    if [ "$max_methods" -gt 0 ]; then
        local method_count=$(grep -c "^\s*\(public\|private\|protected\|async\|static\)\s\+\w\+\s*(" "$file" 2>/dev/null || echo "0")
        # 改行を削除して整数として扱う
        method_count=$(echo "$method_count" | tr -d '\n')
        if [ "$method_count" -gt "$max_methods" ]; then
            echo -e "${RED}❌ メソッド数超過:${NC} $file (${method_count}個 > ${max_methods}個)"
            echo -e "   ${YELLOW}タイプ:${NC} ${type_desc}"
            echo -e "   ${YELLOW}対策:${NC} クラスを小さく分割してください"
            ((violation_count++))
            return 1
        fi
    fi
    
    echo -e "${GREEN}✅ OK${NC}"
    return 0
}

# メイン処理
# Gitでステージングされたファイルを取得
files=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|js)$' || true)

if [ -z "$files" ]; then
    echo "チェック対象のTypeScript/JavaScriptファイルがありません。"
    exit 0
fi

# 統計情報の表示
total_files=$(echo "$files" | wc -l)
echo -e "${BLUE}📋 チェック対象ファイル数:${NC} $total_files"
echo ""

# 各ファイルをチェック
for file in $files; do
    if [ -f "$file" ]; then
        check_file "$file"
        ((checked_files++))
    fi
done

# 結果サマリー
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}📊 SRP違反チェック結果${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$violation_count" -eq 0 ]; then
    echo -e "${GREEN}✅ SRP違反は検出されませんでした${NC}"
    echo -e "${BLUE}チェック済みファイル:${NC} $checked_files"
else
    echo -e "${RED}❌ ${violation_count} 件のSRP違反が検出されました${NC}"
    echo ""
    echo -e "${YELLOW}🛠️  対策手順:${NC}"
    echo "1. 違反ファイルを責務ごとに分割"
    echo "2. 一時的に継続する場合は @SRP-EXCEPTION コメントを追加"
    echo "3. 例外理由を @SRP-REASON で説明"
    echo ""
    echo -e "${BLUE}💡 例外指定例:${NC}"
    echo "// @SRP-EXCEPTION: 統合クラスとして複数サービスの調整が必要"
    echo "// @SRP-REASON: システム全体の初期化と調整のため"
    exit 1
fi