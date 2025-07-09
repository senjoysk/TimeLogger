import { BackupManager } from '../../database/backupManager';
import { Database } from 'sqlite3';
import * as fs from 'fs';
import * as path from 'path';

describe('BackupManager', () => {
  let db: Database;
  let backupManager: BackupManager;
  let testDbPath: string;
  let testBackupDir: string;

  beforeAll(() => {
    // テスト用のディレクトリを作成
    testDbPath = path.join(__dirname, 'test.db');
    testBackupDir = path.join(__dirname, 'test_backups');
    
    // クリーンアップ
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(testBackupDir)) {
      fs.rmSync(testBackupDir, { recursive: true, force: true });
    }
  });

  beforeEach((done) => {
    // テスト用データベースを作成
    db = new Database(testDbPath);
    backupManager = new BackupManager(db, testBackupDir, testDbPath);
    
    // テストデータを挿入（同期処理で実行）
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS test_table (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      db.run(`INSERT INTO test_table (name) VALUES ('test_data_1'), ('test_data_2')`, () => {
        done();
      });
    });
  });

  afterEach((done) => {
    // データベースを閉じる
    db.close((err) => {
      if (err) {
        console.error('Database close error:', err);
      }
      
      // テストファイルをクリーンアップ
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }
      if (fs.existsSync(testBackupDir)) {
        fs.rmSync(testBackupDir, { recursive: true, force: true });
      }
      done();
    });
  });

  describe('バックアップ作成', () => {
    test('バックアップファイルが正常に作成される', async () => {
      const backupPath = await backupManager.createBackup('test');
      
      expect(fs.existsSync(backupPath)).toBe(true);
      expect(backupPath).toMatch(/timelogger_backup_.*_test\.db/);
    });

    test('バックアップファイルの内容が正しい', async () => {
      const backupPath = await backupManager.createBackup('test');
      
      // バックアップファイルを開いて内容を確認
      const backupDb = new Database(backupPath);
      
      return new Promise((resolve, reject) => {
        backupDb.all('SELECT * FROM test_table', (err, rows: any[]) => {
          if (err) {
            reject(err);
          } else {
            expect(rows).toHaveLength(2);
            expect(rows[0].name).toBe('test_data_1');
            expect(rows[1].name).toBe('test_data_2');
            backupDb.close();
            resolve(undefined);
          }
        });
      });
    });
  });

  describe('バックアップ一覧', () => {
    test('バックアップファイルの一覧が取得できる', async () => {
      await backupManager.createBackup('test1');
      await new Promise(resolve => setTimeout(resolve, 10)); // 時間差を作る
      await backupManager.createBackup('test2');
      
      const backupList = backupManager.getBackupList();
      
      expect(backupList).toHaveLength(2);
      expect(backupList.some(backup => backup.name.includes('test1'))).toBe(true);
      expect(backupList.some(backup => backup.name.includes('test2'))).toBe(true);
    });
  });

  describe('バックアップの検証', () => {
    test('正常なバックアップファイルの検証', async () => {
      const backupPath = await backupManager.createBackup('test');
      
      const isValid = await backupManager.validateBackup(backupPath);
      
      expect(isValid).toBe(true);
    });

    test('存在しないファイルの検証', async () => {
      const isValid = await backupManager.validateBackup('/non/existent/path.db');
      
      expect(isValid).toBe(false);
    });
  });

  describe('古いバックアップのクリーンアップ', () => {
    test('古いバックアップファイルが削除される', async () => {
      // 15個のバックアップを作成（上限は10個）
      for (let i = 0; i < 15; i++) {
        await backupManager.createBackup(`test${i}`);
        // ファイルの作成時刻を微調整
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      const backupList = backupManager.getBackupList();
      
      // 10個以下に制限されていることを確認
      expect(backupList.length).toBeLessThanOrEqual(10);
    });
  });
});