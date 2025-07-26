/**
 * 依存性注入インターフェースのテスト
 * インターフェース実装の動作確認
 */

import {
  IClientFactory,
  ISchedulerService,
  ITimeProvider,
  IServerFactory,
  ILogger,
  IConfigService,
  IDependencyContainer
} from '../../interfaces/dependencies';

describe('依存性注入インターフェースのテスト', () => {
  describe('IClientFactory', () => {
    test('createメソッドが実装されている', () => {
      const mockFactory: IClientFactory = {
        create: jest.fn()
      };
      
      expect(typeof mockFactory.create).toBe('function');
    });
  });

  describe('ISchedulerService', () => {
    test('scheduleメソッドが実装されている', () => {
      const mockScheduler: ISchedulerService = {
        schedule: jest.fn(),
        validate: jest.fn()
      };
      
      expect(typeof mockScheduler.schedule).toBe('function');
      expect(typeof mockScheduler.validate).toBe('function');
    });
  });

  describe('ITimeProvider', () => {
    test('時間関連メソッドが実装されている', () => {
      const mockTimeProvider: ITimeProvider = {
        now: jest.fn(),
        format: jest.fn(),
        getTodayString: jest.fn(),
        toZonedTime: jest.fn()
      };
      
      expect(typeof mockTimeProvider.now).toBe('function');
      expect(typeof mockTimeProvider.format).toBe('function');
      expect(typeof mockTimeProvider.getTodayString).toBe('function');
      expect(typeof mockTimeProvider.toZonedTime).toBe('function');
    });
  });

  describe('IServerFactory', () => {
    test('createメソッドが実装されている', () => {
      const mockServerFactory: IServerFactory = {
        create: jest.fn()
      };
      
      expect(typeof mockServerFactory.create).toBe('function');
    });
  });

  describe('ILogger', () => {
    test('ログ関連メソッドが実装されている', () => {
      const mockLogger: ILogger = {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn()
      };
      
      expect(typeof mockLogger.info).toBe('function');
      expect(typeof mockLogger.error).toBe('function');
      expect(typeof mockLogger.warn).toBe('function');
      expect(typeof mockLogger.debug).toBe('function');
    });
  });

  describe('IConfigService', () => {
    test('設定関連メソッドが実装されている', () => {
      const mockConfig: IConfigService = {
        getDiscordToken: jest.fn(),
        getGeminiApiKey: jest.fn(),
        getDatabasePath: jest.fn(),
        isDebugMode: jest.fn(),
        getDefaultTimezone: jest.fn(),
        getServerPort: jest.fn(),
        validate: jest.fn(),
        get: jest.fn()
      };
      
      expect(typeof mockConfig.getDiscordToken).toBe('function');
      expect(typeof mockConfig.getGeminiApiKey).toBe('function');
      expect(typeof mockConfig.getDatabasePath).toBe('function');
      expect(typeof mockConfig.isDebugMode).toBe('function');
      expect(typeof mockConfig.getDefaultTimezone).toBe('function');
      expect(typeof mockConfig.getServerPort).toBe('function');
      expect(typeof mockConfig.validate).toBe('function');
      expect(typeof mockConfig.get).toBe('function');
    });
  });

  describe('IDependencyContainer', () => {
    test('依存関係管理メソッドが実装されている', () => {
      const mockContainer: IDependencyContainer = {
        register: jest.fn(),
        resolve: jest.fn(),
        registerSingleton: jest.fn()
      };
      
      expect(typeof mockContainer.register).toBe('function');
      expect(typeof mockContainer.resolve).toBe('function');
      expect(typeof mockContainer.registerSingleton).toBe('function');
    });
  });
});