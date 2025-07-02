#!/usr/bin/env node

/**
 * 拡張ログ表示スクリプト
 * 新しい分析データを含むログの表示
 */

const { ActivityLogService } = require('../dist/services/activityLogService');
const { GeminiService } = require('../dist/services/geminiService');
const { SqliteActivityLogRepository } = require('../dist/repositories/sqliteActivityLogRepository');
const { config } = require('dotenv');
const { toZonedTime, format } = require('date-fns-tz');

// 環境変数読み込み
config();

async function showEnhancedLogs(date = null, userId = 'test-user') {
  console.log('📋 拡張ログ表示（分析データ付き）\n');
  
  try {
    // サービス初期化
    const dbPath = process.env.DATABASE_PATH || './data/activity_logs.db';
    const repository = new SqliteActivityLogRepository(dbPath);
    const geminiService = new GeminiService(repository);
    const activityLogService = new ActivityLogService(repository, geminiService);
    
    // 指定日のログを取得
    const timezone = 'Asia/Tokyo';
    const logs = await activityLogService.getLogsForDate(userId, date, timezone);
    
    if (logs.length === 0) {
      console.log('📝 表示するログがありません。');
      console.log('💡 新しいログを記録すると、ここに分析データが表示されます。');
      return;
    }
    
    const dateLabel = date || format(new Date(), 'yyyy-MM-dd');
    console.log(`📅 ${dateLabel}のログ (${logs.length}件)\n`);
    
    // 分析データの有無で分類
    const analysisLogs = logs.filter(log => log.startTime && log.endTime);
    const basicLogs = logs.filter(log => !log.startTime || !log.endTime);
    
    console.log(`🔬 分析データ付き: ${analysisLogs.length}件`);
    console.log(`📝 基本データのみ: ${basicLogs.length}件\n`);
    
    // 分析データ付きログを表示
    if (analysisLogs.length > 0) {
      console.log('🎯 詳細分析結果:');
      console.log('─'.repeat(80));
      
      analysisLogs.forEach((log, index) => {
        displayEnhancedLog(log, index + 1, timezone);
      });
    }
    
    // 基本ログも表示
    if (basicLogs.length > 0) {
      console.log('\n📝 基本ログ（分析データなし）:');
      console.log('─'.repeat(50));
      
      basicLogs.slice(0, 5).forEach((log, index) => {
        try {
          const inputTime = new Date(log.inputTimestamp); // camelCaseが正しい
          if (isNaN(inputTime.getTime())) {
            console.log(`${index + 1}. [Invalid Time] ${log.content.substring(0, 60)}${log.content.length > 60 ? '...' : ''}`);
            return;
          }
          const localTime = toZonedTime(inputTime, timezone);
          const timeStr = format(localTime, 'HH:mm', { timeZone: timezone });
          
          console.log(`${index + 1}. [${timeStr}] ${log.content.substring(0, 60)}${log.content.length > 60 ? '...' : ''}`);
        } catch (error) {
          console.log(`${index + 1}. [Error: ${error.message}] ${log.content.substring(0, 60)}${log.content.length > 60 ? '...' : ''}`);
        }
      });
      
      if (basicLogs.length > 5) {
        console.log(`... 他 ${basicLogs.length - 5}件`);
      }
    }
    
    // 統計情報
    if (analysisLogs.length > 0) {
      console.log('\n📊 分析統計:');
      showAnalysisSummary(analysisLogs);
    }
    
  } catch (error) {
    console.error('❌ エラー:', error.message);
    console.error('詳細:', error);
  }
}

// 拡張ログ表示
function displayEnhancedLog(log, index, timezone) {
  const inputTime = new Date(log.inputTimestamp);
  const inputTimeStr = format(toZonedTime(inputTime, timezone), 'HH:mm', { timeZone: timezone });
  
  const startTime = new Date(log.startTime);
  const endTime = new Date(log.endTime);
  const startTimeStr = format(toZonedTime(startTime, timezone), 'HH:mm', { timeZone: timezone });
  const endTimeStr = format(toZonedTime(endTime, timezone), 'HH:mm', { timeZone: timezone });
  
  console.log(`\n${index}. 📝 [${inputTimeStr}] ${log.content}`);
  console.log(`   🕐 実際の時刻: ${startTimeStr} - ${endTimeStr} (${log.totalMinutes}分)`);
  
  // 信頼度表示（色分け）
  const confidence = log.confidence * 100;
  const confidenceEmoji = confidence >= 90 ? '🟢' : confidence >= 70 ? '🟡' : '🔴';
  console.log(`   ${confidenceEmoji} 信頼度: ${confidence.toFixed(1)}% | 手法: ${getMethodLabel(log.analysisMethod)}`);
  
  // カテゴリ表示
  if (log.categories) {
    console.log(`   🏷️ カテゴリ: ${log.categories}`);
  }
  
  // 警告表示
  if (log.analysisWarnings) {
    console.log(`   ⚠️ 警告: ${log.analysisWarnings}`);
  }
  
  // 時刻比較（入力時刻と分析時刻の差異）
  const timeDiff = compareInputAndAnalysisTime(inputTime, startTime, endTime);
  if (timeDiff) {
    console.log(`   📊 ${timeDiff}`);
  }
}

// 手法ラベル変換
function getMethodLabel(method) {
  const labels = {
    'explicit': '明示的',
    'relative': '相対的',
    'inferred': '推定',
    'contextual': 'コンテキスト'
  };
  return labels[method] || method;
}

// 入力時刻と分析時刻の比較
function compareInputAndAnalysisTime(inputTime, startTime, endTime) {
  try {
    // 入力時刻が分析時刻範囲内かチェック
    if (inputTime >= startTime && inputTime <= endTime) {
      return '✅ 入力時刻は活動時間内';
    } else if (inputTime > endTime) {
      const diffMinutes = Math.round((inputTime - endTime) / (1000 * 60));
      return `📍 入力は活動終了の${diffMinutes}分後`;
    } else {
      const diffMinutes = Math.round((startTime - inputTime) / (1000 * 60));
      return `📍 入力は活動開始の${diffMinutes}分前`;
    }
  } catch (error) {
    return null;
  }
}

// 分析サマリー表示
function showAnalysisSummary(logs) {
  const totalMinutes = logs.reduce((sum, log) => sum + (log.totalMinutes || 0), 0);
  const avgConfidence = logs.reduce((sum, log) => sum + (log.confidence || 0), 0) / logs.length;
  
  const methodCounts = logs.reduce((acc, log) => {
    acc[log.analysisMethod] = (acc[log.analysisMethod] || 0) + 1;
    return acc;
  }, {});
  
  const categoryCounts = logs
    .filter(log => log.categories)
    .reduce((acc, log) => {
      log.categories.split(', ').forEach(cat => {
        acc[cat] = (acc[cat] || 0) + 1;
      });
      return acc;
    }, {});
  
  console.log(`⏱️ 総活動時間: ${totalMinutes}分 (${(totalMinutes / 60).toFixed(1)}時間)`);
  console.log(`🎯 平均信頼度: ${(avgConfidence * 100).toFixed(1)}%`);
  
  console.log('\n📈 手法分布:');
  Object.entries(methodCounts).forEach(([method, count]) => {
    console.log(`  ${getMethodLabel(method)}: ${count}件`);
  });
  
  if (Object.keys(categoryCounts).length > 0) {
    console.log('\n🏷️ カテゴリ分布:');
    Object.entries(categoryCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .forEach(([category, count]) => {
        console.log(`  ${category}: ${count}件`);
      });
  }
}

// コマンドライン引数処理
if (require.main === module) {
  const args = process.argv.slice(2);
  const date = args[0] || null; // YYYY-MM-DD形式
  const userId = args[1] || 'test-user';
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log('使用方法:');
    console.log('  node scripts/show-enhanced-logs.js [日付] [ユーザーID]');
    console.log('');
    console.log('例:');
    console.log('  node scripts/show-enhanced-logs.js                     # 今日のログ');
    console.log('  node scripts/show-enhanced-logs.js 2025-01-01          # 指定日のログ');
    console.log('  node scripts/show-enhanced-logs.js 2025-01-01 user123  # 指定日・指定ユーザー');
    process.exit(0);
  }
  
  showEnhancedLogs(date, userId).catch(console.error);
}

module.exports = { showEnhancedLogs };