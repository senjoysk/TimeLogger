/**
 * 統合サマリーサービステスト
 * シンプル化された基本サマリー機能のテスト
 * 
 * 活動ログとTODO情報を統合したシンプルなサマリー機能のテスト
 */

import { IntegratedSummaryService } from '../../services/integratedSummaryService';
import { ActivityLog } from '../../types/activityLog';
import { Todo } from '../../types/todo';
import { 
  IntegratedSummaryResult, 
  TodoSummary
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
  let mockUnifiedAnalysisService: MockUnifiedAnalysisService;

  beforeEach(() => {
    mockRepository = new MockRepository();
    mockUnifiedAnalysisService = new MockUnifiedAnalysisService();
    
    service = new IntegratedSummaryService(
      mockRepository as any,
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
      expect(result.generatedAt).toBeDefined();
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


    test('空のデータでもエラーにならずサマリーを生成する', async () => {
      const userId = 'test-user';
      const businessDate = '2024-01-15';
      const timezone = 'Asia/Tokyo';

      const result = await service.generateIntegratedSummary(userId, businessDate, timezone);

      expect(result).toBeDefined();
      expect(result.todoSummary.totalTodos).toBe(0);
      expect(result.todoSummary.completionRate).toBe(0);
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
      expect(formatted).toContain('完了:'); // 完了件数の表示
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


});