#!/usr/bin/env node

/**
 * データベースマイグレーションスクリプト
 * activity_logsテーブルに分析結果カラムを追加
 */

const { Database } = require('sqlite3').verbose();
const { config } = require('dotenv');
const path = require('path');

// 環境変数読み込み
config();

async function runMigration() {
  console.log('🔧 データベースマイグレーション開始: 分析結果カラムの追加\n');
  
  const dbPath = process.env.DATABASE_PATH || './data/activity_logs.db';
  console.log(`📁 データベースパス: ${dbPath}`);
  
  const db = new Database(dbPath);
  
  try {
    // 現在のテーブル構造を確認
    console.log('\n📋 現在のテーブル構造を確認中...');
    const columns = await new Promise((resolve, reject) => {
      db.all("PRAGMA table_info(activity_logs)", (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    const existingColumns = columns.map(col => col.name);
    console.log('既存カラム:', existingColumns.join(', '));
    
    // 追加するカラムの定義
    const newColumns = [
      { name: 'start_time', type: 'TEXT', comment: '活動開始時刻（UTC、ISO 8601形式）' },
      { name: 'end_time', type: 'TEXT', comment: '活動終了時刻（UTC、ISO 8601形式）' },
      { name: 'total_minutes', type: 'INTEGER', comment: '総活動時間（分）' },
      { name: 'confidence', type: 'REAL', comment: '分析の信頼度 (0-1)' },
      { name: 'analysis_method', type: 'TEXT', comment: '時刻抽出手法' },
      { name: 'categories', type: 'TEXT', comment: 'カテゴリ（カンマ区切り）' },
      { name: 'analysis_warnings', type: 'TEXT', comment: '警告メッセージ（セミコロン区切り）' }
    ];
    
    // 各カラムを追加
    console.log('\n🔨 新しいカラムを追加中...');
    for (const column of newColumns) {
      if (existingColumns.includes(column.name)) {
        console.log(`⏭️  ${column.name} カラムは既に存在します`);
        continue;
      }
      
      const sql = `ALTER TABLE activity_logs ADD COLUMN ${column.name} ${column.type}`;
      
      await new Promise((resolve, reject) => {
        db.run(sql, function(err) {
          if (err) {
            console.error(`❌ ${column.name} カラム追加エラー:`, err.message);
            reject(err);
          } else {
            console.log(`✅ ${column.name} カラムを追加しました (${column.comment})`);
            resolve();
          }
        });
      });
    }
    
    // 新しいインデックスを作成
    console.log('\n🔍 インデックスを作成中...');
    const indexes = [
      {
        name: 'idx_activity_logs_analysis',
        sql: 'CREATE INDEX IF NOT EXISTS idx_activity_logs_analysis ON activity_logs(start_time, end_time, confidence)'
      },
      {
        name: 'idx_activity_logs_categories',
        sql: 'CREATE INDEX IF NOT EXISTS idx_activity_logs_categories ON activity_logs(categories)'
      }
    ];
    
    for (const index of indexes) {
      await new Promise((resolve, reject) => {
        db.run(index.sql, function(err) {
          if (err) {
            console.error(`❌ ${index.name} インデックス作成エラー:`, err.message);
            reject(err);
          } else {
            console.log(`✅ ${index.name} インデックスを作成しました`);
            resolve();
          }
        });
      });
    }
    
    // マイグレーション後のテーブル構造を確認
    console.log('\n📋 マイグレーション後のテーブル構造:');
    const updatedColumns = await new Promise((resolve, reject) => {
      db.all("PRAGMA table_info(activity_logs)", (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log('\nactivity_logs テーブル構造:');
    updatedColumns.forEach(col => {
      const isNew = newColumns.some(nc => nc.name === col.name);
      const indicator = isNew ? '🆕' : '   ';
      console.log(`${indicator} ${col.name.padEnd(20)} ${col.type.padEnd(15)} ${col.notnull ? 'NOT NULL' : 'NULL'}`);
    });
    
    console.log('\n✨ マイグレーションが完了しました！');
    
  } catch (error) {
    console.error('\n❌ マイグレーションエラー:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

// スキーマファイルも更新する関数
async function updateSchemaFile() {
  const fs = require('fs');
  const schemaPath = path.join(__dirname, '../src/database/newSchema.sql');
  
  console.log('\n📝 スキーマファイルを更新中...');
  
  try {
    let schema = fs.readFileSync(schemaPath, 'utf8');
    
    // activity_logs テーブル定義を探して更新
    const tableStart = schema.indexOf('CREATE TABLE IF NOT EXISTS activity_logs');
    const tableEnd = schema.indexOf(');', tableStart) + 2;
    
    if (tableStart === -1) {
      console.log('⚠️  スキーマファイルにactivity_logsテーブル定義が見つかりません');
      return;
    }
    
    const beforeTable = schema.substring(0, tableStart);
    const afterTable = schema.substring(tableEnd);
    
    const newTableDef = `CREATE TABLE IF NOT EXISTS activity_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,           -- ユーザーの生入力
    input_timestamp TEXT NOT NULL,  -- 入力時刻（UTC、ISO 8601形式）
    business_date TEXT NOT NULL,    -- 業務日（YYYY-MM-DD、5am基準）
    is_deleted BOOLEAN DEFAULT FALSE, -- 論理削除フラグ
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    -- リアルタイム分析結果カラム（新機能）
    start_time TEXT,                -- 活動開始時刻（UTC、ISO 8601形式）
    end_time TEXT,                  -- 活動終了時刻（UTC、ISO 8601形式）
    total_minutes INTEGER,          -- 総活動時間（分）
    confidence REAL,                -- 分析の信頼度 (0-1)
    analysis_method TEXT,           -- 時刻抽出手法
    categories TEXT,                -- カテゴリ（カンマ区切り）
    analysis_warnings TEXT          -- 警告メッセージ（セミコロン区切り）
);`;
    
    const updatedSchema = beforeTable + newTableDef + afterTable;
    
    // 新しいインデックスも追加
    const indexSection = '\n-- 分析結果用インデックス\nCREATE INDEX IF NOT EXISTS idx_activity_logs_analysis \nON activity_logs(start_time, end_time, confidence);\n\nCREATE INDEX IF NOT EXISTS idx_activity_logs_categories \nON activity_logs(categories);\n';
    
    // 既存のインデックスセクションの後に追加
    const indexInsertPoint = updatedSchema.indexOf('CREATE INDEX IF NOT EXISTS idx_user_settings_timezone');
    const indexEndPoint = updatedSchema.indexOf('\n', indexInsertPoint) + 1;
    
    const finalSchema = updatedSchema.substring(0, indexEndPoint) + indexSection + updatedSchema.substring(indexEndPoint);
    
    fs.writeFileSync(schemaPath, finalSchema, 'utf8');
    console.log('✅ スキーマファイルを更新しました');
    
  } catch (error) {
    console.error('❌ スキーマファイル更新エラー:', error);
  }
}

// 実行
if (require.main === module) {
  runMigration()
    .then(() => updateSchemaFile())
    .catch(console.error);
}

module.exports = { runMigration };