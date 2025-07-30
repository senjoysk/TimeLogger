#!/bin/bash

# layer-separation-check.sh
# ビジネスロジックとインフラロジック分離のチェックスクリプト
# Issue #61対応: サービス層でのDB/API直接使用を検出

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# カラー出力の定義
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔍 レイヤー分離チェックを開始...${NC}"

# エラーカウンタ
ERROR_COUNT=0

# チェック対象ディレクトリ
SERVICES_DIR="$PROJECT_ROOT/src/services"

# 除外対象ファイル（適切な理由でDB/API直接アクセスが許可されているファイル）
EXCLUDED_FILES=(
  "configService.ts"      # 環境変数読み込みは適切
  "apiCostMonitor.ts"     # repositoryを適切に注入済み
  "analysisCacheService.ts" # repositoryを適切に注入済み
  "integratedSummaryService.ts" # repositoryを適切に注入済み
  "dynamicReportScheduler.ts"   # repositoryを適切に注入済み
)

# 禁止パターンの定義（配列インデックスを数値に変更）
FORBIDDEN_PATTERNS_LIST=(
  # データベース直接操作の検出
  "sqlite3|Database|db\."
  "query\(|execute\(|run\(|all\(|get\("
  "prepare\(|transaction\("
  
  # HTTP/API直接呼び出しの検出
  "fetch\(|axios|got|request\("
  "http\.|https\."
  
  # Discord API直接操作（除外対象以外）
  "channel\.messages\.fetch|messages\.fetch"
  
  # ファイルシステム直接操作
  "fs\.|readFile|writeFile|mkdir"
)

FORBIDDEN_DESCRIPTIONS=(
  "データベース直接操作"
  "SQLクエリ直接実行"
  "データベーストランザクション直接操作"
  "HTTP/API直接呼び出し"
  "HTTP/HTTPS直接利用"
  "Discord API直接操作"
  "ファイルシステム直接操作"
)

# 許可される例外パターン（コメント付きの場合は許可）
ALLOWED_EXCEPTION_COMMENTS=(
  "// ALLOW_LAYER_VIOLATION:"
  "// ALLOW_DB_ACCESS:"
  "// ALLOW_API_ACCESS:"
)

# ファイルチェック関数
check_file() {
  local file_path="$1"
  local file_name=$(basename "$file_path")
  local file_errors=0
  
  # 除外対象ファイルかチェック
  for excluded in "${EXCLUDED_FILES[@]}"; do
    if [[ "$file_name" == "$excluded" ]]; then
      echo -e "${GREEN}✅ $file_name (除外対象)${NC}"
      return 0
    fi
  done
  
  echo -e "${BLUE}🔍 チェック中: $file_name${NC}"
  
  # 各禁止パターンをチェック
  for i in "${!FORBIDDEN_PATTERNS_LIST[@]}"; do
    local pattern="${FORBIDDEN_PATTERNS_LIST[$i]}"
    local description="${FORBIDDEN_DESCRIPTIONS[$i]}"
    
    # パターンにマッチする行を検索
    local matches=$(grep -n -E "$pattern" "$file_path" 2>/dev/null || true)
    
    if [[ -n "$matches" ]]; then
      # 例外コメントがあるかチェック
      local has_exception=false
      while IFS= read -r line; do
        local line_num=$(echo "$line" | cut -d: -f1)
        local content=$(echo "$line" | cut -d: -f2-)
        
        # 同じ行または前の行に例外コメントがあるかチェック
        for comment in "${ALLOWED_EXCEPTION_COMMENTS[@]}"; do
          if grep -q "$comment" <(sed -n "$((line_num-1)),$((line_num+1))p" "$file_path" 2>/dev/null); then
            has_exception=true
            break
          fi
        done
        
        if [[ "$has_exception" == false ]]; then
          echo -e "${RED}❌ $file_name:$line_num - $description${NC}"
          echo -e "${YELLOW}   内容: $(echo "$content" | sed 's/^[[:space:]]*//')${NC}"
          ((file_errors++))
        else
          echo -e "${YELLOW}⚠️  $file_name:$line_num - $description (例外許可)${NC}"
        fi
      done <<< "$matches"
    fi
  done
  
  if [[ $file_errors -eq 0 ]]; then
    echo -e "${GREEN}✅ $file_name - 問題なし${NC}"
  else
    echo -e "${RED}❌ $file_name - $file_errors 件の問題${NC}"
    ((ERROR_COUNT += file_errors))
  fi
  
  return $file_errors
}

# サービス層ファイルをチェック
if [[ -d "$SERVICES_DIR" ]]; then
  for service_file in "$SERVICES_DIR"/*.ts; do
    if [[ -f "$service_file" ]]; then
      check_file "$service_file"
    fi
  done
else
  echo -e "${RED}❌ サービスディレクトリが見つかりません: $SERVICES_DIR${NC}"
  exit 1
fi

echo -e "\n${BLUE}📊 チェック結果サマリー${NC}"
echo -e "対象ディレクトリ: $SERVICES_DIR"
echo -e "チェック済みファイル数: $(find "$SERVICES_DIR" -name "*.ts" | wc -l)"
echo -e "除外ファイル数: ${#EXCLUDED_FILES[@]}"

if [[ $ERROR_COUNT -eq 0 ]]; then
  echo -e "${GREEN}✅ レイヤー分離チェック完了: 問題なし${NC}"
  exit 0
else
  echo -e "${RED}❌ レイヤー分離違反: $ERROR_COUNT 件の問題が発見されました${NC}"
  echo -e "\n${YELLOW}🔧 修正方法:${NC}"
  echo -e "1. データベースアクセスはリポジトリインターフェース経由で実行"
  echo -e "2. API呼び出しは専用クライアント経由で実行"
  echo -e "3. 直接アクセスが必要な場合は適切な例外コメントを追加"
  echo -e "   例: // ALLOW_DB_ACCESS: 設定読み込みのため"
  echo -e "\n詳細は Issue #61 を参照してください。"
  exit 1
fi