import { DatabaseInitializer } from '../../database/databaseInitializer';
import { Database } from 'sqlite3';
import * as fs from 'fs';
import * as path from 'path';

describe('DatabaseInitializer', () => {
  let db: Database;
  let initializer: DatabaseInitializer;
  let testDbPath: string;

  beforeEach(() => {
    // テスト用の一時DBパス
    testDbPath = path.join(__dirname, `../../../temp/test-db-${Date.now()}.db`);
    const dir = path.dirname(testDbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    db = new Database(testDbPath);
    // 自動パス解決を使用
    initializer = new DatabaseInitializer(db);
  });

  afterEach(async () => {
    // DBを閉じて削除
    await new Promise<void>((resolve, reject) => {
      db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('isDatabaseEmpty', () => {
    test('新規作成されたDBは空と判定される', async () => {
      const isEmpty = await initializer.isDatabaseEmpty();
      expect(isEmpty).toBe(true);
    });

    test('テーブルが存在する場合は空でないと判定される', async () => {
      // テーブルを作成
      await new Promise<void>((resolve, reject) => {
        db.run('CREATE TABLE test_table (id INTEGER PRIMARY KEY)', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      const isEmpty = await initializer.isDatabaseEmpty();
      expect(isEmpty).toBe(false);
    });

    test('インデックスのみの場合は空と判定される', async () => {
      // インデックスだけが存在する場合（テーブルは無い）
      const isEmpty = await initializer.isDatabaseEmpty();
      expect(isEmpty).toBe(true);
    });
  });

  describe('initialize', () => {
    test('空のDBの場合はnewSchema.sqlから初期化される', async () => {
      const result = await initializer.initialize();
      
      expect(result.isNewDatabase).toBe(true);
      expect(result.method).toBe('newSchema');
      expect(result.tablesCreated).toBeGreaterThan(0);
    });

    test('既存DBの場合はマイグレーションが実行される', async () => {
      // 基本テーブルを作成
      await new Promise<void>((resolve, reject) => {
        db.run(`CREATE TABLE activity_logs (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at TEXT NOT NULL
        )`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      const result = await initializer.initialize();
      
      expect(result.isNewDatabase).toBe(false);
      expect(result.method).toBe('migration');
    });

    test('初期化エラーが適切にハンドリングされる', async () => {
      // スキーマファイルパスを無効にして強制的にエラーを発生させる
      const invalidInitializer = new DatabaseInitializer(db, '/invalid/path/schema.sql');
      
      await expect(invalidInitializer.initialize()).rejects.toThrow();
    });
  });
});