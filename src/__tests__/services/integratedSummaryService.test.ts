/**
 * 統合サマリーサービステスト
 * TDD開発: Red Phase - まず失敗するテストを書く
 * 
 * 活動ログとTODO情報を統合したサマリー機能のテスト
 */

import { IntegratedSummaryService } from '../../services/integratedSummaryService';
import { ActivityLog } from '../../types/activityLog';
import { Todo } from '../../types/todo';
import { 
  IntegratedSummaryResult, 
  TodoSummary, 
  CorrelationInsights,
  ProductivityMetrics 
} from '../../types/integratedSummary';

// モック実装
class MockRepository {
  private activities: ActivityLog[] = [];
  private todos: Todo[] = [];

  // ActivityLog操作
  async getLogsByDate(userId: string, businessDate: string): Promise<ActivityLog[]> {
    return this.activities.filter(activity => 
      activity.userId === userId && activity.businessDate === businessDate
    );
  }

  // Todo操作
  async getTodosByUserId(userId: string): Promise<Todo[]> {
    return this.todos.filter(todo => todo.userId === userId);
  }

  async getTodosByDateRange(userId: string, startDate: string, endDate: string): Promise<Todo[]> {
    return this.todos.filter(todo => 
      todo.userId === userId &&
      todo.createdAt >= startDate &&
      todo.createdAt <= endDate
    );
  }

  // テスト用データ追加メソッド
  addActivity(activity: ActivityLog): void {
    this.activities.push(activity);
  }

  addTodo(todo: Todo): void {
    this.todos.push(todo);
  }

  clearData(): void {
    this.activities = [];
    this.todos = [];
  }
}

// モックサービス
class MockActivityTodoCorrelationService {
  async analyzeActivityTodoCorrelation(userId: string, businessDate: string, timezone: string) {
    return {
      correlations: [],
      stats: {
        totalActivities: 1,
        totalTodos: 1,
        correlatedPairs: 1,
        autoLinkRecommendations: 0,
        manualReviewRecommendations: 1
      },
      analysisTimestamp: new Date().toISOString()
    };
  }

  async generateProductivityInsights(userId: string, businessDate: string, timezone: string) {
    return {
      completionRate: 0.8,
      averageTaskDuration: 90,
      mostProductiveHours: ['09:00-10:00', '14:00-15:00'],
      efficiencyScore: 85,
      recommendations: ['効率的に作業できています'],
      performanceTrend: 'improving' as const
    };
  }

  async suggestTodoCompletions(userId: string, businessDate: string, timezone: string) {
    return [
      {
        todoId: 'todo-1',
        todoContent: 'テストタスク',
        completionConfidence: 0.9,
        reason: '完了の兆候があります',
        relatedActivityIds: ['activity-1'],
        suggestedCompletionTime: '2024-01-15T10:00:00Z'
      }
    ];
  }
}

class MockUnifiedAnalysisService {
  async analyzeDaily(request: any) {
    return {
      businessDate: request.businessDate,
      totalLogCount: 5,
      categories: [
        {
          category: 'Work',
          estimatedMinutes: 120,
          confidence: 0.8,
          logCount: 3,
          representativeActivities: ['プロジェクト作業', 'ミーティング']
        }
      ],
      timeline: [
        {
          startTime: '2024-01-15T09:00:00Z',
          endTime: '2024-01-15T11:00:00Z',
          category: 'Work',
          content: 'プロジェクト作業',
          confidence: 0.8,
          sourceLogIds: ['log-1', 'log-2']
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
          focusTimeRatio: 0.7,
          meetingTimeRatio: 0.2,
          breakTimeRatio: 0.1,
          adminTimeRatio: 0.0
        },
        suggestions: ['集中時間を増やしましょう'],
        highlights: ['効率的な作業ができました'],
        motivation: '今日も頑張りました！'
      },
      warnings: [],
      generatedAt: new Date().toISOString()
    };
  }
}

describe('IntegratedSummaryService', () => {
  let service: IntegratedSummaryService;
  let mockRepository: MockRepository;
  let mockCorrelationService: MockActivityTodoCorrelationService;
  let mockUnifiedAnalysisService: MockUnifiedAnalysisService;

  beforeEach(() => {
    mockRepository = new MockRepository();
    mockCorrelationService = new MockActivityTodoCorrelationService();
    mockUnifiedAnalysisService = new MockUnifiedAnalysisService();
    
    service = new IntegratedSummaryService(
      mockRepository as any,
      mockCorrelationService as any,
      mockUnifiedAnalysisService as any
    );
  });

  afterEach(() => {
    mockRepository.clearData();
  });

  describe('generateIntegratedSummary', () => {
    test('活動ログとTODOを統合したサマリーを生成する', async () => {
      // テストデータ準備
      const userId = 'test-user';
      const businessDate = '2024-01-15';
      const timezone = 'Asia/Tokyo';

      // 活動ログを追加
      mockRepository.addActivity({
        id: 'activity-1',
        userId,
        content: 'プロジェクト作業を実施',
        inputTimestamp: '2024-01-15T09:00:00Z',
        businessDate,
        isDeleted: false,
        createdAt: '2024-01-15T09:00:00Z',
        updatedAt: '2024-01-15T09:00:00Z',
        startTime: '2024-01-15T09:00:00Z',
        totalMinutes: 120,
        categories: 'Work'
      });

      // TODOを追加
      mockRepository.addTodo({
        id: 'todo-1',
        userId,
        content: 'プロジェクト作業を完了する',
        status: 'completed',
        priority: 1,
        createdAt: '2024-01-15T08:00:00Z',
        updatedAt: '2024-01-15T11:00:00Z',
        completedAt: '2024-01-15T11:00:00Z',
        sourceType: 'manual'
      });

      const result = await service.generateIntegratedSummary(userId, businessDate, timezone);

      expect(result).toBeDefined();
      expect(result.businessDate).toBe(businessDate);
      expect(result.activitySummary).toBeDefined();
      expect(result.todoSummary).toBeDefined();
      expect(result.correlationInsights).toBeDefined();
      expect(result.productivityMetrics).toBeDefined();
      expect(result.recommendations).toBeInstanceOf(Array);
    });

    test('TODOサマリーが正しく生成される', async () => {
      const userId = 'test-user';
      const businessDate = '2024-01-15';
      const timezone = 'Asia/Tokyo';

      // 複数のTODOを追加
      mockRepository.addTodo({
        id: 'todo-1',
        userId,
        content: '完了したタスク',
        status: 'completed',
        priority: 1,
        createdAt: '2024-01-15T08:00:00Z',
        updatedAt: '2024-01-15T10:00:00Z',
        completedAt: '2024-01-15T10:00:00Z',
        sourceType: 'manual'
      });

      mockRepository.addTodo({
        id: 'todo-2',
        userId,
        content: '進行中のタスク',
        status: 'in_progress',
        priority: 2,
        createdAt: '2024-01-15T09:00:00Z',
        updatedAt: '2024-01-15T09:00:00Z',
        sourceType: 'ai_classified'
      });

      mockRepository.addTodo({
        id: 'todo-3',
        userId,
        content: '保留中のタスク',
        status: 'pending',
        priority: 0,
        createdAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-15T10:00:00Z',
        sourceType: 'manual'
      });

      const result = await service.generateIntegratedSummary(userId, businessDate, timezone);

      expect(result.todoSummary.totalTodos).toBe(3);
      expect(result.todoSummary.completedTodos).toBe(1);
      expect(result.todoSummary.inProgressTodos).toBe(1);
      expect(result.todoSummary.pendingTodos).toBe(1);
      expect(result.todoSummary.completionRate).toBe(1/3);
      expect(result.todoSummary.aiClassifiedCount).toBe(1);
      expect(result.todoSummary.manualCreatedCount).toBe(2);
    });

    test('相関インサイトが正しく生成される', async () => {
      const userId = 'test-user';
      const businessDate = '2024-01-15';
      const timezone = 'Asia/Tokyo';

      const result = await service.generateIntegratedSummary(userId, businessDate, timezone);

      expect(result.correlationInsights).toBeDefined();
      expect(result.correlationInsights.correlatedPairs).toBe(1);
      expect(result.correlationInsights.autoLinkOpportunities).toBe(0);
      expect(result.correlationInsights.completionSuggestions).toBeInstanceOf(Array);
      expect(result.correlationInsights.completionSuggestions).toHaveLength(1);
      expect(result.correlationInsights.completionSuggestions[0].completionConfidence).toBeGreaterThan(0.8);
    });

    test('生産性メトリクスが正しく計算される', async () => {
      const userId = 'test-user';
      const businessDate = '2024-01-15';
      const timezone = 'Asia/Tokyo';

      const result = await service.generateIntegratedSummary(userId, businessDate, timezone);

      expect(result.productivityMetrics).toBeDefined();
      expect(result.productivityMetrics.overallScore).toBe(85);
      expect(result.productivityMetrics.todoCompletionRate).toBe(0.8);
      expect(result.productivityMetrics.averageTaskDuration).toBe(90);
      expect(result.productivityMetrics.efficiencyTrend).toBe('improving');
      expect(result.productivityMetrics.mostProductiveHours).toContain('09:00-10:00');
    });

    test('統合推奨事項が生成される', async () => {
      const userId = 'test-user';
      const businessDate = '2024-01-15';
      const timezone = 'Asia/Tokyo';

      const result = await service.generateIntegratedSummary(userId, businessDate, timezone);

      expect(result.recommendations).toBeInstanceOf(Array);
      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.recommendations[0]).toHaveProperty('type');
      expect(result.recommendations[0]).toHaveProperty('content');
      expect(result.recommendations[0]).toHaveProperty('priority');
    });

    test('空のデータでもエラーにならずサマリーを生成する', async () => {
      const userId = 'test-user';
      const businessDate = '2024-01-15';
      const timezone = 'Asia/Tokyo';

      const result = await service.generateIntegratedSummary(userId, businessDate, timezone);

      expect(result).toBeDefined();
      expect(result.todoSummary.totalTodos).toBe(0);
      expect(result.todoSummary.completionRate).toBe(0);
      expect(result.correlationInsights.correlatedPairs).toBe(1); // モックサービスの値
    });
  });

  describe('formatIntegratedSummaryForDiscord', () => {
    test('Discord用にフォーマットされたサマリーを生成する', async () => {
      const userId = 'test-user';
      const businessDate = '2024-01-15';
      const timezone = 'Asia/Tokyo';

      // テストデータを準備
      mockRepository.addTodo({
        id: 'todo-1',
        userId,
        content: 'テストタスク',
        status: 'completed',
        priority: 1,
        createdAt: '2024-01-15T08:00:00Z',
        updatedAt: '2024-01-15T10:00:00Z',
        completedAt: '2024-01-15T10:00:00Z',
        sourceType: 'manual'
      });

      const summary = await service.generateIntegratedSummary(userId, businessDate, timezone);
      const formatted = service.formatIntegratedSummaryForDiscord(summary, timezone);

      expect(typeof formatted).toBe('string');
      expect(formatted).toContain('📊'); // サマリーのヘッダー絵文字
      expect(formatted).toContain('📝'); // TODO絵文字
      expect(formatted).toContain('🔗'); // 相関分析絵文字
      expect(formatted).toContain('⭐'); // 生産性スコア絵文字
      expect(formatted).toContain('完了率');
      expect(formatted).toContain('総合スコア');
    });

    test('長いサマリーが適切に切り詰められる', async () => {
      const userId = 'test-user';
      const businessDate = '2024-01-15';
      const timezone = 'Asia/Tokyo';

      const summary = await service.generateIntegratedSummary(userId, businessDate, timezone);
      const formatted = service.formatIntegratedSummaryForDiscord(summary, timezone);

      // Discordの文字数制限（2000文字）を確認
      expect(formatted.length).toBeLessThanOrEqual(2000);
    });
  });

  describe('calculateIntegratedMetrics', () => {
    test('統合メトリクスが正しく計算される', async () => {
      const userId = 'test-user';
      const businessDate = '2024-01-15';
      const timezone = 'Asia/Tokyo';

      // TODOデータを準備
      mockRepository.addTodo({
        id: 'todo-1',
        userId,
        content: 'タスク1',
        status: 'completed',
        priority: 1,
        createdAt: '2024-01-15T08:00:00Z',
        updatedAt: '2024-01-15T10:00:00Z',
        completedAt: '2024-01-15T10:00:00Z',
        sourceType: 'manual'
      });

      const metrics = await service.calculateIntegratedMetrics(userId, businessDate, timezone);

      expect(metrics).toBeDefined();
      expect(typeof metrics.todoActivityAlignment).toBe('number');
      expect(typeof metrics.completionPredictionAccuracy).toBe('number');
      expect(typeof metrics.timeEstimationAccuracy).toBe('number');
      expect(metrics.todoActivityAlignment).toBeGreaterThanOrEqual(0);
      expect(metrics.todoActivityAlignment).toBeLessThanOrEqual(1);
    });
  });

  describe('generateWeeklySummary', () => {
    test('週次統合サマリーを生成する', async () => {
      const userId = 'test-user';
      const endDate = '2024-01-15';
      const timezone = 'Asia/Tokyo';

      // 週間データを準備
      for (let i = 0; i < 7; i++) {
        const date = new Date('2024-01-15');
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];

        mockRepository.addTodo({
          id: `todo-${i}`,
          userId,
          content: `タスク${i}`,
          status: i % 2 === 0 ? 'completed' : 'pending',
          priority: 1,
          createdAt: `${dateStr}T08:00:00Z`,
          updatedAt: `${dateStr}T10:00:00Z`,
          completedAt: i % 2 === 0 ? `${dateStr}T10:00:00Z` : undefined,
          sourceType: 'manual'
        });
      }

      const weeklySummary = await service.generateWeeklySummary(userId, endDate, timezone);

      expect(weeklySummary).toBeDefined();
      expect(weeklySummary.period.endDate).toBe(endDate);
      expect(weeklySummary.dailySummaries).toHaveLength(7);
      expect(weeklySummary.weeklyMetrics).toBeDefined();
      expect(weeklySummary.weeklyMetrics.averageCompletionRate).toBeGreaterThanOrEqual(0);
      expect(weeklySummary.weeklyTrends).toBeDefined();
    });
  });
});