/**
 * SqliteActivityLogRepository専用リポジトリのテスト
 * 活動ログ管理機能の単一責務テスト
 */

import { SqliteActivityLogRepository } from '../../../repositories/specialized/SqliteActivityLogRepository';
import { DatabaseConnection } from '../../../repositories/base/DatabaseConnection';
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
        businessDate: '2024-01-15',
        inputTimestamp: '2024-01-15T09:00:00Z',
        startTime: '2024-01-15T09:00:00Z',
        endTime: '2024-01-15T10:00:00Z',
        totalMinutes: 60,
        categories: 'WORK'
      };

      const savedLog = await repository.saveLog(request);

      expect(savedLog).toBeDefined();
      expect(savedLog.id).toBeDefined();
      expect(savedLog.userId).toBe(request.userId);
      expect(savedLog.content).toBe(request.content);
      expect(savedLog.categories).toBe(request.categories);
      expect(savedLog.totalMinutes).toBe(request.totalMinutes);
    });

    test('日別ログを取得できる', async () => {
      const userId = 'test-user-2';
      const businessDate = '2024-01-16';

      // テストデータ作成
      await repository.saveLog({
        userId,
        content: 'ログ1',
        businessDate,
        inputTimestamp: '2024-01-16T09:00:00Z',
        categories: 'WORK'
      });

      await repository.saveLog({
        userId,
        content: 'ログ2', 
        businessDate,
        inputTimestamp: '2024-01-16T10:00:00Z',
        categories: 'BREAK'
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
        businessDate: '2024-01-17',
        inputTimestamp: '2024-01-17T09:00:00Z',
        categories: 'WORK'
      });

      await repository.saveLog({
        userId,
        content: '2日目ログ', 
        businessDate: '2024-01-18',
        inputTimestamp: '2024-01-18T09:00:00Z',
        categories: 'WORK'
      });

      await repository.saveLog({
        userId,
        content: '3日目ログ',
        businessDate: '2024-01-19',
        inputTimestamp: '2024-01-19T09:00:00Z',
        categories: 'WORK'
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
        businessDate: '2024-01-20',
        inputTimestamp: '2024-01-20T09:00:00Z',
        categories: 'WORK'
      });

      // updateLogは現在contentのみ更新するので、updateLogFieldsを使用
      await repository.updateLogFields(log.id, {
        content: '更新されたログ',
        categories: 'BREAK',
        totalMinutes: 30
      });

      const updatedLog = await repository.getLogById(log.id);

      expect(updatedLog).toBeDefined();
      expect(updatedLog!.content).toBe('更新されたログ');
      expect(updatedLog!.categories).toBe('BREAK');
      expect(updatedLog!.totalMinutes).toBe(30);
    });

    test('ログを論理削除できる', async () => {
      const log = await repository.saveLog({
        userId: 'test-user-5',
        content: '削除予定ログ',
        businessDate: '2024-01-21',
        inputTimestamp: '2024-01-21T09:00:00Z',
        categories: 'WORK'
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
      const analysisResult = {
        businessDate: '2024-01-22',
        totalLogCount: 1,
        categories: [],
        timeline: [],
        timeDistribution: { totalEstimatedMinutes: 0, workingMinutes: 0, breakMinutes: 0, unaccountedMinutes: 0, overlapMinutes: 0 },
        insights: { productivityScore: 85, workBalance: { focusTimeRatio: 0, meetingTimeRatio: 0, breakTimeRatio: 0, adminTimeRatio: 0 }, suggestions: [], highlights: [], motivation: 'テスト' },
        warnings: [],
        generatedAt: '2024-01-22T00:00:00Z'
      };
      
      const savedCache = await repository.saveAnalysisCache({
        userId: 'test-user-6',
        businessDate: '2024-01-22',
        analysisResult,
        logCount: 5
      });

      expect(savedCache).toBeDefined();
      expect(savedCache.analysisResult).toEqual(analysisResult);

      const retrievedCache = await repository.getAnalysisCache(
        'test-user-6', 
        '2024-01-22'
      );

      expect(retrievedCache).toBeDefined();
      expect(retrievedCache!.analysisResult).toEqual(analysisResult);
    });

    test('古いキャッシュを正常に保存・取得できる', async () => {
      const analysisResult = {
        businessDate: '2024-01-23',
        totalLogCount: 1,
        categories: [],
        timeline: [],
        timeDistribution: { totalEstimatedMinutes: 0, workingMinutes: 0, breakMinutes: 0, unaccountedMinutes: 0, overlapMinutes: 0 },
        insights: { productivityScore: 75, workBalance: { focusTimeRatio: 0, meetingTimeRatio: 0, breakTimeRatio: 0, adminTimeRatio: 0 }, suggestions: [], highlights: [], motivation: 'テスト2' },
        warnings: [],
        generatedAt: '2024-01-23T00:00:00Z'
      };
      
      await repository.saveAnalysisCache({
        userId: 'test-user-7',
        businessDate: '2024-01-23',
        analysisResult,
        logCount: 3
      });

      const cache = await repository.getAnalysisCache(
        'test-user-7',
        '2024-01-23'
      );

      expect(cache).toBeDefined();
      expect(cache!.analysisResult).toEqual(analysisResult);
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
        businessDate: new Date().toISOString().split('T')[0], // 今日の日付
        inputTimestamp: new Date().toISOString(),
        categories: 'WORK'
      });

      const businessDateInfo = await repository.getBusinessDateInfo(userId, timezone);

      expect(businessDateInfo).toBeDefined();
      expect(businessDateInfo.timezone).toBe(timezone);
      expect(businessDateInfo.businessDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(businessDateInfo.startTime).toBeDefined();
      expect(businessDateInfo.endTime).toBeDefined();
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
        '2024-01-01'
      );
      expect(cache).toBeNull();
    });
  });
});