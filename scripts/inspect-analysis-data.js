#!/usr/bin/env node

/**
 * リアルタイム分析データの確認スクリプト
 * データベース内の新しい分析フィールドの状況をチェック
 */

const { SqliteActivityLogRepository } = require('../dist/repositories/sqliteActivityLogRepository');
const { config } = require('dotenv');
const { toZonedTime, format } = require('date-fns-tz');

// 環境変数読み込み
config();

async function inspectAnalysisData() {
  console.log('🔍 リアルタイム分析データ確認ツール\n');
  
  try {
    // リポジトリ初期化
    const dbPath = process.env.DATABASE_PATH || './data/app.db';
    const repository = new SqliteActivityLogRepository(dbPath);
    
    console.log(`📁 データベースパス: ${dbPath}`);
    
    // テーブル構造確認
    console.log('\n📋 テーブル構造確認:');
    await showTableSchema(repository);
    
    // 最新のログデータを取得（最大10件）
    console.log('\n📝 最新ログデータ（最大10件）:');
    await showRecentLogs(repository);
    
    // 分析データが含まれるログを検索
    console.log('\n🔬 分析データ付きログ:');
    await showAnalysisEnabledLogs(repository);
    
    // 統計情報
    console.log('\n📊 分析データ統計:');
    await showAnalysisStatistics(repository);
    
  } catch (error) {
    console.error('❌ エラー:', error.message);
    console.error('詳細:', error);
  }
}

// テーブル構造表示
async function showTableSchema(repository) {
  try {
    const db = repository.db;
    const schema = await new Promise((resolve, reject) => {
      db.all("PRAGMA table_info(activity_logs)", (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log('activity_logs テーブル構造:');
    schema.forEach(col => {
      const newField = ['start_time', 'end_time', 'total_minutes', 'confidence', 'analysis_method', 'categories', 'analysis_warnings'].includes(col.name);
      const indicator = newField ? '🆕' : '   ';
      console.log(`${indicator} ${col.name.padEnd(20)} ${col.type.padEnd(15)} ${col.notnull ? 'NOT NULL' : 'NULL'}`);
    });
  } catch (error) {
    console.log('❌ テーブル構造取得エラー:', error.message);
  }
}

// 最新ログ表示
async function showRecentLogs(repository) {
  try {
    const db = repository.db;
    const logs = await new Promise((resolve, reject) => {
      db.all(`
        SELECT id, content, input_timestamp, start_time, end_time, total_minutes, 
               confidence, analysis_method, categories, analysis_warnings
        FROM activity_logs 
        WHERE is_deleted = 0 
        ORDER BY input_timestamp DESC 
        LIMIT 10
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    if (logs.length === 0) {
      console.log('ログデータがありません。');
      return;
    }
    
    logs.forEach((log, index) => {
      console.log(`\n${index + 1}. [${log.id}] ${formatTimeJST(log.input_timestamp)}`);
      console.log(`   内容: ${log.content.substring(0, 60)}${log.content.length > 60 ? '...' : ''}`);
      
      if (log.start_time && log.end_time) {
        console.log(`   🕐 分析時刻: ${formatTimeJST(log.start_time)} - ${formatTimeJST(log.end_time)} (${log.total_minutes}分)`);
        console.log(`   📊 手法: ${log.analysis_method} | 信頼度: ${(log.confidence * 100).toFixed(1)}%`);
        if (log.categories) console.log(`   🏷️ カテゴリ: ${log.categories}`);
        if (log.analysis_warnings) console.log(`   ⚠️ 警告: ${log.analysis_warnings}`);
      } else {
        console.log(`   ❌ 分析データなし`);
      }
    });
  } catch (error) {
    console.log('❌ ログデータ取得エラー:', error.message);
  }
}

// 分析データ付きログ表示
async function showAnalysisEnabledLogs(repository) {
  try {
    const db = repository.db;
    const logs = await new Promise((resolve, reject) => {
      db.all(`
        SELECT id, content, input_timestamp, start_time, end_time, total_minutes, 
               confidence, analysis_method, categories
        FROM activity_logs 
        WHERE is_deleted = 0 AND start_time IS NOT NULL
        ORDER BY input_timestamp DESC 
        LIMIT 20
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    if (logs.length === 0) {
      console.log('❌ 分析データ付きログがありません。');
      console.log('💡 新しいシステムでログを記録すると、分析データが生成されます。');
      return;
    }
    
    console.log(`✅ 分析データ付きログ: ${logs.length}件`);
    
    logs.slice(0, 5).forEach((log, index) => {
      console.log(`\n${index + 1}. [${formatTimeJST(log.input_timestamp)}] ${log.content.substring(0, 40)}...`);
      console.log(`   🕐 実際の時刻: ${formatTimeJST(log.start_time)} - ${formatTimeJST(log.end_time)}`);
      console.log(`   ⏱️ 時間: ${log.total_minutes}分 | 信頼度: ${(log.confidence * 100).toFixed(1)}% | 手法: ${log.analysis_method}`);
      if (log.categories) console.log(`   🏷️ ${log.categories}`);
    });
    
    if (logs.length > 5) {
      console.log(`\n... 他 ${logs.length - 5}件`);
    }
  } catch (error) {
    console.log('❌ 分析データ取得エラー:', error.message);
  }
}

// 分析統計表示
async function showAnalysisStatistics(repository) {
  try {
    const db = repository.db;
    
    // 基本統計
    const totalCount = await new Promise((resolve, reject) => {
      db.get("SELECT COUNT(*) as count FROM activity_logs WHERE is_deleted = 0", (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
    
    const analysisCount = await new Promise((resolve, reject) => {
      db.get("SELECT COUNT(*) as count FROM activity_logs WHERE is_deleted = 0 AND start_time IS NOT NULL", (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
    
    // 手法別統計
    const methodStats = await new Promise((resolve, reject) => {
      db.all(`
        SELECT analysis_method, COUNT(*) as count, AVG(confidence) as avgConfidence
        FROM activity_logs 
        WHERE is_deleted = 0 AND analysis_method IS NOT NULL
        GROUP BY analysis_method
        ORDER BY count DESC
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    // 信頼度分布
    const confidenceStats = await new Promise((resolve, reject) => {
      db.all(`
        SELECT 
          CASE 
            WHEN confidence >= 0.9 THEN '90%以上'
            WHEN confidence >= 0.8 THEN '80-89%'
            WHEN confidence >= 0.7 THEN '70-79%'
            WHEN confidence >= 0.6 THEN '60-69%'
            ELSE '60%未満'
          END as confidenceRange,
          COUNT(*) as count
        FROM activity_logs 
        WHERE is_deleted = 0 AND confidence IS NOT NULL
        GROUP BY confidenceRange
        ORDER BY confidence DESC
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log(`総ログ数: ${totalCount}件`);
    console.log(`分析データ付き: ${analysisCount}件 (${((analysisCount / totalCount) * 100).toFixed(1)}%)`);
    
    if (methodStats.length > 0) {
      console.log('\n📈 手法別統計:');
      methodStats.forEach(stat => {
        console.log(`  ${stat.analysis_method}: ${stat.count}件 (平均信頼度: ${(stat.avgConfidence * 100).toFixed(1)}%)`);
      });
    }
    
    if (confidenceStats.length > 0) {
      console.log('\n🎯 信頼度分布:');
      confidenceStats.forEach(stat => {
        console.log(`  ${stat.confidenceRange}: ${stat.count}件`);
      });
    }
    
  } catch (error) {
    console.log('❌ 統計データ取得エラー:', error.message);
  }
}

// 時刻をJST形式でフォーマット
function formatTimeJST(isoString) {
  if (!isoString) return 'N/A';
  try {
    const date = new Date(isoString);
    const jstDate = toZonedTime(date, 'Asia/Tokyo');
    return format(jstDate, 'MM/dd HH:mm', { timeZone: 'Asia/Tokyo' });
  } catch (error) {
    return isoString;
  }
}

// 実行
if (require.main === module) {
  inspectAnalysisData().catch(console.error);
}

module.exports = { inspectAnalysisData };