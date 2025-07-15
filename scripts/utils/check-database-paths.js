#!/usr/bin/env node

/**
 * データベースパス妥当性チェックスクリプト
 * 禁止されたパス（activity_logs.db）の使用を検出
 */

const fs = require('fs');
const path = require('path');
const { FORBIDDEN_PATHS } = require('./databasePath');

/**
 * ファイル内容から禁止されたパスを検索
 */
function checkFileForForbiddenPaths(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const violations = [];
    
    for (const forbiddenPath of FORBIDDEN_PATHS) {
      if (content.includes(forbiddenPath)) {
        const lines = content.split('\n');
        lines.forEach((line, index) => {
          if (line.includes(forbiddenPath)) {
            violations.push({
              file: filePath,
              line: index + 1,
              content: line.trim(),
              forbiddenPath
            });
          }
        });
      }
    }
    
    return violations;
  } catch (error) {
    console.error(`❌ ファイル読み取りエラー: ${filePath}`, error.message);
    return [];
  }
}

/**
 * ディレクトリを再帰的にスキャン
 */
function scanDirectory(dirPath, violations = []) {
  const items = fs.readdirSync(dirPath);
  
  for (const item of items) {
    const fullPath = path.join(dirPath, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      // ディレクトリをスキップする条件
      if (['node_modules', '.git', 'dist', 'test-data', 'backups', 'note', 'worktrees'].includes(item)) {
        continue;
      }
      scanDirectory(fullPath, violations);
    } else if (stat.isFile()) {
      // スキップするファイル（設定ファイルやドキュメント）
      const skipFiles = [
        'check-database-paths.js',
        'databasePath.js',
        '.eslintrc-database-path.js',
        'FLY_DEPLOYMENT.md'
      ];
      
      if (skipFiles.includes(item)) {
        continue;
      }
      
      // 対象ファイル拡張子（実行可能なファイルのみ）
      if (['.js', '.ts'].includes(path.extname(item))) {
        const fileViolations = checkFileForForbiddenPaths(fullPath);
        violations.push(...fileViolations);
      }
    }
  }
  
  return violations;
}

/**
 * メイン実行
 */
function main() {
  console.log('🔍 データベースパス妥当性チェック開始...\n');
  
  const projectRoot = path.join(__dirname, '../..');
  const violations = scanDirectory(projectRoot);
  
  if (violations.length === 0) {
    console.log('✅ 禁止されたデータベースパスは見つかりませんでした！');
    console.log('📋 チェック対象パターン:');
    FORBIDDEN_PATHS.forEach(p => console.log(`  - ${p}`));
    process.exit(0);
  } else {
    console.log('🚨 禁止されたデータベースパスが見つかりました！\n');
    
    violations.forEach((violation, index) => {
      console.log(`${index + 1}. ❌ ${violation.file}:${violation.line}`);
      console.log(`   🔍 禁止パターン: "${violation.forbiddenPath}"`);
      console.log(`   📝 該当行: ${violation.content}`);
      console.log('');
    });
    
    console.log('🛠️ 修正方法:');
    console.log('const { getSafeDatabasePath } = require("./utils/databasePath");');
    console.log('const dbPath = getSafeDatabasePath();');
    console.log('');
    
    process.exit(1);
  }
}

// スクリプト実行
if (require.main === module) {
  main();
}

module.exports = { checkFileForForbiddenPaths, scanDirectory };