import { CommandManager } from '../../handlers/commandManager';
import { ActivityHandler } from '../../handlers/activityHandler';
import { SummaryHandler } from '../../handlers/summaryHandler';
import { CostReportHandler } from '../../handlers/costReportHandler';
import { TimezoneCommandHandler } from '../../handlers/timezoneCommandHandler';
import { SummaryCommandHandler } from '../../handlers/summaryCommandHandler';
import { CostCommandHandler } from '../../handlers/costCommandHandler';
import { SqliteRepository } from '../../repositories/sqliteRepository';
import { GeminiService } from '../../services/geminiService';
import { ActivityService } from '../../services/activityService';
import { SummaryService } from '../../services/summaryService';
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

// テスト用のメッセージモック作成ヘルパー
const createMockMessage = (content: string, userId: string = 'test-user-123') => ({
  content,
  author: { id: userId, tag: 'TestUser#1234' },
  reply: jest.fn().mockResolvedValue(undefined),
  channel: { isDMBased: () => true }
} as unknown as Message);

// テスト用のリアルなサービス統合（モック最小限）
describe('E2E User Scenarios', () => {
  let commandManager: CommandManager;
  let repository: SqliteRepository;
  let geminiService: GeminiService;
  let activityService: ActivityService;
  let summaryService: SummaryService;

  beforeAll(async () => {
    // テスト用のモック環境設定
    process.env.GOOGLE_API_KEY = 'test-api-key';
    
    try {
      // リアルなサービスを使用（外部API呼び出しのみモック）
      repository = new SqliteRepository(':memory:');
      await repository.initialize();

      // GeminiServiceのAPI呼び出しをモック
      geminiService = new GeminiService(repository);
      jest.spyOn(geminiService, 'analyzeActivity').mockResolvedValue({
        category: 'プログラミング',
        subCategory: 'バックエンド開発',
        productivityLevel: 4,
        structuredContent: 'Discord Botの開発作業',
        estimatedMinutes: 30,
        startTime: '2025-06-27T10:00:00Z',
        endTime: '2025-06-27T10:30:00Z'
      });

      jest.spyOn(geminiService, 'generateDailySummary').mockResolvedValue({
        date: '2025-06-27',
        categoryTotals: [],
        totalMinutes: 30,
        generatedAt: '2025-06-27T18:00:00Z',
        insights: 'プログラミングに集中して取り組んでいました。',
        motivation: '明日も頑張りましょう！'
      });

      jest.spyOn(geminiService, 'getDailyCostReport').mockResolvedValue('今日のAPI使用料: $0.05');
      jest.spyOn(geminiService, 'checkCostAlerts').mockResolvedValue(null);

      // サービス初期化
      activityService = new ActivityService(repository, geminiService);
      summaryService = new SummaryService(repository, geminiService);

      // ハンドラー作成
      const activityHandler = new ActivityHandler(activityService);
      const summaryHandler = new SummaryHandler(summaryService);
      const costReportHandler = new CostReportHandler(geminiService);

      // CommandManager初期化
      commandManager = new CommandManager(activityHandler, summaryHandler, costReportHandler);

      // コマンドハンドラー登録
      const timezoneHandler = new TimezoneCommandHandler(repository);
      const summaryCommandHandler = new SummaryCommandHandler(summaryService);
      const costCommandHandler = new CostCommandHandler(geminiService);

      commandManager.registerCommandHandler('timezone', timezoneHandler);
      commandManager.registerCommandHandler('summary', summaryCommandHandler);
      commandManager.registerCommandHandler('cost', costCommandHandler);
    } catch (error) {
      console.error('Setup failed:', error);
      throw error;
    }
  }, 30000); // 30秒のタイムアウト

  afterAll(async () => {
    await repository.close();
  });

  describe('🎯 ユーザーの典型的な1日のシナリオ', () => {
    const testUserId = 'scenario-user-123';
    const userTimezone = 'Asia/Tokyo';

    test('シナリオ1: 初回利用ユーザーの完全フロー', async () => {
      // Step 1: タイムゾーン設定
      const timezoneMessage = createMockMessage('!timezone set Asia/Tokyo', testUserId);
      const timezoneResult = await commandManager.handleMessage(timezoneMessage, userTimezone);
      expect(timezoneResult).toBe(true);
      expect(timezoneMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('タイムゾーンを `Asia/Tokyo` に設定しました')
      );

      // Step 2: 朝の活動記録
      const morningActivity = createMockMessage('朝のミーティングに参加していました', testUserId);
      const morningResult = await commandManager.handleMessage(morningActivity, userTimezone);
      expect(morningResult).toBe(true);
      expect(morningActivity.reply).toHaveBeenCalledWith(
        expect.stringContaining('📝 **活動記録を保存しました！**')
      );

      // Step 3: 追加の活動記録
      const codingActivity = createMockMessage('プログラミングをしていました', testUserId);
      const codingResult = await commandManager.handleMessage(codingActivity, userTimezone);
      expect(codingResult).toBe(true);

      // Step 4: サマリー確認
      const summaryRequest = createMockMessage('!summary', testUserId);
      const summaryResult = await commandManager.handleMessage(summaryRequest, userTimezone);
      expect(summaryResult).toBe(true);
      expect(summaryRequest.reply).toHaveBeenCalledWith(
        expect.stringContaining('📊 **')
      );

      // Step 5: コスト確認
      const costRequest = createMockMessage('!cost', testUserId);
      const costResult = await commandManager.handleMessage(costRequest, userTimezone);
      expect(costResult).toBe(true);
      expect(costRequest.reply).toHaveBeenCalledWith(
        expect.stringContaining('今日のAPI使用料')
      );
    });

    test('シナリオ2: 自然言語でのサマリー要求', async () => {
      // 自然言語でのサマリー要求
      const naturalSummary = createMockMessage('今日のサマリーを見せて', testUserId);
      const result = await commandManager.handleMessage(naturalSummary, userTimezone);
      
      expect(result).toBe(true);
      expect(naturalSummary.reply).toHaveBeenCalled();
    });

    test('シナリオ3: コスト関連の自然言語要求', async () => {
      // 自然言語でのコスト要求
      const naturalCost = createMockMessage('API費用を確認したい', testUserId);
      const result = await commandManager.handleMessage(naturalCost, userTimezone);
      
      expect(result).toBe(true);
      expect(naturalCost.reply).toHaveBeenCalled();
    });

    test('シナリオ4: エラーケース処理', async () => {
      // 不正なコマンド
      const invalidCommand = createMockMessage('!invalid', testUserId);
      const result = await commandManager.handleMessage(invalidCommand, userTimezone);
      
      expect(result).toBe(true);
      expect(invalidCommand.reply).toHaveBeenCalledWith(
        expect.stringContaining('不明なコマンドです')
      );
      expect(invalidCommand.reply).toHaveBeenCalledWith(
        expect.stringContaining('利用可能なコマンド')
      );
    });
  });

  describe('🔧 クリティカルコマンドの動作保証', () => {
    const criticalCommands = [
      { command: '!timezone', description: 'タイムゾーン設定' },
      { command: '!summary', description: 'サマリー表示' },
      { command: '!cost', description: 'コストレポート' },
      { command: '!timezone set Asia/Tokyo', description: 'タイムゾーン設定（引数付き）' },
      { command: '!summary 2025-06-27', description: 'サマリー表示（日付指定）' }
    ];

    test.each(criticalCommands)('$description ($command) が正常に動作する', async ({ command }) => {
      const message = createMockMessage(command);
      const result = await commandManager.handleMessage(message, 'Asia/Tokyo');
      
      expect(result).toBe(true);
      // 不明なコマンドエラーが出ないことを確認
      expect(message.reply).not.toHaveBeenCalledWith(
        expect.stringContaining('不明なコマンドです')
      );
    });
  });

  describe('📊 データの整合性確認', () => {
    test('活動記録からサマリー生成までのデータフロー', async () => {
      const userId = 'data-flow-test-user';
      
      // 1. 活動記録を作成
      const activityMessage = createMockMessage('データフローのテストをしています', userId);
      await commandManager.handleMessage(activityMessage, 'Asia/Tokyo');
      
      // 2. データベースに記録が保存されていることを確認
      const records = await repository.getActivityRecords(userId, 'Asia/Tokyo');
      expect(records.length).toBeGreaterThan(0);
      
      // 3. サマリーが生成できることを確認
      const summaryMessage = createMockMessage('!summary', userId);
      await commandManager.handleMessage(summaryMessage, 'Asia/Tokyo');
      
      expect(summaryMessage.reply).toHaveBeenCalled();
    });
  });

  describe('🚨 エラー回復シナリオ', () => {
    test('外部API障害時の適切なエラーレスポンス', async () => {
      // GeminiService APIエラーをシミュレート
      jest.spyOn(geminiService, 'analyzeActivity').mockRejectedValueOnce(new Error('API Error'));
      
      const message = createMockMessage('API障害テスト');
      const result = await commandManager.handleMessage(message, 'Asia/Tokyo');
      
      expect(result).toBe(true);
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('AI分析サービスの処理中にエラーが発生しました')
      );
      
      // モックを復元
      jest.restoreAllMocks();
    });
  });
});