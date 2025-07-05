/**
 * 活動ログとTODO相関分析サービステスト
 * TDD開発: Red Phase - まず失敗するテストを書く
 */

import { ActivityTodoCorrelationService } from '../../services/activityTodoCorrelationService';
import { SqliteActivityLogRepository } from '../../repositories/sqliteActivityLogRepository';
import { ActivityLog } from '../../types/activityLog';
import { Todo } from '../../types/todo';
import { ActivityTodoCorrelationResult, TodoCompletionSuggestion, ProductivityInsights, AutoLinkResult } from '../../types/correlation';

// モック実装
class MockActivityLogRepository {
  private activities: ActivityLog[] = [];
  private todos: Todo[] = [];

  // ActivityLog操作
  async getActivityRecords(userId: string, timezone: string, businessDate?: string): Promise<ActivityLog[]> {
    return this.activities.filter(activity => 
      activity.userId === userId && 
      (!businessDate || activity.businessDate === businessDate)
    );
  }

  // Todo操作
  async getTodosByUserId(userId: string): Promise<Todo[]> {
    return this.todos.filter(todo => todo.userId === userId);
  }

  async createTodo(request: any): Promise<Todo> {
    const todo: Todo = {
      id: `todo-${Date.now()}`,
      userId: request.userId,
      content: request.content,
      status: 'pending',
      priority: request.priority || 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sourceType: request.sourceType || 'manual',
      relatedActivityId: request.relatedActivityId
    };
    this.todos.push(todo);
    return todo;
  }

  async updateTodo(id: string, update: any): Promise<void> {
    const todo = this.todos.find(t => t.id === id);
    if (todo) {
      Object.assign(todo, update);
      todo.updatedAt = new Date().toISOString();
    }
  }

  // テスト用データ追加メソッド
  addActivity(activity: ActivityLog): void {
    this.activities.push(activity);
  }

  addTodo(todo: Todo): void {
    this.todos.push(todo);
  }
}

describe('ActivityTodoCorrelationService', () => {
  let service: ActivityTodoCorrelationService;
  let mockRepository: MockActivityLogRepository;

  beforeEach(() => {
    mockRepository = new MockActivityLogRepository();
    service = new ActivityTodoCorrelationService(mockRepository as any);
  });

  describe('analyzeActivityTodoCorrelation', () => {
    test('活動ログとTODOの相関を正しく分析する', async () => {
      // テストデータ準備
      const userId = 'test-user';
      const businessDate = '2024-01-15';
      
      // 関連する活動ログを追加
      mockRepository.addActivity({
        id: 'activity-1',
        userId,
        content: 'プレゼン資料を作成している',
        inputTimestamp: '2024-01-15T09:00:00Z',
        businessDate,
        isDeleted: false,
        createdAt: '2024-01-15T09:00:00Z',
        updatedAt: '2024-01-15T09:00:00Z',
        startTime: '2024-01-15T09:00:00Z',
        totalMinutes: 120,
        categories: 'Work'
      });

      // 関連するTODOを追加
      mockRepository.addTodo({
        id: 'todo-1',
        userId,
        content: 'プレゼン資料を完成させる',
        status: 'pending',
        priority: 1,
        createdAt: '2024-01-15T08:00:00Z',
        updatedAt: '2024-01-15T08:00:00Z',
        sourceType: 'manual',
        relatedActivityId: 'activity-1'
      });

      const result = await service.analyzeActivityTodoCorrelation(userId, businessDate, 'Asia/Tokyo');

      expect(result).toBeDefined();
      expect(result.correlations).toHaveLength(1);
      expect(result.correlations[0].activityId).toBe('activity-1');
      expect(result.correlations[0].todoId).toBe('todo-1');
      expect(result.correlations[0].similarity).toBeGreaterThan(0.3);
      expect(result.stats.totalActivities).toBe(1);
      expect(result.stats.totalTodos).toBe(1);
      expect(result.stats.correlatedPairs).toBe(1);
    });

    test('類似性の低い活動とTODOが適切にフィルタリングされる', async () => {
      const userId = 'test-user';
      const businessDate = '2024-01-15';
      
      // 関連性の低い活動ログ
      mockRepository.addActivity({
        id: 'activity-1',
        userId,
        content: '散歩をしている',
        inputTimestamp: '2024-01-15T09:00:00Z',
        businessDate,
        isDeleted: false,
        createdAt: '2024-01-15T09:00:00Z',
        updatedAt: '2024-01-15T09:00:00Z',
        startTime: '2024-01-15T09:00:00Z',
        totalMinutes: 30,
        categories: 'Personal'
      });

      // 関連性の低いTODO
      mockRepository.addTodo({
        id: 'todo-1',
        userId,
        content: 'プログラミングの勉強をする',
        status: 'pending',
        priority: 0,
        createdAt: '2024-01-15T08:00:00Z',
        updatedAt: '2024-01-15T08:00:00Z',
        sourceType: 'manual'
      });

      const result = await service.analyzeActivityTodoCorrelation(userId, businessDate, 'Asia/Tokyo');

      expect(result.correlations).toHaveLength(0);
      expect(result.stats.totalActivities).toBe(1);
      expect(result.stats.totalTodos).toBe(1);
      expect(result.stats.correlatedPairs).toBe(0);
    });

    test('既に関連付けられた活動とTODOが検出される', async () => {
      const userId = 'test-user';
      const businessDate = '2024-01-15';
      
      mockRepository.addActivity({
        id: 'activity-1',
        userId,
        content: 'レポート作成を書いている',
        inputTimestamp: '2024-01-15T09:00:00Z',
        businessDate,
        isDeleted: false,
        createdAt: '2024-01-15T09:00:00Z',
        updatedAt: '2024-01-15T09:00:00Z',
        startTime: '2024-01-15T09:00:00Z',
        totalMinutes: 60,
        categories: 'Work'
      });

      mockRepository.addTodo({
        id: 'todo-1',
        userId,
        content: 'レポート作成をする',
        status: 'in_progress',
        priority: 1,
        createdAt: '2024-01-15T08:00:00Z',
        updatedAt: '2024-01-15T09:30:00Z',
        sourceType: 'manual',
        relatedActivityId: 'activity-1'
      });

      const result = await service.analyzeActivityTodoCorrelation(userId, businessDate, 'Asia/Tokyo');

      expect(result.correlations).toHaveLength(1);
      expect(result.correlations[0].isAlreadyLinked).toBe(true);
    });
  });

  describe('suggestTodoCompletions', () => {
    test('完了可能なTODOの提案を生成する', async () => {
      const userId = 'test-user';
      const businessDate = '2024-01-15';
      
      // 作業中の活動ログ
      mockRepository.addActivity({
        id: 'activity-1',
        userId,
        content: 'ドキュメント作成を完成させた',
        inputTimestamp: '2024-01-15T09:00:00Z',
        businessDate,
        isDeleted: false,
        createdAt: '2024-01-15T09:00:00Z',
        updatedAt: '2024-01-15T09:00:00Z',
        startTime: '2024-01-15T09:00:00Z',
        totalMinutes: 180,
        categories: 'Work'
      });

      // 対応するTODO
      mockRepository.addTodo({
        id: 'todo-1',
        userId,
        content: 'ドキュメント作成をする',
        status: 'in_progress',
        priority: 1,
        createdAt: '2024-01-15T08:00:00Z',
        updatedAt: '2024-01-15T09:00:00Z',
        sourceType: 'manual'
      });

      const suggestions = await service.suggestTodoCompletions(userId, businessDate, 'Asia/Tokyo');

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].todoId).toBe('todo-1');
      expect(suggestions[0].completionConfidence).toBeGreaterThan(0.3);
      expect(suggestions[0].reason).toContain('活動');
    });

    test('完了の兆候がない場合は提案されない', async () => {
      const userId = 'test-user';
      const businessDate = '2024-01-15';
      
      mockRepository.addActivity({
        id: 'activity-1',
        userId,
        content: 'プロジェクトの調査を開始した',
        inputTimestamp: '2024-01-15T09:00:00Z',
        businessDate,
        isDeleted: false,
        createdAt: '2024-01-15T09:00:00Z',
        updatedAt: '2024-01-15T09:00:00Z',
        startTime: '2024-01-15T09:00:00Z',
        totalMinutes: 60,
        categories: 'Work'
      });

      mockRepository.addTodo({
        id: 'todo-1',
        userId,
        content: 'プロジェクトの調査',
        status: 'in_progress',
        priority: 0,
        createdAt: '2024-01-15T08:00:00Z',
        updatedAt: '2024-01-15T09:00:00Z',
        sourceType: 'manual'
      });

      const suggestions = await service.suggestTodoCompletions(userId, businessDate, 'Asia/Tokyo');

      expect(suggestions).toHaveLength(0);
    });
  });

  describe('generateProductivityInsights', () => {
    test('生産性インサイトを生成する', async () => {
      const userId = 'test-user';
      const businessDate = '2024-01-15';
      
      // 複数の活動とTODOを設定
      mockRepository.addActivity({
        id: 'activity-1',
        userId,
        content: 'タスクAを完了した',
        inputTimestamp: '2024-01-15T09:00:00Z',
        businessDate,
        isDeleted: false,
        createdAt: '2024-01-15T09:00:00Z',
        updatedAt: '2024-01-15T09:00:00Z',
        startTime: '2024-01-15T09:00:00Z',
        totalMinutes: 120,
        categories: 'Work'
      });

      mockRepository.addTodo({
        id: 'todo-1',
        userId,
        content: 'タスクAを完了する',
        status: 'completed',
        priority: 1,
        createdAt: '2024-01-15T08:00:00Z',
        updatedAt: '2024-01-15T11:00:00Z',
        completedAt: '2024-01-15T11:00:00Z',
        sourceType: 'manual',
        relatedActivityId: 'activity-1'
      });

      const insights = await service.generateProductivityInsights(userId, businessDate, 'Asia/Tokyo');

      expect(insights).toBeDefined();
      expect(insights.completionRate).toBe(1.0); // 100%完了
      expect(insights.averageTaskDuration).toBe(120);
      expect(insights.recommendations[0]).toContain('素晴らしい');
    });

    test('低い完了率でアドバイスが提供される', async () => {
      const userId = 'test-user';
      const businessDate = '2024-01-15';
      
      // 未完了のTODOが多い状況
      mockRepository.addTodo({
        id: 'todo-1',
        userId,
        content: 'タスク1',
        status: 'pending',
        priority: 1,
        createdAt: '2024-01-15T08:00:00Z',
        updatedAt: '2024-01-15T08:00:00Z',
        sourceType: 'manual'
      });

      mockRepository.addTodo({
        id: 'todo-2',
        userId,
        content: 'タスク2',
        status: 'pending',
        priority: 0,
        createdAt: '2024-01-15T08:30:00Z',
        updatedAt: '2024-01-15T08:30:00Z',
        sourceType: 'manual'
      });

      const insights = await service.generateProductivityInsights(userId, businessDate, 'Asia/Tokyo');

      expect(insights.completionRate).toBe(0.0);
      expect(insights.recommendations[0]).toContain('優先順位');
    });
  });

  describe('autoLinkActivitiesToTodos', () => {
    test('活動ログを自動的にTODOと関連付ける', async () => {
      const userId = 'test-user';
      const businessDate = '2024-01-15';
      
      mockRepository.addActivity({
        id: 'activity-1',
        userId,
        content: 'プロジェクト企画書作成を実施中',
        inputTimestamp: '2024-01-15T09:00:00Z',
        businessDate,
        isDeleted: false,
        createdAt: '2024-01-15T09:00:00Z',
        updatedAt: '2024-01-15T09:00:00Z',
        startTime: '2024-01-15T09:00:00Z',
        totalMinutes: 90,
        categories: 'Work'
      });

      mockRepository.addTodo({
        id: 'todo-1',
        userId,
        content: 'プロジェクト企画書作成を完成させる',
        status: 'pending',
        priority: 1,
        createdAt: '2024-01-15T08:00:00Z',
        updatedAt: '2024-01-15T08:00:00Z',
        sourceType: 'manual'
      });

      const results = await service.autoLinkActivitiesToTodos(userId, businessDate, 'Asia/Tokyo');

      expect(results).toHaveLength(1);
      expect(results[0].activityId).toBe('activity-1');
      expect(results[0].todoId).toBe('todo-1');
      expect(results[0].confidence).toBeGreaterThan(0.3);
    });
  });
});