import { ActivityRecord, DailySummary, ActivityAnalysis } from '../types';
import { Todo, CreateTodoRequest, UpdateTodoRequest, GetTodosOptions, TodoStats, TodoStatus, MessageClassificationHistory, ClassificationResult, MessageClassification } from '../types/todo';

/**
 * データベース操作の抽象化インターフェース
 * 依存性逆転の原則に従い、具体的な実装に依存しない設計を実現
 */
export interface IDatabaseRepository {
  // 初期化とライフサイクル管理
  initialize(): Promise<void>;
  close(): Promise<void>;

  // ユーザー関連操作
  getUserTimezone(userId: string): Promise<string>;
  setUserTimezone(userId: string, timezone: string): Promise<void>;

  // 活動記録関連操作
  saveActivityRecord(record: ActivityRecord, timezone: string): Promise<void>;
  getActivityRecords(userId: string, timezone: string, businessDate?: string): Promise<ActivityRecord[]>;
  getActivityRecordsByTimeSlot(userId: string, timeSlot: string): Promise<ActivityRecord[]>;
  updateActivityTime(activityId: string, startTime: string, endTime: string, estimatedMinutes: number): Promise<void>;

  // 日次サマリー関連操作
  saveDailySummary(summary: DailySummary, timezone: string): Promise<void>;
  getDailySummary(userId: string, timezone: string, businessDate?: string): Promise<DailySummary | null>;
}

/**
 * API使用量監視の抽象化インターフェース
 */
export interface IApiCostRepository {
  recordApiCall(operation: string, inputTokens: number, outputTokens: number): Promise<void>;
  getTodayStats(timezone?: string): Promise<{
    totalCalls: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    estimatedCost: number;
    operationBreakdown: Record<string, { calls: number; inputTokens: number; outputTokens: number; cost: number }>;
  }>;
  checkCostAlerts(timezone?: string): Promise<{ message: string; level: 'warning' | 'critical' } | null>;
  generateDailyReport(timezone: string): Promise<string>;
}

/**
 * AI解析サービスの抽象化インターフェース
 * 活動記録の解析とサマリー生成の責任を分離
 */
export interface IAnalysisService {
  // 活動記録の解析
  analyzeActivity(
    userInput: string,
    timeSlot: string,
    previousActivities: ActivityRecord[],
    timezone: string
  ): Promise<ActivityAnalysis>;

  // 日次サマリーの生成
  generateDailySummary(
    activities: ActivityRecord[],
    businessDate: string
  ): Promise<DailySummary>;

  // API使用量の統計取得
  getCostStats(): Promise<any>;

  // 日次コストレポートの取得
  getDailyCostReport(userId: string, timezone: string): Promise<string>;

  // コスト警告のチェック
  checkCostAlerts(userId: string, timezone: string): Promise<any>;
}

/**
 * TODO管理機能の抽象化インターフェース
 */
export interface ITodoRepository {
  // TODO基本操作
  createTodo(request: CreateTodoRequest): Promise<Todo>;
  getTodoById(id: string): Promise<Todo | null>;
  getTodosByUserId(userId: string, options?: GetTodosOptions): Promise<Todo[]>;
  updateTodo(id: string, update: UpdateTodoRequest): Promise<void>;
  updateTodoStatus(id: string, status: TodoStatus): Promise<void>;
  deleteTodo(id: string): Promise<void>;

  // TODO検索・統計
  searchTodos(userId: string, keyword: string): Promise<Todo[]>;
  getTodoStats(userId: string): Promise<TodoStats>;

  // 期日関連
  getTodosWithDueDate(userId: string, beforeDate?: string): Promise<Todo[]>;
  
  // 活動ログ連携
  getTodosByActivityId(activityId: string): Promise<Todo[]>;
}

/**
 * メッセージ分類機能の抽象化インターフェース
 */
export interface IMessageClassificationRepository {
  // 分類履歴の保存・取得
  recordClassification(
    userId: string,
    messageContent: string,
    aiClassification: MessageClassification,
    aiConfidence: number,
    userClassification?: MessageClassification,
    feedback?: string
  ): Promise<MessageClassificationHistory>;

  // 分類精度の改善
  updateClassificationFeedback(
    id: string,
    userClassification: MessageClassification,
    feedback?: string
  ): Promise<void>;

  // 分類精度統計
  getClassificationAccuracy(userId?: string): Promise<{
    classification: MessageClassification;
    totalCount: number;
    correctCount: number;
    accuracy: number;
    avgConfidence: number;
  }[]>;

  // 学習用データの取得
  getClassificationHistory(userId: string, limit?: number): Promise<MessageClassificationHistory[]>;
}