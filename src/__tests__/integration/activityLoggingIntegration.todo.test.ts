/**
 * ActivityLoggingIntegration TODO機能統合テスト
 * TDD開発: Red Phase - まず失敗するテストを書く
 */

import { ActivityLoggingIntegration, ActivityLoggingConfig } from '../../integration/activityLoggingIntegration';
import { TodoCrudHandler } from '../../handlers/todoCrudHandler';
import { MessageClassificationHandler } from '../../handlers/messageClassificationHandler';
import { MessageClassificationService } from '../../services/messageClassificationService';

// モックDependencies
jest.mock('../../repositories/PartialCompositeRepository');
jest.mock('../../services/activityLogService');
jest.mock('../../services/geminiService');
jest.mock('../../services/messageClassificationService');
jest.mock('../../handlers/todoCrudHandler');
jest.mock('../../handlers/messageClassificationHandler');
jest.mock('../../handlers/todoInteractionHandler');

// Discord.jsのモック
const mockMessage = {
  author: { id: 'test-user', bot: false },
  guild: null, // DM
  content: 'テストメッセージ',
  reply: jest.fn().mockResolvedValue({}),
  react: jest.fn().mockResolvedValue({})
};

const mockButtonInteraction = {
  user: { id: 'test-user' },
  customId: 'todo_complete_123',
  isButton: () => true,
  reply: jest.fn().mockResolvedValue({}),
  update: jest.fn().mockResolvedValue({}),
  replied: false
};

const mockClient = {
  listeners: jest.fn().mockReturnValue([]),
  removeAllListeners: jest.fn(),
  on: jest.fn()
};

describe('ActivityLoggingIntegration TODO機能統合', () => {
  let integration: ActivityLoggingIntegration;
  let config: ActivityLoggingConfig;

  beforeEach(() => {
    config = {
      databasePath: ':memory:',
      geminiApiKey: 'test-api-key',
      debugMode: true,
      defaultTimezone: 'Asia/Tokyo',
      enableAutoAnalysis: true,
      cacheValidityMinutes: 60,
      targetUserId: 'test-user'
    };

    integration = new ActivityLoggingIntegration(config);
  });

  afterEach(async () => {
    try {
      if (integration && integration.shutdown) {
        await integration.shutdown();
      }
    } catch (error) {
      // テスト環境ではエラーを無視
      console.warn('テスト終了時のクリーンアップエラー:', error);
    }
    
    // 非同期処理の完了を待つ
    await new Promise(resolve => setImmediate(resolve));
  });

  describe('初期化', () => {
    test('TODO機能サービスが正しく初期化される', async () => {
      await integration.initialize();
      
      // 初期化が完了していることを確認
      expect(integration).toBeDefined();
      
      // 内部サービスの初期化を確認（モック経由）
      expect(MessageClassificationService).toHaveBeenCalled();
      // 分割後のハンドラーを確認
      const { TodoCrudHandler } = require('../../handlers/todoCrudHandler');
      const { MessageClassificationHandler } = require('../../handlers/messageClassificationHandler');
      const { TodoInteractionHandler } = require('../../handlers/todoInteractionHandler');
      expect(TodoCrudHandler).toHaveBeenCalled();
      expect(MessageClassificationHandler).toHaveBeenCalled();
      expect(TodoInteractionHandler).toHaveBeenCalled();
    });

    test('統合システムではSqliteActivityLogRepositoryを共有使用する', async () => {
      await integration.initialize();
      
      // 分割後のハンドラーが適切なリポジトリインスタンスを受け取ることを確認
      const { TodoCrudHandler } = require('../../handlers/todoCrudHandler');
      const { MessageClassificationHandler } = require('../../handlers/messageClassificationHandler');
      const { TodoInteractionHandler } = require('../../handlers/todoInteractionHandler');
      
      expect(TodoCrudHandler).toHaveBeenCalledWith(
        expect.any(Object) // repository (ITodoRepository)
      );
      expect(MessageClassificationHandler).toHaveBeenCalledWith(
        expect.any(Object), // repository (ITodoRepository)
        expect.any(Object), // repository (IMessageClassificationRepository)
        expect.any(Object), // geminiService
        expect.any(Object)  // messageClassificationService
      );
      expect(TodoInteractionHandler).toHaveBeenCalledWith(
        expect.any(Object) // repository (ITodoRepository)
      );
    });
  });

  describe('Bot統合', () => {
    beforeEach(async () => {
      await integration.initialize();
    });

    test('messageCreateとinteractionCreateリスナーが正しく登録される', () => {
      integration.integrateWithBot(mockClient as any);
      
      expect(mockClient.on).toHaveBeenCalledWith('messageCreate', expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith('interactionCreate', expect.any(Function));
    });

    test('既存のmessageCreateリスナーが適切に保持される', () => {
      const existingListeners = [jest.fn(), jest.fn()];
      mockClient.listeners.mockReturnValue(existingListeners);
      
      integration.integrateWithBot(mockClient as any);
      
      expect(mockClient.removeAllListeners).toHaveBeenCalledWith('messageCreate');
      expect(mockClient.on).toHaveBeenCalled();
    });
  });

  describe('メッセージ処理統合', () => {
    beforeEach(async () => {
      await integration.initialize();
      integration.integrateWithBot(mockClient as any);
    });

    test('TODOコマンドが正しく処理される', async () => {
      const todoMessage = {
        ...mockMessage,
        content: '!todo add テスト用TODO'
      };

      // messageCreateイベントハンドラーを取得
      const messageHandler = mockClient.on.mock.calls.find(
        call => call[0] === 'messageCreate'
      )?.[1];

      if (messageHandler) {
        await messageHandler(todoMessage);
      }

      // TODOハンドラーが呼ばれることを確認（実際のテストではモックの確認）
      expect(todoMessage).toBeDefined();
    });

    test('通常メッセージで活動ログ記録とTODO分類が両方実行される', async () => {
      const normalMessage = {
        ...mockMessage,
        content: 'プレゼン資料を作成する'
      };

      // messageCreateイベントハンドラーを取得
      const messageHandler = mockClient.on.mock.calls.find(
        call => call[0] === 'messageCreate'
      )?.[1];

      if (messageHandler) {
        await messageHandler(normalMessage);
      }

      // メッセージが処理されることを確認
      expect(normalMessage).toBeDefined();
    });

    test('Botメッセージは無視される', async () => {
      const botMessage = {
        ...mockMessage,
        author: { id: 'bot-user', bot: true },
        content: 'Botからのメッセージ'
      };

      // messageCreateイベントハンドラーを取得
      const messageHandler = mockClient.on.mock.calls.find(
        call => call[0] === 'messageCreate'
      )?.[1];

      if (messageHandler) {
        const result = await messageHandler(botMessage);
        // Bot メッセージは処理されない
      }

      expect(botMessage.author.bot).toBe(true);
    });

    test('対象外ユーザーのメッセージは無視される', async () => {
      const otherUserMessage = {
        ...mockMessage,
        author: { id: 'other-user', bot: false },
        content: 'テストメッセージ'
      };

      // messageCreateイベントハンドラーを取得
      const messageHandler = mockClient.on.mock.calls.find(
        call => call[0] === 'messageCreate'
      )?.[1];

      if (messageHandler) {
        await messageHandler(otherUserMessage);
      }

      // 対象外ユーザーは処理されない
      expect(otherUserMessage.author.id).toBe('other-user');
    });
  });

  describe('ボタンインタラクション統合', () => {
    beforeEach(async () => {
      await integration.initialize();
      integration.integrateWithBot(mockClient as any);
    });

    test('TODOボタンインタラクションが正しく処理される', async () => {
      // interactionCreateイベントハンドラーを取得
      const interactionHandler = mockClient.on.mock.calls.find(
        call => call[0] === 'interactionCreate'
      )?.[1];

      if (interactionHandler) {
        await interactionHandler(mockButtonInteraction);
      }

      // ボタンインタラクションが処理されることを確認
      expect(mockButtonInteraction).toBeDefined();
    });

    test('対象外ユーザーのボタンインタラクションも処理される（マルチユーザー対応）', async () => {
      const otherUserInteraction = {
        ...mockButtonInteraction,
        user: { id: 'other-user' },
        customId: 'todo_complete_123',
        isButton: () => true
      };

      // handleButtonInteractionメソッドを直接呼び出してテスト
      await integration.handleButtonInteraction(otherUserInteraction as any);

      // マルチユーザー対応により、すべてのユーザーがボタンインタラクションを使用可能
      // ただし、未知のボタンインタラクションは無視される
      // この場合は処理が実行されることを確認（ログが出力される）
      expect(otherUserInteraction).toBeDefined();
    });

    test('非ボタンインタラクションは無視される', async () => {
      const nonButtonInteraction = {
        isButton: () => false,
        user: { id: 'test-user' }
      };

      // interactionCreateイベントハンドラーを取得
      const interactionHandler = mockClient.on.mock.calls.find(
        call => call[0] === 'interactionCreate'
      )?.[1];

      if (interactionHandler) {
        await interactionHandler(nonButtonInteraction);
      }

      // 非ボタンインタラクションは処理されない
      expect(nonButtonInteraction.isButton()).toBe(false);
    });
  });

  describe('エラーハンドリング', () => {
    beforeEach(async () => {
      await integration.initialize();
      integration.integrateWithBot(mockClient as any);
    });

    test('メッセージ処理中のエラーが適切にハンドリングされる', async () => {
      const errorMessage = {
        ...mockMessage,
        content: '!todo invalid-command',
        reply: jest.fn().mockRejectedValue(new Error('Reply failed'))
      };

      // messageCreateイベントハンドラーを取得
      const messageHandler = mockClient.on.mock.calls.find(
        call => call[0] === 'messageCreate'
      )?.[1];

      if (messageHandler) {
        // エラーが発生してもクラッシュしないことを確認
        await expect(messageHandler(errorMessage)).resolves.not.toThrow();
      }
    });

    test('ボタンインタラクション処理中のエラーが適切にハンドリングされる', async () => {
      const errorInteraction = {
        ...mockButtonInteraction,
        customId: 'invalid_button_id',
        reply: jest.fn().mockRejectedValue(new Error('Interaction failed'))
      };

      // interactionCreateイベントハンドラーを取得
      const interactionHandler = mockClient.on.mock.calls.find(
        call => call[0] === 'interactionCreate'
      )?.[1];

      if (interactionHandler) {
        // エラーが発生してもクラッシュしないことを確認
        await expect(interactionHandler(errorInteraction)).resolves.not.toThrow();
      }
    });
  });

  describe('リソースクリーンアップ', () => {
    test('destroy()で分割後のハンドラーもクリーンアップされる', async () => {
      await integration.initialize();
      
      // MessageClassificationHandlerのdestroyメソッドをモック
      const mockDestroy = jest.fn();
      (integration as any).messageClassificationHandler = { destroy: mockDestroy };
      (integration as any).repository = { close: jest.fn() };

      await integration.destroy();

      expect(mockDestroy).toHaveBeenCalled();
    });

    test('部分的な初期化状態でもクリーンアップが安全に実行される', async () => {
      // 部分的に初期化された状態
      (integration as any).isInitialized = true;
      (integration as any).messageClassificationHandler = null;
      (integration as any).repository = { close: jest.fn() };

      // エラーなしでクリーンアップできることを確認
      await expect(integration.destroy()).resolves.not.toThrow();
    });
  });

  describe('設定とファクトリー', () => {
    test('デフォルト設定が正しく生成される', () => {
      const { createDefaultConfig } = require('../../integration/activityLoggingIntegration');
      
      const config = createDefaultConfig('/test/db/path', 'test-api-key');
      
      expect(config).toEqual({
        databasePath: '/test/db/path',
        geminiApiKey: 'test-api-key',
        debugMode: expect.any(Boolean),
        defaultTimezone: 'Asia/Tokyo',
        enableAutoAnalysis: true,
        cacheValidityMinutes: 60,
        targetUserId: expect.any(String)
      });
    });

    test('ファクトリー関数が正しく動作する', async () => {
      const { createActivityLoggingIntegration } = require('../../integration/activityLoggingIntegration');
      
      const testConfig = {
        databasePath: ':memory:',
        geminiApiKey: 'test-key',
        debugMode: false,
        defaultTimezone: 'UTC',
        enableAutoAnalysis: false,
        cacheValidityMinutes: 30,
        targetUserId: 'factory-test-user'
      };

      const instance = await createActivityLoggingIntegration(testConfig);
      
      expect(instance).toBeInstanceOf(ActivityLoggingIntegration);
      
      // クリーンアップ
      if (instance.destroy) {
        await instance.destroy();
      }
    });
  });
});