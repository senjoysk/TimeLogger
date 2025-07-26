import { Todo, CreateTodoRequest, UpdateTodoRequest, GetTodosOptions, TodoStats, TodoStatus, MessageClassificationHistory, ClassificationResult, MessageClassification } from '../types/todo';
import { Memo, CreateMemoRequest, UpdateMemoRequest } from '../types/memo';
import { 
  ActivityPromptSettings, 
  CreateActivityPromptSettingsRequest, 
  UpdateActivityPromptSettingsRequest 
} from '../types/activityPrompt';
import { CostAlert } from '../types/costAlert';
import { IActivityLogRepository } from './activityLogRepository';

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
  checkCostAlerts(timezone?: string): Promise<CostAlert | null>;
  generateDailyReport(timezone: string): Promise<string>;
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
 * メモ管理機能の抽象化インターフェース
 */
export interface IMemoRepository {
  // メモ基本操作
  createMemo(request: CreateMemoRequest): Promise<Memo>;
  getMemoById(id: string): Promise<Memo | null>;
  getMemosByUserId(userId: string): Promise<Memo[]>;
  updateMemo(id: string, update: UpdateMemoRequest): Promise<void>;
  deleteMemo(id: string): Promise<void>;

  // メモ検索
  searchMemos(userId: string, keyword: string): Promise<Memo[]>;
  getMemosByTag(userId: string, tag: string): Promise<Memo[]>;
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

/**
 * 活動促し通知設定の抽象化インターフェース
 */
export interface IActivityPromptRepository {
  // 基本操作
  createSettings(request: CreateActivityPromptSettingsRequest): Promise<ActivityPromptSettings>;
  getSettings(userId: string): Promise<ActivityPromptSettings | null>;
  updateSettings(userId: string, update: UpdateActivityPromptSettingsRequest): Promise<void>;
  deleteSettings(userId: string): Promise<void>;
  
  // 有効な設定の取得
  getEnabledSettings(): Promise<ActivityPromptSettings[]>;
  
  // 特定時刻に通知すべきユーザーの取得
  getUsersToPromptAt(hour: number, minute: number): Promise<string[]>;
  
  // 設定の有効/無効切り替え
  enablePrompt(userId: string): Promise<void>;
  disablePrompt(userId: string): Promise<void>;
  
  // 設定存在確認
  settingsExists(userId: string): Promise<boolean>;
}

/**
 * 統合リポジトリインターフェース
 * SQLiteActivityLogRepositoryの全機能を統合
 */
export interface IUnifiedRepository extends 
  IActivityLogRepository, 
  IApiCostRepository, 
  ITodoRepository, 
  IMessageClassificationRepository, 
  IUserRepository, 
  IActivityPromptRepository {
  
  // データベース管理メソッド
  initializeDatabase(): Promise<void>;
  close(): Promise<void>;
  ensureSchema(): Promise<void>;
}