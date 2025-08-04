#!/usr/bin/env node

/**
 * 本番環境のTODO優先度の文字列値を数値に修正するスクリプト
 * 
 * 使用方法:
 * 1. Fly.ioの本番環境にSSH接続: fly ssh console --app timelogger-bitter-resonance-9585
 * 2. スクリプトを実行: node scripts/production/fix-todo-priority-production.js
 * 
 * 安全機能:
 * - 実行前にバックアップを作成
 * - DRY RUNモードで事前確認可能
 * - トランザクション内で実行
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// 設定
const isDryRun = process.argv.includes('--dry-run');
const dbPath = process.env.DATABASE_PATH || '/app/data/app.db';
const backupPath = `/app/data/app.db.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;

console.log('========================================');
console.log('📊 TODO優先度修正スクリプト（本番環境）');
console.log('========================================');
console.log(`📁 データベース: ${dbPath}`);
console.log(`🔧 モード: ${isDryRun ? 'DRY RUN（確認のみ）' : '実行モード'}`);
console.log('');

// メイン処理
async function main() {
  // バックアップ作成（DRY RUNモードでもバックアップは作成）
  if (!isDryRun && fs.existsSync(dbPath)) {
    console.log('💾 バックアップを作成中...');
    try {
      fs.copyFileSync(dbPath, backupPath);
      console.log(`✅ バックアップ作成完了: ${backupPath}`);
    } catch (error) {
      console.error('❌ バックアップ作成失敗:', error.message);
      process.exit(1);
    }
  }

  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('❌ データベース接続エラー:', err);
      process.exit(1);
    }
    console.log('✅ データベース接続成功\n');
  });

  // 現在の状態を確認
  await analyzeCurrentState(db);

  if (!isDryRun) {
    // 実際の修正を実行
    await fixPriorities(db);
  } else {
    console.log('\n📝 DRY RUNモードのため、実際の変更は行いません。');
    console.log('💡 実行するには --dry-run オプションを外してください。');
  }

  // 修正後の状態を確認
  if (!isDryRun) {
    console.log('\n📊 修正後の状態:');
    await analyzeCurrentState(db);
  }

  db.close(() => {
    console.log('\n✅ 処理完了');
    if (!isDryRun) {
      console.log(`💾 バックアップファイル: ${backupPath}`);
      console.log('⚠️  問題が発生した場合は、以下のコマンドで復元できます:');
      console.log(`   cp ${backupPath} ${dbPath}`);
    }
  });
}

/**
 * 現在の状態を分析
 */
function analyzeCurrentState(db) {
  return new Promise((resolve, reject) => {
    // 文字列priorityの検出
    db.all(`
      SELECT 
        id, 
        user_id,
        priority, 
        content,
        status
      FROM todo_tasks 
      WHERE typeof(priority) = 'text'
      ORDER BY created_at DESC
      LIMIT 100
    `, [], (err, rows) => {
      if (err) {
        console.error('❌ クエリエラー:', err);
        reject(err);
        return;
      }

      console.log(`🔍 文字列priority検出: ${rows.length}件`);
      
      if (rows.length > 0) {
        // 値ごとの集計
        const priorityCounts = {};
        rows.forEach(row => {
          priorityCounts[row.priority] = (priorityCounts[row.priority] || 0) + 1;
        });

        console.log('\n📊 文字列priorityの内訳:');
        Object.entries(priorityCounts).forEach(([value, count]) => {
          console.log(`   "${value}": ${count}件`);
        });

        // サンプル表示（最初の5件）
        console.log('\n📋 サンプル（最初の5件）:');
        rows.slice(0, 5).forEach(row => {
          console.log(`   - User: ${row.user_id.substring(0, 8)}..., Priority: "${row.priority}", Content: ${row.content.substring(0, 30)}...`);
        });
      }

      // 全体の優先度分布を確認
      db.all(`
        SELECT 
          priority,
          typeof(priority) as type,
          COUNT(*) as count 
        FROM todo_tasks 
        WHERE status IN ('pending', 'in_progress')
        GROUP BY priority, typeof(priority)
        ORDER BY count DESC
      `, [], (err, stats) => {
        if (err) {
          console.error('❌ 統計クエリエラー:', err);
          reject(err);
          return;
        }

        console.log('\n📊 優先度の分布（pending/in_progress）:');
        stats.forEach(stat => {
          const label = stat.type === 'integer' 
            ? (stat.priority === 1 ? '高' : stat.priority === 0 ? '普通' : stat.priority === -1 ? '低' : `不明(${stat.priority})`)
            : `文字列("${stat.priority}")`;
          console.log(`   ${label}: ${stat.count}件`);
        });

        resolve();
      });
    });
  });
}

/**
 * 優先度を修正
 */
function fixPriorities(db) {
  return new Promise((resolve, reject) => {
    console.log('\n🔧 修正を開始...');
    
    // トランザクション開始
    db.serialize(() => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          console.error('❌ トランザクション開始エラー:', err);
          reject(err);
          return;
        }

        let totalFixed = 0;
        let errors = [];

        // high -> 1
        db.run(`
          UPDATE todo_tasks 
          SET priority = 1 
          WHERE priority = 'high'
        `, function(err) {
          if (err) {
            errors.push(`high修正: ${err.message}`);
          } else {
            console.log(`✅ "high" → 1: ${this.changes}件修正`);
            totalFixed += this.changes;
          }

          // medium -> 0
          db.run(`
            UPDATE todo_tasks 
            SET priority = 0 
            WHERE priority = 'medium'
          `, function(err) {
            if (err) {
              errors.push(`medium修正: ${err.message}`);
            } else {
              console.log(`✅ "medium" → 0: ${this.changes}件修正`);
              totalFixed += this.changes;
            }

            // low -> -1
            db.run(`
              UPDATE todo_tasks 
              SET priority = -1 
              WHERE priority = 'low'
            `, function(err) {
              if (err) {
                errors.push(`low修正: ${err.message}`);
              } else {
                console.log(`✅ "low" → -1: ${this.changes}件修正`);
                totalFixed += this.changes;
              }

              // その他の文字列値をデフォルト（0）に変換
              db.run(`
                UPDATE todo_tasks 
                SET priority = 0 
                WHERE typeof(priority) = 'text' 
                  AND priority NOT IN ('high', 'medium', 'low')
              `, function(err) {
                if (err) {
                  errors.push(`その他修正: ${err.message}`);
                } else if (this.changes > 0) {
                  console.log(`✅ その他の文字列 → 0: ${this.changes}件修正`);
                  totalFixed += this.changes;
                }

                // エラーチェックとコミット
                if (errors.length > 0) {
                  console.error('\n❌ エラーが発生しました:');
                  errors.forEach(e => console.error(`   - ${e}`));
                  
                  db.run('ROLLBACK', () => {
                    console.log('⏪ ロールバック完了');
                    reject(new Error('修正中にエラーが発生'));
                  });
                } else {
                  db.run('COMMIT', (err) => {
                    if (err) {
                      console.error('❌ コミットエラー:', err);
                      db.run('ROLLBACK');
                      reject(err);
                    } else {
                      console.log(`\n✅ トランザクションコミット完了`);
                      console.log(`📊 合計 ${totalFixed} 件のレコードを修正しました`);
                      resolve();
                    }
                  });
                }
              });
            });
          });
        });
      });
    });
  });
}

// 実行
main().catch(error => {
  console.error('❌ 致命的エラー:', error);
  process.exit(1);
});