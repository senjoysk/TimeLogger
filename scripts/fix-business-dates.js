#!/usr/bin/env node

/**
 * 誤ったbusiness_dateを修正するスクリプト
 * time_slotとタイムゾーンから正しいbusiness_dateを再計算
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// データベースファイルのパス
const dbPath = path.join(__dirname, '..', 'data', 'tasks.db');

console.log(`🔧 business_date修正スクリプトを開始します`);

// データベース接続
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ データベース接続エラー:', err.message);
    process.exit(1);
  }
  console.log('✅ データベースに接続しました');
});

// 各ユーザーのタイムゾーンを取得
db.all('SELECT DISTINCT user_id, timezone FROM users', [], (err, users) => {
  if (err) {
    console.error('❌ ユーザー情報取得エラー:', err);
    return;
  }

  users.forEach(user => {
    console.log(`\n👤 ユーザー ${user.user_id} (${user.timezone}) の処理を開始`);
    
    // そのユーザーの活動記録でtime_slotとbusiness_dateが不一致のものを検索
    db.all(
      `SELECT id, time_slot, business_date, created_at 
       FROM activity_records 
       WHERE user_id = ? 
       AND DATE(time_slot) != business_date`,
      [user.user_id],
      (err, records) => {
        if (err) {
          console.error('❌ 活動記録取得エラー:', err);
          return;
        }

        if (records.length === 0) {
          console.log('  ✅ 修正が必要な記録はありません');
          return;
        }

        console.log(`  📝 修正対象: ${records.length}件`);
        
        let fixedCount = 0;
        records.forEach((record, index) => {
          // time_slotからそのまま日付部分を取得（タイムゾーンは既に考慮済み）
          const correctBusinessDate = record.time_slot.split(' ')[0];
          
          console.log(`    - ${record.time_slot} → ${correctBusinessDate} (現在: ${record.business_date})`);
          
          // business_dateを修正
          db.run(
            'UPDATE activity_records SET business_date = ? WHERE id = ?',
            [correctBusinessDate, record.id],
            (err) => {
              if (err) {
                console.error(`❌ 更新エラー (ID: ${record.id}):`, err);
              } else {
                fixedCount++;
              }
              
              // 最後のレコードの処理が終わったら結果を表示
              if (index === records.length - 1) {
                console.log(`  ✅ ${fixedCount}件のbusiness_dateを修正しました`);
              }
            }
          );
        });
      }
    );
  });

  // 処理完了後にデータベースを閉じる
  setTimeout(() => {
    db.close((err) => {
      if (err) {
        console.error('❌ データベース切断エラー:', err.message);
      } else {
        console.log('\n✅ データベース接続を切断しました');
        console.log('🎉 business_date修正が完了しました');
      }
    });
  }, 3000);
});