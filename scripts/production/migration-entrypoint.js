#!/usr/bin/env node

/**
 * 本番環境起動時マイグレーションエントリーポイント
 * データベースを修正してからアプリケーションを起動
 */

const { spawn } = require('child_process');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

console.log('🚀 起動時マイグレーション開始...');

const DB_PATH = process.env.DB_PATH || '/app/data/tasks.db';
const ACTIVITY_DB_PATH = process.env.ACTIVITY_DB_PATH || '/app/data/activity_logs.db';
console.log(`📁 データベースパス: ${DB_PATH}`);
console.log(`📁 活動ログDB: ${ACTIVITY_DB_PATH}`);

// 最初にスキーマを初期化してからマイグレーション実行
initializeSchema();

function initializeSchema() {
  console.log('📋 スキーマ初期化を開始...');
  
  // newSchema.sqlファイルを読み込み
  const schemaPath = path.join(__dirname, '../../dist/database/newSchema.sql');
  console.log(`📁 スキーマファイルパス: ${schemaPath}`);
  
  if (!fs.existsSync(schemaPath)) {
    console.error('❌ スキーマファイルが見つかりません');
    // スキーマファイルがない場合は従来のマイグレーションを実行
    performMigration();
    return;
  }
  
  const schema = fs.readFileSync(schemaPath, 'utf8');
  console.log('📄 スキーマファイル読み込み完了');
  
  // activity_logs.dbを初期化
  const activityDb = new sqlite3.Database(ACTIVITY_DB_PATH, (err) => {
    if (err) {
      console.error('❌ 活動ログDB接続エラー:', err);
      performMigration();
      return;
    }
    console.log('✅ 活動ログDB接続成功');
    
    // スキーマを実行
    executeSchema(activityDb, schema, () => {
      activityDb.close();
      // 従来のマイグレーション処理も実行
      performMigration();
    });
  });
}

function executeSchema(db, schema, callback) {
  // SQL文を分割して実行
  const statements = schema.split(';').map(s => s.trim()).filter(s => s.length > 0);
  console.log(`📝 実行予定のSQL文数: ${statements.length}`);
  
  let completed = 0;
  let errors = 0;
  
  statements.forEach((statement, index) => {
    if (statement.trim()) {
      db.run(statement, (err) => {
        completed++;
        if (err) {
          if (err.message.includes('already exists') || err.message.includes('duplicate')) {
            console.log(`⏩ スキップ ${index + 1}: ${statement.substring(0, 50)}...`);
          } else {
            console.error(`❌ SQL実行エラー ${index + 1}:`, err.message);
            errors++;
          }
        } else {
          console.log(`✅ SQL実行 ${index + 1}/${statements.length} 完了`);
        }
        
        if (completed === statements.length) {
          console.log(`🎉 スキーマ初期化完了 (成功: ${completed - errors}, エラー: ${errors})`);
          callback();
        }
      });
    }
  });
}

function performMigration() {
  const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.error('❌ データベース接続エラー:', err);
      // エラーでもアプリは起動する
      startApp();
      return;
    }
    console.log('✅ データベース接続成功');
    
    // マイグレーション実行
    runMigration();
  });

  function runMigration() {
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