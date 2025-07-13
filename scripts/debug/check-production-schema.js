/**
 * 本番環境データベーススキーマ確認スクリプト
 */

const Database = require('sqlite3').Database;

const dbPath = process.env.NODE_ENV === 'production' ? '/app/data/app.db' : './data/app.db';
console.log(`📁 データベースパス: ${dbPath}`);

const db = new Database(dbPath);

// user_settingsテーブルのスキーマを確認
db.all("PRAGMA table_info(user_settings)", (err, rows) => {
  if (err) {
    console.error('❌ スキーマ確認エラー:', err);
    process.exit(1);
  }

  console.log('📊 user_settingsテーブルのカラム:');
  rows.forEach(row => {
    console.log(`  - ${row.name}: ${row.type} ${row.notnull ? 'NOT NULL' : 'NULL'} ${row.dflt_value ? `DEFAULT ${row.dflt_value}` : ''}`);
  });

  // 実際のデータを確認
  db.all("SELECT * FROM user_settings LIMIT 5", (err, rows) => {
    if (err) {
      console.error('❌ データ取得エラー:', err);
    } else {
      console.log('\n📋 user_settingsテーブルのデータ (最大5件):');
      rows.forEach(row => {
        console.log('  ', row);
      });
    }
    
    db.close();
  });
});