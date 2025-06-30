/**
 * 活動記録システム統合テスト
 * Discord Botでのコマンド処理の動作確認
 */

import { ActivityLoggingIntegration, createDefaultConfig } from '../../integration';
import { Message } from 'discord.js';

// Discordメッセージのモック
class MockMessage {
  public content: string;
  public author: { id: string; bot: boolean; tag: string };
  public guild: null = null; // DM simulation - 明示的にnullを設定
  public channel: { isDMBased: () => boolean } = { isDMBased: () => true };
  public replies: string[] = [];

  constructor(content: string, userId: string = '770478489203507241') {
    this.content = content;
    this.author = { id: userId, bot: false, tag: 'test-user' };
  }

  async reply(message: string): Promise<void> {
    this.replies.push(message);
  }

  async react(emoji: string): Promise<void> {
    // リアクション処理（モック）
  }
}

describe('活動記録システム統合テスト', () => {
  let integration: ActivityLoggingIntegration;

  beforeAll(async () => {
    // 環境変数を明示的に設定
    process.env.TARGET_USER_ID = '770478489203507241';
    process.env.USER_TIMEZONE = 'Asia/Tokyo';
    
    const config = createDefaultConfig(
      ':memory:',
      'test-api-key'
    );
    config.debugMode = true;
    
    integration = new ActivityLoggingIntegration(config);
    await integration.initialize();
  });

  afterAll(async () => {
    await integration.shutdown();
  });

  describe('コマンド処理テスト', () => {
    test('!cost コマンドが正しく処理される', async () => {
      const mockMessage = new MockMessage('!cost');
      
      // プライベートメソッドをテストするためリフレクション使用
      const handleMessage = (integration as any).handleMessage.bind(integration);
      const result = await handleMessage(mockMessage as unknown as Message);
      
      expect(result).toBe(true); // 処理成功
      expect(mockMessage.replies.length).toBeGreaterThan(0); // 何らかの返信がある
      expect(mockMessage.replies[0]).toContain('API使用量レポート'); // コスト情報が含まれている
    });

    test('!timezone コマンドが正しく処理される', async () => {
      const mockMessage = new MockMessage('!timezone');
      
      const handleMessage = (integration as any).handleMessage.bind(integration);
      const result = await handleMessage(mockMessage as unknown as Message);
      
      expect(result).toBe(true);
      expect(mockMessage.replies.length).toBeGreaterThan(0);
      expect(mockMessage.replies[0]).toContain('タイムゾーン');
    });

    test('!help コマンドにコマンド一覧が表示される', async () => {
      const mockMessage = new MockMessage('!help');
      
      const handleMessage = (integration as any).handleMessage.bind(integration);
      const result = await handleMessage(mockMessage as unknown as Message);
      
      expect(result).toBe(true);
      expect(mockMessage.replies.length).toBeGreaterThan(0);
      
      const helpText = mockMessage.replies[0];
      expect(helpText).toContain('!cost');
      expect(helpText).toContain('!timezone');
      expect(helpText).toContain('!summary');
      expect(helpText).toContain('!edit');
      expect(helpText).toContain('!logs');
    });

    test('未対応コマンドが適切に処理される', async () => {
      const mockMessage = new MockMessage('!unknown');
      
      const handleMessage = (integration as any).handleMessage.bind(integration);
      const result = await handleMessage(mockMessage as unknown as Message);
      
      expect(result).toBe(true); // 処理は成功（ログは出力）
      // 未対応コマンドなので返信はない
    });

    test('通常メッセージが活動ログとして記録される', async () => {
      const mockMessage = new MockMessage('プログラミング作業中');
      
      const handleMessage = (integration as any).handleMessage.bind(integration);
      const result = await handleMessage(mockMessage as unknown as Message);
      
      expect(result).toBe(true);
      // デバッグモードなのでリアクションが追加される想定
    });
  });

  describe('エラーハンドリングテスト', () => {
    test('Botメッセージは無視される', async () => {
      const mockMessage = new MockMessage('!cost');
      mockMessage.author.bot = true;
      
      const handleMessage = (integration as any).handleMessage.bind(integration);
      const result = await handleMessage(mockMessage as unknown as Message);
      
      expect(result).toBe(false); // Bot無視
      expect(mockMessage.replies.length).toBe(0);
    });

    test('対象外ユーザーは無視される', async () => {
      const mockMessage = new MockMessage('!cost', 'wrong-user-id');
      
      const handleMessage = (integration as any).handleMessage.bind(integration);
      const result = await handleMessage(mockMessage as unknown as Message);
      
      expect(result).toBe(false); // 対象外ユーザー無視
      expect(mockMessage.replies.length).toBe(0);
    });
  });

  describe('システム健全性テスト', () => {
    test('設定値を確認する', () => {
      const config = integration.getConfig();
      expect(config.targetUserId).toBe('770478489203507241');
    });

    test('ヘルスチェックが正常に動作する', async () => {
      const healthCheck = await integration.healthCheck();
      
      expect(healthCheck.healthy).toBe(true);
      expect(healthCheck.details.initialized).toBe(true);
      expect(healthCheck.details.database).toBe(true);
      expect(healthCheck.details.services).toBe(true);
      expect(healthCheck.details.handlers).toBe(true);
    });

    test('システム統計が取得できる', async () => {
      const stats = await integration.getSystemStats();
      
      expect(stats).toHaveProperty('totalLogs');
      expect(stats).toHaveProperty('isInitialized');
      expect(stats).toHaveProperty('uptime');
      expect(stats.isInitialized).toBe(true);
    });

    test('設定情報が取得できる', () => {
      const config = integration.getConfig();
      
      expect(config).toHaveProperty('databasePath');
      expect(config).toHaveProperty('geminiApiKey');
      expect(config).toHaveProperty('debugMode');
      expect(config).toHaveProperty('targetUserId');
    });
  });
});