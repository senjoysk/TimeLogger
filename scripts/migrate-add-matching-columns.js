/**
 * 開始・終了ログマッチング機能用カラム追加マイグレーション
 * 既存の activity_logs テーブルに新しいフィールドを追加
 */

const fs = require('fs');
const path = require('path');
const { Database } = require('sqlite3');

// データベースパス
const DATABASE_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'activity_logs.db');

/**
 * マイグレーション実行
 */
async function runMigration() {
  console.log('🔄 開始・終了ログマッチング機能用マイグレーションを開始...');
  console.log(`📁 データベースパス: ${DATABASE_PATH}`);

  const db = new Database(DATABASE_PATH);

  try {
    // トランザクション開始
    await runQuery(db, 'BEGIN TRANSACTION');

    // 1. 新しいカラムの追加
    console.log('📝 新しいカラムを追加中...');
    
    const addColumnQueries = [
      "ALTER TABLE activity_logs ADD COLUMN log_type TEXT DEFAULT 'complete' CHECK (log_type IN ('complete', 'start_only', 'end_only'))",
      "ALTER TABLE activity_logs ADD COLUMN match_status TEXT DEFAULT 'unmatched' CHECK (match_status IN ('unmatched', 'matched', 'ignored'))",
      "ALTER TABLE activity_logs ADD COLUMN matched_log_id TEXT",
      "ALTER TABLE activity_logs ADD COLUMN activity_key TEXT",
      "ALTER TABLE activity_logs ADD COLUMN similarity_score REAL"
    ];

    for (const query of addColumnQueries) {
      try {
        await runQuery(db, query);
        console.log(`✅ カラム追加完了: ${query.split(' ')[5]}`);
      } catch (error) {
        if (error.message.includes('duplicate column name')) {
          console.log(`⚠️  カラムは既に存在します: ${query.split(' ')[5]}`);
        } else {
          throw error;
        }
      }
    }

    // 2. インデックスの作成
    console.log('📊 インデックスを作成中...');
    
    const indexQueries = [
      "CREATE INDEX IF NOT EXISTS idx_activity_logs_log_type ON activity_logs(log_type)",
      "CREATE INDEX IF NOT EXISTS idx_activity_logs_match_status ON activity_logs(match_status)",
      "CREATE INDEX IF NOT EXISTS idx_activity_logs_matched_log_id ON activity_logs(matched_log_id)",
      "CREATE INDEX IF NOT EXISTS idx_activity_logs_activity_key ON activity_logs(activity_key)"
    ];

    for (const query of indexQueries) {
      await runQuery(db, query);
      const indexName = query.split(' ')[5];
      console.log(`✅ インデックス作成完了: ${indexName}`);
    }

    // 3. 既存データのマイグレーション
    console.log('📦 既存データをマイグレーション中...');
    
    // 既存のログはすべて complete タイプとして扱う
    await runQuery(db, `
      UPDATE activity_logs 
      SET log_type = 'complete', 
          match_status = 'matched'
      WHERE log_type IS NULL
    `);
    
    console.log('✅ 既存データのマイグレーション完了');

    // 4. データ整合性確認
    console.log('🔍 データ整合性を確認中...');
    
    const totalCount = await getQuery(db, 'SELECT COUNT(*) as count FROM activity_logs');
    const migratedCount = await getQuery(db, "SELECT COUNT(*) as count FROM activity_logs WHERE log_type = 'complete'");
    
    console.log(`📊 総レコード数: ${totalCount.count}`);
    console.log(`📊 マイグレーション済み: ${migratedCount.count}`);
    
    if (totalCount.count !== migratedCount.count) {
      throw new Error('データ整合性エラー: マイグレーションが完全ではありません');
    }

    // トランザクションコミット
    await runQuery(db, 'COMMIT');
    
    console.log('🎉 マイグレーション完了！');
    console.log('');
    console.log('📋 追加されたカラム:');
    console.log('  - log_type: ログの種類（complete/start_only/end_only）');
    console.log('  - match_status: マッチング状態（unmatched/matched/ignored）');
    console.log('  - matched_log_id: マッチング相手のログID');
    console.log('  - activity_key: 活動内容の分類キー');
    console.log('  - similarity_score: マッチング時の類似度スコア');
    console.log('');
    console.log('📊 作成されたインデックス:');
    console.log('  - idx_activity_logs_log_type');
    console.log('  - idx_activity_logs_match_status');
    console.log('  - idx_activity_logs_matched_log_id');
    console.log('  - idx_activity_logs_activity_key');

  } catch (error) {
    console.error('❌ マイグレーションエラー:', error);
    
    try {
      await runQuery(db, 'ROLLBACK');
      console.log('🔙 ロールバック完了');
    } catch (rollbackError) {
      console.error('❌ ロールバックエラー:', rollbackError);
    }
    
    throw error;
  } finally {
    db.close();
  }
}

/**
 * SQLクエリ実行（Promise版）
 */
function runQuery(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this);
      }
    });
  });
}

/**
 * SQLクエリ実行（単一行取得・Promise版）
 */
function getQuery(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

// スクリプト実行
if (require.main === module) {
  runMigration()
    .then(() => {
      console.log('✅ マイグレーションスクリプト実行完了');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ マイグレーションスクリプト実行失敗:', error);
      process.exit(1);
    });
}

module.exports = { runMigration };