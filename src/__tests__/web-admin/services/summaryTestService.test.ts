/**
 * SummaryTestService テストスイート
 * 
 * サマリーテスト機能のテスト
 * 
 * テスト対象:
 * - ドライランモードでのサマリーテスト
 * - 対象ユーザー指定でのテスト
 * - 送信判定ロジックの検証
 * - エラーハンドリング
 * - テスト結果の統計情報
 */

import { SummaryTestService } from '../../../web-admin/services/summaryTestService';
import { TaskLoggerBot } from '../../../bot';
import { MockTimeProvider, MockLogger } from '../../../factories';
import { SummaryTestRequest, SummaryTestUserResult } from '../../../web-admin/types/testing';

// TaskLoggerBotのモック
jest.mock('../../../bot');
const MockTaskLoggerBot = TaskLoggerBot as jest.MockedClass<typeof TaskLoggerBot>;

describe('SummaryTestService', () => {
  let service: SummaryTestService;
  let mockBot: jest.Mocked<TaskLoggerBot>;
  let mockTimeProvider: MockTimeProvider;
  let mockLogger: MockLogger;

  beforeEach(() => {
    mockTimeProvider = new MockTimeProvider();
    mockLogger = new MockLogger();
    mockBot = new MockTaskLoggerBot() as jest.Mocked<TaskLoggerBot>;
    
    service = new SummaryTestService(mockBot, mockTimeProvider, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('ドライランテスト機能', () => {
    test('ドライランモードで全ユーザーテストが実行される', async () => {
      // テストユーザーデータのモック
      mockBot.getRegisteredUsers = jest.fn().mockResolvedValue([
        { userId: 'user1', timezone: 'Asia/Tokyo' },
        { userId: 'user2', timezone: 'America/New_York' },
        { userId: 'user3', timezone: 'Europe/London' }
      ]);

      // 18:30 Asia/Tokyoに設定
      mockTimeProvider.setMockDate(new Date('2024-01-15T09:30:00Z')); // UTC 09:30 = JST 18:30

      const request: SummaryTestRequest = {
        dryRun: true,
        testDateTime: '2024-01-15T09:30:00Z',
        testTimezone: 'Asia/Tokyo'
      };

      const result = await service.executeTest(request);

      expect(result.success).toBe(true);
      expect(result.testSettings.dryRun).toBe(true);
      expect(result.results).toHaveLength(3);
      expect(result.summary.totalUsers).toBe(3);
      
      // Asia/Tokyoユーザーは送信対象
      const tokyoUser = result.results.find(r => r.userId === 'user1');
      expect(tokyoUser!.status).toBe('sent');
      expect(tokyoUser!.reason).toContain('18:30');
      
      // 他のユーザーはスキップ
      const nyUser = result.results.find(r => r.userId === 'user2');
      expect(nyUser!.status).toBe('skipped');
    });

    test('ドライランモードでは実際のDiscord送信が行われない', async () => {
      // テストユーザーデータのモック
      mockBot.getRegisteredUsers = jest.fn().mockResolvedValue([
        { userId: 'user1', timezone: 'Asia/Tokyo' }
      ]);

      // Discord送信メソッドのモック
      mockBot.sendDailySummaryToUserForTest = jest.fn().mockResolvedValue(undefined);

      const request: SummaryTestRequest = {
        dryRun: true,
        testDateTime: '2024-01-15T09:30:00Z',
        testTimezone: 'Asia/Tokyo'
      };

      await service.executeTest(request);

      // ドライランなのでDiscord送信メソッドは呼ばれない
      expect(mockBot.sendDailySummaryToUserForTest).not.toHaveBeenCalled();
    });
  });

  describe('対象ユーザー指定テスト', () => {
    test('指定したユーザーのみがテスト対象になる', async () => {
      // 全ユーザーデータのモック
      mockBot.getRegisteredUsers = jest.fn().mockResolvedValue([
        { userId: 'user1', timezone: 'Asia/Tokyo' },
        { userId: 'user2', timezone: 'America/New_York' },
        { userId: 'user3', timezone: 'Europe/London' }
      ]);

      const request: SummaryTestRequest = {
        dryRun: true,
        targetUsers: ['user1', 'user3'], // user2は対象外
        testDateTime: '2024-01-15T09:30:00Z',
        testTimezone: 'Asia/Tokyo'
      };

      const result = await service.executeTest(request);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.summary.totalUsers).toBe(2);
      
      const userIds = result.results.map(r => r.userId);
      expect(userIds).toContain('user1');
      expect(userIds).toContain('user3');
      expect(userIds).not.toContain('user2');
    });

    test('存在しないユーザーが指定された場合はエラーになる', async () => {
      // テストユーザーデータのモック
      mockBot.getRegisteredUsers = jest.fn().mockResolvedValue([
        { userId: 'user1', timezone: 'Asia/Tokyo' }
      ]);

      const request: SummaryTestRequest = {
        dryRun: true,
        targetUsers: ['user1', 'nonexistent'], // 存在しないユーザー
        testDateTime: '2024-01-15T09:30:00Z',
        testTimezone: 'Asia/Tokyo'
      };

      const result = await service.executeTest(request);

      expect(result.success).toBe(false);
      expect(result.error).toContain('存在しないユーザーが指定されました');
    });
  });

  describe('送信判定ロジックテスト', () => {
    test('18:30の判定が正確に行われる', async () => {
      // テストユーザーデータのモック
      mockBot.getRegisteredUsers = jest.fn().mockResolvedValue([
        { userId: 'user_tokyo', timezone: 'Asia/Tokyo' },
        { userId: 'user_ny', timezone: 'America/New_York' },
        { userId: 'user_london', timezone: 'Europe/London' }
      ]);

      // Asia/Tokyo 18:30に設定（UTC 09:30）
      const request: SummaryTestRequest = {
        dryRun: true,
        testDateTime: '2024-01-15T09:30:00Z',
        testTimezone: 'Asia/Tokyo'
      };

      const result = await service.executeTest(request);

      expect(result.success).toBe(true);
      
      // Asia/Tokyoユーザーは18:30なので送信対象
      const tokyoUser = result.results.find(r => r.userId === 'user_tokyo');
      expect(tokyoUser!.status).toBe('sent');
      expect(tokyoUser!.localTime).toContain('18:30');
      
      // America/New_Yorkユーザーは4:30なのでスキップ
      const nyUser = result.results.find(r => r.userId === 'user_ny');
      expect(nyUser!.status).toBe('skipped');
      expect(nyUser!.localTime).toContain('04:30');
    });

    test('18:30以外の時刻では送信されない', async () => {
      // テストユーザーデータのモック
      mockBot.getRegisteredUsers = jest.fn().mockResolvedValue([
        { userId: 'user1', timezone: 'Asia/Tokyo' }
      ]);

      // Asia/Tokyo 18:29に設定（1分早い）
      const request: SummaryTestRequest = {
        dryRun: true,
        testDateTime: '2024-01-15T09:29:00Z',
        testTimezone: 'Asia/Tokyo'
      };

      const result = await service.executeTest(request);

      expect(result.success).toBe(true);
      
      const user = result.results[0];
      expect(user.status).toBe('skipped');
      expect(user.reason).toContain('18:30ではありません');
    });
  });

  describe('サマリープレビュー機能テスト', () => {
    test('ドライランモードでサマリープレビューが生成される', async () => {
      // テストユーザーデータのモック
      mockBot.getRegisteredUsers = jest.fn().mockResolvedValue([
        { userId: 'user1', timezone: 'Asia/Tokyo' }
      ]);

      // サマリー生成のモック
      mockBot.generateSummaryPreview = jest.fn().mockResolvedValue('今日の活動サマリー: 5件のタスクを完了しました。');

      const request: SummaryTestRequest = {
        dryRun: true,
        testDateTime: '2024-01-15T09:30:00Z',
        testTimezone: 'Asia/Tokyo'
      };

      const result = await service.executeTest(request);

      expect(result.success).toBe(true);
      
      const user = result.results[0];
      expect(user.summaryPreview).toBeDefined();
      expect(user.summaryPreview).toContain('今日の活動サマリー');
    });
  });

  describe('実際送信モードテスト', () => {
    test('dryRun=falseで実際のDiscord送信が実行される', async () => {
      // テストユーザーデータのモック
      mockBot.getRegisteredUsers = jest.fn().mockResolvedValue([
        { userId: 'user1', timezone: 'Asia/Tokyo' }
      ]);

      // Discord送信メソッドのモック
      mockBot.sendDailySummaryToUserForTest = jest.fn().mockResolvedValue(undefined);

      const request: SummaryTestRequest = {
        dryRun: false,
        testDateTime: '2024-01-15T09:30:00Z',
        testTimezone: 'Asia/Tokyo'
      };

      await service.executeTest(request);

      // 実際送信なのでDiscord送信メソッドが呼ばれる
      expect(mockBot.sendDailySummaryToUserForTest).toHaveBeenCalledWith('user1', 'Asia/Tokyo');
    });
  });

  describe('エラーハンドリングテスト', () => {
    test('Bot初期化エラーが適切に処理される', async () => {
      // Botが未初期化の状態をシミュレート
      const uninitializedService = new SummaryTestService(null as any, mockTimeProvider, mockLogger);

      const request: SummaryTestRequest = {
        dryRun: true,
        testDateTime: '2024-01-15T09:30:00Z',
        testTimezone: 'Asia/Tokyo'
      };

      const result = await uninitializedService.executeTest(request);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Bot が初期化されていません');
    });

    test('ユーザー取得エラーが適切に処理される', async () => {
      // ユーザー取得でエラーをスロー
      mockBot.getRegisteredUsers = jest.fn().mockRejectedValue(new Error('データベース接続エラー'));

      const request: SummaryTestRequest = {
        dryRun: true,
        testDateTime: '2024-01-15T09:30:00Z',
        testTimezone: 'Asia/Tokyo'
      };

      const result = await service.executeTest(request);

      expect(result.success).toBe(false);
      expect(result.error).toContain('データベース接続エラー');
    });

    test('個別ユーザーの送信エラーが結果に反映される', async () => {
      // テストユーザーデータのモック
      mockBot.getRegisteredUsers = jest.fn().mockResolvedValue([
        { userId: 'user1', timezone: 'Asia/Tokyo' }
      ]);

      // Discord送信でエラーをスロー
      mockBot.sendDailySummaryToUserForTest = jest.fn().mockRejectedValue(new Error('Discord API エラー'));

      const request: SummaryTestRequest = {
        dryRun: false,
        testDateTime: '2024-01-15T09:30:00Z',
        testTimezone: 'Asia/Tokyo'
      };

      const result = await service.executeTest(request);

      expect(result.success).toBe(true); // 全体としては成功
      expect(result.summary.errorCount).toBe(1);
      
      const user = result.results[0];
      expect(user.status).toBe('error');
      expect(user.errorDetail).toContain('Discord API エラー');
    });
  });

  describe('統計情報テスト', () => {
    test('送信統計が正確に計算される', async () => {
      // 複数のテストユーザーデータのモック
      mockBot.getRegisteredUsers = jest.fn().mockResolvedValue([
        { userId: 'user_tokyo1', timezone: 'Asia/Tokyo' },
        { userId: 'user_tokyo2', timezone: 'Asia/Tokyo' },
        { userId: 'user_ny', timezone: 'America/New_York' },
        { userId: 'user_london', timezone: 'Europe/London' }
      ]);

      // Asia/Tokyo 18:30に設定（UTC 09:30）
      const request: SummaryTestRequest = {
        dryRun: true,
        testDateTime: '2024-01-15T09:30:00Z',
        testTimezone: 'Asia/Tokyo'
      };

      const result = await service.executeTest(request);

      expect(result.success).toBe(true);
      expect(result.summary.totalUsers).toBe(4);
      expect(result.summary.sentCount).toBe(2); // Asia/Tokyoユーザー2名
      expect(result.summary.skippedCount).toBe(2); // NY、Londonユーザー
      expect(result.summary.errorCount).toBe(0);
    });
  });
});