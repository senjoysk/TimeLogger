/**
 * 本番環境でsuspend_hour/wake_hourカラムを追加するマイグレーションスクリプト
 */

const Database = require('sqlite3').Database;
const path = require('path');

async function runMigration() {
  const dbPath = process.env.NODE_ENV === 'production' ? '/app/data/app.db' : path.join(__dirname, '../../data/app.db');
  console.log(`📁 データベースパス: ${dbPath}`);
  
  const db = new Database(dbPath);
  
  return new Promise((resolve, reject) => {
    // 現在のスキーマを確認
    db.all("PRAGMA table_info(user_settings)", (err, rows) => {
      if (err) {
        console.error('❌ スキーマ確認エラー:', err);
        reject(err);
        return;
      }

      console.log('📊 現在のuser_settingsテーブルカラム:');
      const existingColumns = rows.map(row => row.name);
      existingColumns.forEach(col => {
        console.log(`  - ${col}`);
      });

      const hasSuspendHour = existingColumns.includes('suspend_hour');
      const hasWakeHour = existingColumns.includes('wake_hour');

      console.log(`\n🔍 カラム存在確認:`);
      console.log(`  - suspend_hour: ${hasSuspendHour ? '✅ 存在' : '❌ 不在'}`);
      console.log(`  - wake_hour: ${hasWakeHour ? '✅ 存在' : '❌ 不在'}`);

      // 必要なカラムを追加
      const migrations = [];
      
      if (!hasSuspendHour) {
        migrations.push("ALTER TABLE user_settings ADD COLUMN suspend_hour INTEGER DEFAULT 0");
      }
      
      if (!hasWakeHour) {
        migrations.push("ALTER TABLE user_settings ADD COLUMN wake_hour INTEGER DEFAULT 7");
      }

      if (migrations.length === 0) {
        console.log('✅ 全ての必要なカラムが既に存在します');
        db.close();
        resolve();
        return;
      }

      console.log(`\n🔧 実行するマイグレーション: ${migrations.length}件`);
      
      let completed = 0;
      const total = migrations.length;
      
      migrations.forEach((sql, index) => {
        console.log(`  ${index + 1}. ${sql}`);
        
        db.run(sql, (err) => {
          if (err) {
            console.error(`❌ マイグレーション ${index + 1} エラー:`, err);
            reject(err);
            return;
          }
          
          console.log(`✅ マイグレーション ${index + 1} 完了`);
          completed++;
          
          if (completed === total) {
            // 最終確認
            db.all("SELECT user_id, suspend_hour, wake_hour, timezone FROM user_settings", (err, rows) => {
              if (err) {
                console.error('❌ 最終確認エラー:', err);
                reject(err);
              } else {
                console.log('\n✅ マイグレーション完了! 現在のデータ:');
                rows.forEach(row => {
                  console.log(`  ユーザー ${row.user_id}: サスペンド=${row.suspend_hour}:00, 起床=${row.wake_hour}:00, タイムゾーン=${row.timezone}`);
                });
                db.close();
                resolve();
              }
            });
          }
        });
      });
    });
  });
}

// スクリプト実行
runMigration()
  .then(() => {
    console.log('\n🎉 suspend_hour/wake_hourカラム追加マイグレーション完了!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ マイグレーション失敗:', error);
    process.exit(1);
  });