#!/usr/bin/env node

/**
 * 緊急マイグレーションスクリプト
 * 本番環境のデータベースに欠落しているカラムを追加
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join('/app/data', 'tasks.db');

console.log('🚀 緊急マイグレーション開始...');
console.log(`📁 データベースパス: ${DB_PATH}`);

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ データベース接続エラー:', err);
    process.exit(1);
  }
  console.log('✅ データベース接続成功');
});

// 実行するSQL文
const migrations = [
  {
    name: 'discord_message_idカラム追加',
    sql: 'ALTER TABLE activity_logs ADD COLUMN discord_message_id TEXT'
  },
  {
    name: 'recovery_processedカラム追加', 
    sql: 'ALTER TABLE activity_logs ADD COLUMN recovery_processed BOOLEAN DEFAULT FALSE'
  },
  {
    name: 'recovery_timestampカラム追加',
    sql: 'ALTER TABLE activity_logs ADD COLUMN recovery_timestamp TEXT'
  },
  {
    name: 'suspend_statesテーブル作成',
    sql: `CREATE TABLE IF NOT EXISTS suspend_states (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      suspend_time TEXT NOT NULL,
      wake_time TEXT,
      expected_wake_time TEXT,
      status TEXT NOT NULL CHECK (status IN ('suspended', 'active', 'scheduled')),
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
    )`
  },
  {
    name: 'discord_message_idインデックス作成',
    sql: 'CREATE INDEX IF NOT EXISTS idx_discord_message_id ON activity_logs(discord_message_id)'
  },
  {
    name: 'recovery_processedインデックス作成',
    sql: 'CREATE INDEX IF NOT EXISTS idx_recovery_processed ON activity_logs(recovery_processed)'
  },
  {
    name: 'discord_message_idユニークインデックス作成',
    sql: 'CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_discord_message_id ON activity_logs(discord_message_id) WHERE discord_message_id IS NOT NULL'
  },
  {
    name: 'suspend_states user_idインデックス作成',
    sql: 'CREATE INDEX IF NOT EXISTS idx_suspend_states_user_id ON suspend_states(user_id)'
  },
  {
    name: 'suspend_states suspend_timeインデックス作成',
    sql: 'CREATE INDEX IF NOT EXISTS idx_suspend_states_suspend_time ON suspend_states(suspend_time)'
  }
];

let successCount = 0;
let errorCount = 0;

// マイグレーションを順次実行
const runMigrations = async () => {
  for (const migration of migrations) {
    await new Promise((resolve) => {
      console.log(`\n🔧 実行中: ${migration.name}`);
      db.run(migration.sql, (err) => {
        if (err) {
          if (err.message.includes('duplicate column name') || 
              err.message.includes('already exists')) {
            console.log(`⏩ スキップ: ${migration.name} (既に存在)`)
            successCount++;
          } else {
            console.error(`❌ エラー: ${migration.name}`, err.message);
            errorCount++;
          }
        } else {
          console.log(`✅ 成功: ${migration.name}`);
          successCount++;
        }
        resolve();
      });
    });
  }

  // 結果表示
  console.log('\n📊 マイグレーション結果:');
  console.log(`✅ 成功: ${successCount}`);
  console.log(`❌ エラー: ${errorCount}`);
  
  // データベースを閉じる
  db.close((err) => {
    if (err) {
      console.error('データベースクローズエラー:', err);
    }
    console.log('\n🎉 マイグレーション完了！');
    process.exit(errorCount > 0 ? 1 : 0);
  });
};

// マイグレーション実行
runMigrations();