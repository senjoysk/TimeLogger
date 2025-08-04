#!/usr/bin/env node

/**
 * 安全な統一データベースマイグレーションスクリプト
 * Phase1対応版 - 既存データを保護
 */

const { spawn } = require('child_process');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

console.log('🚀 安全な統一データベースマイグレーション開始...');

// Phase1設定に合わせたパス設定
const NODE_ENV = process.env.NODE_ENV || 'production';
const isProduction = NODE_ENV === 'production';
const UNIFIED_DB_PATH = isProduction ? '/app/data/app.db' : './data/app.db';

// スキーマファイルパス
const SCHEMA_PATH = path.join(__dirname, '../../dist/database/newSchema.sql');

console.log(`📁 環境: ${NODE_ENV}`);
console.log(`📁 統一DB: ${UNIFIED_DB_PATH}`);
console.log(`📁 スキーマファイル: ${SCHEMA_PATH}`);

// メインの統合処理
async function runSafeMigration() {
  try {
    // Phase 1: データベースの状態確認
    console.log('\n📋 Phase 1: データベース状態確認');
    const dbExists = await checkDatabaseStatus();
    
    if (dbExists) {
      console.log('✅ 統一データベースは既に存在します');
      
      // Phase 2: 必要なテーブルの確認と作成
      console.log('\n📋 Phase 2: 必要なテーブルの確認');
      await ensureRequiredTables();
      
      // Phase 3: 検証
      console.log('\n📋 Phase 3: データベース検証');
      await validateDatabase();
    } else {
      console.log('🔨 新規データベースを作成します');
      
      // 新規作成の場合のみスキーマを適用
      await initializeNewDatabase();
      await validateDatabase();
    }
    
    console.log('\n🎉 安全な統一データベースマイグレーション完了！');
    
  } catch (error) {
    console.error('❌ マイグレーションエラー:', error);
    process.exit(1);
  }
}

/**
 * データベースの状態確認
 */
async function checkDatabaseStatus() {
  if (!fs.existsSync(UNIFIED_DB_PATH)) {
    return false;
  }
  
  return new Promise((resolve) => {
    const db = new sqlite3.Database(UNIFIED_DB_PATH, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        console.log('⚠️  データベースファイルは存在しますが、読み取れません');
        resolve(false);
      } else {
        // データの存在確認
        db.get("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'", (err, row) => {
          db.close();
          if (err || !row || row.count === 0) {
            console.log('⚠️  データベースは空です');
            resolve(false);
          } else {
            console.log(`📊 既存のテーブル数: ${row.count}`);
            resolve(true);
          }
        });
      }
    });
  });
}

/**
 * 新規データベースの初期化
 */
async function initializeNewDatabase() {
  return new Promise((resolve, reject) => {
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    console.log('📄 スキーマファイル読み込み完了');
    
    const db = new sqlite3.Database(UNIFIED_DB_PATH, (err) => {
      if (err) {
        console.error('❌ DB作成エラー:', err);
        reject(err);
        return;
      }
      console.log('✅ データベース作成成功');
      
      executeSchema(db, schema, (err) => {
        db.close();
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  });
}

/**
 * 必要なテーブルの確認と作成
 */
async function ensureRequiredTables() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(UNIFIED_DB_PATH, (err) => {
      if (err) {
        console.error('❌ DB接続エラー:', err);
        reject(err);
        return;
      }
      
      // 既存テーブルの確認
      db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, rows) => {
        if (err) {
          console.error('❌ テーブル一覧取得エラー:', err);
          db.close();
          reject(err);
          return;
        }
        
        const existingTables = rows.map(row => row.name);
        console.log('📊 既存のテーブル:', existingTables.join(', '));
        
        // Phase1で必要な列の確認（特にnight suspend関連）
        checkRequiredColumns(db, () => {
          db.close();
          resolve();
        });
      });
    });
  });
}

/**
 * 必要な列の確認
 */
function checkRequiredColumns(db, callback) {
  console.log('🔍 必要な列の確認中...');
  
  // activity_logsテーブルの列確認
  db.all("PRAGMA table_info(activity_logs)", [], (err, columns) => {
    if (err) {
      console.error('❌ 列情報取得エラー:', err);
      callback(err);
      return;
    }
    
    const columnNames = columns.map(col => col.name);
    const requiredColumns = ['discord_message_id', 'recovery_processed', 'recovery_timestamp'];
    const missingColumns = requiredColumns.filter(col => !columnNames.includes(col));
    
    if (missingColumns.length > 0) {
      console.log('⚠️  不足している列を追加します:', missingColumns.join(', '));
      addMissingColumns(db, missingColumns, callback);
    } else {
      console.log('✅ 全ての必要な列が存在します');
      callback();
    }
  });
}

/**
 * 不足している列の追加
 */
function addMissingColumns(db, missingColumns, callback) {
  const alterStatements = missingColumns.map(col => {
    switch(col) {
      case 'discord_message_id':
        return 'ALTER TABLE activity_logs ADD COLUMN discord_message_id TEXT';
      case 'recovery_processed':
        return 'ALTER TABLE activity_logs ADD COLUMN recovery_processed BOOLEAN DEFAULT FALSE';
      case 'recovery_timestamp':
        return 'ALTER TABLE activity_logs ADD COLUMN recovery_timestamp TEXT';
      default:
        return null;
    }
  }).filter(stmt => stmt !== null);
  
  let completed = 0;
  
  db.serialize(() => {
    alterStatements.forEach(stmt => {
      db.run(stmt, (err) => {
        completed++;
        if (err) {
          console.error(`❌ 列追加エラー: ${stmt}`, err.message);
        } else {
          console.log(`✅ 列追加成功: ${stmt}`);
        }
        
        if (completed === alterStatements.length) {
          callback();
        }
      });
    });
  });
}

/**
 * スキーマの実行
 */
function executeSchema(db, schema, callback) {
  const statements = schema.split(';').map(s => s.trim()).filter(s => s.length > 0);
  console.log(`📝 実行予定のSQL文数: ${statements.length}`);
  
  let completed = 0;
  let errors = 0;
  
  db.serialize(() => {
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
            console.log(`🎉 スキーマ実行完了 (成功: ${completed - errors}, エラー: ${errors})`);
            callback(null);
          }
        });
      }
    });
  });
}

/**
 * データベース検証
 */
async function validateDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(UNIFIED_DB_PATH, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        console.error('❌ 検証用DB接続エラー:', err);
        reject(err);
        return;
      }
      
      // テーブル一覧を取得
      db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, rows) => {
        if (err) {
          console.error('❌ テーブル一覧取得エラー:', err);
          db.close();
          reject(err);
          return;
        }
        
        const tables = rows.map(row => row.name);
        console.log('📊 作成されたテーブル:');
        tables.forEach(table => console.log(`   - ${table}`));
        
        // 必須テーブルの確認
        const requiredTables = ['activity_logs', 'user_settings', 'todo_tasks'];
        const missingTables = requiredTables.filter(table => !tables.includes(table));
        
        if (missingTables.length > 0) {
          console.error('❌ 必須テーブルが不足:', missingTables.join(', '));
          db.close();
          reject(new Error(`Missing required tables: ${missingTables.join(', ')}`));
          return;
        }
        
        // データ件数の確認
        let checksCompleted = 0;
        requiredTables.forEach(table => {
          db.get(`SELECT COUNT(*) as count FROM ${table}`, (err, row) => {
            checksCompleted++;
            if (!err && row) {
              console.log(`   - ${table}: ${row.count}件`);
            }
            
            if (checksCompleted === requiredTables.length) {
              console.log('✅ データベース検証完了');
              db.close();
              resolve();
            }
          });
        });
      });
    });
  });
}

/**
 * アプリケーションの起動
 */
function startApp() {
  console.log('\n🚀 メインアプリケーションを起動中...');
  
  const app = spawn('node', ['dist/index.js'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_PATH: UNIFIED_DB_PATH,
      ACTIVITY_DB_PATH: UNIFIED_DB_PATH,
    }
  });
  
  app.on('error', (err) => {
    console.error('❌ アプリケーション起動エラー:', err);
    process.exit(1);
  });
  
  app.on('exit', (code) => {
    process.exit(code || 0);
  });
}

// マイグレーション実行
runSafeMigration()
  .then(() => {
    startApp();
  })
  .catch((error) => {
    console.error('❌ 安全なマイグレーション失敗:', error);
    process.exit(1);
  });