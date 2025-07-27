#!/bin/bash

# ファイルサイズ監視スクリプト
# 肥大化したファイルを検出し、開発効率と保守性の低下を防ぐ

set -e

echo "📏 ファイルサイズ監視チェックを開始します..."

# 設定: サイズ閾値定義
LARGE_FILE_LINES=800        # 大型ファイル警告閾値
HUGE_FILE_LINES=1500        # 巨大ファイル阻止閾値
WARNING_FILE_LINES=600      # 警告ファイル閾値

# 色付きログ用の定数
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# カウンター
warning_count=0
error_count=0
total_files=0

# ヘルパー関数: ファイルサイズ分析
analyze_file_size() {
    local file="$1"
    local lines=$(wc -l < "$file")
    local size_category=""
    local status="OK"
    
    total_files=$((total_files + 1))
    
    if [ "$lines" -ge "$HUGE_FILE_LINES" ]; then
        size_category="🚨 HUGE"
        status="ERROR"
        error_count=$((error_count + 1))
        echo -e "${RED}🚨 巨大ファイル:${NC} $file ($lines 行)"
        echo -e "   ${RED}緊急対応が必要です！${NC} 即座にファイル分割を実施してください"
    elif [ "$lines" -ge "$LARGE_FILE_LINES" ]; then
        size_category="⚠️  LARGE"
        status="WARNING"
        warning_count=$((warning_count + 1))
        echo -e "${YELLOW}⚠️  大型ファイル:${NC} $file ($lines 行)"
        echo -e "   ${YELLOW}分割を検討してください${NC}"
    elif [ "$lines" -ge "$WARNING_FILE_LINES" ]; then
        size_category="📋 WATCH"
        warning_count=$((warning_count + 1))
        echo -e "${BLUE}📋 監視対象:${NC} $file ($lines 行)"
        echo -e "   ${BLUE}注意深く見守り中${NC} - 更なる肥大化を防止"
    else
        size_category="✅ OK"
        echo -e "${GREEN}✅ 適切なサイズ:${NC} $file ($lines 行)"
    fi
    
    return 0
}

# ヘルパー関数: ファイル種別別の詳細分析
analyze_file_details() {
    local file="$1"
    local lines=$(wc -l < "$file")
    
    # TypeScriptファイルの場合、追加情報を表示
    if [[ "$file" == *.ts ]] && [ "$lines" -ge "$WARNING_FILE_LINES" ]; then
        echo -e "   ${BLUE}詳細分析:${NC}"
        
        # クラス数チェック
        local class_count=$(grep -c "^class\|^export class\|^abstract class" "$file" 2>/dev/null || echo "0")
        if [ "$class_count" -gt 0 ]; then
            echo -e "     📦 クラス数: $class_count"
        fi
        
        # インターフェース数チェック
        local interface_count=$(grep -c "^interface\|^export interface" "$file" 2>/dev/null || echo "0")
        if [ "$interface_count" -gt 0 ]; then
            echo -e "     🔌 インターフェース数: $interface_count"
        fi
        
        # 関数数チェック
        local function_count=$(grep -c "function\|=>" "$file" 2>/dev/null || echo "0")
        if [ "$function_count" -gt 0 ]; then
            echo -e "     ⚙️  関数数: $function_count"
        fi
        
        # import数チェック
        local import_count=$(grep -c "^import" "$file" 2>/dev/null || echo "0")
        if [ "$import_count" -gt 20 ]; then
            echo -e "     📥 import数: $import_count ${YELLOW}(多数)${NC}"
        fi
    fi
}

# ヘルパー関数: 分割提案生成
suggest_splitting() {
    local file="$1"
    local lines=$(wc -l < "$file")
    
    if [ "$lines" -ge "$LARGE_FILE_LINES" ]; then
        echo -e "   ${YELLOW}💡 分割提案:${NC}"
        
        case "$file" in
            *Repository.ts)
                echo -e "     • 責務別データアクセスクラスに分割"
                echo -e "     • インターフェース実装ごとに分離"
                ;;
            *Service.ts)
                echo -e "     • 機能別サブサービスに分割"
                echo -e "     • API呼び出し・ロジック・レスポンス処理を分離"
                ;;
            *Handler.ts)
                echo -e "     • コマンド解析・実行・レスポンス生成に分割"
                echo -e "     • 共通処理をユーティリティクラスに抽出"
                ;;
            *)
                echo -e "     • 責務ごとにクラス分割を検討"
                echo -e "     • 共通機能をユーティリティに抽出"
                ;;
        esac
    fi
}

# 現在のコミット対象ファイルを取得
if [ -n "$(git diff --cached --name-only)" ]; then
    # コミット対象ファイルがある場合
    files_to_check=$(git diff --cached --name-only | grep -E '\.(ts|js)$' | grep -v node_modules | grep -v dist || echo "")
else
    # 全ファイルをチェック（ただし、テストファイルと巨大な型定義ファイルは除外）
    files_to_check=$(find src -name "*.ts" -o -name "*.js" | grep -v node_modules | grep -v __tests__ | grep -v ".d.ts" | head -20)
fi

if [ -z "$files_to_check" ]; then
    echo -e "${GREEN}✅ チェック対象のファイルがありません${NC}"
    exit 0
fi

echo -e "${BLUE}📋 チェック対象ファイル数:${NC} $(echo "$files_to_check" | wc -l)"
echo ""

# 各ファイルをチェック
for file in $files_to_check; do
    if [ -f "$file" ]; then
        analyze_file_size "$file"
        analyze_file_details "$file"
        suggest_splitting "$file"
        echo ""
    fi
done

# サイズ統計生成
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}📊 ファイルサイズ監視結果${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo -e "${BLUE}📈 統計:${NC}"
echo "   総ファイル数: $total_files"
echo "   警告ファイル数: $warning_count"
echo "   エラーファイル数: $error_count"

# 最大サイズファイルを特定
if [ "$total_files" -gt 0 ]; then
    echo ""
    echo -e "${BLUE}📋 サイズ上位ファイル:${NC}"
    for file in $files_to_check; do
        if [ -f "$file" ]; then
            lines=$(wc -l < "$file")
            echo "   $lines 行: $file"
        fi
    done | sort -nr | head -5
fi

# 結果判定
if [ "$error_count" -gt 0 ]; then
    echo ""
    echo -e "${RED}❌ $error_count 件の巨大ファイルが検出されました${NC}"
    echo -e "${RED}🚨 即座に分割対応が必要です！${NC}"
    echo ""
    echo -e "${YELLOW}🛠️  緊急対応手順:${NC}"
    echo "1. 巨大ファイルを責務ごとに分割"
    echo "2. テストを追加して動作確認"
    echo "3. 分割後にコミット再実行"
    echo ""
    exit 1
elif [ "$warning_count" -gt 3 ]; then
    echo ""
    echo -e "${YELLOW}⚠️  $warning_count 件の大型ファイルが検出されました${NC}"
    echo -e "${YELLOW}📝 近い将来に分割を検討してください${NC}"
    echo ""
    echo -e "${BLUE}💡 改善提案:${NC}"
    echo "1. 段階的なリファクタリング計画を立案"
    echo "2. 新機能追加時に関連部分を分割"
    echo "3. 定期的なコードレビューで監視"
    echo ""
    # 警告は通すが、継続監視を促す
    exit 0
else
    echo ""
    echo -e "${GREEN}✅ ファイルサイズは適切な範囲内です${NC}"
    echo -e "${GREEN}✅ 良好な保守性が保たれています${NC}"
    exit 0
fi