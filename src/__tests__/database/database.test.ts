/**
 * Database 初期化テスト
 * Phase 4: 重要コンポーネントのテストカバレッジ向上
 */

import { SqliteActivityLogRepository } from '../../repositories/sqliteActivityLogRepository';
import * as fs from 'fs';
import * as path from 'path';

describe('Database Initialization', () => {
  let testDbPath: string;
  let repository: SqliteActivityLogRepository;

  beforeEach(() => {
    // テスト用データベースパスを設定
    testDbPath = path.join(__dirname, '../../../test-data/database-test.db');
    const testDir = path.dirname(testDbPath);
    
    // テストディレクトリ作成
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    
    // 既存のテストDBを削除
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  afterEach(async () => {
    // データベース接続をクリーンアップ
    if (repository) {
      await repository.close();
    }
    
    // テストDBファイルを削除
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('データベース初期化', () => {
    test('新しいデータベースファイルが作成される', async () => {
      repository = new SqliteActivityLogRepository(testDbPath);
      await repository.initializeDatabase();
      
      expect(fs.existsSync(testDbPath)).toBe(true);
    });

    test('既存のデータベースファイルに接続できる', async () => {
      // 最初にデータベースを作成
      repository = new SqliteActivityLogRepository(testDbPath);
      await repository.initializeDatabase();
      await repository.close();
      
      // 既存ファイルに再接続
      repository = new SqliteActivityLogRepository(testDbPath);
      await repository.initializeDatabase();
      
      expect(fs.existsSync(testDbPath)).toBe(true);
    });

    test('スキーマが正しく作成される', async () => {
      repository = new SqliteActivityLogRepository(testDbPath);
      await repository.initializeDatabase();
      
      // データベースファイルが存在し、テーブルが作成されることを確認
      expect(fs.existsSync(testDbPath)).toBe(true);
      
      // ログを作成してデータベースが動作することを確認
      const logData = {
        userId: 'test-user',
        content: 'スキーマテスト',
        inputTimestamp: new Date().toISOString(),
        businessDate: '2025-01-15'
      };
      
      const result = await repository.saveLog(logData);
      expect(result).toBeDefined();
      expect(result.content).toBe(logData.content);
    });
  });

  describe('データベース操作機能', () => {
    beforeEach(async () => {
      repository = new SqliteActivityLogRepository(testDbPath);
      await repository.initializeDatabase();
    });

    test('活動ログが正常に作成される', async () => {
      const logData = {
        userId: 'test-user',
        content: 'テスト活動ログ',
        inputTimestamp: new Date().toISOString(),
        businessDate: '2025-01-15'
      };
      
      const result = await repository.saveLog(logData);
      
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.content).toBe(logData.content);
    });

    test('ユーザー設定が正常に保存される', async () => {
      const userId = 'test-user';
      const timezone = 'Asia/Tokyo';
      
      await repository.saveUserTimezone(userId, timezone);
      
      const savedTimezone = await repository.getUserTimezone(userId);
      expect(savedTimezone).toBe(timezone);
    });

    test('業務日でのログ取得が正常に動作する', async () => {
      const userId = 'test-user';
      const businessDate = '2025-01-15';
      
      // ログを作成
      await repository.saveLog({
        userId,
        content: 'テストログ1',
        inputTimestamp: new Date().toISOString(),
        businessDate
      });
      
      await repository.saveLog({
        userId,
        content: 'テストログ2',
        inputTimestamp: new Date().toISOString(),
        businessDate
      });
      
      // 業務日でログを取得
      const logs = await repository.getLogsByDate(userId, businessDate);
      
      expect(logs).toHaveLength(2);
      expect(logs[0].content).toBe('テストログ1');
      expect(logs[1].content).toBe('テストログ2');
    });
  });

  describe('データ操作の信頼性', () => {
    test('同一ユーザーのタイムゾーン更新', async () => {
      repository = new SqliteActivityLogRepository(testDbPath);
      await repository.initializeDatabase();
      
      const userId = 'test-user';
      await repository.saveUserTimezone(userId, 'Asia/Tokyo');
      
      // 同じユーザーIDで再度保存（更新として処理される）
      await repository.saveUserTimezone(userId, 'America/New_York');
      
      const timezone = await repository.getUserTimezone(userId);
      expect(timezone).toBe('America/New_York');
    });

    test('ログ更新機能', async () => {
      repository = new SqliteActivityLogRepository(testDbPath);
      await repository.initializeDatabase();
      
      // ログ作成
      const logData = {
        userId: 'test-user',
        content: '元のログ内容',
        inputTimestamp: new Date().toISOString(),
        businessDate: '2025-01-15'
      };
      
      const createdLog = await repository.saveLog(logData);
      
      // ログ更新
      const updatedLog = await repository.updateLog(createdLog.id, '更新されたログ内容');
      
      expect(updatedLog.content).toBe('更新されたログ内容');
      expect(updatedLog.id).toBe(createdLog.id);
    });
  });
});