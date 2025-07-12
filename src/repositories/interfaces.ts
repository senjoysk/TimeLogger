import { ActivityRecord, DailySummary, ActivityAnalysis } from '../types';
import { Todo, CreateTodoRequest, UpdateTodoRequest, GetTodosOptions, TodoStats, TodoStatus, MessageClassificationHistory, ClassificationResult, MessageClassification } from '../types/todo';

/**
 * ユーザー情報
 */
export interface UserInfo {
  userId: string;
  username?: string;
  timezone: string;
  registrationDate: string;  // first_seen のエイリアス
  lastSeenAt: string;        // last_seen のエイリアス
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * ユーザー統計情報
 */
export interface UserStats {
  userId: string;
  totalLogs: number;
  thisMonthLogs: number;
  thisWeekLogs: number;
  todayLogs: number;
  avgLogsPerDay: number;
  mostActiveHour: number | null;
  totalMinutesLogged: number;
  longestActiveDay?: {
    date: string;
    logCount: number;
  } | null;
}

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
  
  // サスペンドスケジュール関連操作
  saveUserSuspendSchedule(userId: string, suspendHour: number, wakeHour: number): Promise<void>;
  getUserSuspendSchedule(userId: string): Promise<{ suspendHour: number; wakeHour: number; timezone: string } | null>;
  getAllUserSuspendSchedules(): Promise<{ [userId: string]: { suspendHour: number; wakeHour: number; timezone: string } }>;

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
  
  // パフォーマンス最適化メソッド
  getTodosByDateRange(userId: string, startDate: string, endDate: string): Promise<Todo[]>;
  getTodosByStatusOptimized(userId: string, statuses: TodoStatus[]): Promise<Todo[]>;
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

/**
 * 夜間サスペンド機能の抽象化インターフェース
 * メッセージリカバリとサスペンド状態管理の責任を分離
 */
export interface INightSuspendRepository {
  // Discord メッセージID関連操作
  existsByDiscordMessageId(messageId: string): Promise<boolean>;
  getByDiscordMessageId(messageId: string): Promise<any | null>;
  
  // リカバリ処理関連操作
  getUnprocessedMessages(userId: string, timeRange: { start: Date; end: Date }): Promise<any[]>;
  markAsRecoveryProcessed(logId: string, timestamp: string): Promise<void>;
  
  // サスペンド状態管理
  saveSuspendState(state: SuspendState): Promise<void>;
  getLastSuspendState(userId: string): Promise<SuspendState | null>;
  
  // ActivityLog作成（Discord経由）
  createActivityLogFromDiscord(data: DiscordActivityLogData): Promise<any>;
}

/**
 * サスペンド状態を表すインターフェース
 */
export interface SuspendState {
  id: string;
  user_id: string;
  suspend_time: string;
  expected_recovery_time: string;
  actual_recovery_time?: string;
  created_at: string;
}

/**
 * Discord経由のActivityLog作成データ
 */
export interface DiscordActivityLogData {
  user_id: string;
  content: string;
  input_timestamp: string;
  business_date: string;
  discord_message_id: string;
  recovery_processed: boolean;
  recovery_timestamp?: string;
}

/**
 * ユーザー管理機能の抽象化インターフェース
 */
export interface IUserRepository {
  // ユーザー存在確認
  userExists(userId: string): Promise<boolean>;
  
  // ユーザー登録
  registerUser(userId: string, username: string): Promise<void>;
  
  // ユーザー情報取得
  getUserInfo(userId: string): Promise<UserInfo | null>;
  
  // 全ユーザー取得
  getAllUsers(): Promise<UserInfo[]>;
  
  // ユーザー統計取得
  getUserStats(userId: string): Promise<UserStats>;
  
  // 最終利用日時更新
  updateLastSeen(userId: string): Promise<void>;
}