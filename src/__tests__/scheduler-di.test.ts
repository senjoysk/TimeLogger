/**
 * Scheduler DI対応テスト
 * 依存性注入によるテスト可能性の向上を確認
 */

import { Scheduler } from '../scheduler';
import { TaskLoggerBot } from '../bot';
import { 
  ISchedulerService, 
  ILogger,
  ITimeProvider,
  IConfigService 
} from '../interfaces/dependencies';
import { PartialCompositeRepository } from '../repositories/PartialCompositeRepository';

// モック依存関係の作成
const createMockSchedulerService = (): ISchedulerService => ({
  schedule: jest.fn().mockReturnValue({
    start: jest.fn(),
    stop: jest.fn()
  }),
  validate: jest.fn().mockReturnValue(true)
});

const createMockLogger = (): ILogger => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
});

const createMockTimeProvider = (): ITimeProvider => ({
  now: jest.fn().mockReturnValue(new Date('2023-01-01T12:00:00Z')),
  format: jest.fn().mockReturnValue('2023-01-01 12:00:00'),
  getTodayString: jest.fn().mockReturnValue('2023-01-01'),
  toZonedTime: jest.fn().mockReturnValue(new Date('2023-01-01T12:00:00Z'))
});

const createMockConfigService = (): IConfigService => ({
  getDiscordToken: jest.fn().mockReturnValue('test-token'),
  getGeminiApiKey: jest.fn().mockReturnValue('test-api-key'),
  getDatabasePath: jest.fn().mockReturnValue('./test.db'),
  isDebugMode: jest.fn().mockReturnValue(false),
  getDefaultTimezone: jest.fn().mockReturnValue('Asia/Tokyo'),
  getServerPort: jest.fn().mockReturnValue(3000),
  validate: jest.fn().mockReturnValue(true),
  get: jest.fn()
});

describe('Scheduler DI対応テスト', () => {
  let mockBot: any;
  let mockRepository: any;
  let mockSchedulerService: ISchedulerService;
  let mockLogger: ILogger;
  let mockTimeProvider: ITimeProvider;
  let mockConfigService: IConfigService;

  beforeEach(() => {
    mockBot = {
      sendDailySummaryForAllUsers: jest.fn(),
      sendApiCostReportForAllUsers: jest.fn(),
      getRepository: jest.fn().mockReturnValue({
        getAllUsers: jest.fn().mockResolvedValue([
          { userId: 'user1', timezone: 'Asia/Tokyo' },
          { userId: 'user2', timezone: 'America/New_York' }
        ]),
        getDatabase: jest.fn().mockReturnValue({})
      })
    };

    mockRepository = {
      getAllUsers: jest.fn().mockResolvedValue([]),
      getDatabase: jest.fn().mockReturnValue({})
    };

    mockSchedulerService = createMockSchedulerService();
    mockLogger = createMockLogger();
    mockTimeProvider = createMockTimeProvider();
    mockConfigService = createMockConfigService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('🟢 Green Phase - 依存性注入対応', () => {
    test('DIコンストラクタで依存関係を注入できる', () => {
      const scheduler = new Scheduler(mockBot, mockRepository, {
        schedulerService: mockSchedulerService,
        logger: mockLogger,
        timeProvider: mockTimeProvider,
        configService: mockConfigService
      });
      
      expect(scheduler).toBeDefined();
    });

    test('DIによってSchedulerServiceが使用される', async () => {
      const scheduler = new Scheduler(mockBot, mockRepository, {
        schedulerService: mockSchedulerService,
        logger: mockLogger,
        timeProvider: mockTimeProvider,
        configService: mockConfigService
      });

      // startメソッドを呼ぶとschedulerServiceのscheduleが呼ばれることを確認
      await scheduler.start();
      
      // 3回呼ばれる（dailySummary + apiCostReport + activityPrompt）
      expect(mockSchedulerService.schedule).toHaveBeenCalledTimes(3);
    });

    test('DIによってLoggerが使用される', async () => {
      const scheduler = new Scheduler(mockBot, mockRepository, {
        schedulerService: mockSchedulerService,
        logger: mockLogger,
        timeProvider: mockTimeProvider,
        configService: mockConfigService
      });

      await scheduler.start();

      // Loggerのinfoメソッドが複数回呼ばれることを確認
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('スケジューラーを開始')
      );
    });

    test('DIによってTimeProviderが使用される', async () => {
      const scheduler = new Scheduler(mockBot, mockRepository, {
        schedulerService: mockSchedulerService,
        logger: mockLogger,
        timeProvider: mockTimeProvider,
        configService: mockConfigService
      });

      // スケジューラーのコールバック内でtimeProvider.now()が呼ばれることを確認するため
      // スケジュールされたジョブを手動実行
      await scheduler.start();
      
      // scheduleが呼ばれた際のコールバック関数を取得して実行
      const scheduleCall = (mockSchedulerService.schedule as jest.Mock).mock.calls[0];
      const callback = scheduleCall[1];
      
      // コールバックを実行
      await callback();
      
      expect(mockTimeProvider.now).toHaveBeenCalled();
    });
  });

  describe('従来のコンストラクタ（後方互換性）', () => {
    test('従来の引数でも初期化可能', () => {
      // 従来通りの初期化方法が動作することを確認
      expect(() => {
        const scheduler = new Scheduler(mockBot, mockRepository);
        expect(scheduler).toBeDefined();
      }).not.toThrow();
    });
  });
});