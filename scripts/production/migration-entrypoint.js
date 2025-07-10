#!/usr/bin/env node

/**
 * 本番環境起動時マイグレーションエントリーポイント
 * データベースを修正してからアプリケーションを起動
 */

const { spawn } = require('child_process');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

console.log('🚀 起動時マイグレーション開始...');

const DB_PATH = process.env.DB_PATH || '/app/data/tasks.db';
console.log(`📁 データベースパス: ${DB_PATH}`);

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ データベース接続エラー:', err);
    // エラーでもアプリは起動する
    startApp();
    return;
  }
  console.log('✅ データベース接続成功');
  
  // マイグレーション実行
  performMigration();
});

function performMigration() {
  db.serialize(() => {
    // 各カラムを順番に追加（エラーは無視）
    const alterCommands = [
      'ALTER TABLE activity_logs ADD COLUMN discord_message_id TEXT',
      'ALTER TABLE activity_logs ADD COLUMN recovery_processed BOOLEAN DEFAULT FALSE',
      'ALTER TABLE activity_logs ADD COLUMN recovery_timestamp TEXT'
    ];
    
    let completed = 0;
    alterCommands.forEach((sql, index) => {
      db.run(sql, (err) => {
        completed++;
        if (err && !err.message.includes('duplicate column')) {
          console.error(`❌ カラム追加エラー ${index + 1}:`, err.message);
        } else {
          console.log(`✅ カラム追加 ${index + 1}/3 完了`);
        }
        
        if (completed === alterCommands.length) {
          // suspend_statesテーブル作成
          createSuspendStatesTable();
        }
      });
    });
  });
}

function createSuspendStatesTable() {
  const sql = `CREATE TABLE IF NOT EXISTS suspend_states (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    suspend_time TEXT NOT NULL,
    wake_time TEXT,
    expected_wake_time TEXT,
    status TEXT NOT NULL CHECK (status IN ('suspended', 'active', 'scheduled')),
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
  )`;
  
  db.run(sql, (err) => {
    if (err) {
      console.error('❌ suspend_statesテーブル作成エラー:', err.message);
    } else {
      console.log('✅ suspend_statesテーブル作成完了');
    }
    
    // インデックス作成
    createIndexes();
  });
}

function createIndexes() {
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_discord_message_id ON activity_logs(discord_message_id)',
    'CREATE INDEX IF NOT EXISTS idx_recovery_processed ON activity_logs(recovery_processed)',
    'CREATE INDEX IF NOT EXISTS idx_suspend_states_user_id ON suspend_states(user_id)'
  ];
  
  let completed = 0;
  indexes.forEach((sql, index) => {
    db.run(sql, (err) => {
      completed++;
      if (err && !err.message.includes('already exists')) {
        console.error(`❌ インデックス作成エラー ${index + 1}:`, err.message);
      } else {
        console.log(`✅ インデックス ${index + 1}/3 作成完了`);
      }
      
      if (completed === indexes.length) {
        // マイグレーション完了
        finalizeMigration();
      }
    });
  });
}

function finalizeMigration() {
  // 最終確認
  db.all('PRAGMA table_info(activity_logs)', [], (err, rows) => {
    if (!err) {
      const columns = rows.map(r => r.name);
      console.log('📊 最終カラム一覧:', columns.join(', '));
      if (columns.includes('discord_message_id')) {
        console.log('🎉 マイグレーション成功！');
      }
    }
    
    db.close((err) => {
      if (err) {
        console.error('データベースクローズエラー:', err);
      }
      console.log('✅ データベース接続を閉じました');
      
      // アプリケーションを起動
      startApp();
    });
  });
}

function startApp() {
  console.log('\n🚀 メインアプリケーションを起動中...');
  
  // node dist/index.js を起動
  const app = spawn('node', ['dist/index.js'], {
    stdio: 'inherit',
    env: process.env
  });
  
  app.on('error', (err) => {
    console.error('❌ アプリケーション起動エラー:', err);
    process.exit(1);
  });
  
  app.on('exit', (code) => {
    process.exit(code || 0);
  });
}