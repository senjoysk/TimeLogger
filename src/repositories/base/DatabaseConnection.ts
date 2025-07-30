/**
 * データベース接続共有管理クラス
 * 複数のリポジトリ間でSQLite接続を共有し、トランザクション管理を行う
 */

import { Database } from 'sqlite3';
import { MigrationManager } from '../../database/migrationManager';
import { DatabaseInitializer } from '../../database/databaseInitializer';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../utils/logger';
import { DatabaseError } from '../../errors';

/**
 * SQLiteパラメータ型定義
 */
type SqliteParam = string | number | boolean | null;

/**
 * データベース接続管理クラス
 */
export class DatabaseConnection {
  private static instances: Map<string, DatabaseConnection> = new Map();
  private db: Database | null = null;
  private connected: boolean = false;
  private migrationManager: MigrationManager | null = null;
  private databasePath: string;

  private constructor(databasePath: string) {
    this.databasePath = databasePath;
  }

  /**
   * パスごとのインスタンスを管理
   */
  public static getInstance(databasePath: string): DatabaseConnection {
    if (!DatabaseConnection.instances.has(databasePath)) {
      DatabaseConnection.instances.set(databasePath, new DatabaseConnection(databasePath));
    }
    return DatabaseConnection.instances.get(databasePath)!;
  }

  /**
   * データベース接続の初期化
   */
  public async initializeDatabase(): Promise<void> {
    if (this.connected && this.db) {
      return;
    }

    // データベースディレクトリの作成
    const dir = path.dirname(this.databasePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // SQLite接続
    this.db = new Database(this.databasePath);
    this.migrationManager = new MigrationManager(this.db, this.databasePath);

    // 外部キー制約を有効化
    await this.run('PRAGMA foreign_keys = ON');

    // スキーマ初期化とマイグレーション実行
    const initializer = new DatabaseInitializer(this.db, undefined, this.migrationManager);
    await initializer.initialize();

    this.connected = true;
    logger.info('DATABASE', 'データベース接続が初期化されました', { databasePath: this.databasePath });
  }

  /**
   * データベース接続の取得
   */
  public getDatabase(): Database {
    if (!this.db) {
      throw new DatabaseError('Database not initialized. Call initializeDatabase() first.');
    }
    return this.db;
  }

  /**
   * 接続状態の確認
   */
  public isConnected(): boolean {
    return this.connected && this.db !== null;
  }

  /**
   * SQL実行（Promise版）
   */
  public run(sql: string, params?: SqliteParam[]): Promise<{ lastID: number; changes: number }> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new DatabaseError('Database not initialized'));
        return;
      }

      this.db.run(sql, params || [], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({
            lastID: this.lastID,
            changes: this.changes
          });
        }
      });
    });
  }

  /**
   * 単一行取得（Promise版）
   */
  public get<T = any>(sql: string, params?: SqliteParam[]): Promise<T | undefined> { // ALLOW_ANY: ジェネリック型のデフォルト値として使用
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new DatabaseError('Database not initialized'));
        return;
      }

      this.db.get(sql, params || [], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row as T);
        }
      });
    });
  }

  /**
   * 複数行取得（Promise版）
   */
  public all<T = any>(sql: string, params?: SqliteParam[]): Promise<T[]> { // ALLOW_ANY: ジェネリック型のデフォルト値として使用
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new DatabaseError('Database not initialized'));
        return;
      }

      this.db.all(sql, params || [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows as T[]);
        }
      });
    });
  }

  /**
   * トランザクション実行
   */
  public async transaction<T>(callback: () => Promise<T>): Promise<T> {
    await this.run('BEGIN TRANSACTION');
    
    try {
      const result = await callback();
      await this.run('COMMIT');
      return result;
    } catch (error) {
      await this.run('ROLLBACK');
      throw error;
    }
  }

  /**
   * データベース接続の閉鎖
   */
  public async close(): Promise<void> {
    if (this.db) {
      return new Promise((resolve, reject) => {
        this.db!.close((err) => {
          if (err) {
            reject(err);
          } else {
            this.db = null;
            this.connected = false;
            this.migrationManager = null;
            DatabaseConnection.instances.delete(this.databasePath);
            logger.info('DATABASE', 'データベース接続が閉鎖されました');
            resolve();
          }
        });
      });
    }
  }

  /**
   * スキーマ確認
   */
  public async ensureSchema(): Promise<void> {
    if (!this.connected) {
      await this.initializeDatabase();
    }
  }

  /**
   * デバッグ用: 接続情報の表示
   */
  public getConnectionInfo(): { path: string; connected: boolean } {
    return {
      path: this.databasePath,
      connected: this.connected
    };
  }
}