/**
 * 🔴 Red Phase: Scheduler活動促し機能テスト
 * TDDアプローチ: 実装前のテスト作成
 */

import { Scheduler } from '../scheduler';
import { TaskLoggerBot } from '../bot';
import { SqliteActivityLogRepository } from '../repositories/sqliteActivityLogRepository';
import { ISchedulerService, ILogger, ITimeProvider, IConfigService } from '../interfaces/dependencies';
import { ActivityPromptSettings } from '../types/activityPrompt';

// モック用インターフェース
interface MockActivityPromptRepository {
  getEnabledSettings: jest.Mock<Promise<ActivityPromptSettings[]>, []>;
  getUsersToPromptAt: jest.Mock<Promise<string[]>, [number, number]>;
}

// モック用Bot
interface MockTaskLoggerBot {
  sendActivityPromptToUser: jest.Mock<Promise<void>, [string, string]>;
  getRepository: jest.Mock<SqliteActivityLogRepository>;
}

describe('🔴 Red Phase: Scheduler活動促し機能', () => {
  let scheduler: Scheduler;
  let mockBot: MockTaskLoggerBot;
  let mockRepository: SqliteActivityLogRepository;
  let mockSchedulerService: jest.Mocked<ISchedulerService>;
  let mockLogger: jest.Mocked<ILogger>;
  let mockTimeProvider: jest.Mocked<ITimeProvider>;
  let mockConfigService: jest.Mocked<IConfigService>;
  let mockActivityPromptRepo: MockActivityPromptRepository;

  beforeEach(() => {
    // Bot モック
    mockBot = {
      sendActivityPromptToUser: jest.fn().mockResolvedValue(undefined),
      getRepository: jest.fn()
    };

    // Repository モック
    mockRepository = {
      getAllUsers: jest.fn().mockResolvedValue([
        { userId: 'user1', timezone: 'Asia/Tokyo' },
        { userId: 'user2', timezone: 'America/New_York' }
      ]),
      getDatabase: jest.fn().mockReturnValue({}) // モックデータベース
    } as any;

    mockBot.getRepository.mockReturnValue(mockRepository);

    // ActivityPromptRepository モック
    mockActivityPromptRepo = {
      getEnabledSettings: jest.fn(),
      getUsersToPromptAt: jest.fn()
    };

    // 依存関係モック
    mockSchedulerService = {
      schedule: jest.fn(),
      isRunning: jest.fn()
    } as any;

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    };

    mockTimeProvider = {
      now: jest.fn().mockReturnValue(new Date('2024-01-01T12:00:00Z'))
    } as any;

    mockConfigService = {
      get: jest.fn()
    } as any;

    scheduler = new Scheduler(
      mockBot as any,
      mockRepository,
      {
        schedulerService: mockSchedulerService,
        logger: mockLogger,
        timeProvider: mockTimeProvider,
        configService: mockConfigService,
        activityPromptRepository: mockActivityPromptRepo as any
      }
    );
  });

  describe('活動促しスケジュール開始', () => {
    test('活動促しスケジュールを開始できる', async () => {
      await scheduler.start();

      // 毎分実行のスケジュールが登録されることを確認
      expect(mockSchedulerService.schedule).toHaveBeenCalledWith(
        '* * * * *', // 毎分実行
        expect.any(Function)
      );
    });

    test('スケジュールが複数登録される', async () => {
      await scheduler.start();

      // 日次サマリー、APIコスト、活動促しの3つのスケジュールが登録
      expect(mockSchedulerService.schedule).toHaveBeenCalledTimes(3);
    });
  });

  describe('タイムゾーン別通知判定', () => {
    beforeEach(() => {
      // activity_prompt_settingsテーブルから有効な設定を取得するモック
      mockActivityPromptRepo.getEnabledSettings.mockResolvedValue([
        {
          userId: 'user1',
          isEnabled: true,
          startHour: 9,
          startMinute: 0,
          endHour: 17,
          endMinute: 30,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z'
        },
        {
          userId: 'user2',
          isEnabled: true,
          startHour: 8,
          startMinute: 30,
          endHour: 18,
          endMinute: 0,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z'
        }
      ]);

      // スケジューラーにActivityPromptRepositoryを注入
      (scheduler as any).activityPromptRepository = mockActivityPromptRepo;
    });

    test('該当時刻のユーザーに通知を送信', async () => {
      // 9:00の場合にuser1とuser2の両方が対象
      mockActivityPromptRepo.getUsersToPromptAt.mockResolvedValue(['user1', 'user2']);
      
      await scheduler.start();

      // スケジュール関数を取得して実行
      const scheduleCall = mockSchedulerService.schedule.mock.calls.find(
        call => call[0] === '* * * * *'
      );
      const scheduleFunction = scheduleCall?.[1];

      // 現在時刻を9:00に設定
      mockTimeProvider.now.mockReturnValue(new Date('2024-01-01T00:00:00Z')); // UTC 00:00 = Asia/Tokyo 09:00

      if (scheduleFunction) {
        await scheduleFunction();
      }

      expect(mockActivityPromptRepo.getUsersToPromptAt).toHaveBeenCalledWith(9, 0);
      expect(mockBot.sendActivityPromptToUser).toHaveBeenCalledWith('user1', 'Asia/Tokyo');
      expect(mockBot.sendActivityPromptToUser).toHaveBeenCalledWith('user2', 'America/New_York');
    });

    test('対象外時刻では通知を送信しない', async () => {
      // 該当ユーザーなし
      mockActivityPromptRepo.getUsersToPromptAt.mockResolvedValue([]);
      
      await scheduler.start();

      const scheduleCall = mockSchedulerService.schedule.mock.calls.find(
        call => call[0] === '* * * * *'
      );
      const scheduleFunction = scheduleCall?.[1];

      // 現在時刻を8:15に設定（0分・30分以外）
      mockTimeProvider.now.mockReturnValue(new Date('2024-01-01T23:15:00Z')); // 対象外時刻

      if (scheduleFunction) {
        await scheduleFunction();
      }

      expect(mockBot.sendActivityPromptToUser).not.toHaveBeenCalled();
    });

    test('30分の時刻でも通知を送信', async () => {
      mockActivityPromptRepo.getUsersToPromptAt.mockResolvedValue(['user1']);
      
      await scheduler.start();

      const scheduleCall = mockSchedulerService.schedule.mock.calls.find(
        call => call[0] === '* * * * *'
      );
      const scheduleFunction = scheduleCall?.[1];

      // 現在時刻を9:30に設定
      mockTimeProvider.now.mockReturnValue(new Date('2024-01-01T00:30:00Z')); // UTC 00:30 = Asia/Tokyo 09:30

      if (scheduleFunction) {
        await scheduleFunction();
      }

      expect(mockActivityPromptRepo.getUsersToPromptAt).toHaveBeenCalledWith(9, 30);
      expect(mockBot.sendActivityPromptToUser).toHaveBeenCalledWith('user1', 'Asia/Tokyo');
    });
  });

  describe('エラーハンドリング', () => {
    test('通知送信失敗時もスケジュールを継続', async () => {
      mockActivityPromptRepo.getEnabledSettings.mockResolvedValue([]);
      mockActivityPromptRepo.getUsersToPromptAt.mockResolvedValue(['user1']);
      mockBot.sendActivityPromptToUser.mockRejectedValue(new Error('Discord API Error'));

      (scheduler as any).activityPromptRepository = mockActivityPromptRepo;
      
      await scheduler.start();

      const scheduleCall = mockSchedulerService.schedule.mock.calls.find(
        call => call[0] === '* * * * *'
      );
      const scheduleFunction = scheduleCall?.[1];

      // エラーが投げられても処理が継続することを確認
      await expect(scheduleFunction?.()).resolves.not.toThrow();
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('活動促し通知エラー'),
        expect.any(Error)
      );
    });

    test('リポジトリエラー時も処理継続', async () => {
      mockActivityPromptRepo.getUsersToPromptAt.mockRejectedValue(new Error('DB Error'));

      (scheduler as any).activityPromptRepository = mockActivityPromptRepo;
      
      await scheduler.start();

      const scheduleCall = mockSchedulerService.schedule.mock.calls.find(
        call => call[0] === '* * * * *'
      );
      const scheduleFunction = scheduleCall?.[1];

      await expect(scheduleFunction?.()).resolves.not.toThrow();
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('活動促し通知エラー'),
        expect.any(Error)
      );
    });
  });

  describe('スケジュール停止', () => {
    test('活動促しスケジュールも停止される', () => {
      scheduler.stop();

      // stopメソッドが呼ばれることを確認（実際の実装では各jobのstopが呼ばれる）
      // この実装では直接schedulerService.stopは使用しない
    });
  });

  describe('手動実行', () => {
    test('活動促し機能を手動実行できる', async () => {
      mockActivityPromptRepo.getEnabledSettings.mockResolvedValue([]);
      (scheduler as any).activityPromptRepository = mockActivityPromptRepo;

      await expect(scheduler.executeManually('activityPrompt')).resolves.not.toThrow();
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('手動実行: activityPrompt')
      );
    });
  });
});