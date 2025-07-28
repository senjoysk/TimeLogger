/**
 * Database 初期化テスト
 * Phase 4: 重要コンポーネントのテストカバレッジ向上
 */

import { PartialCompositeRepository } from '../../repositories/PartialCompositeRepository';
import { getTestDbPath, cleanupTestDatabase } from '../../utils/testDatabasePath';
import * as fs from 'fs';

describe('Database Initialization', () => {
  let testDbPath: string;
  let repository: PartialCompositeRepository;

  beforeEach(() => {
    // パフォーマンス最適化: メモリDBを使用
    testDbPath = ':memory:';
  });

  afterEach(async () => {
    // データベース接続をクリーンアップ
    if (repository) {
      await repository.close();
    }
    
    // メモリDBのため、ファイルクリーンアップは不要
  });

  describe('データベース初期化', () => {
    test('新しいデータベースが初期化される', async () => {
      repository = new PartialCompositeRepository(testDbPath);
      await repository.initializeDatabase();
      
      // メモリDBの場合はファイル存在確認ではなく、接続確認を行う
      expect(repository.isConnected()).toBe(true);
    });

    test('データベースが再初期化できる', async () => {
      // 最初にデータベースを作成
      repository = new PartialCompositeRepository(testDbPath);
      await repository.initializeDatabase();
      await repository.close();
      
      // 再度初期化
      repository = new PartialCompositeRepository(testDbPath);
      await repository.initializeDatabase();
      
      expect(repository.isConnected()).toBe(true);
    });

    test('スキーマが正しく作成される', async () => {
      repository = new PartialCompositeRepository(testDbPath);
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
      repository = new PartialCompositeRepository(testDbPath);
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
      repository = new PartialCompositeRepository(testDbPath);
      await repository.initializeDatabase();
      
      const userId = 'test-user';
      await repository.saveUserTimezone(userId, 'Asia/Tokyo');
      
      // 同じユーザーIDで再度保存（更新として処理される）
      await repository.saveUserTimezone(userId, 'America/New_York');
      
      const timezone = await repository.getUserTimezone(userId);
      expect(timezone).toBe('America/New_York');
    });

    test('ログ更新機能', async () => {
      repository = new PartialCompositeRepository(testDbPath);
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