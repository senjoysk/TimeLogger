#!/usr/bin/env node

/**
 * Coverage Analysis Tool
 * Phase 4: 未カバーファイルの特定と優先順位付け
 */

const { execSync } = require('child_process');

// 重要度スコア計算の重み
const IMPORTANCE_WEIGHTS = {
  integration: 10,      // 統合システム (最重要)
  handlers: 8,          // コマンドハンドラー
  services: 7,          // サービス層
  repositories: 6,      // データアクセス層
  utils: 5,             // ユーティリティ
  database: 4,          // データベース初期化
  factories: 3,         // ファクトリークラス
  types: 2,             // 型定義
  components: 1         // UI コンポーネント
};

function main() {
  console.log('📊 Coverage Analysis - Priority Assessment');
  console.log('==========================================');
  
  try {
    // 詳細カバレッジレポートを取得
    console.log('🔍 Analyzing test coverage...');
    const coverageOutput = execSync('npm run test:coverage -- --silent --coverageReporters=text', {
      encoding: 'utf8',
      stdio: 'pipe'
    });
    
    const analysis = analyzeCoverage(coverageOutput);
    
    displayPriorityList(analysis);
    generateRecommendations(analysis);
    
  } catch (error) {
    console.error('❌ Coverage analysis failed:', error.message);
    process.exit(1);
  }
}

function analyzeCoverage(output) {
  const lines = output.split('\n');
  const fileResults = [];
  let inFileSection = false;
  
  for (const line of lines) {
    if (line.includes('File') && line.includes('%')) {
      inFileSection = true;
      continue;
    }
    
    if (inFileSection && line.trim().startsWith('src/')) {
      const parsed = parseFileLine(line);
      if (parsed) {
        fileResults.push(parsed);
      }
    }
    
    if (line.includes('---') || line.includes('===')) {
      inFileSection = false;
    }
  }
  
  return fileResults.map(addPriorityScore).sort((a, b) => b.priorityScore - a.priorityScore);
}

function parseFileLine(line) {
  // Extract file path and coverage percentages
  const parts = line.trim().split('|');
  if (parts.length < 5) return null;
  
  const filePath = parts[0].trim();
  const statements = parseFloat(parts[1].trim()) || 0;
  const branches = parseFloat(parts[2].trim()) || 0;
  const functions = parseFloat(parts[3].trim()) || 0;
  const lines = parseFloat(parts[4].trim()) || 0;
  
  // Calculate average coverage
  const avgCoverage = (statements + branches + functions + lines) / 4;
  
  return {
    filePath,
    statements,
    branches, 
    functions,
    lines,
    avgCoverage
  };
}

function addPriorityScore(fileData) {
  const { filePath, avgCoverage } = fileData;
  
  // Determine category from file path
  let category = 'other';
  for (const [cat, weight] of Object.entries(IMPORTANCE_WEIGHTS)) {
    if (filePath.includes(`src/${cat}`)) {
      category = cat;
      break;
    }
  }
  
  const importanceWeight = IMPORTANCE_WEIGHTS[category] || 1;
  
  // Priority score: (importance) * (1 - coverage/100) * impact factor
  // Lower coverage + higher importance = higher priority
  const coverageGap = Math.max(0, 70 - avgCoverage); // Target 70%
  const priorityScore = importanceWeight * coverageGap;
  
  return {
    ...fileData,
    category,
    importanceWeight,
    coverageGap,
    priorityScore
  };
}

function displayPriorityList(analysis) {
  console.log('\n🎯 Test Priority Recommendations (Top 15):');
  console.log('=' .repeat(80));
  
  const topPriorities = analysis.slice(0, 15);
  
  topPriorities.forEach((item, index) => {
    const priority = item.priorityScore > 50 ? '🔥 HIGH' : 
                    item.priorityScore > 20 ? '⚠️  MED' : 
                    '💡 LOW';
    
    console.log(`${(index + 1).toString().padStart(2)}. ${priority} ${item.filePath}`);
    console.log(`    Coverage: ${item.avgCoverage.toFixed(1)}% | Gap: ${item.coverageGap.toFixed(1)}% | Score: ${item.priorityScore.toFixed(1)}`);
    console.log(`    Category: ${item.category} (weight: ${item.importanceWeight})`);
    console.log('');
  });
}

function generateRecommendations(analysis) {
  const highPriority = analysis.filter(item => item.priorityScore > 50);
  const mediumPriority = analysis.filter(item => item.priorityScore > 20 && item.priorityScore <= 50);
  
  console.log('\n📋 Recommendations:');
  console.log('==================');
  
  if (highPriority.length > 0) {
    console.log('\n🔥 HIGH PRIORITY (Immediate Action):');
    highPriority.slice(0, 5).forEach(item => {
      console.log(`  • ${item.filePath} (${item.avgCoverage.toFixed(1)}% coverage)`);
      console.log(`    → Focus on ${getTestSuggestion(item)}`);
    });
  }
  
  if (mediumPriority.length > 0) {
    console.log('\n⚠️  MEDIUM PRIORITY (Next Sprint):');
    mediumPriority.slice(0, 5).forEach(item => {
      console.log(`  • ${item.filePath} (${item.avgCoverage.toFixed(1)}% coverage)`);
    });
  }
  
  console.log('\n💡 Strategy:');
  console.log('  1. Start with integration/ and handlers/ - these are critical user paths');
  console.log('  2. Add edge case tests for services/ - improve branch coverage'); 
  console.log('  3. Mock external dependencies in repositories/ tests');
  console.log('  4. Focus on error handling paths - often missed in testing');
  
  console.log('\n🎯 Target: Improve overall coverage from 66.5% to 70%+ within this phase');
}

function getTestSuggestion(item) {
  const { category, branches, functions } = item;
  
  if (category === 'integration') {
    return 'end-to-end flow testing and error scenarios';
  } else if (category === 'handlers') {
    return 'command validation and edge cases';
  } else if (category === 'services') {
    return 'business logic branches and error handling';
  } else if (branches < 50) {
    return 'conditional logic and error paths';
  } else if (functions < 60) {
    return 'method coverage and parameter validation';
  } else {
    return 'statement coverage and edge cases';
  }
}

// メイン実行
if (require.main === module) {
  main();
}

module.exports = { analyzeCoverage, addPriorityScore };