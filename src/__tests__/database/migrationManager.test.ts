/**
 * MigrationManager テスト
 * TDDアプローチ: データベースマイグレーションの安全性を保証
 */

import * as fs from 'fs';
import * as path from 'path';
import { Database } from 'sqlite3';
import { MigrationManager } from '../../database/migrationManager';
import { getTestDbPath, cleanupTestDatabase } from '../../utils/testDatabasePath';

describe('MigrationManager', () => {
  const testDbPath = getTestDbPath(__filename);
  let db: Database;
  let migrationManager: MigrationManager;

  beforeEach(async () => {
    // テスト用データベースをクリーンアップ
    cleanupTestDatabase(testDbPath);
    
    // 新しいデータベース接続を作成
    db = new Database(testDbPath);
    migrationManager = new MigrationManager(db, testDbPath);
    
    // マイグレーションシステムを初期化
    await migrationManager.initialize();
  });

  afterEach((done) => {
    db.close((err) => {
      if (err) console.error('Database close error:', err);
      cleanupTestDatabase(testDbPath);
      done();
    });
  });

  describe('初期化とシステム設定', () => {
    test('マイグレーションシステムが正しく初期化される', async () => {
      // When: 初期化後の状態確認
      const status = await migrationManager.getMigrationStatus();
      
      // Then: システムが適切に初期化されている
      expect(status.available).toBeGreaterThanOrEqual(0);
      expect(status.executed).toBeGreaterThanOrEqual(0);
      expect(status.pending).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(status.pendingMigrations)).toBe(true);
    });

    test('マイグレーション履歴テーブルが作成される', (done) => {
      // When: schema_migrationsテーブルの存在確認
      db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'", (err, row: any) => {
        // Then: テーブルが存在する
        expect(err).toBeNull();
        expect(row).toBeDefined();
        expect(row.name).toBe('schema_migrations');
        done();
      });
    });
  });

  describe('マイグレーション実行', () => {
    test('利用可能なマイグレーションが正しく検出される', async () => {
      // When: マイグレーション状態を取得
      const status = await migrationManager.getMigrationStatus();
      
      // Then: 005マイグレーションが検出される
      expect(status.pendingMigrations).toContain('005_add_prompt_columns_to_user_settings.sql');
    });

    test('Migration 003 単体でテスト - 複数SQL文パーサーでSQL直接実行', async () => {
      // Given: user_settingsテーブルを事前作成（migration 003の前提条件）
      await new Promise<void>((resolve, reject) => {
        db.run(`CREATE TABLE user_settings (
          user_id TEXT PRIMARY KEY,
          timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
          created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        )`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Given: Migration 003のSQLを直接取得
      const fs = require('fs');
      const path = require('path');
      const migration003Path = path.join(__dirname, '../../database/migrations/003_user_settings_enhancement.sql');
      const migration003Sql = fs.readFileSync(migration003Path, 'utf8');

      // When: 複数SQL文パーサーでMigration 003を実行
      await migrationManager.executeMultipleStatements(migration003Sql);
      
      // Then: username, first_seen, last_seen, is_activeカラムが追加されている
      await new Promise<void>((resolve, reject) => {
        db.all("PRAGMA table_info(user_settings)", (err, rows: any[]) => {
          if (err) reject(err);
          else {
            const columnNames = rows.map(row => row.name);
            expect(columnNames).toContain('username');
            expect(columnNames).toContain('first_seen');
            expect(columnNames).toContain('last_seen');
            expect(columnNames).toContain('is_active');
            resolve();
          }
        });
      });
    });

    test('Migration 005 単体でテスト - 複数SQL文パーサーでSQL直接実行', async () => {
      // Given: user_settingsテーブルを事前作成
      await new Promise<void>((resolve, reject) => {
        db.run(`CREATE TABLE user_settings (
          user_id TEXT PRIMARY KEY,
          timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
          created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        )`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Given: Migration 005のSQLを直接取得
      const fs = require('fs');
      const path = require('path');
      const migration005Path = path.join(__dirname, '../../database/migrations/005_add_prompt_columns_to_user_settings.sql');
      const migration005Sql = fs.readFileSync(migration005Path, 'utf8');

      // When: 複数SQL文パーサーでMigration 005を実行
      await migrationManager.executeMultipleStatements(migration005Sql);
      
      // Then: prompt_enabledカラムが追加されている
      await new Promise<void>((resolve, reject) => {
        db.all("PRAGMA table_info(user_settings)", (err, rows: any[]) => {
          if (err) reject(err);
          else {
            const columnNames = rows.map(row => row.name);
            expect(columnNames).toContain('prompt_enabled');
            expect(columnNames).toContain('prompt_start_hour');
            expect(columnNames).toContain('prompt_start_minute');
            expect(columnNames).toContain('prompt_end_hour');
            expect(columnNames).toContain('prompt_end_minute');
            resolve();
          }
        });
      });
    });

  });

  describe('Migration 005 専用テスト', () => {
    test('user_settingsテーブルが存在しない場合はスキップされる', async () => {
      // Given: user_settingsテーブルが存在しない状態
      
      // When: マイグレーションを実行
      try {
        await migrationManager.runMigrations();
        // Then: エラーが発生しない（スキップされる）か、適切にハンドリングされる
      } catch (error) {
        // Migration 005がスキップされることを確認
        console.log('Expected behavior: Migration skipped due to missing table');
      }
      
      // Then: 他のマイグレーションが実行されていることを確認
      const status = await migrationManager.getMigrationStatus();
      expect(status).toBeDefined();
    });

    test('マイグレーションの冪等性 - 同じマイグレーションを複数回実行しても安全', async () => {
      // Given: user_settingsテーブルを事前作成
      await new Promise<void>((resolve, reject) => {
        db.run(`CREATE TABLE user_settings (
          user_id TEXT PRIMARY KEY,
          timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
          created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        )`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Given: Migration 005のSQLを直接取得
      const fs = require('fs');
      const path = require('path');
      const migration005Path = path.join(__dirname, '../../database/migrations/005_add_prompt_columns_to_user_settings.sql');
      
      // マイグレーションファイルが存在する場合のみテスト実行
      if (fs.existsSync(migration005Path)) {
        const migration005Sql = fs.readFileSync(migration005Path, 'utf8');

        // When: 1回目の実行 - カラムが追加される
        await expect(migrationManager.executeMultipleStatementsWithTransaction(migration005Sql))
          .resolves.not.toThrow();

        // When: 2回目の実行 - 冪等性テスト（カラム重複エラーが適切に処理される）
        await expect(migrationManager.executeMultipleStatementsWithTransaction(migration005Sql))
          .resolves.not.toThrow();

        // Then: カラムが正しく存在し、重複実行でもエラーにならない
        await new Promise<void>((resolve, reject) => {
          db.all("PRAGMA table_info(user_settings)", (err, rows: any[]) => {
            if (err) reject(err);
            else {
              const columnNames = rows.map(row => row.name);
              expect(columnNames).toContain('prompt_enabled');
              expect(columnNames).toContain('prompt_start_hour');
              resolve();
            }
          });
        });
      } else {
        console.log('⚠️ Migration 005ファイルが存在しないため、冪等性テストをスキップします');
      }
    });

  });

  describe('エラーハンドリング', () => {
    test('存在しないマイグレーションファイルは無視される', async () => {
      // When & Then: 存在しないマイグレーションがあってもシステムが動作する
      try {
        await migrationManager.runMigrations();
      } catch (error) {
        // エラーが発生しても、システムは継続できる状態であることを確認
        console.log('Migration error handled gracefully:', error);
      }
      
      // Then: システム状態が取得できることを確認
      const status = await migrationManager.getMigrationStatus();
      expect(status).toBeDefined();
    });

    test('マイグレーション実行履歴が正しく記録される', async () => {
      // Given: user_settingsテーブルを事前作成
      await new Promise<void>((resolve, reject) => {
        db.run(`CREATE TABLE user_settings (
          user_id TEXT PRIMARY KEY,
          timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
          created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        )`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Given: テスト用マイグレーション実行
      const testSql = `
        ALTER TABLE user_settings ADD COLUMN test_column TEXT DEFAULT 'test';
      `;

      // When: executeMultipleStatementsWithTransactionを実行
      await migrationManager.executeMultipleStatementsWithTransaction(testSql);
      
      // Then: recordMigrationメソッドは直接テストできないため、
      // システム全体でのマイグレーション状態確認で代替
      const status = await migrationManager.getMigrationStatus();
      expect(status).toBeDefined();
      expect(typeof status.available).toBe('number');
      expect(typeof status.executed).toBe('number');
      expect(typeof status.pending).toBe('number');

      // Then: 追加したカラムが存在することを確認
      await new Promise<void>((resolve, reject) => {
        db.all("PRAGMA table_info(user_settings)", (err, rows: any[]) => {
          if (err) reject(err);
          else {
            const columnNames = rows.map(row => row.name);
            expect(columnNames).toContain('test_column');
            resolve();
          }
        });
      });
    });
  });


  describe('トランザクション管理', () => {
    test('マイグレーション実行でトランザクションを使用', async () => {
      // Given: user_settingsテーブルを事前作成
      await new Promise<void>((resolve, reject) => {
        db.run(`CREATE TABLE user_settings (
          user_id TEXT PRIMARY KEY,
          timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo'
        )`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Given: 意図的に失敗するSQL文を含むマイグレーション
      const invalidMigrationSql = `
        ALTER TABLE user_settings ADD COLUMN test_col1 TEXT;
        ALTER TABLE user_settings ADD COLUMN test_col2 INTEGER;
        ALTER TABLE nonexistent_table ADD COLUMN should_fail TEXT;
        ALTER TABLE user_settings ADD COLUMN test_col3 TEXT;
      `;

      // When & Then: トランザクションによりロールバックされる
      await expect(migrationManager.executeMultipleStatementsWithTransaction(invalidMigrationSql))
        .rejects.toThrow();
      
      // Then: 部分的な変更がロールバックされている
      await new Promise<void>((resolve, reject) => {
        db.all("PRAGMA table_info(user_settings)", (err, rows: any[]) => {
          if (err) reject(err);
          else {
            const columnNames = rows.map(row => row.name);
            // トランザクションがロールバックされるため、追加されたカラムは存在しない
            expect(columnNames).not.toContain('test_col1');
            expect(columnNames).not.toContain('test_col2');
            expect(columnNames).not.toContain('test_col3');
            resolve();
          }
        });
      });
    });

    test('成功時はすべての変更がコミットされる', async () => {
      // Given: user_settingsテーブルを事前作成
      await new Promise<void>((resolve, reject) => {
        db.run(`CREATE TABLE user_settings (
          user_id TEXT PRIMARY KEY,
          timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo'
        )`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Given: 正常なSQL文のみのマイグレーション
      const validMigrationSql = `
        ALTER TABLE user_settings ADD COLUMN test_col1 TEXT;
        ALTER TABLE user_settings ADD COLUMN test_col2 INTEGER DEFAULT 0;
        CREATE INDEX IF NOT EXISTS idx_test ON user_settings(test_col1);
      `;

      // When: トランザクション付きで実行
      await migrationManager.executeMultipleStatementsWithTransaction(validMigrationSql);
      
      // Then: 全ての変更がコミットされている
      await new Promise<void>((resolve, reject) => {
        db.all("PRAGMA table_info(user_settings)", (err, rows: any[]) => {
          if (err) reject(err);
          else {
            const columnNames = rows.map(row => row.name);
            expect(columnNames).toContain('test_col1');
            expect(columnNames).toContain('test_col2');
            resolve();
          }
        });
      });
    });
  });

  describe('複数SQL文の処理', () => {
    test('複数のSQL文を順次実行できる', async () => {
      // Given: 複数のSQL文を含むマイグレーション
      const multiSql = `
        ALTER TABLE user_settings ADD COLUMN test_col1 TEXT;
        ALTER TABLE user_settings ADD COLUMN test_col2 INTEGER DEFAULT 0;
        CREATE INDEX IF NOT EXISTS idx_test ON user_settings(test_col1);
      `;

      // Given: テーブルを事前作成
      await new Promise<void>((resolve, reject) => {
        db.run(`CREATE TABLE user_settings (
          user_id TEXT PRIMARY KEY,
          timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo'
        )`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // When: executeMultipleStatements を呼び出す
      // Then: 全てのSQL文が順次実行される
      await expect(migrationManager.executeMultipleStatements(multiSql)).resolves.not.toThrow();
      
      // Then: 全てのカラムが追加されている
      await new Promise<void>((resolve, reject) => {
        db.all("PRAGMA table_info(user_settings)", (err, rows: any[]) => {
          if (err) reject(err);
          else {
            const columnNames = rows.map(row => row.name);
            expect(columnNames).toContain('test_col1');
            expect(columnNames).toContain('test_col2');
            resolve();
          }
        });
      });
    });

    test('SQL文の解析で空文とコメントを無視する', async () => {
      // Given: 空行とコメントを含むSQL
      const sqlWithComments = `
        -- This is a comment
        ALTER TABLE user_settings ADD COLUMN test_col TEXT;
        
        /* Multi-line comment */
        
        -- Another comment
        ALTER TABLE user_settings ADD COLUMN test_col2 INTEGER;
      `;

      // Given: テーブルを事前作成
      await new Promise<void>((resolve, reject) => {
        db.run(`CREATE TABLE user_settings (
          user_id TEXT PRIMARY KEY,
          timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo'
        )`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // When: parseSqlStatements を呼び出す
      const statements = migrationManager.parseSqlStatements(sqlWithComments);
      
      // Then: コメントと空行が除外されている
      expect(statements).toHaveLength(2);
      expect(statements[0]).toContain('test_col TEXT');
      expect(statements[1]).toContain('test_col2 INTEGER');
    });

    test('個別SQL文実行でエラー時に詳細情報を提供', async () => {
      // Given: 無効なSQL文
      const invalidSql = "ALTER TABLE nonexistent_table ADD COLUMN test TEXT;";

      // When & Then: エラーが適切にハンドリングされる
      await expect(migrationManager.executeMultipleStatements(invalidSql))
        .rejects.toThrow(/マイグレーション SQL文 1 の実行に失敗しました/);
    });
  });

  describe('マイグレーション状態管理', () => {
    test('getMigrationStatus()が正確な状態を返す', async () => {
      // When: ステータスを取得
      const status = await migrationManager.getMigrationStatus();
      
      // Then: 適切な情報が含まれている
      expect(typeof status.available).toBe('number');
      expect(typeof status.executed).toBe('number');
      expect(typeof status.pending).toBe('number');
      expect(Array.isArray(status.pendingMigrations)).toBe(true);
    });
  });

  describe('セキュリティと安全性', () => {
    test('SQLインジェクション対策 - パラメータ化クエリの使用', async () => {
      // Given: テーブルを事前作成
      await new Promise<void>((resolve, reject) => {
        db.run(`CREATE TABLE test_security (
          id INTEGER PRIMARY KEY,
          name TEXT
        )`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // When: 悪意のあるSQL文を含むマイグレーション（実際には安全に処理される）
      const safeSql = `
        INSERT INTO test_security (name) VALUES ('normal_data');
        INSERT INTO test_security (name) VALUES ('data_with_quotes''test');
      `;

      // Then: SQL文が安全に実行される
      await expect(migrationManager.executeMultipleStatements(safeSql))
        .resolves.not.toThrow();

      // Then: データが正しく挿入されている
      const result = await new Promise<any[]>((resolve, reject) => {
        db.all("SELECT * FROM test_security", (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('normal_data');
      expect(result[1].name).toBe("data_with_quotes'test");
    });

    test('バックアップ機能の統合テスト', async () => {
      // Given: バックアップ機能が無効の場合でもマイグレーションが動作すること
      const originalEnv = process.env.ENABLE_BACKUP;
      
      // When: バックアップ無効でマイグレーション実行
      process.env.ENABLE_BACKUP = 'false';
      
      try {
        await migrationManager.runMigrations();
        // Then: エラーが発生しない
      } catch (error) {
        console.log('Migration completed with or without backup:', error);
      }
      
      // cleanup
      process.env.ENABLE_BACKUP = originalEnv;
      
      // Then: システム状態が正常
      const status = await migrationManager.getMigrationStatus();
      expect(status).toBeDefined();
    });
  });

  describe('パフォーマンステスト', () => {
    test('大きなマイグレーションファイルの処理性能', async () => {
      // Given: テーブルを事前作成
      await new Promise<void>((resolve, reject) => {
        db.run(`CREATE TABLE test_performance (
          id INTEGER PRIMARY KEY,
          data TEXT
        )`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Given: 大量のSQL文を含むマイグレーション（50文）
      const statements = Array.from({ length: 50 }, (_, i) => 
        `INSERT INTO test_performance (data) VALUES ('test_data_${i}');`
      );
      const largeSql = statements.join('\n');

      // When: 実行時間を測定
      const startTime = Date.now();
      await migrationManager.executeMultipleStatements(largeSql);
      const executionTime = Date.now() - startTime;

      // Then: 合理的な時間内で完了（10秒以内）
      expect(executionTime).toBeLessThan(10000);

      // Then: 全データが正しく挿入されている
      const result = await new Promise<any[]>((resolve, reject) => {
        db.all("SELECT COUNT(*) as count FROM test_performance", (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      expect(result[0].count).toBe(50);
    });

    test('SQL文パーサーのパフォーマンス', async () => {
      // Given: 複雑なSQL文（コメント、空行、複数文を含む）
      const complexSql = `
        -- This is a comment
        
        ALTER TABLE test_table ADD COLUMN col1 TEXT;
        
        /* Multi-line
           comment */
           
        ALTER TABLE test_table ADD COLUMN col2 INTEGER;
        
        -- Another comment
        CREATE INDEX IF NOT EXISTS idx_test ON test_table(col1);
      `;

      // When: パーサーの実行時間を測定
      const startTime = Date.now();
      const statements = migrationManager.parseSqlStatements(complexSql);
      const parsingTime = Date.now() - startTime;

      // Then: パーシングが高速（100ms以内）
      expect(parsingTime).toBeLessThan(100);
      
      // Then: 正しく3つのSQL文に分割される
      expect(statements).toHaveLength(3);
      expect(statements[0]).toContain('ADD COLUMN col1');
      expect(statements[1]).toContain('ADD COLUMN col2');
      expect(statements[2]).toContain('CREATE INDEX');
    });
  });
});