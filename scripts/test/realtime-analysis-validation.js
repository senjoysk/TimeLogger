#!/usr/bin/env node

/**
 * リアルタイム活動分析システムの実データ検証スクリプト
 * 実際の入力パターンで精度と性能を検証
 */

const { RealTimeActivityAnalyzer } = require('../../dist/services/realTimeActivityAnalyzer');
const { GeminiService } = require('../../dist/services/geminiService');
const { SqliteActivityLogRepository } = require('../../dist/repositories/sqliteActivityLogRepository');
const { config } = require('dotenv');
const { toZonedTime, format } = require('date-fns-tz');

// 環境変数読み込み
config();

// テストケース定義
const TEST_CASES = [
  // 時刻不一致問題の再現ケース
  {
    name: '時刻不一致問題の解決確認',
    input: '[08:19] 7:38から8:20までTimeLoggerのリファクタリング',
    inputTime: '2025-01-01T08:19:00+09:00',
    expected: {
      startTimeJST: '07:38',
      endTimeJST: '08:20',
      totalMinutes: 42,
      method: 'explicit'
    }
  },
  // 明示的時刻パターン
  {
    name: '明示的時刻範囲（コロン形式）',
    input: '14:00から15:30まで定例会議に参加',
    inputTime: '2025-01-01T16:00:00+09:00',
    expected: {
      startTimeJST: '14:00',
      endTimeJST: '15:30',
      totalMinutes: 90,
      method: 'explicit'
    }
  },
  {
    name: '明示的時刻範囲（日本語形式）',
    input: '9時30分から11時00分までコードレビュー',
    inputTime: '2025-01-01T11:30:00+09:00',
    expected: {
      startTimeJST: '09:30',
      endTimeJST: '11:00',
      totalMinutes: 90,
      method: 'explicit'
    }
  },
  // 相対時刻パターン
  {
    name: '相対時刻（さっき）',
    input: 'さっき1時間ほどドキュメント作成',
    inputTime: '2025-01-01T14:00:00+09:00',
    expected: {
      endTimeJST: '14:00',
      totalMinutes: 60,
      method: 'relative'
    }
  },
  {
    name: '相対時刻（○分前）',
    input: '30分前からデバッグ作業中',
    inputTime: '2025-01-01T15:00:00+09:00',
    expected: {
      endTimeJST: '15:00',
      totalMinutes: 30,
      method: 'relative'
    }
  },
  // 継続時間パターン
  {
    name: '継続時間（時間）',
    input: '2時間プログラミングに集中しました',
    inputTime: '2025-01-01T17:00:00+09:00',
    expected: {
      endTimeJST: '17:00',
      totalMinutes: 120,
      method: 'relative'
    }
  },
  {
    name: '継続時間（分）',
    input: '45分間テストコードを書きました',
    inputTime: '2025-01-01T12:00:00+09:00',
    expected: {
      endTimeJST: '12:00',
      totalMinutes: 45,
      method: 'relative'
    }
  },
  // 並列活動パターン
  {
    name: '並列活動（簡単）',
    input: '10:00から11:00まで会議をしながらメモを取った',
    inputTime: '2025-01-01T11:30:00+09:00',
    expected: {
      startTimeJST: '10:00',
      endTimeJST: '11:00',
      totalMinutes: 60,
      activityCount: 2
    }
  },
  {
    name: '並列活動（複雑）',
    input: '14:00-16:00 開発作業、ドキュメント更新、Slackでの質問対応',
    inputTime: '2025-01-01T16:30:00+09:00',
    expected: {
      startTimeJST: '14:00',
      endTimeJST: '16:00',
      totalMinutes: 120,
      activityCount: 3
    }
  },
  // エッジケース
  {
    name: '日付をまたぐ時刻',
    input: '23:30から0:30まで緊急対応',
    inputTime: '2025-01-02T01:00:00+09:00',
    expected: {
      startTimeJST: '23:30',
      endTimeJST: '00:30',
      totalMinutes: 60,
      method: 'explicit'
    }
  },
  {
    name: 'タイムスタンプ付き入力',
    input: '[15:45] 14:00から会議でした',
    inputTime: '2025-01-01T15:45:00+09:00',
    expected: {
      startTimeJST: '14:00',
      endTimeJST: '15:45',
      totalMinutes: 105,
      method: 'explicit'
    }
  },
  // 曖昧な表現
  {
    name: '時刻情報なし',
    input: 'プログラミングをしました',
    inputTime: '2025-01-01T12:00:00+09:00',
    expected: {
      method: 'inferred',
      lowConfidence: true
    }
  }
];

// 検証実行関数
async function runValidation() {
  console.log('🚀 リアルタイム活動分析システム実データ検証開始\n');
  
  // リポジトリとサービスの初期化
  const repository = new SqliteActivityLogRepository(':memory:'); // インメモリDBで検証
  await repository.initializeDatabase();
  
  const geminiService = new GeminiService(repository);
  const analyzer = new RealTimeActivityAnalyzer(geminiService);
  
  const results = {
    total: TEST_CASES.length,
    passed: 0,
    failed: 0,
    details: []
  };
  
  // 各テストケースを実行
  for (const testCase of TEST_CASES) {
    console.log(`\n📋 テスト: ${testCase.name}`);
    console.log(`   入力: "${testCase.input}"`);
    console.log(`   入力時刻: ${testCase.inputTime}`);
    
    const startTime = Date.now();
    
    try {
      // 分析実行
      const result = await analyzer.analyzeActivity(
        testCase.input,
        'Asia/Tokyo',
        new Date(testCase.inputTime),
        { recentLogs: [] }
      );
      
      const processingTime = Date.now() - startTime;
      
      // 結果検証
      const validationResult = validateResult(result, testCase);
      
      if (validationResult.passed) {
        results.passed++;
        console.log(`   ✅ 成功`);
      } else {
        results.failed++;
        console.log(`   ❌ 失敗: ${validationResult.errors.join(', ')}`);
      }
      
      // 詳細結果を記録
      results.details.push({
        testCase: testCase.name,
        passed: validationResult.passed,
        errors: validationResult.errors,
        result: {
          startTime: formatTimeJST(result.timeAnalysis.startTime),
          endTime: formatTimeJST(result.timeAnalysis.endTime),
          totalMinutes: result.timeAnalysis.totalMinutes,
          method: result.timeAnalysis.method,
          confidence: result.timeAnalysis.confidence,
          activityCount: result.activities.length,
          warningCount: result.warnings.length,
          processingTimeMs: processingTime
        }
      });
      
      // 詳細出力
      console.log(`   時刻: ${formatTimeJST(result.timeAnalysis.startTime)} - ${formatTimeJST(result.timeAnalysis.endTime)}`);
      console.log(`   時間: ${result.timeAnalysis.totalMinutes}分`);
      console.log(`   手法: ${result.timeAnalysis.method}`);
      console.log(`   信頼度: ${(result.timeAnalysis.confidence * 100).toFixed(1)}%`);
      console.log(`   活動数: ${result.activities.length}`);
      console.log(`   警告: ${result.warnings.length}件`);
      console.log(`   処理時間: ${processingTime}ms`);
      
    } catch (error) {
      results.failed++;
      console.log(`   ❌ エラー: ${error.message}`);
      
      results.details.push({
        testCase: testCase.name,
        passed: false,
        errors: [`実行エラー: ${error.message}`],
        result: null
      });
    }
  }
  
  // サマリー出力
  console.log('\n' + '='.repeat(60));
  console.log('📊 検証結果サマリー');
  console.log('='.repeat(60));
  console.log(`総テスト数: ${results.total}`);
  console.log(`成功: ${results.passed} (${(results.passed / results.total * 100).toFixed(1)}%)`);
  console.log(`失敗: ${results.failed} (${(results.failed / results.total * 100).toFixed(1)}%)`);
  
  // 精度分析
  const accuracyStats = analyzeAccuracy(results.details);
  console.log('\n📈 精度分析:');
  console.log(`明示的時刻の精度: ${accuracyStats.explicit.toFixed(1)}%`);
  console.log(`相対時刻の精度: ${accuracyStats.relative.toFixed(1)}%`);
  console.log(`推定時刻の精度: ${accuracyStats.inferred.toFixed(1)}%`);
  
  // パフォーマンス分析
  const performanceStats = analyzePerformance(results.details);
  console.log('\n⚡ パフォーマンス分析:');
  console.log(`平均処理時間: ${performanceStats.avgTime.toFixed(0)}ms`);
  console.log(`最大処理時間: ${performanceStats.maxTime}ms`);
  console.log(`3秒以内の割合: ${performanceStats.under3s.toFixed(1)}%`);
  
  // 失敗ケースの詳細
  if (results.failed > 0) {
    console.log('\n❌ 失敗ケースの詳細:');
    results.details
      .filter(d => !d.passed)
      .forEach(d => {
        console.log(`\n- ${d.testCase}:`);
        d.errors.forEach(e => console.log(`  ${e}`));
      });
  }
  
  // 目標達成状況
  console.log('\n🎯 目標達成状況:');
  console.log(`時刻精度目標 (95%): ${accuracyStats.explicit >= 95 ? '✅ 達成' : '❌ 未達成'}`);
  console.log(`処理時間目標 (3秒以内): ${performanceStats.under3s >= 95 ? '✅ 達成' : '❌ 未達成'}`);
  
  process.exit(results.failed > 0 ? 1 : 0);
}

// 結果検証関数
function validateResult(result, testCase) {
  const errors = [];
  const expected = testCase.expected;
  
  // 時刻検証
  if (expected.startTimeJST) {
    const actualStartJST = formatTimeJST(result.timeAnalysis.startTime);
    if (actualStartJST !== expected.startTimeJST) {
      errors.push(`開始時刻不一致: 期待=${expected.startTimeJST}, 実際=${actualStartJST}`);
    }
  }
  
  if (expected.endTimeJST) {
    const actualEndJST = formatTimeJST(result.timeAnalysis.endTime);
    if (actualEndJST !== expected.endTimeJST) {
      errors.push(`終了時刻不一致: 期待=${expected.endTimeJST}, 実際=${actualEndJST}`);
    }
  }
  
  // 時間検証
  if (expected.totalMinutes !== undefined) {
    if (Math.abs(result.timeAnalysis.totalMinutes - expected.totalMinutes) > 1) {
      errors.push(`時間不一致: 期待=${expected.totalMinutes}分, 実際=${result.timeAnalysis.totalMinutes}分`);
    }
  }
  
  // 手法検証
  if (expected.method) {
    if (result.timeAnalysis.method !== expected.method) {
      errors.push(`手法不一致: 期待=${expected.method}, 実際=${result.timeAnalysis.method}`);
    }
  }
  
  // 活動数検証
  if (expected.activityCount !== undefined) {
    if (result.activities.length !== expected.activityCount) {
      errors.push(`活動数不一致: 期待=${expected.activityCount}, 実際=${result.activities.length}`);
    }
  }
  
  // 低信頼度チェック
  if (expected.lowConfidence) {
    if (result.timeAnalysis.confidence >= 0.5) {
      errors.push(`信頼度が予想より高い: ${result.timeAnalysis.confidence}`);
    }
  }
  
  return {
    passed: errors.length === 0,
    errors
  };
}

// 時刻をJST形式でフォーマット
function formatTimeJST(isoString) {
  const date = new Date(isoString);
  const jstDate = toZonedTime(date, 'Asia/Tokyo');
  return format(jstDate, 'HH:mm', { timeZone: 'Asia/Tokyo' });
}

// 精度分析
function analyzeAccuracy(details) {
  const byMethod = {
    explicit: [],
    relative: [],
    inferred: []
  };
  
  details.forEach(d => {
    if (d.result && d.result.method) {
      byMethod[d.result.method].push(d.passed);
    }
  });
  
  const calculate = (arr) => {
    if (arr.length === 0) return 0;
    return (arr.filter(x => x).length / arr.length) * 100;
  };
  
  return {
    explicit: calculate(byMethod.explicit),
    relative: calculate(byMethod.relative),
    inferred: calculate(byMethod.inferred)
  };
}

// パフォーマンス分析
function analyzePerformance(details) {
  const times = details
    .filter(d => d.result && d.result.processingTimeMs)
    .map(d => d.result.processingTimeMs);
  
  if (times.length === 0) {
    return { avgTime: 0, maxTime: 0, under3s: 0 };
  }
  
  return {
    avgTime: times.reduce((a, b) => a + b, 0) / times.length,
    maxTime: Math.max(...times),
    under3s: (times.filter(t => t < 3000).length / times.length) * 100
  };
}

// 実行
if (require.main === module) {
  runValidation().catch(console.error);
}

module.exports = { runValidation, TEST_CASES };