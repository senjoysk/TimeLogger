#!/usr/bin/env node

/**
 * リアルタイム分析システムのテストスクリプト
 * 直接APIを呼び出して動作確認
 */

const { RealTimeActivityAnalyzer } = require('../dist/services/realTimeActivityAnalyzer');
const { SqliteActivityLogRepository } = require('../dist/repositories/sqliteActivityLogRepository');
const { GeminiService } = require('../dist/services/geminiService');
const { config } = require('dotenv');

// 環境変数読み込み
config();

async function testRealTimeAnalysis() {
  console.log('🧪 リアルタイム分析システム テスト\n');
  
  try {
    // サービス初期化
    const dbPath = process.env.DATABASE_PATH || './data/tasks.db';
    const repository = new SqliteActivityLogRepository(dbPath);
    const geminiService = new GeminiService(repository);
    const analyzer = new RealTimeActivityAnalyzer(geminiService);
    
    // テストケース
    const testCases = [
      {
        name: '明示的時刻範囲',
        input: '7:38から8:20までTimeLoggerのリファクタリング',
        inputTimestamp: new Date('2025-07-02T02:49:43.477Z'), // JST 11:49
        timezone: 'Asia/Tokyo'
      },
      {
        name: '時刻範囲（ハイフン）',
        input: '8:20-9:30 Time Loggerのリファクタリグしつつ、10%くらいは事務作業',
        inputTimestamp: new Date('2025-07-02T04:04:59.561Z'), // JST 13:04
        timezone: 'Asia/Tokyo'
      },
      {
        name: 'チルダ形式',
        input: '13:30~16:00は歯医者。移動時間込み。',
        inputTimestamp: new Date('2025-07-02T10:51:36.387Z'), // JST 19:51
        timezone: 'Asia/Tokyo'
      }
    ];
    
    // 各テストケースを実行
    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      console.log(`📝 テスト ${i + 1}: ${testCase.name}`);
      console.log(`入力: "${testCase.input}"`);
      console.log(`入力時刻: ${testCase.inputTimestamp.toISOString()}`);
      
      try {
        const result = await analyzer.analyzeActivity(
          testCase.input,
          testCase.inputTimestamp,
          testCase.timezone
        );
        
        console.log('✅ 分析結果:');
        console.log(`   🕐 時刻: ${new Date(result.timeAnalysis.startTime).toLocaleString('ja-JP', { timeZone: testCase.timezone })} - ${new Date(result.timeAnalysis.endTime).toLocaleString('ja-JP', { timeZone: testCase.timezone })}`);
        console.log(`   ⏱️ 時間: ${result.timeAnalysis.totalMinutes}分`);
        console.log(`   🎯 信頼度: ${(result.timeAnalysis.confidence * 100).toFixed(1)}%`);
        console.log(`   📊 手法: ${result.timeAnalysis.method}`);
        
        if (result.activityAnalysis.activities.length > 0) {
          console.log('   🏷️ 活動:');
          result.activityAnalysis.activities.forEach(activity => {
            console.log(`      - ${activity.content} (${activity.timePercentage}%, ${activity.confidence.toFixed(2)})`);
          });
        }
        
        if (result.validationResult.warnings.length > 0) {
          console.log('   ⚠️ 警告:');
          result.validationResult.warnings.forEach(warning => {
            console.log(`      - ${warning.type}: ${warning.message}`);
          });
        }
        
      } catch (error) {
        console.log('❌ エラー:', error.message);
        console.log('詳細:', error);
      }
      
      console.log('─'.repeat(60));
    }
    
  } catch (error) {
    console.error('❌ 初期化エラー:', error.message);
    console.error('詳細:', error);
  }
}

// 実行
if (require.main === module) {
  testRealTimeAnalysis().catch(console.error);
}

module.exports = { testRealTimeAnalysis };