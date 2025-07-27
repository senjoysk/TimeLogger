import { Database } from 'sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { MigrationManager } from './migrationManager';
import { ActivityLogError } from '../types/activityLog';

/**
 * データベース初期化結果
 */
export interface InitializationResult {
  isNewDatabase: boolean;
  method: 'newSchema' | 'migration';
  tablesCreated?: number;
  migrationsApplied?: number;
  error?: string;
}

/**
 * データベース初期化管理クラス
 * 空のDB判定と適切な初期化方式の選択を行う
 */
export class DatabaseInitializer {
  private db: Database;
  private schemaPath: string;
  private migrationManager: MigrationManager;

  constructor(db: Database, schemaPath?: string) {
    this.db = db;
    
    // スキーマファイルパスの解決
    if (schemaPath) {
      this.schemaPath = schemaPath;
    } else {
      // デフォルトパスの探索（確実な方法）
      this.schemaPath = this.findSchemaFile();
    }
    
    this.migrationManager = new MigrationManager(db, process.env.DATABASE_PATH);
  }

  /**
   * スキーマファイルを確実に見つける
   */
  private findSchemaFile(): string {
    const possiblePaths = [
      // 開発環境でのパス
      path.join(__dirname, 'newSchema.sql'),
      path.join(__dirname, '../database/newSchema.sql'), 
      
      // ビルド後のdist環境でのパス  
      path.join(process.cwd(), 'dist/database/newSchema.sql'),
      
      // 開発・テスト環境でのsrcパス
      path.join(process.cwd(), 'src/database/newSchema.sql'),
      
      // テスト実行時（srcからの相対パス）
      path.resolve(__dirname, '../../src/database/newSchema.sql'),
      
      // Jest実行時の特殊パス解決
      path.join(__dirname, '../../src/database/newSchema.sql'),
      path.join(__dirname, '../../../src/database/newSchema.sql'),
      
      // プロジェクトルートからの絶対パス
      path.resolve(process.cwd(), 'src/database/newSchema.sql')
    ];
    
    // 存在するファイルを探す
    for (const filePath of possiblePaths) {
      if (fs.existsSync(filePath)) {
        console.log(`✅ スキーマファイル発見: ${filePath}`);
        return filePath;
      }
    }
    
    // 見つからない場合はエラー詳細を出力
    console.error('❌ スキーマファイルが見つかりません。探索したパス:');
    possiblePaths.forEach(p => {
      console.error(`  - ${p}: ${fs.existsSync(p) ? '✅' : '❌'}`);
    });
    console.error(`  現在のディレクトリ: ${process.cwd()}`);
    console.error(`  __dirname: ${__dirname}`);
    
    // デフォルトパス（エラー用）
    return possiblePaths[0];
  }

  /**
   * データベースが空かどうかを判定
   * @returns true: 空のDB（新規）、false: 既存DB
   */
  async isDatabaseEmpty(): Promise<boolean> {
    try {
      // ユーザーテーブルの存在確認（システムテーブルを除外）
      const tables = await this.queryDatabase<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      );
      
      return tables.length === 0;
    } catch (error) {
      console.error('❌ DB空判定エラー:', error);
      throw new ActivityLogError('データベースの状態確認に失敗しました', 'DB_CHECK_ERROR', { error });
    }
  }

  /**
   * データベースを初期化
   * 空のDBならnewSchema.sql、既存DBならマイグレーションを実行
   */
  async initialize(): Promise<InitializationResult> {
    try {
      console.log('🔍 データベース状態を確認中...');
      console.log('📁 現在のディレクトリ:', process.cwd());
      console.log('📁 __dirname:', __dirname);
      console.log('📁 使用するスキーマパス:', this.schemaPath);
      
      const isEmpty = await this.isDatabaseEmpty();
      console.log('📊 データベース空判定:', isEmpty ? '空' : '既存');
      
      if (isEmpty) {
        console.log('📝 新規データベースを検出 - newSchema.sqlから初期化します');
        return await this.initializeFromSchema();
      } else {
        console.log('📂 既存データベースを検出 - マイグレーションを実行します');
        return await this.runMigrations();
      }
    } catch (error) {
      console.error('❌ データベース初期化エラー:', error);
      throw error;
    }
  }

  /**
   * newSchema.sqlから新規データベースを初期化
   */
  private async initializeFromSchema(): Promise<InitializationResult> {
    try {
      if (!fs.existsSync(this.schemaPath)) {
        console.error('❌ スキーマファイルが見つかりません:', this.schemaPath);
        console.error('📁 探索したパス:');
        const allPaths = [
          path.join(__dirname, 'newSchema.sql'),
          path.join(__dirname, '../database/newSchema.sql'), 
          path.join(__dirname, '../../src/database/newSchema.sql'),
          path.join(process.cwd(), 'dist/database/newSchema.sql'),
          path.join(__dirname, '../../dist/database/newSchema.sql'),
          path.join(process.cwd(), 'src/database/newSchema.sql'),
          path.resolve(__dirname, '../../src/database/newSchema.sql'),
          path.resolve(process.cwd(), 'src/database/newSchema.sql')
        ];
        allPaths.forEach(p => {
          console.error(`  ${p}: ${fs.existsSync(p) ? '✅' : '❌'}`);
        });
        
        throw new ActivityLogError(
          `スキーマファイルが見つかりません: ${this.schemaPath}`,
          'SCHEMA_FILE_NOT_FOUND',
          { 
            schemaPath: this.schemaPath,
            searchedPaths: allPaths,
            cwd: process.cwd(),
            dirname: __dirname
          }
        );
      }
      
      console.log(`📁 スキーマファイル: ${this.schemaPath}`);
      
      const schema = fs.readFileSync(this.schemaPath, 'utf8');
      const statements = this.splitSqlStatements(schema);
      
      console.log(`📊 実行するSQL文: ${statements.length}個`);
      
      // テーブル作成を確実に実行するため、各文を個別にトランザクション外で実行
      await this.executeQuery('PRAGMA journal_mode=WAL');  // Write-Ahead Logging mode
      
      let tablesCreated = 0;
      
      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i].trim();
        if (!statement) continue;
        
        try {
          console.log(`🔸 実行中: ${statement.substring(0, 100)}...`);
          await this.executeQuery(statement);
          
          if (statement.toUpperCase().includes('CREATE TABLE')) {
            tablesCreated++;
          }
          
          console.log(`✅ SQL ${i + 1}/${statements.length} 実行完了`);
        } catch (error: unknown) {
          // 既存オブジェクトエラーは無視（idempotent）
          const err = error as Error;
          if (err.message?.includes('already exists')) {
            console.log(`⏩ SQL ${i + 1} スキップ（既存）`);
            continue;
          }
          console.error(`❌ SQL実行エラー (文 ${i + 1}):`, err);
          console.error(`❌ 失敗したSQL:`, statement);
          throw error;
        }
      }
      
      console.log('✅ newSchema.sqlからの初期化が完了しました');
      
      return {
        isNewDatabase: true,
        method: 'newSchema',
        tablesCreated
      };
    } catch (error) {
      throw new ActivityLogError(
        'スキーマからの初期化に失敗しました',
        'SCHEMA_INIT_ERROR',
        { error, schemaPath: this.schemaPath }
      );
    }
  }

  /**
   * 既存データベースにマイグレーションを実行
   */
  private async runMigrations(): Promise<InitializationResult> {
    try {
      // マイグレーションシステムを初期化
      await this.migrationManager.initialize();
      
      // マイグレーション状態を確認
      const status = await this.migrationManager.getMigrationStatus();
      console.log(`📊 マイグレーション状態: ${status.pending}個の未実行マイグレーション`);
      
      // マイグレーションを実行
      await this.migrationManager.runMigrations();
      
      return {
        isNewDatabase: false,
        method: 'migration',
        migrationsApplied: status.pending
      };
    } catch (error) {
      throw new ActivityLogError(
        'マイグレーション実行に失敗しました',
        'MIGRATION_ERROR',
        { error }
      );
    }
  }

  /**
   * SQL文を分割し、実行順序を適切に並び替え（TRIGGER、VIEW、複数行SQL対応）
   */
  private splitSqlStatements(schema: string): string[] {
    // 改良されたSQL分割処理
    const statements: string[] = [];
    
    // コメント行を除去
    const lines = schema.split('\n').filter(line => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith('--');
    });
    
    const cleanedSchema = lines.join('\n');
    
    // セミコロン+改行で分割（より正確）
    const rawStatements = cleanedSchema.split(/;\s*\n/);
    
    for (let i = 0; i < rawStatements.length; i++) {
      let statement = rawStatements[i].trim();
      
      if (!statement) continue;
      
      // 最後の文以外には ; を追加
      if (i < rawStatements.length - 1 && !statement.endsWith(';')) {
        statement += ';';
      }
      
      // TRIGGER文の特別処理
      if (statement.toUpperCase().includes('CREATE TRIGGER') && 
          statement.toUpperCase().includes('BEGIN') && 
          !statement.toUpperCase().includes('END;')) {
        // ENDが含まれるまで次の文と結合
        while (i < rawStatements.length - 1) {
          i++;
          const nextPart = rawStatements[i].trim();
          statement += '\n' + nextPart;
          if (nextPart.toUpperCase().includes('END;') || nextPart.toUpperCase().endsWith('END')) {
            break;
          }
        }
      }
      
      statements.push(statement);
    }
    
    const filteredStatements = statements.filter(s => s.length > 0);
    
    // 実行順序を適切に並び替え
    return this.sortSqlStatements(filteredStatements);
  }

  /**
   * SQL文を適切な実行順序に並び替え
   * 1. CREATE TABLE
   * 2. CREATE INDEX  
   * 3. CREATE TRIGGER
   * 4. CREATE VIEW
   */
  private sortSqlStatements(statements: string[]): string[] {
    const tables: string[] = [];
    const indexes: string[] = [];
    const triggers: string[] = [];
    const views: string[] = [];
    const others: string[] = [];

    for (const statement of statements) {
      const upperStatement = statement.toUpperCase();
      
      if (upperStatement.includes('CREATE TABLE')) {
        tables.push(statement);
      } else if (upperStatement.includes('CREATE INDEX')) {
        indexes.push(statement);
      } else if (upperStatement.includes('CREATE TRIGGER')) {
        triggers.push(statement);
      } else if (upperStatement.includes('CREATE VIEW')) {
        views.push(statement);
      } else {
        others.push(statement);
      }
    }

    // 適切な順序で結合
    return [...tables, ...indexes, ...triggers, ...views, ...others];
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
   * データベースクエリ実行（結果取得）
   */
  private queryDatabase<T>(sql: string, params: (string | number | boolean)[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows as T[]);
        }
      });
    });
  }
}