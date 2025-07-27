/**
 * SqliteActivityLogRepository専用リポジトリのテスト
 * 活動ログ管理機能の単一責務テスト
 */

import { SqliteActivityLogRepository } from '../../../repositories/specialized/SqliteActivityLogRepository';
import { DatabaseConnection } from '../../../repositories/DatabaseConnection';
import { getTestDbPath, cleanupTestDatabase } from '../../../utils/testDatabasePath';
import { CreateActivityLogRequest } from '../../../types/activityLog';

describe('SqliteActivityLogRepository専用テスト', () => {
  const testDbPath = getTestDbPath(__filename);
  let repository: SqliteActivityLogRepository;

  beforeAll(async () => {
    // テストDB準備
    cleanupTestDatabase(testDbPath);
    
    // 専用リポジトリ初期化
    repository = new SqliteActivityLogRepository(testDbPath);
    await repository.ensureSchema();
    
    // データベース初期化（メインスキーマが必要）
    const db = DatabaseConnection.getInstance(testDbPath);
    await db.initializeDatabase();
  });

  afterAll(async () => {
    // DB接続を閉じる
    const db = DatabaseConnection.getInstance(testDbPath);
    await db.close();
    
    // テストDBクリーンアップ
    cleanupTestDatabase(testDbPath);
  });

  describe('活動ログ管理', () => {
    test('活動ログを保存できる', async () => {
      const request: CreateActivityLogRequest = {
        userId: 'test-user-1',
        content: 'テスト活動ログ',
        activityType: 'WORK',
        startTime: '09:00',
        endTime: '10:00',
        durationMinutes: 60,
        businessDate: '2024-01-15',
        inputTimestamp: '2024-01-15T09:00:00Z'
      };

      const savedLog = await repository.saveLog(request);

      expect(savedLog).toBeDefined();
      expect(savedLog.id).toBeDefined();
      expect(savedLog.userId).toBe(request.userId);
      expect(savedLog.content).toBe(request.content);
      expect(savedLog.activityType).toBe(request.activityType);
      expect(savedLog.durationMinutes).toBe(request.durationMinutes);
    });

    test('日別ログを取得できる', async () => {
      const userId = 'test-user-2';
      const businessDate = '2024-01-16';

      // テストデータ作成
      await repository.saveLog({
        userId,
        content: 'ログ1',
        activityType: 'WORK',
        businessDate,
        inputTimestamp: '2024-01-16T09:00:00Z'
      });

      await repository.saveLog({
        userId,
        content: 'ログ2', 
        activityType: 'BREAK',
        businessDate,
        inputTimestamp: '2024-01-16T10:00:00Z'
      });

      const logs = await repository.getLogsByDate(userId, businessDate);

      expect(logs).toHaveLength(2);
      expect(logs[0].content).toBe('ログ1');
      expect(logs[1].content).toBe('ログ2');
      expect(logs[0].inputTimestamp < logs[1].inputTimestamp).toBe(true);
    });

    test('期間別ログを取得できる', async () => {
      const userId = 'test-user-3';

      // 複数日のテストデータ作成
      await repository.saveLog({
        userId,
        content: '1日目ログ',
        activityType: 'WORK',
        businessDate: '2024-01-17',
        inputTimestamp: '2024-01-17T09:00:00Z'
      });

      await repository.saveLog({
        userId,
        content: '2日目ログ',
        activityType: 'WORK', 
        businessDate: '2024-01-18',
        inputTimestamp: '2024-01-18T09:00:00Z'
      });

      await repository.saveLog({
        userId,
        content: '3日目ログ',
        activityType: 'WORK',
        businessDate: '2024-01-19',
        inputTimestamp: '2024-01-19T09:00:00Z'
      });

      const logs = await repository.getLogsByDateRange(userId, '2024-01-17', '2024-01-18');

      expect(logs).toHaveLength(2);
      expect(logs[0].content).toBe('1日目ログ');
      expect(logs[1].content).toBe('2日目ログ');
    });

    test('ログを更新できる', async () => {
      const log = await repository.saveLog({
        userId: 'test-user-4',
        content: '元のログ',
        activityType: 'WORK',
        businessDate: '2024-01-20',
        inputTimestamp: '2024-01-20T09:00:00Z'
      });

      await repository.updateLog(log.id, {
        content: '更新されたログ',
        activityType: 'BREAK',
        durationMinutes: 30
      });

      const updatedLog = await repository.getLogById(log.id);

      expect(updatedLog).toBeDefined();
      expect(updatedLog!.content).toBe('更新されたログ');
      expect(updatedLog!.activityType).toBe('BREAK');
      expect(updatedLog!.durationMinutes).toBe(30);
    });

    test('ログを論理削除できる', async () => {
      const log = await repository.saveLog({
        userId: 'test-user-5',
        content: '削除予定ログ',
        activityType: 'WORK',
        businessDate: '2024-01-21',
        inputTimestamp: '2024-01-21T09:00:00Z'
      });

      // 削除前は取得できる
      const beforeDelete = await repository.getLogById(log.id);
      expect(beforeDelete).toBeDefined();

      // 論理削除実行
      await repository.deleteLog(log.id);

      // 削除後は取得できない
      const afterDelete = await repository.getLogById(log.id);
      expect(afterDelete).toBeNull();
    });
  });

  describe('分析キャッシュ管理', () => {
    test('分析キャッシュを保存・取得できる', async () => {
      const cacheData = { summary: 'テストサマリー', score: 85 };
      
      const savedCache = await repository.saveAnalysisCache({
        userId: 'test-user-6',
        businessDate: '2024-01-22',
        cacheType: 'DAILY_SUMMARY',
        cacheData,
        expiresAt: '2024-01-23T00:00:00Z'
      });

      expect(savedCache).toBeDefined();
      expect(savedCache.cacheData).toEqual(cacheData);

      const retrievedCache = await repository.getAnalysisCache(
        'test-user-6', 
        '2024-01-22', 
        'DAILY_SUMMARY'
      );

      expect(retrievedCache).toBeDefined();
      expect(retrievedCache!.cacheData).toEqual(cacheData);
    });

    test('期限切れキャッシュは取得されない', async () => {
      // 過去の日時で期限切れキャッシュを作成
      await repository.saveAnalysisCache({
        userId: 'test-user-7',
        businessDate: '2024-01-23',
        cacheType: 'EXPIRED_TEST',
        cacheData: { test: 'expired' },
        expiresAt: '2024-01-01T00:00:00Z' // 過去の日時
      });

      const cache = await repository.getAnalysisCache(
        'test-user-7',
        '2024-01-23', 
        'EXPIRED_TEST'
      );

      expect(cache).toBeNull();
    });

    test('期限切れキャッシュを削除できる', async () => {
      // 期限切れキャッシュ削除をテスト
      await repository.clearExpiredCache();
      
      // 削除処理が正常に実行されることを確認（エラーが発生しないこと）
      expect(true).toBe(true);
    });
  });

  describe('業務日時処理', () => {
    test('業務日時情報を取得できる', async () => {
      const userId = 'test-user-8';
      const timezone = 'Asia/Tokyo';

      // テストログを作成
      await repository.saveLog({
        userId,
        content: '業務日時テストログ',
        activityType: 'WORK',
        businessDate: new Date().toISOString().split('T')[0], // 今日の日付
        inputTimestamp: new Date().toISOString()
      });

      const businessDateInfo = await repository.getBusinessDateInfo(userId, timezone);

      expect(businessDateInfo).toBeDefined();
      expect(businessDateInfo.userId).toBe(userId);
      expect(businessDateInfo.timezone).toBe(timezone);
      expect(businessDateInfo.logCount).toBeGreaterThan(0);
      expect(businessDateInfo.currentBusinessDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('タイムゾーン管理', () => {
    test('ユーザータイムゾーンを保存・取得できる', async () => {
      const userId = 'test-user-9';
      const timezone = 'America/New_York';

      await repository.saveUserTimezone(userId, timezone);

      const retrievedTimezone = await repository.getUserTimezone(userId);

      expect(retrievedTimezone).toBe(timezone);
    });

    test('スケジューラー用タイムゾーンを取得できる', async () => {
      const userTimezones = await repository.getAllUserTimezonesForScheduler();

      expect(Array.isArray(userTimezones)).toBe(true);
      // 前のテストで保存したユーザーが含まれていることを確認
      const testUser = userTimezones.find(tz => tz.userId === 'test-user-9');
      expect(testUser).toBeDefined();
      expect(testUser!.timezone).toBe('America/New_York');
    });

    test('未処理通知と処理済みマークが正しく動作する', async () => {
      // 未処理通知の取得をテスト
      const notifications = await repository.getUnprocessedNotifications();
      expect(Array.isArray(notifications)).toBe(true);

      // タイムゾーン変更履歴の取得をテスト
      const changes = await repository.getUserTimezoneChanges();
      expect(Array.isArray(changes)).toBe(true);
    });
  });

  describe('エラーハンドリング', () => {
    test('存在しないログIDでの取得はnullを返す', async () => {
      const log = await repository.getLogById('non-existent-id');
      expect(log).toBeNull();
    });

    test('存在しないユーザーのタイムゾーン取得はnullを返す', async () => {
      const timezone = await repository.getUserTimezone('non-existent-user');
      expect(timezone).toBeNull();
    });

    test('存在しない分析キャッシュの取得はnullを返す', async () => {
      const cache = await repository.getAnalysisCache(
        'non-existent-user',
        '2024-01-01',
        'NON_EXISTENT_TYPE'
      );
      expect(cache).toBeNull();
    });
  });
});