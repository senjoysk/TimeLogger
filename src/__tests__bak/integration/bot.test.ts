import { TaskLoggerBot } from '../../bot';
import { config } from '../../config';
import { Message } from 'discord.js';

// SQLite3のモック（テスト環境でのバイナリ問題を回避）
jest.mock('sqlite3', () => ({
  Database: jest.fn().mockImplementation(() => ({
    run: jest.fn((sql, params, callback) => callback && callback(null)),
    get: jest.fn((sql, params, callback) => callback && callback(null, { timezone: 'Asia/Tokyo' })),
    all: jest.fn((sql, params, callback) => callback && callback(null, [])),
    close: jest.fn((callback) => callback && callback(null))
  }))
}));

// Discord.jsのモック
jest.mock('discord.js', () => ({
  Client: jest.fn().mockImplementation(() => ({
    login: jest.fn().mockResolvedValue(undefined),
    destroy: jest.fn(),
    once: jest.fn(),
    on: jest.fn(),
    user: { tag: 'TestBot#1234', id: 'bot-123' },
    users: {
      fetch: jest.fn().mockResolvedValue({
        tag: 'TestUser#1234',
        createDM: jest.fn().mockResolvedValue({
          send: jest.fn().mockResolvedValue(undefined)
        })
      })
    }
  })),
  GatewayIntentBits: {
    Guilds: 'guilds',
    GuildMessages: 'guildMessages',
    DirectMessages: 'directMessages',
    MessageContent: 'messageContent'
  },
  Partials: {
    Channel: 'channel',
    Message: 'message'
  }
}));

// 環境変数モック
jest.mock('../../config', () => ({
  config: {
    discord: {
      token: 'test-token',
      targetUserId: 'test-user-123',
      commandPrefix: '!'
    },
    database: {
      path: ':memory:'
    },
    gemini: {
      apiKey: 'test-api-key'
    }
  }
}));

// ファイルシステムモック
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  readFileSync: jest.fn().mockReturnValue('CREATE TABLE test (id INTEGER);')
}));

describe('TaskLoggerBot Integration Test', () => {
  let bot: TaskLoggerBot;

  beforeEach(() => {
    // console出力をモック化
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(async () => {
    if (bot) {
      await bot.stop();
    }
    jest.restoreAllMocks();
  });

  describe('Bot初期化', () => {
    test('Botが正常に初期化される', () => {
      expect(() => {
        bot = new TaskLoggerBot();
      }).not.toThrow();
      
      expect(bot).toBeInstanceOf(TaskLoggerBot);
    });

    test('必要なサービスが初期化される', () => {
      bot = new TaskLoggerBot();
      
      // StatusとRepositoryが取得できることを確認
      const status = bot.getStatus();
      expect(status).toHaveProperty('isRunning');
      expect(status.isRunning).toBe(false);
      
      const repository = bot.getRepository();
      expect(repository).toBeDefined();
    });
  });

  describe('Bot起動・停止', () => {
    test('Botが正常に起動・停止できる', async () => {
      bot = new TaskLoggerBot();
      
      // 起動テスト
      await expect(bot.start()).resolves.not.toThrow();
      expect(bot.getStatus().isRunning).toBe(true);
      
      // 停止テスト
      await expect(bot.stop()).resolves.not.toThrow();
      expect(bot.getStatus().isRunning).toBe(false);
    });
  });

  describe('重要なコマンドの統合テスト', () => {
    beforeEach(async () => {
      bot = new TaskLoggerBot();
      await bot.start();
    });

    test('重要なメソッドが存在し実行可能である', async () => {
      // 重要なパブリックメソッドの存在確認（新システムでは30分問いかけは不要）
      expect(typeof bot.sendDailySummary).toBe('function');
      expect(typeof bot.sendApiCostReport).toBe('function');
      expect(typeof bot.sendCostAlert).toBe('function');

      // これらのメソッドが例外なく実行できることを確認
      await expect(bot.sendDailySummary()).resolves.not.toThrow();
      await expect(bot.sendApiCostReport()).resolves.not.toThrow();
      await expect(bot.sendCostAlert('テストメッセージ')).resolves.not.toThrow();
    });
  });

  describe('エラーハンドリング統合テスト', () => {
    test('不正な設定での初期化エラーハンドリング', () => {
      // 一時的に設定を変更
      const originalConfig = { ...config };
      (config as any).discord.token = '';

      expect(() => {
        new TaskLoggerBot();
      }).not.toThrow(); // 初期化時ではなく、start時にエラーが発生すべき

      // 設定を復元
      Object.assign(config, originalConfig);
    });

    test('データベース初期化エラーの処理', async () => {
      bot = new TaskLoggerBot();
      
      // リポジトリのinitializeメソッドをモック化してエラーを発生させる
      const mockRepository = bot.getRepository();
      jest.spyOn(mockRepository, 'initialize').mockRejectedValue(new Error('DB Error'));

      await expect(bot.start()).rejects.toThrow('DB Error');
    });
  });

  describe('設定とコンフィグレーション', () => {
    test('必要な設定値が正しく読み込まれる', () => {
      bot = new TaskLoggerBot();
      
      // configが正しく参照されていることを確認
      expect(config.discord.token).toBe('test-token');
      expect(config.discord.targetUserId).toBe('test-user-123');
      expect(config.discord.commandPrefix).toBe('!');
    });
  });
});