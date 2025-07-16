/**
 * TaskLoggerBot クラスのテスト
 * Discord Bot コアシステムの基本機能をテスト
 */

import { TaskLoggerBot } from '../bot';
import { Client } from 'discord.js';

// Discord.js のモック
jest.mock('discord.js', () => ({
  Client: jest.fn().mockImplementation(() => ({
    login: jest.fn().mockResolvedValue('mocked-token'),
    destroy: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    once: jest.fn(),
    user: { tag: 'MockBot#1234' }
  })),
  GatewayIntentBits: {
    Guilds: 1,
    GuildMessages: 2,
    DirectMessages: 4,
    DirectMessageReactions: 8,
    MessageContent: 16
  },
  Partials: {
    Channel: 1,
    Message: 2
  }
}));


// ActivityLoggingIntegration のモック
jest.mock('../integration', () => ({
  ActivityLoggingIntegration: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    shutdown: jest.fn().mockResolvedValue(undefined),
    setup: jest.fn(),
    handleMessage: jest.fn().mockResolvedValue(true)
  })),
  createDefaultConfig: jest.fn().mockReturnValue({
    databasePath: 'test.db',
    geminiApiKey: 'test-key',
    debugMode: true
  })
}));

describe('TaskLoggerBot', () => {
  let bot: TaskLoggerBot;

  beforeEach(() => {
    // モックをリセット
    jest.clearAllMocks();
    bot = new TaskLoggerBot();
  });

  afterEach(() => {
    // テスト後のクリーンアップ
    if (bot) {
      // stop メソッドが実装されている場合は呼び出す
    }
  });

  describe('コンストラクター・初期化', () => {
    test('TaskLoggerBotが正しく初期化される', () => {
      // Botインスタンスが作成されることを確認
      expect(bot).toBeDefined();
      expect(bot).toBeInstanceOf(TaskLoggerBot);
    });

    test('Discord Clientが正しく初期化される', () => {
      // ClientのコンストラクターがIntentsとPartialsで呼ばれることを確認
      expect(Client).toHaveBeenCalledWith({
        intents: [1, 2, 4, 8, 16], // モックされたIntents値
        partials: [1, 2] // モックされたPartials値
      });
    });

    test('初期状態が正しく設定される', () => {
      // Botの初期状態を確認（privateフィールドへのアクセスはリフレクションで）
      const status = (bot as any).status;
      expect(status.isRunning).toBe(false);
      expect(status.scheduledJobs).toEqual([]);
    });
  });

  describe('start/stopメソッド', () => {
    test('startメソッドが存在し、呼び出し可能である', () => {
      // startメソッドの存在確認
      expect(typeof (bot as any).start).toBe('function');
    });

    test('stopメソッドが存在し、呼び出し可能である', () => {
      // stopメソッドの存在確認
      expect(typeof (bot as any).stop).toBe('function');
    });
  });

  describe('エラーハンドリング', () => {
    test('エラーカウンターが初期化される', () => {
      // errorCountersが初期化されることを確認
      const errorCounters = (bot as any).errorCounters;
      expect(errorCounters).toBeInstanceOf(Map);
      expect(errorCounters.size).toBe(0);
    });

    test('Discord接続エラーが適切に処理される', () => {
      // エラーハンドリングが設定されることを確認
      const client = (bot as any).client;
      expect(client.on).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });

  describe('統合システム連携', () => {
    test('ActivityLoggingIntegrationが初期状態では未設定である', () => {
      // 初期状態では統合システムは未設定（start()後に設定される）
      const integration = (bot as any).activityLoggingIntegration;
      expect(integration).toBeUndefined();
    });

    test('setupEventHandlersメソッドが呼び出される', () => {
      // イベントハンドラーが設定されることを確認（間接的にsetupEventHandlersが実行された証拠）
      const client = (bot as any).client;
      expect(client.on).toHaveBeenCalled();
    });
  });
});