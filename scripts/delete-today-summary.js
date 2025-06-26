#!/usr/bin/env node

/**
 * 今日の日次サマリーを削除するスクリプト
 * 使用方法: node scripts/delete-today-summary.js [YYYY-MM-DD]
 * 引数なしの場合は今日の日付を使用
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// データベースファイルのパス
const dbPath = path.join(__dirname, '..', 'data', 'tasks.db');

// 日付を YYYY-MM-DD 形式で取得
function getTodayDate(timezoneOffset = '+09:00') {
  const now = new Date();
  // JST (UTC+9) での日付を取得
  const jstDate = new Date(now.getTime() + (9 * 60 * 60 * 1000));
  return jstDate.toISOString().split('T')[0];
}

// コマンドライン引数から日付を取得、なければ今日の日付
const targetDate = process.argv[2] || getTodayDate();

console.log(`🗑️  日次サマリー削除スクリプトを開始します`);
console.log(`📅 対象日付: ${targetDate}`);

// データベース接続
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ データベース接続エラー:', err.message);
    process.exit(1);
  }
  console.log('✅ データベースに接続しました');
});

// 削除前に既存のサマリーを確認
db.get(
  'SELECT business_date, total_minutes, generated_at FROM daily_summaries WHERE business_date = ?',
  [targetDate],
  (err, row) => {
    if (err) {
      console.error('❌ サマリー検索エラー:', err.message);
      db.close();
      process.exit(1);
    }

    if (!row) {
      console.log(`ℹ️  ${targetDate} の日次サマリーは存在しません`);
      db.close();
      process.exit(0);
    }

    console.log(`📊 既存のサマリー:`);
    console.log(`   日付: ${row.business_date}`);
    console.log(`   総活動時間: ${row.total_minutes}分`);
    console.log(`   生成日時: ${row.generated_at}`);
    
    // サマリーを削除
    db.run(
      'DELETE FROM daily_summaries WHERE business_date = ?',
      [targetDate],
      function(err) {
        if (err) {
          console.error('❌ サマリー削除エラー:', err.message);
          db.close();
          process.exit(1);
        }

        if (this.changes === 0) {
          console.log(`ℹ️  削除対象のサマリーが見つかりませんでした`);
        } else {
          console.log(`✅ ${targetDate} の日次サマリーを削除しました`);
          console.log(`📝 削除件数: ${this.changes}件`);
        }

        // データベース接続を閉じる
        db.close((err) => {
          if (err) {
            console.error('❌ データベース切断エラー:', err.message);
          } else {
            console.log('✅ データベース接続を切断しました');
          }
          
          console.log('🎉 削除処理が完了しました');
        });
      }
    );
  }
);