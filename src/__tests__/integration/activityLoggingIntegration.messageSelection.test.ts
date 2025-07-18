/**
 * 🔴 Red Phase: ActivityLoggingIntegrationでMessageSelectionHandlerを使用するテスト
 * 
 * AI分類処理をMessageSelectionHandlerに置き換える統合テスト
 */

import { ActivityLoggingIntegration } from '../../integration/activityLoggingIntegration';
import { MessageSelectionHandler } from '../../handlers/messageSelectionHandler';
import { SqliteActivityLogRepository } from '../../repositories/sqliteActivityLogRepository';
import { SqliteMemoRepository } from '../../repositories/sqliteMemoRepository';
import { GeminiService } from '../../services/geminiService';
import { DailyReportSender } from '../../services/dailyReportSender';

// 必要なモックを設定
jest.mock('../../repositories/sqliteActivityLogRepository');
jest.mock('../../repositories/sqliteMemoRepository', () => ({
  SqliteMemoRepository: jest.fn().mockImplementation(() => ({
    createMemo: jest.fn(),
    getMemoById: jest.fn(),
    getMemosByUserId: jest.fn(),
    updateMemo: jest.fn(),
    deleteMemo: jest.fn(),
    searchMemos: jest.fn(),
    getMemosByTag: jest.fn(),
    close: jest.fn()
  }))
}));
jest.mock('../../services/geminiService');
jest.mock('../../services/dailyReportSender');
jest.mock('../../handlers/messageSelectionHandler');

// SQLiteモック  
jest.mock('sqlite3', () => ({
  Database: jest.fn().mockImplementation(function(path: string, callback: Function) {
    // pathパラメータを使用
    console.log(`Mock Database created for path: ${path}`);
    callback(null);
  })
}));

describe.skip('🔴 Red Phase: ActivityLoggingIntegration MessageSelection統合テスト', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });
  let integration: ActivityLoggingIntegration;
  let mockMessage: any;
  let mockMessageSelectionHandler: jest.Mocked<MessageSelectionHandler>;

  beforeEach(() => {
    // モックのリセット
    jest.clearAllMocks();
    
    // モックの初期化
    mockMessage = {
      author: { id: 'test-user-123', bot: false, username: 'TestUser', tag: 'TestUser#1234' },
      content: 'テストメッセージ内容',
      guild: null, // DMとして扱う
      channel: {
        isDMBased: jest.fn().mockReturnValue(true)
      },
      reply: jest.fn().mockResolvedValue({})
    };

    mockMessageSelectionHandler = {
      processNonCommandMessage: jest.fn().mockResolvedValue(true),
      showSelectionUI: jest.fn().mockResolvedValue(undefined),
      handleButtonInteraction: jest.fn().mockResolvedValue(undefined),
      getStoredMessage: jest.fn().mockReturnValue('テストメッセージ内容'),
      setTodoRepository: jest.fn(),
      setActivityLogService: jest.fn()
    } as any;

    // MessageSelectionHandlerのコンストラクタモック
    (MessageSelectionHandler as jest.MockedClass<typeof MessageSelectionHandler>).mockImplementation(() => {
      return mockMessageSelectionHandler;
    });
    
    // SqliteActivityLogRepositoryのモック設定
    const mockRepository = {
      initializeDatabase: jest.fn().mockResolvedValue(undefined),
      getUserTimezone: jest.fn().mockResolvedValue('Asia/Tokyo'),
      getApiCostForPeriod: jest.fn().mockResolvedValue({ totalTokens: 0, totalCost: 0 }),
      getActivityLogsBetween: jest.fn().mockResolvedValue([]),
      createTodo: jest.fn().mockResolvedValue({ id: 1, content: 'test' }),
      getTodos: jest.fn().mockResolvedValue([]),
      close: jest.fn().mockResolvedValue(undefined),
      ensureUserProfile: jest.fn().mockResolvedValue(false), // 新規ユーザーではない
      // コストコマンド用のモック
      getApiCost: jest.fn().mockResolvedValue({ totalCost: 0.001 }),
      getCurrentMonth: jest.fn().mockReturnValue('2024-01'),
      getPreviousMonth: jest.fn().mockReturnValue('2023-12')
    };
    (SqliteActivityLogRepository as jest.MockedClass<typeof SqliteActivityLogRepository>)
      .mockImplementation(() => mockRepository as any);
    
    // GeminiServiceのモック設定
    const mockGeminiService = {
      analyzeActivities: jest.fn().mockResolvedValue({ summary: 'test' })
    };
    (GeminiService as jest.MockedClass<typeof GeminiService>)
      .mockImplementation(() => mockGeminiService as any);
    
    // DailyReportSenderのモック設定
    const mockDailyReportSender = {
      setRepository: jest.fn(),
      setGeminiService: jest.fn(),
      sendReport: jest.fn().mockResolvedValue(undefined)
    };
    (DailyReportSender as jest.MockedClass<typeof DailyReportSender>)
      .mockImplementation(() => mockDailyReportSender as any);
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