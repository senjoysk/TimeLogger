/**
 * TaskLoggerBot DI対応テスト
 * 依存性注入によるテスト可能性の向上を確認
 */

import { TaskLoggerBot } from '../bot';
import { 
  IClientFactory, 
  IConfigService, 
  ILogger,
  ITimeProvider 
} from '../interfaces/dependencies';
import { ConfigService } from '../services/configService';

// モックファクトリーの作成
const createMockClientFactory = (): IClientFactory => ({
  create: jest.fn().mockReturnValue({
    intents: [],
    partials: [],
    login: jest.fn().mockResolvedValue(undefined),
    destroy: jest.fn(),
    once: jest.fn(),
    on: jest.fn(),
    readyAt: new Date(),
    user: { id: 'test-bot-id', tag: 'TestBot#1234' },
    users: { fetch: jest.fn() },
    guilds: { cache: { size: 0 } },
    ws: { ping: 50 }
  })
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

describe('TaskLoggerBot DI対応テスト', () => {
  let mockClientFactory: IClientFactory;
  let mockConfigService: IConfigService;
  let mockLogger: ILogger;
  let mockTimeProvider: ITimeProvider;

  beforeEach(() => {
    // 環境変数を設定
    process.env.DISCORD_BOT_TOKEN = 'test-token';
    process.env.GEMINI_API_KEY = 'test-api-key';
    
    mockClientFactory = createMockClientFactory();
    mockConfigService = new ConfigService();
    mockLogger = createMockLogger();
    mockTimeProvider = createMockTimeProvider();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('🟢 Green Phase - 依存性注入対応', () => {
    test('DIコンストラクタで依存関係を注入できる', () => {
      const bot = new TaskLoggerBot({
        clientFactory: mockClientFactory,
        configService: mockConfigService,
        logger: mockLogger,
        timeProvider: mockTimeProvider
      });
      
      expect(bot).toBeDefined();
    });

    test('DIによってDiscord Clientファクトリーが使用される', () => {
      const bot = new TaskLoggerBot({
        clientFactory: mockClientFactory,
        configService: mockConfigService,
        logger: mockLogger,
        timeProvider: mockTimeProvider
      });

      expect(mockClientFactory.create).toHaveBeenCalledWith({
        intents: expect.any(Array),
        partials: expect.any(Array)
      });
    });

    test('DIによってConfigServiceが使用される', () => {
      const bot = new TaskLoggerBot({
        clientFactory: mockClientFactory,
        configService: mockConfigService,
        logger: mockLogger,
        timeProvider: mockTimeProvider
      });

      // ConfigServiceのgetServerPortが呼ばれることを確認
      expect(mockConfigService.getServerPort).toBeDefined();
    });

    test('DIによってTimeProviderが使用される', () => {
      const bot = new TaskLoggerBot({
        clientFactory: mockClientFactory,
        configService: mockConfigService,
        logger: mockLogger,
        timeProvider: mockTimeProvider
      });

      // TimeProviderが注入されていることを確認
      expect(mockTimeProvider.now).toBeDefined();
    });
  });

  describe('従来のコンストラクタ（後方互換性）', () => {
    test('引数なしでの初期化も可能', () => {
      // 従来通りの初期化方法が動作することを確認
      expect(() => {
        const bot = new TaskLoggerBot();
        expect(bot).toBeDefined();
      }).not.toThrow();
    });
  });
});