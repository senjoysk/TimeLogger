/**
 * ファクトリークラステスト
 * 依存関係ファクトリーの動作確認
 */

import {
  DiscordClientFactory,
  CronSchedulerService,
  RealTimeProvider,
  MockTimeProvider,
  ExpressServerFactory,
  ConsoleLogger,
  MockLogger,
  createFactories
} from '../../factories';

// Discord.js のモック
jest.mock('discord.js', () => ({
  Client: jest.fn().mockImplementation(() => ({
    login: jest.fn(),
    destroy: jest.fn()
  }))
}));

// node-cron のモック
jest.mock('node-cron', () => ({
  schedule: jest.fn().mockReturnValue({
    start: jest.fn(),
    stop: jest.fn()
  }),
  validate: jest.fn().mockReturnValue(true)
}));

// express のモック
jest.mock('express', () => {
  const mockApp = {
    get: jest.fn(),
    post: jest.fn(),
    use: jest.fn(),
    listen: jest.fn()
  };
  return jest.fn(() => mockApp);
});

describe('ファクトリークラステスト', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('DiscordClientFactory', () => {
    test('Discord Clientを作成できる', () => {
      const factory = new DiscordClientFactory();
      const options = { intents: [] };
      
      const client = factory.create(options);
      expect(client).toBeDefined();
    });
  });

  describe('CronSchedulerService', () => {
    test('Cronスケジュールを作成できる', () => {
      const service = new CronSchedulerService();
      const callback = jest.fn();
      
      const task = service.schedule('0 0 * * *', callback);
      
      expect(task).toBeDefined();
      expect(typeof task.start).toBe('function');
      expect(typeof task.stop).toBe('function');
    });

    test('Cron式の検証ができる', () => {
      const service = new CronSchedulerService();
      
      expect(service.validate('0 0 * * *')).toBe(true);
    });

    test('タスクが自動開始される（scheduled: true）', () => {
      const service = new CronSchedulerService();
      const callback = jest.fn();
      const mockTask = {
        start: jest.fn(),
        stop: jest.fn()
      };
      
      // node-cronのモックをリセットして設定
      const cronMock = require('node-cron');
      cronMock.schedule.mockReturnValue(mockTask);
      
      const task = service.schedule('0 0 * * *', callback);
      
      // node-cronのscheduleが正しいオプションで呼ばれたことを確認
      expect(cronMock.schedule).toHaveBeenCalledWith(
        '0 0 * * *',
        callback,
        {
          scheduled: true,
          timezone: 'UTC'
        }
      );
      
      // task.start()が呼ばれたことを確認
      expect(mockTask.start).toHaveBeenCalled();
    });
  });

  describe('RealTimeProvider', () => {
    test('現在時刻を取得できる', () => {
      const provider = new RealTimeProvider();
      const now = provider.now();
      
      expect(now).toBeInstanceOf(Date);
    });

    test('日時をフォーマットできる', () => {
      const provider = new RealTimeProvider();
      const date = new Date('2023-01-01T12:00:00Z');
      
      const formatted = provider.format(date, 'Asia/Tokyo');
      expect(typeof formatted).toBe('string');
    });

    test('今日の日付文字列を取得できる', () => {
      const provider = new RealTimeProvider();
      
      const todayString = provider.getTodayString('Asia/Tokyo');
      expect(todayString).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test('タイムゾーン変換ができる', () => {
      const provider = new RealTimeProvider();
      const date = new Date('2023-01-01T12:00:00Z');
      
      const zonedDate = provider.toZonedTime(date, 'Asia/Tokyo');
      expect(zonedDate).toBeInstanceOf(Date);
    });
  });

  describe('MockTimeProvider', () => {
    test('初期時刻を設定して作成できる', () => {
      const initialDate = new Date('2023-01-01T12:00:00Z');
      const provider = new MockTimeProvider(initialDate);
      
      expect(provider.now()).toEqual(initialDate);
    });

    test('モック時刻を設定できる', () => {
      const provider = new MockTimeProvider();
      const mockDate = new Date('2023-01-01T12:00:00Z');
      
      provider.setMockDate(mockDate);
      expect(provider.now()).toEqual(mockDate);
    });

    test('時間を進めることができる', () => {
      const initialDate = new Date('2023-01-01T12:00:00Z');
      const provider = new MockTimeProvider(initialDate);
      
      provider.advanceTime(3600000); // 1時間進める
      
      const advancedDate = provider.now();
      expect(advancedDate.getTime()).toBe(initialDate.getTime() + 3600000);
    });

    test('日時フォーマットが動作する', () => {
      const provider = new MockTimeProvider();
      const date = new Date('2023-01-01T12:00:00Z');
      
      const formatted = provider.format(date, 'Asia/Tokyo');
      expect(typeof formatted).toBe('string');
    });
  });

  describe('ExpressServerFactory', () => {
    test('Expressアプリケーションを作成できる', () => {
      const factory = new ExpressServerFactory();
      
      const app = factory.create();
      expect(app).toBeDefined();
    });
  });

  describe('ConsoleLogger', () => {
    let consoleSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      jest.spyOn(console, 'error').mockImplementation();
      jest.spyOn(console, 'warn').mockImplementation();
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    test('情報ログが出力される', () => {
      const logger = new ConsoleLogger('info');
      
      logger.info('テストメッセージ');
      expect(console.log).toHaveBeenCalledWith('[INFO] テストメッセージ', '');
    });

    test('エラーログが出力される', () => {
      const logger = new ConsoleLogger('error');
      const error = new Error('テストエラー');
      
      logger.error('エラーメッセージ', error);
      expect(console.error).toHaveBeenCalledWith('[ERROR] エラーメッセージ', error.stack, '');
    });

    test('ログレベルが制御される', () => {
      const logger = new ConsoleLogger('warn');
      
      logger.debug('デバッグメッセージ'); // 出力されない
      logger.info('情報メッセージ'); // 出力されない
      logger.warn('警告メッセージ'); // 出力される
      
      expect(console.log).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledWith('[WARN] 警告メッセージ', '');
    });
  });

  describe('MockLogger', () => {
    test('ログを記録できる', () => {
      const logger = new MockLogger();
      
      logger.info('テストメッセージ');
      logger.error('エラーメッセージ');
      
      expect(logger.logs).toHaveLength(2);
      expect(logger.logs[0]).toEqual({
        level: 'info',
        message: 'テストメッセージ'
      });
      expect(logger.logs[1]).toEqual({
        level: 'error',
        message: 'エラーメッセージ'
      });
    });

    test('ログレベル別の集計ができる', () => {
      const logger = new MockLogger();
      
      logger.info('情報1');
      logger.info('情報2');
      logger.error('エラー1');
      
      expect(logger.countLogs('info')).toBe(2);
      expect(logger.countLogs('error')).toBe(1);
      expect(logger.countLogs('warn')).toBe(0);
    });

    test('ログをクリアできる', () => {
      const logger = new MockLogger();
      
      logger.info('テストメッセージ');
      expect(logger.logs).toHaveLength(1);
      
      logger.clear();
      expect(logger.logs).toHaveLength(0);
    });
  });

  describe('createFactories', () => {
    test('本番用ファクトリーセットが作成される', () => {
      const factories = createFactories.production();
      
      expect(factories.clientFactory).toBeInstanceOf(DiscordClientFactory);
      expect(factories.schedulerService).toBeInstanceOf(CronSchedulerService);
      expect(factories.timeProvider).toBeInstanceOf(RealTimeProvider);
      expect(factories.serverFactory).toBeInstanceOf(ExpressServerFactory);
      expect(factories.logger).toBeInstanceOf(ConsoleLogger);
    });

    test('開発用ファクトリーセットが作成される', () => {
      const factories = createFactories.development();
      
      expect(factories.clientFactory).toBeInstanceOf(DiscordClientFactory);
      expect(factories.schedulerService).toBeInstanceOf(CronSchedulerService);
      expect(factories.timeProvider).toBeInstanceOf(RealTimeProvider);
      expect(factories.serverFactory).toBeInstanceOf(ExpressServerFactory);
      expect(factories.logger).toBeInstanceOf(ConsoleLogger);
    });

    test('テスト用ファクトリーセットが作成される', () => {
      const mockDate = new Date('2023-01-01T12:00:00Z');
      const factories = createFactories.test(mockDate);
      
      expect(factories.clientFactory).toBeInstanceOf(DiscordClientFactory);
      expect(factories.schedulerService).toBeInstanceOf(CronSchedulerService);
      expect(factories.timeProvider).toBeInstanceOf(MockTimeProvider);
      expect(factories.serverFactory).toBeInstanceOf(ExpressServerFactory);
      expect(factories.logger).toBeInstanceOf(MockLogger);
      
      // MockTimeProviderに指定した時刻が設定されているか確認
      expect(factories.timeProvider.now()).toEqual(mockDate);
    });
  });
});