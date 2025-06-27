#!/usr/bin/env node

/**
 * 活動記録のカテゴリ・サブカテゴリを修正するスクリプト
 * 特に経理業務などが誤分類されているものを修正
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// データベースファイルのパス
const dbPath = path.join(__dirname, '..', 'data', 'tasks.db');

console.log(`🔧 活動記録カテゴリ修正スクリプトを開始します`);

// データベース接続
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ データベース接続エラー:', err.message);
    process.exit(1);
  }
  console.log('✅ データベースに接続しました');
});

// 修正ルールの定義
const categoryFixRules = [
  {
    condition: 'original_text LIKE "%予算%" OR original_text LIKE "%経理%" OR original_text LIKE "%コスト%"',
    newCategory: '仕事',
    newSubCategory: '経理業務',
    description: '経理業務関連の活動'
  },
  {
    condition: 'original_text LIKE "%バグ修正%" OR original_text LIKE "%バグ%" OR original_text LIKE "%デバッグ%"',
    newCategory: '仕事', 
    newSubCategory: 'バグ修正',
    description: 'バグ修正関連の活動'
  },
  {
    condition: 'original_text LIKE "%調査%" OR original_text LIKE "%リサーチ%" OR original_text LIKE "%情報収集%"',
    newCategory: '仕事',
    newSubCategory: '調査業務', 
    description: '調査業務関連の活動'
  },
  {
    condition: 'original_text LIKE "%監査%" OR original_text LIKE "%書類%" OR original_text LIKE "%署名%"',
    newCategory: '仕事',
    newSubCategory: '監査業務',
    description: '監査業務関連の活動'
  },
  {
    condition: 'original_text LIKE "%掃除%" OR original_text LIKE "%整理%" OR original_text LIKE "%片付け%"',
    newCategory: '休憩',
    newSubCategory: '家事',
    description: '家事関連の活動'
  },
  {
    condition: 'original_text LIKE "%コーヒー%" OR original_text LIKE "%休憩%" OR original_text LIKE "%ブレイク%"',
    newCategory: '休憩',
    newSubCategory: 'コーヒーブレイク',
    description: '休憩関連の活動'
  }
];

let totalUpdated = 0;

// 各修正ルールを順次実行
function executeFixRules(ruleIndex = 0) {
  if (ruleIndex >= categoryFixRules.length) {
    // 全ての修正完了
    console.log(`\n🎉 カテゴリ修正が完了しました`);
    console.log(`📊 総修正件数: ${totalUpdated}件`);
    
    // データベース接続を閉じる
    db.close((err) => {
      if (err) {
        console.error('❌ データベース切断エラー:', err.message);
      } else {
        console.log('✅ データベース接続を切断しました');
      }
    });
    return;
  }

  const rule = categoryFixRules[ruleIndex];
  console.log(`\n🔍 ${rule.description}を修正中...`);
  
  // 修正対象を確認
  db.all(
    `SELECT id, original_text, category, sub_category 
     FROM activity_records 
     WHERE ${rule.condition}`,
    [],
    (err, rows) => {
      if (err) {
        console.error('❌ 修正対象検索エラー:', err.message);
        executeFixRules(ruleIndex + 1);
        return;
      }

      if (rows.length === 0) {
        console.log(`  ℹ️  修正対象が見つかりませんでした`);
        executeFixRules(ruleIndex + 1);
        return;
      }

      console.log(`  📝 修正対象: ${rows.length}件`);
      rows.forEach(row => {
        console.log(`    - "${row.original_text}" (${row.category}/${row.sub_category || 'なし'})`);
      });

      // 修正を実行
      db.run(
        `UPDATE activity_records 
         SET category = ?, sub_category = ?
         WHERE ${rule.condition}`,
        [rule.newCategory, rule.newSubCategory],
        function(err) {
          if (err) {
            console.error('❌ カテゴリ修正エラー:', err.message);
          } else {
            console.log(`  ✅ ${this.changes}件を修正しました → ${rule.newCategory}/${rule.newSubCategory}`);
            totalUpdated += this.changes;
          }
          
          // 次のルールを実行
          executeFixRules(ruleIndex + 1);
        }
      );
    }
  );
}

// 修正開始
executeFixRules();