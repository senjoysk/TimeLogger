#!/usr/bin/env node

/**
 * Coverage Threshold Checker
 * Phase 4: カバレッジ監視と品質ゲート
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// カバレッジしきい値設定
const COVERAGE_THRESHOLDS = {
  statements: 65.0,  // 現在66.47% -> 65%に設定
  branches: 58.0,    // 現在60.67% -> 58%に設定  
  functions: 70.0,   // 現在72.08% -> 70%に設定
  lines: 65.0        // 現在66.54% -> 65%に設定
};

// カバレッジ目標値（段階的向上用）
const COVERAGE_TARGETS = {
  statements: 70.0,
  branches: 65.0,
  functions: 75.0,
  lines: 70.0
};

function main() {
  console.log('🔍 Test Coverage Quality Check');
  console.log('================================');
  
  try {
    // テストカバレッジを実行して結果を取得
    console.log('📊 Running test coverage...');
    const coverageOutput = execSync('npm run test:coverage -- --silent --coverageReporters=text-summary', {
      encoding: 'utf8',
      stdio: 'pipe'
    });
    
    // カバレッジ数値を抽出
    const coverage = extractCoverageData(coverageOutput);
    
    if (!coverage) {
      console.error('❌ Failed to parse coverage data');
      process.exit(1);
    }
    
    console.log('\n📈 Current Coverage:');
    console.log(`  Statements: ${coverage.statements}%`);
    console.log(`  Branches: ${coverage.branches}%`);
    console.log(`  Functions: ${coverage.functions}%`);
    console.log(`  Lines: ${coverage.lines}%`);
    
    // しきい値チェック
    const thresholdResults = checkThresholds(coverage);
    
    // 目標値との比較
    const targetResults = checkTargets(coverage);
    
    // 結果表示
    displayResults(thresholdResults, targetResults);
    
    // 品質ゲート判定
    if (thresholdResults.failed.length > 0) {
      console.log('\n🚨 Quality Gate: FAILED');
      console.log('💡 Please add tests to improve coverage before merging');
      process.exit(1);
    } else {
      console.log('\n✅ Quality Gate: PASSED');
      console.log('🎉 All coverage thresholds met!');
      
      if (targetResults.achieved.length > 0) {
        console.log('\n🎯 Bonus: Target achievements detected!');
        targetResults.achieved.forEach(metric => {
          console.log(`  ✨ ${metric} target reached!`);
        });
      }
      
      process.exit(0);
    }
    
  } catch (error) {
    console.error('❌ Coverage check failed:', error.message);
    process.exit(1);
  }
}

function extractCoverageData(output) {
  const patterns = {
    statements: /Statements\s*:\s*(\d+\.?\d*)%/,
    branches: /Branches\s*:\s*(\d+\.?\d*)%/,
    functions: /Functions\s*:\s*(\d+\.?\d*)%/,
    lines: /Lines\s*:\s*(\d+\.?\d*)%/
  };
  
  const coverage = {};
  
  for (const [metric, pattern] of Object.entries(patterns)) {
    const match = output.match(pattern);
    if (match) {
      coverage[metric] = parseFloat(match[1]);
    } else {
      console.warn(`⚠️ Could not parse ${metric} coverage`);
      return null;
    }
  }
  
  return coverage;
}

function checkThresholds(coverage) {
  const passed = [];
  const failed = [];
  
  for (const [metric, threshold] of Object.entries(COVERAGE_THRESHOLDS)) {
    const current = coverage[metric];
    
    if (current >= threshold) {
      passed.push({
        metric,
        current,
        threshold,
        margin: (current - threshold).toFixed(2)
      });
    } else {
      failed.push({
        metric,
        current,
        threshold,
        deficit: (threshold - current).toFixed(2)
      });
    }
  }
  
  return { passed, failed };
}

function checkTargets(coverage) {
  const achieved = [];
  const remaining = [];
  
  for (const [metric, target] of Object.entries(COVERAGE_TARGETS)) {
    const current = coverage[metric];
    
    if (current >= target) {
      achieved.push(metric);
    } else {
      remaining.push({
        metric,
        current,
        target,
        needed: (target - current).toFixed(2)
      });
    }
  }
  
  return { achieved, remaining };
}

function displayResults(thresholdResults, targetResults) {
  console.log('\n🎯 Threshold Check Results:');
  
  // 成功したしきい値
  if (thresholdResults.passed.length > 0) {
    console.log('  ✅ Passed:');
    thresholdResults.passed.forEach(result => {
      console.log(`    ${result.metric}: ${result.current}% (>${result.threshold}%, +${result.margin}%)`);
    });
  }
  
  // 失敗したしきい値
  if (thresholdResults.failed.length > 0) {
    console.log('  ❌ Failed:');
    thresholdResults.failed.forEach(result => {
      console.log(`    ${result.metric}: ${result.current}% (<${result.threshold}%, -${result.deficit}%)`);
    });
  }
  
  // 目標値進捗
  if (targetResults.remaining.length > 0) {
    console.log('\n🎯 Progress to Targets:');
    targetResults.remaining.forEach(result => {
      const progress = ((result.current / result.target) * 100).toFixed(1);
      console.log(`  📈 ${result.metric}: ${result.current}% / ${result.target}% (${progress}% complete, +${result.needed}% needed)`);
    });
  }
}

// メイン実行
if (require.main === module) {
  main();
}

module.exports = {
  extractCoverageData,
  checkThresholds,
  checkTargets,
  COVERAGE_THRESHOLDS,
  COVERAGE_TARGETS
};