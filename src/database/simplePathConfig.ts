/**
 * 簡単なデータベースパス設定（Phase1用）
 * 既存コードに影響を与えずに表記ゆれを防止
 */

import * as path from 'path';

/**
 * 統一されたデータベースパス設定
 */
export const DATABASE_PATHS = {
  // 環境別ベースパス
  getBasePath(): string {
    const env = process.env.NODE_ENV || 'development';
    switch (env) {
      case 'production':
        return '/app/data';
      case 'test':
        return path.join(__dirname, '../../test-data');
      default:
        return path.join(__dirname, '../../data');
    }
  },

  // 統一メインデータベースパス
  getMainDatabasePath(): string {
    return path.join(this.getBasePath(), 'app.db');
  },

  // レガシーデータベースパス
  getLegacyDatabasePath(): string {
    return path.join(this.getBasePath(), 'tasks.db');
  },

  // バックアップディレクトリ
  getBackupDirectory(): string {
    return path.join(this.getBasePath(), 'backups');
  },

  // 現在の環境
  getEnvironment(): string {
    return process.env.NODE_ENV || 'development';
  }
} as const;

/**
 * 統一されたパス取得関数（便利関数）
 */
export function getUnifiedDatabasePath(): string {
  return DATABASE_PATHS.getMainDatabasePath();
}

export function getLegacyDatabasePath(): string {
  return DATABASE_PATHS.getLegacyDatabasePath();
}

export function getBackupDirectory(): string {
  return DATABASE_PATHS.getBackupDirectory();
}