#!/usr/bin/env node

/**
 * リアルタイム活動分析システムのパフォーマンスベンチマーク
 * 処理速度とメモリ使用量を測定
 */

const { RealTimeActivityAnalyzer } = require('../../dist/services/realTimeActivityAnalyzer');
const { GeminiService } = require('../../dist/services/geminiService');
const { PartialCompositeRepository } = require('../../dist/repositories/PartialCompositeRepository');
const { config } = require('dotenv');

// 環境変数読み込み
config();

// ベンチマークシナリオ
const BENCHMARK_SCENARIOS = [
  {
    name: '単純な明示的時刻',
    input: '10:00から11:00まで会議',
    complexity: 'simple'
  },
  {
    name: '複雑な明示的時刻（タイムスタンプ付き）',
    input: '[12:34] 9:15から11:45まで開発作業とコードレビュー',
    complexity: 'medium'
  },
  {
    name: '相対時刻（計算が必要）',
    input: 'さっき2時間ほどドキュメント作成をしていました',
    complexity: 'medium'
  },
  {
    name: '並列活動（複数解析）',
    input: '14:00-16:00 プログラミングをしながらSlack対応、途中で15分休憩',
    complexity: 'complex'
  },
  {
    name: '長文入力（100文字以上）',
    input: '今朝9時から始めた新機能の実装作業は予想以上に複雑で、データベース設計の見直しから始まり、' +
           'APIの仕様変更、フロントエンドの大幅な修正まで必要になってしまい、結局12時過ぎまでかかってしまいました。',
    complexity: 'complex'
  },
  {
    name: '曖昧な表現（推論が必要）',
    input: '午前中ずっとミーティングでした',
    complexity: 'medium'
  }
];

// メモリ使用量測定
function getMemoryUsage() {
  const usage = process.memoryUsage();
  return {
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024 * 10) / 10, // MB
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024 * 10) / 10,
    external: Math.round(usage.external / 1024 / 1024 * 10) / 10,
    rss: Math.round(usage.rss / 1024 / 1024 * 10) / 10
  };
}

// ベンチマーク実行
async function runBenchmark() {
  console.log('⚡ リアルタイム活動分析システム パフォーマンスベンチマーク\n');
  console.log(`Node.js: ${process.version}`);
  console.log(`Platform: ${process.platform} ${process.arch}`);
  console.log(`CPU: ${require('os').cpus()[0].model}`);
  console.log(`Memory: ${Math.round(require('os').totalmem() / 1024 / 1024 / 1024)}GB\n`);
  
  // 初期化
  const repository = new PartialCompositeRepository(':memory:');
  await repository.initializeDatabase();
  const geminiService = new GeminiService(repository);
  const analyzer = new RealTimeActivityAnalyzer(geminiService);
  
  // ウォームアップ（JITコンパイラ最適化のため）
  console.log('🔥 ウォームアップ中...');
  for (let i = 0; i < 5; i++) {
    await analyzer.analyzeActivity(
      '10:00から11:00まで作業',
      'Asia/Tokyo',
      new Date(),
      { recentLogs: [] }
    );
  }
  
  // ガベージコレクション実行（正確な測定のため）
  if (global.gc) {
    global.gc();
  }
  
  const initialMemory = getMemoryUsage();
  console.log(`初期メモリ使用量: ${initialMemory.heapUsed}MB\n`);
  
  // 各シナリオのベンチマーク
  const results = [];
  
  for (const scenario of BENCHMARK_SCENARIOS) {
    console.log(`\n📊 ベンチマーク: ${scenario.name}`);
    console.log(`   複雑度: ${scenario.complexity}`);
    console.log(`   入力長: ${scenario.input.length}文字`);
    
    const iterations = scenario.complexity === 'complex' ? 20 : 50;
    const times = [];
    
    // 複数回実行して平均を取る
    for (let i = 0; i < iterations; i++) {
      const startTime = process.hrtime.bigint();
      
      await analyzer.analyzeActivity(
        scenario.input,
        'Asia/Tokyo',
        new Date('2025-01-01T15:00:00+09:00'),
        { recentLogs: [] }
      );
      
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1000000; // ナノ秒からミリ秒へ
      times.push(duration);
    }
    
    // 統計計算
    times.sort((a, b) => a - b);
    const avg = times.reduce((a, b) => a + b) / times.length;
    const median = times[Math.floor(times.length / 2)];
    const p95 = times[Math.floor(times.length * 0.95)];
    const p99 = times[Math.floor(times.length * 0.99)];
    const min = times[0];
    const max = times[times.length - 1];
    
    const result = {
      scenario: scenario.name,
      complexity: scenario.complexity,
      inputLength: scenario.input.length,
      iterations,
      avg: Math.round(avg * 10) / 10,
      median: Math.round(median * 10) / 10,
      p95: Math.round(p95 * 10) / 10,
      p99: Math.round(p99 * 10) / 10,
      min: Math.round(min * 10) / 10,
      max: Math.round(max * 10) / 10
    };
    
    results.push(result);
    
    console.log(`   平均: ${result.avg}ms`);
    console.log(`   中央値: ${result.median}ms`);
    console.log(`   95%ile: ${result.p95}ms`);
    console.log(`   99%ile: ${result.p99}ms`);
    console.log(`   最小/最大: ${result.min}ms / ${result.max}ms`);
  }
  
  // メモリ使用量の最終測定
  const finalMemory = getMemoryUsage();
  const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
  
  // サマリー出力
  console.log('\n' + '='.repeat(60));
  console.log('📈 パフォーマンスサマリー');
  console.log('='.repeat(60));
  
  // 複雑度別の平均
  const byComplexity = {
    simple: results.filter(r => r.complexity === 'simple'),
    medium: results.filter(r => r.complexity === 'medium'),
    complex: results.filter(r => r.complexity === 'complex')
  };
  
  Object.entries(byComplexity).forEach(([complexity, items]) => {
    if (items.length > 0) {
      const avgTime = items.reduce((sum, item) => sum + item.avg, 0) / items.length;
      console.log(`${complexity}タスクの平均: ${avgTime.toFixed(1)}ms`);
    }
  });
  
  // 全体統計
  const allAvg = results.reduce((sum, r) => sum + r.avg, 0) / results.length;
  const all95 = results.map(r => r.p95).sort((a, b) => a - b)[Math.floor(results.length * 0.95)];
  
  console.log(`\n全体平均: ${allAvg.toFixed(1)}ms`);
  console.log(`全体95%ile: ${all95.toFixed(1)}ms`);
  
  // 目標達成状況
  console.log('\n🎯 パフォーマンス目標:');
  const under3s = results.filter(r => r.p95 < 3000).length / results.length * 100;
  console.log(`3秒以内（95%ile）: ${under3s.toFixed(1)}% ${under3s >= 95 ? '✅' : '❌'}`);
  
  // メモリ使用量
  console.log('\n💾 メモリ使用量:');
  console.log(`初期: ${initialMemory.heapUsed}MB`);
  console.log(`最終: ${finalMemory.heapUsed}MB`);
  console.log(`増加量: ${memoryIncrease.toFixed(1)}MB`);
  console.log(`目標（50MB以内）: ${memoryIncrease < 50 ? '✅' : '❌'}`);
  
  // 詳細レポート生成
  generateDetailedReport(results, { initialMemory, finalMemory, memoryIncrease });
  
  // スロー処理の警告
  const slowScenarios = results.filter(r => r.p95 > 1000);
  if (slowScenarios.length > 0) {
    console.log('\n⚠️  1秒を超える処理:');
    slowScenarios.forEach(s => {
      console.log(`- ${s.scenario}: ${s.p95}ms (95%ile)`);
    });
  }
}

// 詳細レポート生成
function generateDetailedReport(results, memoryStats) {
  const fs = require('fs');
  const path = require('path');
  
  const report = {
    timestamp: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: `${process.platform} ${process.arch}`,
      cpu: require('os').cpus()[0].model,
      memory: `${Math.round(require('os').totalmem() / 1024 / 1024 / 1024)}GB`
    },
    results,
    memoryStats,
    summary: {
      averageTime: results.reduce((sum, r) => sum + r.avg, 0) / results.length,
      maxTime: Math.max(...results.map(r => r.max)),
      memoryIncrease: memoryStats.memoryIncrease,
      performanceGoalMet: results.filter(r => r.p95 < 3000).length / results.length >= 0.95,
      memoryGoalMet: memoryStats.memoryIncrease < 50
    }
  };
  
  const reportPath = path.join(__dirname, `performance-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 詳細レポート: ${reportPath}`);
}

// 実行
if (require.main === module) {
  // --expose-gc オプションでガベージコレクションを有効化
  if (!global.gc) {
    console.log('💡 ヒント: より正確な測定のため、--expose-gc オプションで実行してください');
    console.log('   node --expose-gc scripts/test/performance-benchmark.js\n');
  }
  
  runBenchmark().catch(console.error);
}

module.exports = { runBenchmark, BENCHMARK_SCENARIOS };