#!/bin/bash

echo "🚀 本番環境でインラインマイグレーションを実行中..."

# Node.jsスクリプトを直接実行
fly ssh console -a timelogger-bitter-resonance-9585 -C "cd /app && node -e \"
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('/app/data/tasks.db');

console.log('🔧 マイグレーション開始...');

// カラム追加を試みる
db.serialize(() => {
  // discord_message_idカラム
  db.run('ALTER TABLE activity_logs ADD COLUMN discord_message_id TEXT', (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('discord_message_id追加エラー:', err.message);
    } else {
      console.log('✅ discord_message_idカラム処理完了');
    }
  });
  
  // recovery_processedカラム
  db.run('ALTER TABLE activity_logs ADD COLUMN recovery_processed BOOLEAN DEFAULT FALSE', (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('recovery_processed追加エラー:', err.message);
    } else {
      console.log('✅ recovery_processedカラム処理完了');
    }
  });
  
  // recovery_timestampカラム
  db.run('ALTER TABLE activity_logs ADD COLUMN recovery_timestamp TEXT', (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('recovery_timestamp追加エラー:', err.message);
    } else {
      console.log('✅ recovery_timestampカラム処理完了');
    }
  });
  
  // suspend_statesテーブル
  db.run(\`CREATE TABLE IF NOT EXISTS suspend_states (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    suspend_time TEXT NOT NULL,
    wake_time TEXT,
    expected_wake_time TEXT,
    status TEXT NOT NULL CHECK (status IN ('suspended', 'active', 'scheduled')),
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
  )\`, (err) => {
    if (err) {
      console.error('suspend_states作成エラー:', err.message);
    } else {
      console.log('✅ suspend_statesテーブル処理完了');
    }
  });
  
  // 完了確認
  setTimeout(() => {
    db.all('PRAGMA table_info(activity_logs)', [], (err, rows) => {
      if (!err) {
        const columns = rows.map(r => r.name);
        console.log('✅ 現在のカラム:', columns.join(', '));
        if (columns.includes('discord_message_id')) {
          console.log('🎉 マイグレーション成功！');
        }
      }
      db.close();
    });
  }, 2000);
});
\""

echo "✅ インラインマイグレーション実行完了"
echo "🔄 アプリケーションを再起動中..."

# アプリケーションを再起動
fly apps restart timelogger-bitter-resonance-9585

echo "✅ 完了！"