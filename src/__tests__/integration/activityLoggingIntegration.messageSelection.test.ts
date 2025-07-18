/**
 * 🔴 Red Phase: ActivityLoggingIntegrationでMessageSelectionHandlerを使用するテスト
 * 
 * AI分類処理をMessageSelectionHandlerに置き換える統合テスト
 */

import { ActivityLoggingIntegration } from '../../integration/activityLoggingIntegration';
import { MessageSelectionHandler } from '../../handlers/messageSelectionHandler';

// MessageSelectionHandlerをモック
jest.mock('../../handlers/messageSelectionHandler', () => {
  return {
    MessageSelectionHandler: jest.fn()
  };
});

describe('🔴 Red Phase: ActivityLoggingIntegration MessageSelection統合テスト', () => {
  let integration: ActivityLoggingIntegration;
  let mockMessage: any;
  let mockMessageSelectionHandler: jest.Mocked<MessageSelectionHandler>;

  beforeEach(() => {
    // モックの初期化
    mockMessage = {
      author: { id: 'test-user-123', bot: false },
      content: 'テストメッセージ内容',
      reply: jest.fn().mockResolvedValue({})
    };

    mockMessageSelectionHandler = {
      processNonCommandMessage: jest.fn().mockResolvedValue(true),
      showSelectionUI: jest.fn().mockResolvedValue(undefined),
      handleButtonInteraction: jest.fn().mockResolvedValue(undefined),
      getStoredMessage: jest.fn().mockReturnValue('テストメッセージ内容')
    } as any;

    // MessageSelectionHandlerのコンストラクタモック
    (MessageSelectionHandler as jest.MockedClass<typeof MessageSelectionHandler>).mockImplementation(() => {
      return mockMessageSelectionHandler;
    });
  });

  test('🔴 Red Phase: AI分類の代わりにMessageSelectionHandlerが呼ばれる', async () => {
    // この時点では実装がないため、テストは失敗する
    const config = {
      databasePath: 'test.db',
      geminiApiKey: 'test-key',
      debugMode: false,
      defaultTimezone: 'Asia/Tokyo',
      enableAutoAnalysis: true,
      cacheValidityMinutes: 60,
      targetUserId: 'test-user'
    };
    integration = new ActivityLoggingIntegration(config);
    await integration.initialize();

    // 非コマンドメッセージを処理
    const result = await integration.handleMessage(mockMessage);

    // AI分類ではなく、MessageSelectionHandlerが呼ばれることを確認
    expect(mockMessageSelectionHandler.processNonCommandMessage).toHaveBeenCalledWith(
      mockMessage,
      'test-user-123',
      'Asia/Tokyo' // デフォルトタイムゾーン
    );
    expect(result).toBe(true);
  });

  test('🔴 Red Phase: コマンドメッセージは従来通り処理される', async () => {
    // この時点では実装がないため、テストは失敗する
    const config = {
      databasePath: 'test.db',
      geminiApiKey: 'test-key',
      debugMode: false,
      defaultTimezone: 'Asia/Tokyo',
      enableAutoAnalysis: true,
      cacheValidityMinutes: 60,
      targetUserId: 'test-user'
    };
    integration = new ActivityLoggingIntegration(config);
    await integration.initialize();

    // コマンドメッセージを作成
    const commandMessage = {
      ...mockMessage,
      content: '!cost' // コマンド
    };

    const result = await integration.handleMessage(commandMessage);

    // MessageSelectionHandlerは呼ばれないことを確認
    expect(mockMessageSelectionHandler.processNonCommandMessage).not.toHaveBeenCalled();
    expect(result).toBe(true); // コマンド処理は成功
  });

  test('🔴 Red Phase: MessageSelectionのボタンインタラクションが処理される', async () => {
    // この時点では実装がないため、テストは失敗する
    const config = {
      databasePath: 'test.db',
      geminiApiKey: 'test-key',
      debugMode: false,
      defaultTimezone: 'Asia/Tokyo',
      enableAutoAnalysis: true,
      cacheValidityMinutes: 60,
      targetUserId: 'test-user'
    };
    integration = new ActivityLoggingIntegration(config);
    await integration.initialize();

    // MessageSelection用のボタンインタラクションを作成
    const mockButtonInteraction = {
      customId: 'select_TODO',
      user: { id: 'test-user-123' },
      replied: false,
      update: jest.fn().mockResolvedValue({})
    } as any;

    // ボタンインタラクションを処理
    await integration.handleButtonInteraction(mockButtonInteraction);

    // MessageSelectionHandlerが呼ばれることを確認
    expect(mockMessageSelectionHandler.handleButtonInteraction).toHaveBeenCalledWith(
      mockButtonInteraction,
      'test-user-123',
      'Asia/Tokyo'
    );
  });
});