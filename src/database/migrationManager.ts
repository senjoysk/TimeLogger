import * as fs from 'fs';
import * as path from 'path';
import { Database } from 'sqlite3';
import { ActivityLogError } from '../types/activityLog';
import { BackupManager } from './backupManager';
import { DATABASE_PATHS } from './simplePathConfig';

/**
 * データベースマイグレーション管理システム
 * プロダクション環境での安全なスキーマ変更を管理
 */
export class MigrationManager {
  private db: Database;
  private migrationsPath: string;
  private backupManager: BackupManager;
  private dbPath: string;

  constructor(db: Database, dbPath?: string) {
    this.db = db;
    // マイグレーションファイルのパスを正しく設定
    // dist/database/migrationManager.js から dist/database/migrations へのパス
    // dist/__tests__/database/migrationManager.test.js から dist/database/migrations へのパス
    const isDevelopment = __dirname.includes('/src/');
    if (isDevelopment) {
      this.migrationsPath = path.join(__dirname, 'migrations');
    } else if (__dirname.includes('/dist/__tests__/')) {
      // テスト実行時のパス: dist/__tests__/database -> dist/database/migrations
      this.migrationsPath = path.join(__dirname, '../../database/migrations');
    } else {
      // 通常実行時のパス: dist/database -> dist/database/migrations
      this.migrationsPath = path.join(__dirname, 'migrations');
    }
    this.dbPath = dbPath || DATABASE_PATHS.getMainDatabasePath();
    
    // 統一DBパス設定を使用
    this.backupManager = new BackupManager(db, undefined, this.dbPath);
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
      return new Set(result.map(row => row.version as string));
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
      return result.some((row: Record<string, unknown>) => (row.name as string) === columnName);
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
      console.log('🔍 マイグレーションパス:', this.migrationsPath);
      
      const availableMigrations = this.getAvailableMigrations();
      console.log('📋 利用可能なマイグレーション:', availableMigrations);
      
      const executedMigrations = await this.getExecutedMigrations();
      console.log('📋 実行済みマイグレーション:', Array.from(executedMigrations));
      
      const pendingMigrations = availableMigrations.filter(
        migration => !executedMigrations.has(this.extractVersion(migration))
      );
      console.log('📋 保留中のマイグレーション:', pendingMigrations);

      if (pendingMigrations.length === 0) {
        console.log('✅ 実行すべきマイグレーションはありません');
        return;
      }

      console.log(`📋 実行予定のマイグレーション: ${pendingMigrations.length}件`);
      
      // マイグレーション実行前にバックアップを作成（一時的に無効化）
      const ENABLE_BACKUP = process.env.ENABLE_BACKUP === 'true';
      if (ENABLE_BACKUP) {
        console.log('💾 マイグレーション前バックアップを作成中...');
        await this.backupManager.createBackup('pre_migration');
      } else {
        console.log('⚠️ バックアップ機能は無効化されています (ENABLE_BACKUP=false)');
      }
      
      for (const migrationFile of pendingMigrations) {
        await this.executeMigration(migrationFile);
      }
      
      console.log('✅ 全マイグレーションが完了しました');
    } catch (error: unknown) {
      console.error('❌ マイグレーション実行エラー:', {
        message: (error as Error).message,
        stack: (error as Error).stack,
        path: this.migrationsPath
      });
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
      
      // 全てのマイグレーションでトランザクション付き複数SQL文パーサーを使用
      await this.executeMultipleStatementsWithTransaction(migrationSql);
      
      const executionTime = Date.now() - startTime;
      
      // マイグレーション成功を記録
      await this.recordMigration(version, `Migration ${version} executed`, executionTime, true);
      
      console.log(`✅ マイグレーション ${version} が完了しました (${executionTime}ms)`);
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      console.error(`❌ マイグレーション ${version} が失敗しました:`, error);
      
      // マイグレーション失敗を記録
      try {
        await this.recordMigration(version, `Migration ${version} failed`, executionTime, false, String(error));
      } catch (recordError) {
        console.error('⚠️ マイグレーション失敗記録エラー:', recordError);
      }
      
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
        INSERT OR REPLACE INTO schema_migrations (version, description, execution_time_ms, success, error_message)
        VALUES (?, ?, ?, ?, ?)
      `;
      
      await this.executeQuery(sql, [version, description, executionTime, success ? 1 : 0, errorMessage || '']);
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
  private executeQuery(sql: string, params: (string | number | boolean)[] = []): Promise<void> {
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
   * 複数SQL文を順次実行する
   * マイグレーション003と005で使用される複数文対応
   */
  public async executeMultipleStatements(sql: string): Promise<void> {
    try {
      const statements = this.parseSqlStatements(sql);
      
      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i];
        try {
          console.log(`📝 SQL文 ${i + 1}/${statements.length} を実行中: ${statement.substring(0, 50)}...`);
          await this.executeQuery(statement);
          console.log(`✅ SQL文 ${i + 1} 実行完了`);
        } catch (error) {
          console.error(`❌ SQL文 ${i + 1} 実行エラー:`, error);
          console.error(`❌ 失敗したSQL: ${statement}`);
          throw new ActivityLogError(
            `マイグレーション SQL文 ${i + 1} の実行に失敗しました`,
            'SQL_EXECUTION_ERROR',
            { 
              error, 
              statementIndex: i + 1, 
              totalStatements: statements.length,
              failedSql: statement 
            }
          );
        }
      }
    } catch (error) {
      if (error instanceof ActivityLogError) {
        throw error;
      }
      throw new ActivityLogError('複数SQL文の実行に失敗しました', 'MULTIPLE_SQL_EXECUTION_ERROR', { error });
    }
  }

  /**
   * 複数SQL文をトランザクション内で実行する
   * マイグレーションの原子性を保証
   */
  public async executeMultipleStatementsWithTransaction(sql: string): Promise<void> {
    try {
      console.log('🔄 トランザクションを開始します...');
      await this.beginTransaction();

      try {
        const statements = this.parseSqlStatements(sql);
        
        for (let i = 0; i < statements.length; i++) {
          const statement = statements[i];
          try {
            console.log(`📝 [TX] SQL文 ${i + 1}/${statements.length} を実行中: ${statement.substring(0, 50)}...`);
            
            // ALTER TABLE ADD COLUMNの場合、カラム重複エラーを許容
            if (this.isAddColumnStatement(statement)) {
              try {
                await this.executeQuery(statement);
                console.log(`✅ [TX] SQL文 ${i + 1} 実行完了（カラム追加）`);
              } catch (error) {
                if (this.isColumnAlreadyExistsError(error)) {
                  console.log(`⚠️ [TX] SQL文 ${i + 1} スキップ（カラム既存）: ${this.extractColumnName(statement)}`);
                  // カラムが既に存在する場合はスキップ（エラーではない）
                } else {
                  throw error;
                }
              }
            } else {
              await this.executeQuery(statement);
              console.log(`✅ [TX] SQL文 ${i + 1} 実行完了`);
            }
          } catch (error) {
            console.error(`❌ [TX] SQL文 ${i + 1} 実行エラー:`, error);
            console.error(`❌ [TX] 失敗したSQL: ${statement}`);
            throw new ActivityLogError(
              `トランザクション内 SQL文 ${i + 1} の実行に失敗しました`,
              'TRANSACTION_SQL_ERROR',
              { 
                error, 
                statementIndex: i + 1, 
                totalStatements: statements.length,
                failedSql: statement 
              }
            );
          }
        }

        console.log('✅ トランザクションをコミットします...');
        await this.commitTransaction();
        console.log('✅ トランザクションが正常に完了しました');

      } catch (error) {
        console.error('❌ トランザクション実行エラー - ロールバックします:', error);
        await this.rollbackTransaction();
        throw error;
      }
    } catch (error) {
      if (error instanceof ActivityLogError) {
        throw error;
      }
      throw new ActivityLogError('トランザクション実行に失敗しました', 'TRANSACTION_EXECUTION_ERROR', { error });
    }
  }

  /**
   * トランザクション開始
   */
  private async beginTransaction(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          reject(new ActivityLogError('トランザクション開始に失敗しました', 'TRANSACTION_BEGIN_ERROR', { error: err }));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * トランザクションコミット
   */
  private async commitTransaction(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run('COMMIT', (err) => {
        if (err) {
          reject(new ActivityLogError('トランザクションコミットに失敗しました', 'TRANSACTION_COMMIT_ERROR', { error: err }));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * トランザクションロールバック
   */
  private async rollbackTransaction(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run('ROLLBACK', (err) => {
        if (err) {
          console.error('⚠️ トランザクションロールバックエラー:', err);
          // ロールバック失敗はログに記録するが、元のエラーを隠さない
          resolve();
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * ALTER TABLE ADD COLUMN文かどうかを判定
   */
  private isAddColumnStatement(statement: string): boolean {
    const trimmed = statement.trim().toUpperCase();
    return trimmed.includes('ALTER TABLE') && trimmed.includes('ADD COLUMN');
  }

  /**
   * カラム既存エラーかどうかを判定
   */
  private isColumnAlreadyExistsError(error: unknown): boolean {
    const errorMessage = String((error as Error)?.message || error).toLowerCase();
    return errorMessage.includes('duplicate column name') || 
           errorMessage.includes('already exists') ||
           errorMessage.includes('duplicate column');
  }

  /**
   * ALTER TABLE ADD COLUMN文からカラム名を抽出
   */
  private extractColumnName(statement: string): string {
    const match = statement.match(/ADD\s+COLUMN\s+(\w+)/i);
    return match ? match[1] : 'unknown';
  }

  /**
   * SQL文字列を個別のSQL文に分割する
   * コメント行と空行を除外し、セミコロンで分割
   * トリガーやストアドプロシージャのBEGIN...ENDブロックを考慮
   */
  public parseSqlStatements(sql: string): string[] {
    // 1. コメント行を除去（行ごとに処理）
    const cleanedLines = sql.split('\n').filter(line => {
      const trimmed = line.trim();
      // 空行、--コメント、/* */コメント行を除外
      return trimmed.length > 0 && 
             !trimmed.startsWith('--') && 
             !trimmed.startsWith('/*') &&
             !trimmed.startsWith('*/');
    });

    // 2. 全行を結合
    const cleanedSql = cleanedLines.join('\n');
    
    // 3. トリガーやBEGIN...ENDブロックを考慮した分割
    const statements = this.parseComplexSqlStatements(cleanedSql);

    console.log(`📊 SQL文を解析: ${statements.length}文に分割`);
    
    return statements;
  }

  /**
   * トリガーやBEGIN...ENDブロックを考慮したSQL文分割
   */
  private parseComplexSqlStatements(sql: string): string[] {
    const statements: string[] = [];
    let currentStatement = '';
    let inBeginEndBlock = false;
    let beginEndDepth = 0;
    
    // セミコロンで分割し、各部分を検査
    const parts = sql.split(';');
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim();
      
      if (part.length === 0) continue;
      
      currentStatement += (currentStatement ? ';' : '') + part;
      
      // BEGIN/ENDブロックの検出
      const beginMatches = (part.match(/\bBEGIN\b/gi) || []).length;
      const endMatches = (part.match(/\bEND\b/gi) || []).length;
      
      beginEndDepth += beginMatches - endMatches;
      
      if (beginEndDepth > 0) {
        inBeginEndBlock = true;
      } else if (inBeginEndBlock && beginEndDepth === 0) {
        // BEGIN...ENDブロックが完了
        inBeginEndBlock = false;
        statements.push(currentStatement.trim());
        currentStatement = '';
      } else if (!inBeginEndBlock) {
        // 通常の文の完了
        statements.push(currentStatement.trim());
        currentStatement = '';
      }
    }
    
    // 残りの文があれば追加
    if (currentStatement.trim()) {
      statements.push(currentStatement.trim());
    }
    
    return statements.filter(stmt => stmt.length > 0);
  }

  /**
   * データベースクエリ実行（結果取得）
   */
  private queryDatabase(sql: string, params: (string | number | boolean)[] = []): Promise<Record<string, unknown>[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows as Record<string, unknown>[]);
        }
      });
    });
  }

  /**
   * マイグレーション状態の確認
   */
  async getMigrationStatus(): Promise<{
    available: number;
    executed: number;
    pending: number;
    pendingMigrations: string[];
    error?: string;
  }> {
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