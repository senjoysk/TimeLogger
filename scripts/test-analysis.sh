#!/bin/bash

# テスト分析スクリプト
# テスト実行 → 失敗抽出 → レポート生成

set -e

echo "🧪 テスト実行と失敗分析を開始..."

# テスト結果保存用ディレクトリ作成
mkdir -p test-reports

# テスト実行して結果を保存（失敗してもスクリプトを継続）
echo "📊 テスト実行中..."
set +e  # テスト失敗時もスクリプトを継続
npm test > test-reports/test-results.txt 2>&1
TEST_EXIT_CODE=$?
set -e  # エラーチェックを再開

# 成功/失敗の統計を表示
echo "=== テスト統計 ==="
grep "Test Suites:" test-reports/test-results.txt | tail -1

# 失敗したテストを抽出
echo -e "\n=== 失敗分析 ==="
if grep -q "FAIL " test-reports/test-results.txt; then
    # 失敗したテストスイート一覧
    echo "❌ 失敗したテストスイート:"
    grep "FAIL " test-reports/test-results.txt | sed 's/^FAIL /  - /'
    
    # 詳細な失敗情報を抽出
    echo -e "\n=== 失敗詳細 ==="
    grep -A 10 -B 2 "FAIL \|● \|Error:" test-reports/test-results.txt > test-reports/test-failures.txt
    
    # 失敗サマリーを抽出
    echo -e "\n=== 失敗サマリー ==="
    grep -A 20 "Summary of all failing tests" test-reports/test-results.txt > test-reports/test-summary.txt 2>/dev/null || echo "サマリーなし"
    
    if [ -s test-reports/test-summary.txt ]; then
        cat test-reports/test-summary.txt
    else
        head -20 test-reports/test-failures.txt
    fi
    
    echo -e "\n📁 詳細は以下ファイルを確認:"
    echo "  - test-reports/test-results.txt (全結果)"
    echo "  - test-reports/test-failures.txt (失敗詳細)"
    echo "  - test-reports/test-summary.txt (失敗サマリー)"
    
    exit $TEST_EXIT_CODE
else
    echo "✅ 全テスト成功！"
    # 成功時も統計を保存
    grep "Test Suites:" test-reports/test-results.txt > test-reports/test-success.txt
    exit $TEST_EXIT_CODE
fi