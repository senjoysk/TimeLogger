#!/usr/bin/env node

/**
 * マイグレーションスクリプト: user_settingsテーブルにサスペンドスケジュール機能カラム追加
 * 実行方法: node scripts/migration/add-suspend-schedule-columns.js
 */

const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { getSafeDatabasePath } = require('../utils/databasePath');

// 統一パス管理ライブラリを使用（安全性チェック付き）
const DATABASE_PATH = getSafeDatabasePath();

async function migrateSuspendScheduleColumns() {
  console.log('🔄 サスペンドスケジュール機能マイグレーション開始...');
  console.log(`データベースパス: ${DATABASE_PATH}`);

  const db = new sqlite3.Database(DATABASE_PATH);

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      console.log('📊 現在のuser_settingsテーブル構造を確認中...');
      
      // 現在のテーブル構造を確認
      db.get("PRAGMA table_info(user_settings)", (err, result) => {
        if (err) {
          console.error('❌ テーブル情報取得エラー:', err);
          reject(err);
          return;
        }

        // すべてのカラム情報を取得
        db.all("PRAGMA table_info(user_settings)", (err, columns) => {
          if (err) {
            console.error('❌ カラム情報取得エラー:', err);
            reject(err);
            return;
          }

          console.log('📋 現在のカラム:');
          columns.forEach(col => {
            console.log(`  - ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.dflt_value ? `DEFAULT ${col.dflt_value}` : ''}`);
          });

          // suspend_hourとwake_hourカラムが存在するかチェック
          const hasSuspendHour = columns.some(col => col.name === 'suspend_hour');
          const hasWakeHour = columns.some(col => col.name === 'wake_hour');

          if (hasSuspendHour && hasWakeHour) {
            console.log('✅ サスペンドスケジュール機能カラムは既に存在しています。');
            resolve();
            return;
          }

          console.log('🔧 新しいカラムを追加します...');

          // マイグレーション実行
          const migrations = [];

          if (!hasSuspendHour) {
            migrations.push("ALTER TABLE user_settings ADD COLUMN suspend_hour INTEGER DEFAULT 0");
          }

          if (!hasWakeHour) {
            migrations.push("ALTER TABLE user_settings ADD COLUMN wake_hour INTEGER DEFAULT 7");
          }

          // 逐次実行
          let migrationIndex = 0;
          
          function runNextMigration() {
            if (migrationIndex >= migrations.length) {
              console.log('✅ マイグレーション完了！');
              
              // マイグレーション後の構造確認
              db.all("PRAGMA table_info(user_settings)", (err, newColumns) => {
                if (err) {
                  console.error('❌ マイグレーション後の構造確認エラー:', err);
                  reject(err);
                  return;
                }

                console.log('📋 マイグレーション後のカラム:');
                newColumns.forEach(col => {
                  console.log(`  - ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.dflt_value ? `DEFAULT ${col.dflt_value}` : ''}`);
                });

                // 既存ユーザーのデフォルト値設定を確認
                db.get("SELECT COUNT(*) as count FROM user_settings", (err, countResult) => {
                  if (err) {
                    console.error('❌ ユーザー数確認エラー:', err);
                    reject(err);
                    return;
                  }

                  console.log(`👥 既存ユーザー数: ${countResult.count}人`);
                  
                  if (countResult.count > 0) {
                    console.log('🔄 既存ユーザーにデフォルト値を設定中...');
                    
                    // 既存ユーザーのNULL値をデフォルト値で更新
                    db.run(`
                      UPDATE user_settings 
                      SET suspend_hour = 0, wake_hour = 7 
                      WHERE suspend_hour IS NULL OR wake_hour IS NULL
                    `, (err) => {
                      if (err) {
                        console.error('❌ デフォルト値設定エラー:', err);
                        reject(err);
                        return;
                      }

                      console.log('✅ 既存ユーザーのデフォルト値設定完了');
                      resolve();
                    });
                  } else {
                    resolve();
                  }
                });
              });
              return;
            }

            const migration = migrations[migrationIndex];
            console.log(`🔧 実行中: ${migration}`);

            db.run(migration, (err) => {
              if (err) {
                console.error(`❌ マイグレーション失敗: ${migration}`, err);
                reject(err);
                return;
              }

              console.log(`✅ 完了: ${migration}`);
              migrationIndex++;
              runNextMigration();
            });
          }

          runNextMigration();
        });
      });
    });
  })
  .finally(() => {
    db.close((err) => {
      if (err) {
        console.error('❌ データベース接続クローズエラー:', err);
      } else {
        console.log('🔒 データベース接続クローズ完了');
      }
    });
  });
}

// スクリプト実行
if (require.main === module) {
  migrateSuspendScheduleColumns()
    .then(() => {
      console.log('🎉 サスペンドスケジュール機能マイグレーション完了！');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 マイグレーション失敗:', error);
      process.exit(1);
    });
}

module.exports = { migrateSuspendScheduleColumns };