/**
 * データベースパス統一管理ライブラリ
 * 全スクリプトでこのライブラリを使用することで、パスの統一を強制
 */

const path = require('path');

/**
 * 統一されたデータベースパス取得
 * @returns {string} 正しいデータベースパス
 */
function getUnifiedDatabasePath() {
  // 環境変数が設定されている場合はそれを優先
  if (process.env.DATABASE_PATH) {
    return process.env.DATABASE_PATH;
  }
  
  // 環境別デフォルトパス
  const env = process.env.NODE_ENV || 'development';
  
  switch (env) {
    case 'production':
      return '/app/data/app.db';
    case 'test':
      return path.join(__dirname, '../../test-data/app.db');
    default:
      return path.join(__dirname, '../../data/app.db');
  }
}

/**
 * レガシーデータベースパス取得（tasks.db）
 * マイグレーション目的でのみ使用
 * @returns {string} レガシーデータベースパス
 */
function getLegacyDatabasePath() {
  if (process.env.LEGACY_DATABASE_PATH) {
    return process.env.LEGACY_DATABASE_PATH;
  }
  
  const env = process.env.NODE_ENV || 'development';
  
  switch (env) {
    case 'production':
      return '/app/data/tasks.db';
    case 'test':
      return path.join(__dirname, '../../test-data/tasks.db');
    default:
      return path.join(__dirname, '../../data/tasks.db');
  }
}

/**
 * バックアップディレクトリパス取得
 * @returns {string} バックアップディレクトリパス
 */
function getBackupDirectory() {
  const env = process.env.NODE_ENV || 'development';
  
  switch (env) {
    case 'production':
      return '/app/data/backups';
    case 'test':
      return path.join(__dirname, '../../test-data/backups');
    default:
      return path.join(__dirname, '../../data/backups');
  }
}

/**
 * 禁止されたパス一覧（これらのパスを使用した場合はエラー）
 */
const FORBIDDEN_PATHS = [
  'activity_logs.db',
  './data/activity_logs.db',
  '/app/data/activity_logs.db',
  'data/activity_logs.db'
];

/**
 * パスの妥当性チェック
 * @param {string} dbPath チェック対象のパス
 * @throws {Error} 禁止されたパスの場合はエラー
 */
function validateDatabasePath(dbPath) {
  // 禁止されたパスパターンをチェック
  for (const forbiddenPath of FORBIDDEN_PATHS) {
    if (dbPath.includes('activity_logs.db')) {
      throw new Error(`
🚨 禁止されたデータベースパス: ${dbPath}

❌ 'activity_logs.db' は使用禁止です！
✅ 正しいパス: getUnifiedDatabasePath() を使用してください

修正方法:
const { getUnifiedDatabasePath } = require('./utils/databasePath');
const dbPath = getUnifiedDatabasePath();
      `);
    }
  }
}

/**
 * 安全なデータベースパス取得（妥当性チェック付き）
 * @returns {string} 検証済みの正しいデータベースパス
 */
function getSafeDatabasePath() {
  const dbPath = getUnifiedDatabasePath();
  validateDatabasePath(dbPath);
  return dbPath;
}

module.exports = {
  getUnifiedDatabasePath,
  getLegacyDatabasePath,
  getBackupDirectory,
  validateDatabasePath,
  getSafeDatabasePath,
  FORBIDDEN_PATHS
};