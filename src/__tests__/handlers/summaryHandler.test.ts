/**
 * SummaryHandler テスト
 * サマリーコマンドとキャッシュ動作の確認
 */

import { SummaryHandler } from '../../handlers/summaryHandler';
import { Message } from 'discord.js';
import { DailyAnalysisResult } from '../../types/activityLog';

// Discordメッセージのモック
class MockMessage {
  public content: string;
  public author: { id: string; bot: boolean; tag: string };
  public guild: null = null;
  public channel: { isDMBased: () => boolean } = { isDMBased: () => true };
  public replies: string[] = [];
  public edits: string[] = [];

  constructor(content: string, userId: string = '770478489203507241') {
    this.content = content;
    this.author = { id: userId, bot: false, tag: 'test-user' };
  }

  async reply(message: string): Promise<MockMessage> {
    this.replies.push(message);
    const progressMessage = new MockMessage('Progress message');
    // プログレスメッセージのeditメソッドをオーバーライド
    progressMessage.edit = async (content: string) => {
      this.edits.push(content);
    };
    return progressMessage;
  }

  async edit(message: string): Promise<void> {
    this.edits.push(message);
  }
}

// モック分析サービス
class MockUnifiedAnalysisService {
  private shouldUseCache = true;
  private analysisCallCount = 0;

  async analyzeDaily(request: any): Promise<DailyAnalysisResult> {
    this.analysisCallCount++;
    
    const result: DailyAnalysisResult = {
      businessDate: request.businessDate || '2025-06-30',
      totalLogCount: 5,
      generatedAt: new Date().toISOString(),
      categories: [
        {
          category: 'プログラミング',
          estimatedMinutes: 120,
          confidence: 0.9,
          logCount: 3,
          representativeActivities: ['コーディング', 'デバッグ']
        }
      ],
      timeline: [
        {
          startTime: '2025-06-30T09:00:00Z',
          endTime: '2025-06-30T11:00:00Z',
          category: 'プログラミング',
          content: 'TimeLoggerの開発',
          confidence: 0.9,
          sourceLogIds: ['log1', 'log2']
        }
      ],
      timeDistribution: {
        totalEstimatedMinutes: 120,
        workingMinutes: 120,
        breakMinutes: 0,
        unaccountedMinutes: 0,
        overlapMinutes: 0
      },
      insights: {
        productivityScore: 85,
        workBalance: {
          focusTimeRatio: 0.8,
          meetingTimeRatio: 0.1,
          breakTimeRatio: 0.1,
          adminTimeRatio: 0.0
        },
        highlights: ['集中してコーディングができた'],
        suggestions: ['休憩を増やすと良い'],
        motivation: '今日もお疲れさまでした！'
      },
      warnings: []
    };

    // forceRefreshがtrueの場合は必ず新しい分析を実行
    if (request.forceRefresh) {
      console.log('🔄 強制リフレッシュでの分析実行');
    }

    return result;
  }

  async getCachedAnalysis(userId: string, businessDate: string): Promise<DailyAnalysisResult | null> {
    if (this.shouldUseCache) {
      console.log('⚡ キャッシュから返却');
      return this.analyzeDaily({ userId, businessDate, forceRefresh: false });
    }
    return null;
  }

  getAnalysisCallCount(): number {
    return this.analysisCallCount;
  }

  setShouldUseCache(useCache: boolean): void {
    this.shouldUseCache = useCache;
  }
}

// モック活動ログサービス
class MockActivityLogService {
  calculateBusinessDate(timezone: string, inputTime?: string) {
    return {
      businessDate: '2025-06-30',
      timezone,
      inputTime: inputTime || new Date().toISOString()
    };
  }
}

describe('SummaryHandler', () => {
  let summaryHandler: SummaryHandler;
  let mockUnifiedAnalysisService: MockUnifiedAnalysisService;
  let mockActivityLogService: MockActivityLogService;

  beforeEach(() => {
    mockUnifiedAnalysisService = new MockUnifiedAnalysisService();
    mockActivityLogService = new MockActivityLogService();
    summaryHandler = new SummaryHandler(
      mockUnifiedAnalysisService as any,
      mockActivityLogService as any
    );
  });

  describe('基本的なサマリー機能', () => {
    test('通常のサマリーコマンドが正しく処理される', async () => {
      const mockMessage = new MockMessage('!summary');
      
      await summaryHandler.handle(mockMessage as unknown as Message, '770478489203507241', [], 'Asia/Tokyo');
      
      expect(mockMessage.replies.length).toBeGreaterThan(0);
      expect(mockMessage.edits.length).toBeGreaterThan(0);
      expect(mockMessage.edits[0]).toContain('活動サマリー');
      expect(mockMessage.edits[0]).toContain('プログラミング');
    });

    test('引数なしの場合は今日のサマリーが生成される', async () => {
      const mockMessage = new MockMessage('!summary');
      
      await summaryHandler.handle(mockMessage as unknown as Message, '770478489203507241', [], 'Asia/Tokyo');
      
      // 日付フォーマットがyyyy/MM/dd形式に変更されていることを確認
      expect(mockMessage.edits[0]).toContain('2025/06/30');
    });
  });

  describe('キャッシュとリフレッシュ機能', () => {
    test('refresh引数で強制リフレッシュが実行される', async () => {
      const mockMessage = new MockMessage('!summary refresh');
      
      const initialCallCount = mockUnifiedAnalysisService.getAnalysisCallCount();
      
      await summaryHandler.handle(mockMessage as unknown as Message, '770478489203507241', ['refresh'], 'Asia/Tokyo');
      
      expect(mockMessage.replies.length).toBeGreaterThan(0);
      expect(mockMessage.edits.length).toBeGreaterThan(0);
      expect(mockUnifiedAnalysisService.getAnalysisCallCount()).toBe(initialCallCount + 1);
    });

    test('通常のサマリーではキャッシュが使用される', async () => {
      mockUnifiedAnalysisService.setShouldUseCache(true);
      const mockMessage = new MockMessage('!summary');
      
      const initialCallCount = mockUnifiedAnalysisService.getAnalysisCallCount();
      
      await summaryHandler.handle(mockMessage as unknown as Message, '770478489203507241', [], 'Asia/Tokyo');
      
      expect(mockMessage.edits[0]).toContain('活動サマリー');
      // キャッシュが使用される場合でも分析は1回実行される（getCachedAnalysisの実装による）
      expect(mockUnifiedAnalysisService.getAnalysisCallCount()).toBe(initialCallCount + 1);
    });
  });

  describe('日付指定機能', () => {
    test('特定の日付でサマリーが生成される', async () => {
      const mockMessage = new MockMessage('!summary 2025-06-29');
      
      await summaryHandler.handle(mockMessage as unknown as Message, '770478489203507241', ['2025-06-29'], 'Asia/Tokyo');
      
      expect(mockMessage.edits[0]).toContain('活動サマリー');
    });

    test('昨日のサマリーが正しく処理される', async () => {
      const mockMessage = new MockMessage('!summary yesterday');
      
      await summaryHandler.handle(mockMessage as unknown as Message, '770478489203507241', ['yesterday'], 'Asia/Tokyo');
      
      expect(mockMessage.edits[0]).toContain('活動サマリー');
    });

    test('相対日付指定が正しく処理される', async () => {
      const mockMessage = new MockMessage('!summary -1');
      
      await summaryHandler.handle(mockMessage as unknown as Message, '770478489203507241', ['-1'], 'Asia/Tokyo');
      
      expect(mockMessage.edits[0]).toContain('活動サマリー');
    });
  });

  describe('ヘルプ機能', () => {
    test('ヘルプコマンドが正しく表示される', async () => {
      const mockMessage = new MockMessage('!summary help');
      
      await summaryHandler.handle(mockMessage as unknown as Message, '770478489203507241', ['help'], 'Asia/Tokyo');
      
      expect(mockMessage.replies.length).toBeGreaterThan(0);
      expect(mockMessage.replies[0]).toContain('サマリーコマンド');
      expect(mockMessage.replies[0]).toContain('refresh');
      expect(mockMessage.replies[0]).toContain('キャッシュを無視して再分析');
    });
  });

  describe('エラーハンドリング', () => {
    test('無効な日付形式でエラーメッセージが表示される', async () => {
      const mockMessage = new MockMessage('!summary 2025-13-40');
      
      await summaryHandler.handle(mockMessage as unknown as Message, '770478489203507241', ['2025-13-40'], 'Asia/Tokyo');
      
      expect(mockMessage.replies.length).toBeGreaterThan(0);
      expect(mockMessage.replies[0]).toContain('❌');
    });

    test('未来の日付でエラーメッセージが表示される', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);
      const futureDateStr = futureDate.toISOString().split('T')[0];
      
      const mockMessage = new MockMessage(`!summary ${futureDateStr}`);
      
      await summaryHandler.handle(mockMessage as unknown as Message, '770478489203507241', [futureDateStr], 'Asia/Tokyo');
      
      expect(mockMessage.replies.length).toBeGreaterThan(0);
      expect(mockMessage.replies[0]).toContain('❌');
    });

  });
});