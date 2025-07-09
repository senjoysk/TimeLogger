import * as fs from 'fs';
import * as path from 'path';
import { Database } from 'sqlite3';
import { ActivityLogError } from '../types/activityLog';
import { BackupManager } from './backupManager';

/**
 * データベースマイグレーション管理システム
 * プロダクション環境での安全なスキーマ変更を管理
 */
export class MigrationManager {
  private db: Database;
  private migrationsPath: string;
  private backupManager: BackupManager;

  constructor(db: Database) {
    this.db = db;
    this.migrationsPath = path.join(__dirname, 'migrations');
    this.backupManager = new BackupManager(db);
  }

  /**
   * マイグレーションシステムの初期化
   */
  async initialize(): Promise<void> {
    try {
      console.log('🔄 マイグレーションシステムを初期化中...');
      
      // マイグレーション管理テーブルの作成
      const systemSql = fs.readFileSync(
        path.join(this.migrationsPath, 'migration_system.sql'), 
        'utf8'
      );
      
      await this.executeQuery(systemSql);
      console.log('✅ マイグレーションシステムの初期化が完了しました');
    } catch (error) {
      console.error('❌ マイグレーションシステム初期化エラー:', error);
      throw new ActivityLogError('マイグレーションシステムの初期化に失敗しました', 'MIGRATION_INIT_ERROR', { error });
    }
  }

  /**
   * 利用可能なマイグレーションファイルを取得
   */
  private getAvailableMigrations(): string[] {
    try {
      const files = fs.readdirSync(this.migrationsPath);
      return files
        .filter(file => file.endsWith('.sql') && file !== 'migration_system.sql')
        .sort();
    } catch (error) {
      console.error('❌ マイグレーションファイル読み込みエラー:', error);
      return [];
    }
  }

  /**
   * 実行済みマイグレーションを取得
   */
  private async getExecutedMigrations(): Promise<Set<string>> {
    try {
      const result = await this.queryDatabase('SELECT version FROM schema_migrations WHERE success = 1');
      return new Set(result.map(row => row.version));
    } catch (error) {
      console.log('⚠️ マイグレーション履歴テーブルが存在しません（初回実行）');
      return new Set();
    }
  }

  /**
   * カラムが存在するかチェック
   */
  private async columnExists(tableName: string, columnName: string): Promise<boolean> {
    try {
      const result = await this.queryDatabase(`PRAGMA table_info(${tableName})`);
      return result.some((row: any) => row.name === columnName);
    } catch (error) {
      console.log(`⚠️ テーブル ${tableName} が存在しません`);
      return false;
    }
  }

  /**
   * テーブルが存在するかチェック
   */
  private async tableExists(tableName: string): Promise<boolean> {
    try {
      const result = await this.queryDatabase(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
        [tableName]
      );
      return result.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * 安全なマイグレーション実行
   */
  async runMigrations(): Promise<void> {
    try {
      console.log('🚀 マイグレーションを開始します...');
      
      const availableMigrations = this.getAvailableMigrations();
      const executedMigrations = await this.getExecutedMigrations();
      
      const pendingMigrations = availableMigrations.filter(
        migration => !executedMigrations.has(this.extractVersion(migration))
      );

      if (pendingMigrations.length === 0) {
        console.log('✅ 実行すべきマイグレーションはありません');
        return;
      }

      console.log(`📋 実行予定のマイグレーション: ${pendingMigrations.length}件`);
      
      // マイグレーション実行前にバックアップを作成
      console.log('💾 マイグレーション前バックアップを作成中...');
      await this.backupManager.createBackup('pre_migration');
      
      for (const migrationFile of pendingMigrations) {
        await this.executeMigration(migrationFile);
      }
      
      console.log('✅ 全マイグレーションが完了しました');
    } catch (error) {
      console.error('❌ マイグレーション実行エラー:', error);
      throw new ActivityLogError('マイグレーションの実行に失敗しました', 'MIGRATION_EXECUTION_ERROR', { error });
    }
  }

  /**
   * 個別マイグレーションの実行
   */
  private async executeMigration(migrationFile: string): Promise<void> {
    const version = this.extractVersion(migrationFile);
    const startTime = Date.now();
    
    try {
      console.log(`🔧 マイグレーション ${version} を実行中...`);
      
      const migrationPath = path.join(this.migrationsPath, migrationFile);
      const migrationSql = fs.readFileSync(migrationPath, 'utf8');
      
      // 特別な処理が必要なマイグレーションの場合
      if (version === '001') {
        await this.executeMigration001();
      } else {
        // 通常のSQLマイグレーション
        await this.executeQuery(migrationSql);
      }
      
      const executionTime = Date.now() - startTime;
      
      // マイグレーション成功を記録
      await this.recordMigration(version, `Migration ${version} executed`, executionTime, true);
      
      console.log(`✅ マイグレーション ${version} が完了しました (${executionTime}ms)`);
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      // マイグレーション失敗を記録
      await this.recordMigration(version, `Migration ${version} failed`, executionTime, false, String(error));
      
      console.error(`❌ マイグレーション ${version} が失敗しました:`, error);
      throw error;
    }
  }

  /**
   * Migration 001: api_costs テーブルに business_date カラムを追加
   */
  private async executeMigration001(): Promise<void> {
    try {
      // テーブルが存在するかチェック
      const tableExists = await this.tableExists('api_costs');
      if (!tableExists) {
        console.log('⚠️ api_costs テーブルが存在しません - スキップします');
        return;
      }

      // カラムが既に存在するかチェック
      const columnExists = await this.columnExists('api_costs', 'business_date');
      if (columnExists) {
        console.log('✅ business_date カラムは既に存在します');
        return;
      }

      // カラムを追加
      console.log('📝 api_costs テーブルに business_date カラムを追加しています...');
      await this.executeQuery('ALTER TABLE api_costs ADD COLUMN business_date TEXT');
      console.log('✅ business_date カラムを追加しました');
      
    } catch (error) {
      console.error('❌ Migration 001 実行エラー:', error);
      throw error;
    }
  }

  /**
   * マイグレーション履歴を記録
   */
  private async recordMigration(
    version: string, 
    description: string, 
    executionTime: number, 
    success: boolean, 
    errorMessage?: string
  ): Promise<void> {
    try {
      const sql = `
        INSERT INTO schema_migrations (version, description, execution_time_ms, success, error_message)
        VALUES (?, ?, ?, ?, ?)
      `;
      
      await this.executeQuery(sql, [version, description, executionTime, success ? 1 : 0, errorMessage || null]);
    } catch (error) {
      console.error('⚠️ マイグレーション履歴記録エラー:', error);
      // マイグレーション履歴記録の失敗は致命的エラーとしない
    }
  }

  /**
   * ファイル名からバージョンを抽出
   */
  private extractVersion(filename: string): string {
    const match = filename.match(/^(\d+)_/);
    return match ? match[1] : filename;
  }

  /**
   * データベースクエリ実行（Promise化）
   */
  private executeQuery(sql: string, params: any[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * データベースクエリ実行（結果取得）
   */
  private queryDatabase(sql: string, params: any[] = []): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * マイグレーション状態の確認
   */
  async getMigrationStatus(): Promise<any> {
    try {
      const availableMigrations = this.getAvailableMigrations();
      const executedMigrations = await this.getExecutedMigrations();
      
      const pending = availableMigrations.filter(
        migration => !executedMigrations.has(this.extractVersion(migration))
      );
      
      return {
        available: availableMigrations.length,
        executed: executedMigrations.size,
        pending: pending.length,
        pendingMigrations: pending
      };
    } catch (error) {
      console.error('❌ マイグレーション状態確認エラー:', error);
      return {
        available: 0,
        executed: 0,
        pending: 0,
        pendingMigrations: [],
        error: String(error)
      };
    }
  }
}