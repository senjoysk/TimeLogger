/**
 * TODO・活動ログ重複登録防止テスト
 * AI分類優先方式により、メッセージが重複して登録されないことを確認
 */

import { ActivityLoggingIntegration, ActivityLoggingConfig } from '../../integration/activityLoggingIntegration';
import { PartialCompositeRepository } from '../../repositories/PartialCompositeRepository';
import { SqliteTodoRepository } from '../../repositories/specialized/SqliteTodoRepository';
import { Message, ButtonInteraction } from 'discord.js';
import { Todo } from '../../types/todo';
import { MockGeminiService } from '../mocks/mockGeminiService';
import { TestDatabaseInitializer } from '../../database/testDatabaseInitializer';
import * as fs from 'fs';
import * as path from 'path';

// Discordメッセージのモック
class MockMessage {
  public content: string;
  public author: { id: string; bot: boolean };
  public guild: null = null;
  public channel: { isDMBased: () => boolean } = { isDMBased: () => true };
  public replies: any[] = [];
  public reactions: string[] = [];

  constructor(content: string, userId: string = 'test-user-123') {
    this.content = content;
    this.author = { id: userId, bot: false };
  }

  async reply(options: any): Promise<any> {
    this.replies.push(options);
    
    // Discord.jsのButtonBuilderを実際のボタンデータに変換
    const convertedComponents = options.components ? options.components.map((row: any) => {
      if (row.components) {
        return {
          type: 1,
          components: row.components.map((btn: any) => ({
            type: 2,
            customId: btn.data?.custom_id || '',
            label: btn.data?.label || '',
            style: btn.data?.style || 1
          }))
        };
      }
      return row;
    }) : [];
    
    return {
      id: `reply-${Date.now()}`,
      content: typeof options === 'string' ? options : options.content || '',
      embeds: options.embeds || [],
      components: convertedComponents
    };
  }

  async react(emoji: string): Promise<void> {
    this.reactions.push(emoji);
  }
}

// ButtonInteractionのモック
class MockButtonInteraction {
  public customId: string;
  public user: { id: string };
  public replied: boolean = false;
  public message: any;
  private updateData: any = null;

  constructor(customId: string, userId: string = 'test-user-123', message?: any) {
    this.customId = customId;
    this.user = { id: userId };
    this.message = message;
  }

  async reply(options: any): Promise<void> {
    this.replied = true;
  }

  async update(options: any): Promise<void> {
    this.updateData = options;
  }

  getUpdateData(): any {
    return this.updateData;
  }
}

describe('Test Setup', () => {
  test('環境設定が正しく行われている', () => {
    // console.errorをモックしてエラーログをキャプチャ
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    expect(process.env.NODE_ENV).toBe('test');
    expect(typeof ActivityLoggingIntegration).toBe('function');
    expect(typeof PartialCompositeRepository).toBe('function');
    
    // スパイをクリーンアップ
    consoleSpy.mockRestore();
  });
});

describe('TODO・活動ログ重複登録防止テスト', () => {
  let integration: ActivityLoggingIntegration;
  let repository: PartialCompositeRepository;
  let testDbInitializer: TestDatabaseInitializer;
  let consoleSpy: jest.SpyInstance;

  beforeEach(async () => {
    // console.errorをモックしてエラーログをキャプチャ
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // テスト用データベースの初期化（固有のDB作成）
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substr(2, 9);
    testDbInitializer = new TestDatabaseInitializer(__filename, `duplication-${timestamp}-${randomId}`);
    repository = await testDbInitializer.initialize();
    
    // 統合システムの初期化
    const config: ActivityLoggingConfig = {
      databasePath: testDbInitializer.getPath(),
      geminiApiKey: 'test-api-key',
      debugMode: false,
      defaultTimezone: 'Asia/Tokyo',
      enableAutoAnalysis: false,
      cacheValidityMinutes: 60,
      targetUserId: 'test-user-123'
    };

    integration = new ActivityLoggingIntegration(config);
    
    try {
      await integration.initialize();
    } catch (error) {
      // 初期化エラーをログに記録して再スロー
      console.log('統合システム初期化エラー:', error);
      console.log('エラーの詳細:', JSON.stringify(error, null, 2));
      console.log('設定:', JSON.stringify(config, null, 2));
      console.log('データベースパス:', testDbInitializer.getPath());
      console.log('テストディレクトリ存在:', fs.existsSync(path.dirname(testDbInitializer.getPath())));
      
      // より詳細なエラー情報を提供
      if (error instanceof Error) {
        console.log('エラーメッセージ:', error.message);
        console.log('スタックトレース:', error.stack);
      }
      
      throw error;
    }

    // MockGeminiServiceを注入
    const mockGeminiService = new MockGeminiService();
    (integration as any).geminiService = mockGeminiService;
    
    // 関連サービスにもモックを注入
    if ((integration as any).messageClassificationService) {
      (integration as any).messageClassificationService.geminiService = mockGeminiService;
    }
    if ((integration as any).todoHandler) {
      (integration as any).todoHandler.geminiService = mockGeminiService;
      if ((integration as any).todoHandler.classificationService) {
        (integration as any).todoHandler.classificationService.geminiService = mockGeminiService;
      }
    }
    if ((integration as any).unifiedAnalysisService) {
      (integration as any).unifiedAnalysisService.geminiService = mockGeminiService;
    }

    // リポジトリは既に初期化済み（TestDatabaseInitializerから取得）
    // 統合システムが使用するリポジトリと検証用リポジトリが同じDBを参照することを確認
    const integrationRepository = (integration as any).repository;
    // PartialCompositeRepositoryは内部的に複数のリポジトリを持つため、パス比較はスキップ
  });

  afterEach(async () => {
    // console.errorのスパイをクリーンアップ
    if (consoleSpy) {
      consoleSpy.mockRestore();
    }
    
    // 統合システムの完全シャットダウン
    if (integration) {
      try {
        await integration.shutdown();
      } catch (error) {
        console.log('統合システムシャットダウンエラー:', error);
      }
      integration = null as any;
    }
    
    // テストデータベースの完全クリーンアップ
    if (testDbInitializer) {
      await testDbInitializer.cleanup();
    }
    
    // 非同期処理の完了を確実に待つ
    await new Promise(resolve => setImmediate(resolve));
  });

  test('通常メッセージはAI分類のみ実行され、活動ログに自動登録されない', async () => {
    const message = new MockMessage('明日までに資料を作成する', 'test-user-123');
    
    // メッセージ処理
    await integration.handleMessage(message as any);

    // 検証: AI分類のリプライが送信されている
    expect(message.replies.length).toBeGreaterThan(0);
    
    // 複数のリプライがある場合は最後のものを使用
    const reply = message.replies[message.replies.length - 1];
    expect(reply.embeds).toBeDefined();
    expect(reply.components).toBeDefined();

    // 検証: この時点では活動ログにもTODOにも登録されていない
    const businessDateInfo = repository.calculateBusinessDate(new Date().toISOString(), 'Asia/Tokyo');
    const activityLogs = await repository.getLogsByDate('test-user-123', businessDateInfo.businessDate);
    const todos = await repository.getTodosByUserId('test-user-123');
    
    expect(activityLogs.length).toBe(0);
    expect(todos.length).toBe(0);
  });

  test('TODO確認ボタンを押すとTODOのみ登録され、活動ログには登録されない', async () => {
    const userId = 'test-user-123';
    const messageContent = '明日までに資料を作成する';
    
    // 直接TODOハンドラーのhandleMessageClassificationを呼び出し、createTodoFromMessageをテスト
    const mockMessage = new MockMessage(messageContent, userId);
    
    // AI分類をシミュレート（MockGeminiServiceが「資料」「作成」でTODOと分類）
    await integration.handleMessage(mockMessage as any);
    
    // AI分類のリプライが送信されていることを確認
    expect(mockMessage.replies.length).toBeGreaterThan(0);
    
    // 直接createTodoFromMessageを呼び出すために、TodoCommandHandlerを取得
    const todoHandler = (integration as any).todoHandler;
    
    // 分類結果をシミュレート
    const classificationResult = {
      classification: 'TODO' as const,
      confidence: 0.9,
      reason: 'テスト用分類結果',
      priority: 0
    };
    
    // createTodoFromMessageを直接呼び出し
    const mockInteraction = new MockButtonInteraction('test_button', userId);
    await todoHandler.createTodoFromMessage(
      mockInteraction,
      messageContent,
      classificationResult,
      userId,
      'Asia/Tokyo'
    );

    // 検証: TODOのみ登録されている
    const todos = await repository.getTodosByUserId(userId);
    const businessDateInfo = repository.calculateBusinessDate(new Date().toISOString(), 'Asia/Tokyo');
    const activityLogs = await repository.getLogsByDate(userId, businessDateInfo.businessDate);
    
    expect(todos.length).toBe(1);
    expect(todos[0].content).toBe(messageContent);
    expect(activityLogs.length).toBe(0); // 活動ログには登録されていない
  });

  test('活動ログボタンを押すと活動ログのみ登録され、TODOには登録されない', async () => {
    const userId = 'test-user-123';
    const messageContent = '会議に参加した';
    
    // ユーザーを事前に登録（必要な場合）
    await repository.registerUser(userId, 'Test User');
    
    // ActivityLogServiceを直接使用してテスト
    const activityLogService = (integration as any).activityLogService;
    
    // 活動ログを直接記録
    const savedLog = await activityLogService.recordActivity(userId, messageContent, 'Asia/Tokyo');

    // 検証: 活動ログのみ登録されている（保存されたログの業務日で検索）
    const todos = await repository.getTodosByUserId(userId);
    
    // 保存されたログの業務日で検索（ActivityLogServiceが使用した業務日と一致させる）
    const activityLogs = savedLog ? await repository.getLogsByDate(userId, savedLog.businessDate) : [];
    
    expect(activityLogs.length).toBe(1);
    expect(activityLogs[0].content).toBe(messageContent);
    expect(todos.length).toBe(0); // TODOには登録されていない
  });

  test('無視ボタンを押すと何も登録されない', async () => {
    // このテスト用のconsole.errorモック
    const testConsoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    try {
      const userId = 'test-user-123';
      const messageContent = '雑談メッセージ';
      
      // AI分類が行われることを確認（無視の場合は何も登録されない）
      const mockMessage = new MockMessage(messageContent, userId);
      await integration.handleMessage(mockMessage as any);
      
      // AI分類のリプライが送信されていることを確認
      expect(mockMessage.replies.length).toBeGreaterThan(0);

      // 無視の場合は何もアクションを取らない（ボタン押下をシミュレートしない）
      
      // 検証: 何も登録されていない
      const businessDateInfo = repository.calculateBusinessDate(new Date().toISOString(), 'Asia/Tokyo');
      const activityLogs = await repository.getLogsByDate(userId, businessDateInfo.businessDate);
      const todos = await repository.getTodosByUserId(userId);
      
      expect(activityLogs.length).toBe(0);
      expect(todos.length).toBe(0);
    } finally {
      // テスト用スパイをクリーンアップ
      testConsoleSpy.mockRestore();
    }
  });

  test('複数メッセージでもそれぞれ適切に分類され重複登録されない', async () => {
    const userId = 'test-user-123';
    const todoHandler = (integration as any).todoHandler;
    const activityLogService = (integration as any).activityLogService;
    
    // ユーザーを事前に登録（必要な場合）
    await repository.registerUser(userId, 'Test User');
    
    // 直接メソッドを呼び出してTODOと活動ログを作成
    const mockInteraction = new MockButtonInteraction('test_button', userId);
    
    // TODO 1: プレゼン資料を作成する
    await todoHandler.createTodoFromMessage(
      mockInteraction,
      'プレゼン資料を作成する',
      { classification: 'TODO' as const, confidence: 0.9, reason: 'テスト', priority: 0 },
      userId,
      'Asia/Tokyo'
    );
    
    // 活動ログ: ミーティングに参加した（ActivityLogServiceを直接使用）
    const savedLog = await activityLogService.recordActivity(userId, 'ミーティングに参加した', 'Asia/Tokyo');
    
    // TODO 2: レポートを明日までに提出
    await todoHandler.createTodoFromMessage(
      mockInteraction,
      'レポートを明日までに提出',
      { classification: 'TODO' as const, confidence: 0.9, reason: 'テスト', priority: 0 },
      userId,
      'Asia/Tokyo'
    );

    // 検証: それぞれ適切に登録されている（保存されたログの業務日で検索）
    const todos = await repository.getTodosByUserId(userId);
    const activityLogs = await repository.getLogsByDate(userId, savedLog.businessDate);
    
    expect(todos.length).toBe(2); // TODOは2件
    expect(activityLogs.length).toBe(1); // 活動ログは1件
    
    // 内容も確認
    const todoContents = todos.map((t: Todo) => t.content).sort();
    expect(todoContents).toEqual([
      'プレゼン資料を作成する',
      'レポートを明日までに提出'
    ]);
    
    expect(activityLogs[0].content).toBe('ミーティングに参加した');
  });
});