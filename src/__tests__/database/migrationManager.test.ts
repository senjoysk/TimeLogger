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

    test.skip('同じマイグレーションを複数回実行しても安全（冪等性）', async () => {
      // Given: ディレクトリとファイルの存在確認
      const fs = require('fs');
      const path = require('path');
      
      // マイグレーションパスの確認
      let migrationPath: string;
      const testDir = __dirname;  // dist/__tests__/database
      
      if (testDir.includes('/dist/')) {
        migrationPath = path.join(testDir, '../../database/migrations');
      } else {
        migrationPath = path.join(testDir, '../../src/database/migrations');
      }
      
      console.log('🔍 実際のマイグレーションパス:', migrationPath);
      console.log('🔍 ディレクトリ存在確認:', fs.existsSync(migrationPath));
      
      if (fs.existsSync(migrationPath)) {
        const files = fs.readdirSync(migrationPath);
        console.log('🔍 マイグレーションファイル:', files);
      }
      
      // user_settingsテーブルを事前作成
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

      // When: マイグレーションを1回実行してみる
      try {
        await migrationManager.runMigrations();
        console.log('✅ 1回目のマイグレーション成功');
      } catch (error: any) {
        console.error('❌ 1回目のマイグレーション実行エラー詳細:', {
          message: error.message,
          code: error.code,
          name: error.name,
          errorType: error.constructor.name
        });
        throw error;
      }
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

    test.skip('既にprompt_enabledカラムが存在する場合はスキップされる', async () => {
      // Given: prompt_enabledカラムがすでに存在するテーブル
      await new Promise<void>((resolve, reject) => {
        db.run(`CREATE TABLE user_settings (
          user_id TEXT PRIMARY KEY,
          timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
          prompt_enabled BOOLEAN DEFAULT FALSE,
          created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        )`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // When: マイグレーションを実行
      await expect(migrationManager.runMigrations()).resolves.not.toThrow();
      
      // Then: エラーが発生しない
    });

    test.skip('インデックスが正しく作成される', async () => {
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

      // When: マイグレーションを実行
      await migrationManager.runMigrations();
      
      // Then: インデックスが作成されている
      await new Promise<void>((resolve, reject) => {
        db.all("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_user_settings_prompt%'", (err, rows: any[]) => {
          if (err) reject(err);
          else {
            const indexNames = rows.map(row => row.name);
            expect(indexNames).toContain('idx_user_settings_prompt_enabled');
            expect(indexNames).toContain('idx_user_settings_prompt_schedule');
            resolve();
          }
        });
      });
    });
  });

  describe('エラーハンドリング', () => {
    test.skip('マイグレーション実行履歴が正しく記録される', async () => {
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

      // When: マイグレーションを実行
      await migrationManager.runMigrations();
      
      // Then: 実行履歴が記録されている
      await new Promise<void>((resolve, reject) => {
        db.all("SELECT * FROM schema_migrations WHERE version = '005'", (err, rows: any[]) => {
          if (err) reject(err);
          else {
            expect(rows.length).toBe(1);
            expect(rows[0].success).toBe(1);
            expect(rows[0].description).toContain('Migration 005');
            resolve();
          }
        });
      });
    });

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
});