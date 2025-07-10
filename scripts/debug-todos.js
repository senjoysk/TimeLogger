#!/usr/bin/env node

const { Database } = require('sqlite3');
const path = require('path');

const DB_PATH = process.env.DATABASE_PATH || '/app/data/app.db';
const USER_ID = '770478489203507241';

console.log(`🔍 TODO データベース確認: ${DB_PATH}`);

const db = new Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ データベース接続エラー:', err);
    process.exit(1);
  }
  
  console.log('✅ データベース接続成功');
  
  // TODO件数確認
  db.get(
    'SELECT COUNT(*) as count FROM todo_tasks WHERE user_id = ?',
    [USER_ID],
    (err, row) => {
      if (err) {
        console.error('❌ TODOデータ取得エラー:', err);
      } else {
        console.log(`📊 ユーザー ${USER_ID} のTODO件数: ${row.count}件`);
      }
      
      // 全TODOリスト表示
      db.all(
        'SELECT id, content, status, priority, created_at FROM todo_tasks WHERE user_id = ? ORDER BY created_at DESC',
        [USER_ID],
        (err, rows) => {
          if (err) {
            console.error('❌ TODOリスト取得エラー:', err);
          } else {
            console.log('\n📋 TODOリスト:');
            if (rows.length === 0) {
              console.log('  (TODOが見つかりません)');
            } else {
              rows.forEach((todo, index) => {
                console.log(`  ${index + 1}. [${todo.status}] ${todo.content} (ID: ${todo.id}, 優先度: ${todo.priority})`);
                console.log(`     作成日: ${todo.created_at}`);
              });
            }
          }
          
          // active TODO件数確認
          db.get(
            "SELECT COUNT(*) as count FROM todo_tasks WHERE user_id = ? AND status IN ('pending', 'in_progress')",
            [USER_ID],
            (err, row) => {
              if (err) {
                console.error('❌ アクティブTODO件数取得エラー:', err);
              } else {
                console.log(`\n📊 アクティブTODO件数: ${row.count}件`);
              }
              
              db.close();
            }
          );
        }
      );
    }
  );
});