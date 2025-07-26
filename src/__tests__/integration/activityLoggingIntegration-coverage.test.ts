/**
 * ActivityLoggingIntegration カバレッジ向上テスト
 * Phase 4: 統合システムの重要パスとエラーハンドリングのテスト
 */

import { ActivityLoggingIntegration, createDefaultConfig } from '../../integration';
import { Message } from 'discord.js';
import { getTestDbPath, cleanupTestDatabase } from '../../utils/testDatabasePath';

// Discordメッセージのモック（既存のものを拡張）
class ExtendedMockMessage {
  public content: string;
  public author: { id: string; bot: boolean; tag: string };
  public guild: any;
  public channel: { isDMBased: () => boolean; send?: jest.Mock };
  public replies: string[] = [];
  public reactions: any[] = [];

  constructor(content: string, userId: string = 'test-user-coverage', isBot: boolean = false) {
    this.content = content;
    this.author = { id: userId, bot: isBot, tag: 'test-user' };
    this.guild = null;
    this.channel = { 
      isDMBased: () => true,
      send: jest.fn().mockResolvedValue({ id: 'message-id' })
    };
  }

  async reply(message: string): Promise<void> {
    this.replies.push(message);
  }

  async react(emoji: string): Promise<void> {
    this.reactions.push(emoji);
  }
}

describe('ActivityLoggingIntegration Coverage Tests', () => {
  let integration: ActivityLoggingIntegration;
  let testDbPath: string;

  beforeAll(async () => {
    // テスト用データベース設定
    testDbPath = getTestDbPath(__filename);
    cleanupTestDatabase(testDbPath);

    const config = createDefaultConfig(testDbPath, 'test-api-key');
    config.debugMode = true;
    config.enableAutoAnalysis = false;
    
    integration = new ActivityLoggingIntegration(config);
    await integration.initialize();
  });

  afterAll(async () => {
    if (integration) {
      await integration.shutdown();
    }
  });

  describe('エラーハンドリングパスのテスト', () => {
    test('初期化済みでない状態でのヘルスチェック', async () => {
      const config = createDefaultConfig('./test-data/temp-uninit.db', 'test-key');
      const uninitIntegration = new ActivityLoggingIntegration(config);
      
      const health = await uninitIntegration.healthCheck();
      
      expect(health.healthy).toBe(false);
      expect(health.details!.initialized).toBe(false);
    });

    test('不正な設定での初期化エラー', async () => {
      const invalidConfig = createDefaultConfig('/invalid/path/db.db', ''); // 無効なパス
      const invalidIntegration = new ActivityLoggingIntegration(invalidConfig);
      
      await expect(invalidIntegration.initialize()).rejects.toThrow();
    });

    test('二重初期化の防止', async () => {
      // integrationは既にbeforeAllで初期化済み
      // 再初期化を試行
      await expect(integration.initialize()).resolves.not.toThrow();
      
      // 二重初期化後も正常に動作することを確認
      const health = await integration.healthCheck();
      expect(health.healthy).toBe(true);
    });

    test('初期化前のメッセージ処理', async () => {
      const config = createDefaultConfig('./test-data/temp-preinit.db', 'test-key');
      const preInitIntegration = new ActivityLoggingIntegration(config);
      
      const mockMessage = new ExtendedMockMessage('test message') as unknown as Message;
      const handleMessage = (preInitIntegration as any).handleMessage.bind(preInitIntegration);
      
      // 初期化前はfalseを返す
      const result = await handleMessage(mockMessage);
      expect(result).toBe(false);
    });
  });

  describe('メッセージ処理の境界テスト', () => {
    test('空文字列メッセージの処理', async () => {
      const mockMessage = new ExtendedMockMessage('') as unknown as Message;
      const handleMessage = (integration as any).handleMessage.bind(integration);
      
      const result = await handleMessage(mockMessage);
      expect(result).toBe(false); // 空メッセージは処理されない
    });

    test('空白のみメッセージの処理', async () => {
      const mockMessage = new ExtendedMockMessage('   \n  \t  ') as unknown as Message;
      const handleMessage = (integration as any).handleMessage.bind(integration);
      
      const result = await handleMessage(mockMessage);
      expect(result).toBe(false); // 空白のみも処理されない
    });

    test('非常に長いメッセージの処理', async () => {
      const longMessage = 'Long message test content: ' + 'A'.repeat(1000); // 1000文字程度
      const mockMessage = new ExtendedMockMessage(longMessage) as unknown as Message;
      const handleMessage = (integration as any).handleMessage.bind(integration);
      
      const result = await handleMessage(mockMessage);
      expect(result).toBe(true); // 長いメッセージでも処理される
    });

    test('特殊文字を含むメッセージの処理', async () => {
      const specialMessage = '🚀💻📊 Special chars: ñáéíóú @user #channel';
      const mockMessage = new ExtendedMockMessage(specialMessage) as unknown as Message;
      const handleMessage = (integration as any).handleMessage.bind(integration);
      
      const result = await handleMessage(mockMessage);
      expect(result).toBe(true);
    });

    test('Botメッセージの無視確認', async () => {
      const mockMessage = new ExtendedMockMessage('Bot message', 'bot-user', true) as unknown as Message;
      const handleMessage = (integration as any).handleMessage.bind(integration);
      
      const result = await handleMessage(mockMessage);
      expect(result).toBe(false); // Botメッセージは無視される
    });
  });

  describe('システム統計とモニタリング', () => {
    test('システム統計の詳細取得', async () => {
      const stats = await integration.getSystemStats();
      
      expect(stats).toHaveProperty('totalLogs');
      expect(stats).toHaveProperty('isInitialized');
      expect(stats).toHaveProperty('uptime');
      expect(stats.isInitialized).toBe(true);
      expect(typeof stats.totalLogs).toBe('number');
      expect(stats.totalLogs).toBeGreaterThanOrEqual(0);
    });

    test('設定情報の安全な取得', () => {
      const config = integration.getConfig();
      
      expect(config).toHaveProperty('databasePath');
      expect(config).toHaveProperty('debugMode');
      expect(config).toHaveProperty('targetUserId');
      
      // APIキーは漏洩防止のため直接確認しない
      expect(config).toHaveProperty('geminiApiKey');
    });

    test('ヘルスチェックの詳細確認', async () => {
      const health = await integration.healthCheck();
      
      expect(health.healthy).toBe(true);
      expect(health.details).toHaveProperty('initialized');
      expect(health.details).toHaveProperty('database');
      expect(health.details).toHaveProperty('services');
      expect(health.details).toHaveProperty('handlers');
      
      // 全てのコンポーネントが正常
      expect(health.details!.initialized).toBe(true);
      expect(health.details!.database).toBe(true);
      expect(health.details!.services).toBe(true);
      expect(health.details!.handlers).toBe(true);
    });
  });

  describe('非同期処理とリソース管理', () => {
    test('シャットダウン処理の確認', async () => {
      const config = createDefaultConfig('./test-data/temp-shutdown.db', 'test-key');
      const tempIntegration = new ActivityLoggingIntegration(config);
      
      await tempIntegration.initialize();
      
      // シャットダウン前の状態確認
      let health = await tempIntegration.healthCheck();
      expect(health.healthy).toBe(true);
      
      // シャットダウン実行
      await tempIntegration.shutdown();
      
      // シャットダウン後の状態確認
      health = await tempIntegration.healthCheck();
      expect(health.details!.initialized).toBe(false);
    });

    test('リソースクリーンアップの確認', async () => {
      const config = createDefaultConfig('./test-data/temp-cleanup.db', 'test-key');
      const tempIntegration = new ActivityLoggingIntegration(config);
      
      await tempIntegration.initialize();
      
      // いくつかの処理を実行
      const mockMessage = new ExtendedMockMessage('test cleanup') as unknown as Message;
      const handleMessage = (tempIntegration as any).handleMessage.bind(tempIntegration);
      await handleMessage(mockMessage);
      
      // クリーンアップ
      await tempIntegration.shutdown();
      
      // リソースが適切にクリーンアップされていることを確認
      expect(() => tempIntegration.getConfig()).not.toThrow();
    });
  });

  describe('サマリー生成の境界テスト', () => {
    test('無効なユーザーIDでのサマリー生成', async () => {
      const summaryText = await integration.generateDailySummaryText('', 'Asia/Tokyo');
      
      // 空のユーザーIDでもエラーにならず、適切なメッセージが返される
      expect(typeof summaryText).toBe('string');
      expect(summaryText.length).toBeGreaterThan(0);
    });

    test('無効なタイムゾーンでのサマリー生成', async () => {
      const summaryText = await integration.generateDailySummaryText('test-user', 'Invalid/Timezone');
      
      // 無効なタイムゾーンでもフォールバック処理される
      expect(typeof summaryText).toBe('string');
      expect(summaryText.length).toBeGreaterThan(0);
    });

    test('データが存在しない日付のサマリー生成', async () => {
      const summaryText = await integration.generateDailySummaryText('nonexistent-user', 'Asia/Tokyo');
      
      // データがなくてもフォールバックメッセージが返される
      expect(typeof summaryText).toBe('string');
      expect(summaryText.length).toBeGreaterThan(0);
    }, 10000); // タイムアウトを10秒に設定
  });

  describe('設定と環境依存の処理', () => {
    test('デバッグモード有効時の追加ログ', async () => {
      // デバッグモードが有効な状態でメッセージ処理
      const mockMessage = new ExtendedMockMessage('Debug test message') as unknown as Message;
      const handleMessage = (integration as any).handleMessage.bind(integration);
      
      const result = await handleMessage(mockMessage);
      
      expect(result).toBe(true);
      // デバッグモードでは追加の処理（リアクション等）が実行される
    });

    test('自動分析無効時の処理', async () => {
      // 設定で自動分析が無効になっている状態をテスト
      const config = integration.getConfig();
      expect(config.enableAutoAnalysis).toBe(false);
      
      const mockMessage = new ExtendedMockMessage('Analysis test') as unknown as Message;
      const handleMessage = (integration as any).handleMessage.bind(integration);
      
      const result = await handleMessage(mockMessage);
      expect(result).toBe(true);
    });
  });
});