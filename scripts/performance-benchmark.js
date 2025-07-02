/**
 * リアルタイム活動分析システム パフォーマンスベンチマーク
 * 処理時間とメモリ使用量を測定
 */

require('dotenv').config();
const path = require('path');
const { RealTimeActivityAnalyzer } = require('../dist/services/realTimeActivityAnalyzer');
const { GeminiService } = require('../dist/services/geminiService');
const { TimeInformationExtractor } = require('../dist/services/timeInformationExtractor');
const { ActivityContentAnalyzer } = require('../dist/services/activityContentAnalyzer');
const { TimeConsistencyValidator } = require('../dist/services/timeConsistencyValidator');

// メモリ使用量測定
function getMemoryUsage() {
  const used = process.memoryUsage();
  return {
    rss: Math.round(used.rss / 1024 / 1024 * 100) / 100,
    heapTotal: Math.round(used.heapTotal / 1024 / 1024 * 100) / 100,
    heapUsed: Math.round(used.heapUsed / 1024 / 1024 * 100) / 100,
    external: Math.round(used.external / 1024 / 1024 * 100) / 100
  };
}

// ベンチマークテストケース
const benchmarkCases = [
  {
    name: '単純な時刻指定',
    input: '10:00から11:00まで会議',
    complexity: 'simple'
  },
  {
    name: '複数活動（並列）',
    input: '14:00-17:00 プログラミング70%、コードレビュー30%',
    complexity: 'medium'
  },
  {
    name: '相対時刻 + 複数活動',
    input: 'さっき2時間、開発作業しながら随時Slackで連絡対応',
    complexity: 'medium'
  },
  {
    name: '長文詳細活動',
    input: '午前中はTimeLoggerのリファクタリング作業。主にデータベース層の最適化とTypeScript型定義の整理を実施。途中で30分ほど会議に参加。',
    complexity: 'complex'
  },
  {
    name: '曖昧な時間表現',
    input: '今日は朝から夕方までずっとドキュメント作成。昼休みは1時間。',
    complexity: 'complex'
  },
  {
    name: '最大複雑度（並列活動 + 詳細説明）',
    input: '9:30-18:30 開発作業60%（React ComponentsのUI改善、パフォーマンス最適化、テストコード追加）、会議20%（朝会、設計レビュー、1on1）、コードレビュー15%、その他雑務5%',
    complexity: 'very_complex'
  }
];

async function runBenchmark() {
  console.log('📊 リアルタイム活動分析システム パフォーマンスベンチマーク\n');
  console.log('🔧 初期化中...');
  
  // 初期メモリ使用量
  const initialMemory = getMemoryUsage();
  console.log(`💾 初期メモリ: RSS ${initialMemory.rss}MB, Heap ${initialMemory.heapUsed}MB\n`);
  
  // システム初期化（直接サービスを作成）
  const geminiService = new GeminiService(process.env.GEMINI_API_KEY);
  const timeExtractor = new TimeInformationExtractor(geminiService);
  const contentAnalyzer = new ActivityContentAnalyzer(geminiService);
  const validator = new TimeConsistencyValidator();
  
  const analyzer = new RealTimeActivityAnalyzer(
    timeExtractor,
    contentAnalyzer,
    validator
  );
  const results = [];
  
  console.log('🚀 ベンチマーク開始\n');
  console.log('─'.repeat(80));
  
  for (const testCase of benchmarkCases) {
    console.log(`\n📝 ${testCase.name} [${testCase.complexity}]`);
    console.log(`入力: "${testCase.input}"`);
    
    // メモリ使用量（実行前）
    const beforeMemory = getMemoryUsage();
    
    // 実行時間測定（5回実行して平均を取る）
    const times = [];
    let result;
    
    for (let i = 0; i < 5; i++) {
      const startTime = Date.now();
      
      try {
        result = await analyzer.analyzeActivity(
          testCase.input,
          'Asia/Tokyo',
          new Date(),
          { recentLogs: [] }
        );
        
        const endTime = Date.now();
        times.push(endTime - startTime);
        
        // 最初の実行のみ詳細表示
        if (i === 0) {
          console.log(`✅ 成功: ${result.timeAnalysis.totalMinutes}分, 信頼度 ${(result.confidence * 100).toFixed(1)}%`);
        }
      } catch (error) {
        console.log(`❌ エラー: ${error.message}`);
        break;
      }
      
      // 連続実行による影響を避けるため少し待機
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // メモリ使用量（実行後）
    const afterMemory = getMemoryUsage();
    
    // 統計計算
    if (times.length > 0) {
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const minTime = Math.min(...times);
      const maxTime = Math.max(...times);
      const memoryDelta = afterMemory.heapUsed - beforeMemory.heapUsed;
      
      console.log(`⏱️  実行時間: 平均 ${avgTime.toFixed(0)}ms (最小 ${minTime}ms, 最大 ${maxTime}ms)`);
      console.log(`💾 メモリ増加: ${memoryDelta.toFixed(2)}MB`);
      
      results.push({
        name: testCase.name,
        complexity: testCase.complexity,
        avgTime,
        minTime,
        maxTime,
        memoryDelta,
        success: true
      });
    } else {
      results.push({
        name: testCase.name,
        complexity: testCase.complexity,
        success: false
      });
    }
    
    console.log('─'.repeat(80));
  }
  
  // 最終メモリ使用量
  const finalMemory = getMemoryUsage();
  console.log(`\n💾 最終メモリ: RSS ${finalMemory.rss}MB, Heap ${finalMemory.heapUsed}MB`);
  console.log(`📈 メモリ増加: RSS +${(finalMemory.rss - initialMemory.rss).toFixed(2)}MB, Heap +${(finalMemory.heapUsed - initialMemory.heapUsed).toFixed(2)}MB`);
  
  // サマリー
  console.log('\n📊 ベンチマークサマリー\n');
  console.log('複雑度別平均実行時間:');
  
  const complexityGroups = {};
  results.filter(r => r.success).forEach(r => {
    if (!complexityGroups[r.complexity]) {
      complexityGroups[r.complexity] = [];
    }
    complexityGroups[r.complexity].push(r.avgTime);
  });
  
  Object.entries(complexityGroups).forEach(([complexity, times]) => {
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    console.log(`  ${complexity}: ${avg.toFixed(0)}ms`);
  });
  
  // 目標達成状況
  console.log('\n🎯 目標達成状況:');
  const allSuccess = results.filter(r => r.success);
  const avgOverall = allSuccess.reduce((a, r) => a + r.avgTime, 0) / allSuccess.length;
  console.log(`  平均処理時間: ${avgOverall.toFixed(0)}ms ${avgOverall < 3000 ? '✅' : '❌'} (目標: 3000ms以内)`);
  console.log(`  最大メモリ使用: ${finalMemory.heapUsed}MB ${finalMemory.heapUsed < 50 ? '✅' : '❌'} (目標: 50MB以内)`);
  
  console.log('\n✅ ベンチマーク完了');
}

// 実行
runBenchmark().catch(console.error);