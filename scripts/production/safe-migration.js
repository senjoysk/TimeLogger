#!/usr/bin/env node

/**
 * 本番環境セーフマイグレーションスクリプト
 * データを保持したまま必要なカラムとテーブルを追加
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// データベースパス（本番環境）
const DB_PATH = '/app/data/tasks.db';

console.log('🚀 セーフマイグレーション開始...');
console.log(`📁 データベースパス: ${DB_PATH}`);

// データベース接続
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ データベース接続エラー:', err);
    process.exit(1);
  }
  console.log('✅ データベース接続成功');
});

/**
 * テーブルのカラム情報を取得
 */
const getTableColumns = (tableName) => {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(${tableName})`, [], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
};

/**
 * SQLを実行（エラーハンドリング付き）
 */
const runSQL = (sql, description) => {
  return new Promise((resolve) => {
    console.log(`\n🔧 実行中: ${description}`);
    db.run(sql, (err) => {
      if (err) {
        if (err.message.includes('duplicate column name') ||
            err.message.includes('already exists')) {
          console.log(`⏩ スキップ: ${description} (既に存在)`);
        } else if (err.message.includes('no such table')) {
          console.log(`⚠️ テーブルが存在しません: ${description}`);
        } else {
          console.error(`❌ エラー: ${description}`, err.message);
        }
      } else {
        console.log(`✅ 成功: ${description}`);
      }
      resolve(); // エラーでも続行
    });
  });
};

/**
 * メインのマイグレーション処理
 */
const runMigration = async () => {
  try {
    // 1. activity_logsテーブルの存在確認
    console.log('\n📊 activity_logsテーブルの状態確認...');
    const columns = await getTableColumns('activity_logs');
    const columnNames = columns.map(col => col.name);
    console.log('現在のカラム:', columnNames.join(', '));
    
    // 2. 必要なカラムの追加
    const requiredColumns = [
      { name: 'discord_message_id', type: 'TEXT', description: 'Discord メッセージID' },
      { name: 'recovery_processed', type: 'BOOLEAN DEFAULT FALSE', description: 'リカバリ処理済みフラグ' },
      { name: 'recovery_timestamp', type: 'TEXT', description: 'リカバリ実行時刻' }
    ];
    
    for (const column of requiredColumns) {
      if (!columnNames.includes(column.name)) {
        await runSQL(
          `ALTER TABLE activity_logs ADD COLUMN ${column.name} ${column.type}`,
          `${column.name}カラム追加 (${column.description})`
        );
      } else {
        console.log(`✅ ${column.name}カラムは既に存在`);
      }
    }
    
    // 3. suspend_statesテーブルの作成
    await runSQL(`
      CREATE TABLE IF NOT EXISTS suspend_states (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        suspend_time TEXT NOT NULL,
        wake_time TEXT,
        expected_wake_time TEXT,
        status TEXT NOT NULL CHECK (status IN ('suspended', 'active', 'scheduled')),
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
      )
    `, 'suspend_statesテーブル作成');
    
    // 4. インデックスの作成
    const indexes = [
      {
        sql: 'CREATE INDEX IF NOT EXISTS idx_discord_message_id ON activity_logs(discord_message_id)',
        desc: 'discord_message_idインデックス'
      },
      {
        sql: 'CREATE INDEX IF NOT EXISTS idx_recovery_processed ON activity_logs(recovery_processed)',
        desc: 'recovery_processedインデックス'
      },
      {
        sql: 'CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_discord_message_id ON activity_logs(discord_message_id) WHERE discord_message_id IS NOT NULL',
        desc: 'discord_message_idユニークインデックス'
      },
      {
        sql: 'CREATE INDEX IF NOT EXISTS idx_suspend_states_user_id ON suspend_states(user_id)',
        desc: 'suspend_states user_idインデックス'
      },
      {
        sql: 'CREATE INDEX IF NOT EXISTS idx_suspend_states_suspend_time ON suspend_states(suspend_time)',
        desc: 'suspend_states suspend_timeインデックス'
      }
    ];
    
    for (const index of indexes) {
      await runSQL(index.sql, index.desc);
    }
    
    // 5. 最終確認
    console.log('\n📊 マイグレーション後の状態確認...');
    const finalColumns = await getTableColumns('activity_logs');
    const finalColumnNames = finalColumns.map(col => col.name);
    console.log('最終的なカラム:', finalColumnNames.join(', '));
    
    // discord_message_idカラムが存在するか確認
    if (finalColumnNames.includes('discord_message_id')) {
      console.log('\n🎉 マイグレーション成功！必要なカラムがすべて存在します。');
    } else {
      console.log('\n⚠️ 警告: discord_message_idカラムが見つかりません。');
    }
    
  } catch (error) {
    console.error('\n❌ 予期しないエラー:', error);
  } finally {
    // データベースを閉じる
    db.close((err) => {
      if (err) {
        console.error('データベースクローズエラー:', err);
      } else {
        console.log('\n✅ データベース接続を閉じました');
      }
      console.log('\n🏁 マイグレーション処理完了');
    });
  }
};

// マイグレーション実行
runMigration();