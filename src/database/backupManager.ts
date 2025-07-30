import * as fs from 'fs';
import * as path from 'path';
import { Database } from 'sqlite3';
import { ActivityLogError } from '../types/activityLog';
import { logger } from '../utils/logger';
import { DATABASE_PATHS } from './simplePathConfig';

/**
 * データベースバックアップ管理システム
 * 本番環境での安全なデータベース運用をサポート
 */
export class BackupManager {
  private db: Database;
  private backupDir: string;
  private maxBackups: number = 10;
  private dbPath: string;

  constructor(db: Database, backupDir?: string, dbPath?: string) {
    this.db = db;
    this.backupDir = backupDir || DATABASE_PATHS.getBackupDirectory();
    this.dbPath = dbPath || DATABASE_PATHS.getMainDatabasePath();
    this.ensureBackupDirectory();
  }

  /**
   * バックアップディレクトリの作成
   */
  private ensureBackupDirectory(): void {
    try {
      if (!fs.existsSync(this.backupDir)) {
        fs.mkdirSync(this.backupDir, { recursive: true });
        logger.info('BACKUP', `📁 バックアップディレクトリを作成しました: ${this.backupDir}`);
      }
    } catch (error) {
      logger.warn('BACKUP', 'バックアップディレクトリの作成に失敗しました', { backupDir: this.backupDir, error });
      // テスト環境などでディレクトリ作成権限がない場合はスキップ
    }
  }

  /**
   * データベースのバックアップ作成
   */
  async createBackup(reason: string = 'manual'): Promise<string> {
    try {
      // バックアップディレクトリが存在しない場合は再作成を試みる
      this.ensureBackupDirectory();
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFileName = `timelogger_backup_${timestamp}_${reason}.db`;
      const backupPath = path.join(this.backupDir, backupFileName);

      logger.info('BACKUP', `💾 データベースバックアップを作成中... (${reason})`);
      
      // SQLiteのBACKUP APIを使用（推奨方式）
      await this.executeBackupCommand(backupPath);
      
      logger.info('BACKUP', `✅ バックアップ作成完了: ${backupPath}`);
      
      // 古いバックアップファイルのクリーンアップ
      await this.cleanupOldBackups();
      
      return backupPath;
    } catch (error) {
      logger.error('BACKUP', '❌ バックアップ作成エラー:', error);
      throw new ActivityLogError('データベースバックアップの作成に失敗しました', 'BACKUP_ERROR', { error, reason });
    }
  }

  /**
   * SQLiteのバックアップコマンド実行
   */
  private executeBackupCommand(backupPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // SQLite3 の serialize を使用して安全にバックアップを実行
      this.db.serialize(() => {
        this.db.run('BEGIN IMMEDIATE;', (err) => {
          if (err) {
            reject(err);
            return;
          }
          
          // VACUUMを使用してバックアップを作成
          this.db.run(`VACUUM INTO '${backupPath}'`, (err) => {
            if (err) {
              // VACUUMが失敗した場合はファイルコピーを試す
              this.db.run('ROLLBACK;', () => {
                this.copyDatabaseFile(backupPath)
                  .then(() => resolve())
                  .catch(reject);
              });
            } else {
              this.db.run('COMMIT;', (err) => {
                if (err) {
                  reject(err);
                } else {
                  resolve();
                }
              });
            }
          });
        });
      });
    });
  }

  /**
   * ファイルコピーによるバックアップ（代替手段）
   */
  private async copyDatabaseFile(backupPath: string): Promise<void> {
    try {
      // データベースファイルパスを推定
      const dbPath = this.getDatabasePath();
      if (dbPath && fs.existsSync(dbPath)) {
        fs.copyFileSync(dbPath, backupPath);
        logger.info('BACKUP', `📋 ファイルコピーでバックアップを作成しました: ${backupPath}`);
      } else {
        throw new Error('データベースファイルが見つかりません');
      }
    } catch (error) {
      logger.error('BACKUP', '❌ ファイルコピーバックアップエラー:', error);
      throw error;
    }
  }

  /**
   * データベースファイルパスを取得
   */
  private getDatabasePath(): string | null {
    try {
      return this.dbPath;
    } catch (error) {
      logger.warn('BACKUP', '⚠️ データベースパスの取得に失敗しました');
      return null;
    }
  }

  /**
   * 古いバックアップファイルのクリーンアップ
   */
  private async cleanupOldBackups(): Promise<void> {
    try {
      const backupFiles = fs.readdirSync(this.backupDir)
        .filter(file => file.startsWith('timelogger_backup_') && file.endsWith('.db'))
        .map(file => ({
          name: file,
          path: path.join(this.backupDir, file),
          mtime: fs.statSync(path.join(this.backupDir, file)).mtime
        }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      if (backupFiles.length > this.maxBackups) {
        const filesToDelete = backupFiles.slice(this.maxBackups);
        
        for (const file of filesToDelete) {
          fs.unlinkSync(file.path);
          logger.info('BACKUP', `🗑️ 古いバックアップファイルを削除: ${file.name}`);
        }
        
        logger.info('BACKUP', `✅ バックアップクリーンアップ完了 (${filesToDelete.length}件削除)`);
      }
    } catch (error) {
      logger.error('BACKUP', '⚠️ バックアップクリーンアップエラー:', error);
      // クリーンアップエラーは致命的でないため、例外を投げない
    }
  }

  /**
   * バックアップファイルの一覧取得
   */
  getBackupList(): Array<{name: string, path: string, size: number, created: Date}> {
    try {
      const backupFiles = fs.readdirSync(this.backupDir)
        .filter(file => file.startsWith('timelogger_backup_') && file.endsWith('.db'))
        .map(file => {
          const filePath = path.join(this.backupDir, file);
          const stats = fs.statSync(filePath);
          return {
            name: file,
            path: filePath,
            size: stats.size,
            created: stats.mtime
          };
        })
        .sort((a, b) => b.created.getTime() - a.created.getTime());

      return backupFiles;
    } catch (error) {
      logger.error('BACKUP', '❌ バックアップ一覧取得エラー:', error);
      return [];
    }
  }

  /**
   * バックアップからの復元
   */
  async restoreFromBackup(backupPath: string): Promise<void> {
    try {
      if (!fs.existsSync(backupPath)) {
        throw new Error(`バックアップファイルが見つかりません: ${backupPath}`);
      }

      logger.info('BACKUP', `🔄 バックアップから復元中: ${backupPath}`);
      
      // 現在のデータベースの緊急バックアップを作成
      await this.createBackup('pre_restore');
      
      // データベース接続を一時的に閉じる
      await this.closeDatabase();
      
      // バックアップファイルを現在のデータベースファイルに復元
      const currentDbPath = this.getDatabasePath();
      if (currentDbPath) {
        fs.copyFileSync(backupPath, currentDbPath);
        logger.info('BACKUP', `✅ データベース復元完了: ${currentDbPath}`);
      } else {
        throw new Error('現在のデータベースパスが特定できません');
      }
      
      // データベース接続を再開
      await this.reopenDatabase();
      
      logger.info('BACKUP', '✅ バックアップからの復元が完了しました');
    } catch (error) {
      logger.error('BACKUP', '❌ バックアップ復元エラー:', error);
      throw new ActivityLogError('バックアップからの復元に失敗しました', 'RESTORE_ERROR', { error, backupPath });
    }
  }

  /**
   * データベース接続を閉じる
   */
  private closeDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * データベース接続を再開
   */
  private async reopenDatabase(): Promise<void> {
    // 注意: 実際の実装では、Repository側でデータベース接続を再作成する必要がある
    logger.info('BACKUP', '⚠️ データベース接続の再開は、Repository側で実装する必要があります');
  }

  /**
   * バックアップの検証
   */
  async validateBackup(backupPath: string): Promise<boolean> {
    try {
      if (!fs.existsSync(backupPath)) {
        return false;
      }

      // バックアップファイルの基本チェック
      const stats = fs.statSync(backupPath);
      if (stats.size === 0) {
        logger.error('BACKUP', '❌ バックアップファイルが空です');
        return false;
      }

      // SQLiteファイルの整合性チェック（簡易版）
      const testDb = new Database(backupPath);
      
      return new Promise((resolve) => {
        testDb.get('SELECT COUNT(*) as count FROM sqlite_master', (err, row) => {
          testDb.close();
          if (err) {
            logger.error('BACKUP', '❌ バックアップファイルの整合性チェックエラー:', err);
            resolve(false);
          } else {
            logger.info('BACKUP', '✅ バックアップファイルの整合性チェック完了');
            resolve(true);
          }
        });
      });
    } catch (error) {
      logger.error('BACKUP', '❌ バックアップ検証エラー:', error);
      return false;
    }
  }
}