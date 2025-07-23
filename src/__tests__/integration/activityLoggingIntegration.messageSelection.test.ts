/**
 * ActivityLoggingIntegration MessageSelection統合テスト
 * 
 * MessageSelectionHandlerが正しく統合されることを確認
 */

import { ActivityLoggingIntegration, createDefaultConfig } from '../../integration';
import { getTestDbPath, cleanupTestDatabase } from '../../utils/testDatabasePath';
import * as fs from 'fs';
import * as path from 'path';

// Discordメッセージのモック
class MockMessage {
  public content: string;
  public author: { id: string; bot: boolean; tag: string; username: string };
  public guild: null = null;
  public channel: { isDMBased: () => boolean } = { isDMBased: () => true };
  public replies: string[] = [];

  constructor(content: string, userId: string = '770478489203507241') {
    this.content = content;
    this.author = { id: userId, bot: false, tag: 'test-user', username: 'TestUser' };
  }

  async reply(message: string): Promise<void> {
    this.replies.push(message);
  }
}

// ボタンインタラクションのモック
class MockButtonInteraction {
  public customId: string;
  public user: { id: string };
  public replied: boolean = false;
  public updates: any[] = [];

  constructor(customId: string, userId: string = '770478489203507241') {
    this.customId = customId;
    this.user = { id: userId };
  }

  async update(options: any): Promise<void> {
    this.updates.push(options);
  }
}

describe('ActivityLoggingIntegration MessageSelection統合テスト', () => {
  let integration: ActivityLoggingIntegration;
  const testDbPath = getTestDbPath(__filename);

  beforeAll(async () => {
    // テスト環境準備
    process.env.USER_TIMEZONE = 'Asia/Tokyo';
    
    const testDir = path.dirname(testDbPath);
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    cleanupTestDatabase(testDbPath);
    
    const config = createDefaultConfig(
      testDbPath,
      'test-gemini-key'
    );
    
    integration = new ActivityLoggingIntegration(config);
    await integration.initialize();
  });

  afterAll(async () => {
    if (integration) {
      await integration.shutdown();
    }
    cleanupTestDatabase(testDbPath);
  });

  test('MessageSelectionHandler統合テストの基本動作', async () => {
    // Given: 非コマンドメッセージ
    const message = new MockMessage('今日のタスクを整理しました');
    
    // When: メッセージを処理
    const result = await integration.handleMessage(message as any);
    
    // Then: 処理が成功する
    expect(result).toBe(true);
  });

  test('コマンドメッセージは従来通り処理される', async () => {
    // Given: コマンドメッセージ
    const message = new MockMessage('!timezone');
    
    // When: メッセージを処理
    const result = await integration.handleMessage(message as any);
    
    // Then: 処理が成功する
    expect(result).toBe(true);
  });

  test('ボタンインタラクションが処理される', async () => {
    // Given: MessageSelection用のボタンインタラクション
    const interaction = new MockButtonInteraction('select_TODO');
    
    // When: ボタンインタラクションを処理
    await integration.handleButtonInteraction(interaction as any);
    
    // Then: エラーが発生しない（正常処理）
    expect(interaction.updates).toBeDefined();
  });
});