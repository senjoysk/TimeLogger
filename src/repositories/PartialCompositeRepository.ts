/**
 * Phase 4B完了: 完全分離CompositeRepository
 * 全インターフェースを専用リポジトリに完全委譲
 * 
 * 完全分離戦略:
 * - IApiCostRepository -> SqliteApiCostRepository（分離済み）
 * - ITodoRepository -> SqliteTodoRepository（分離済み）
 * - IMessageClassificationRepository -> SqliteMessageClassificationRepository（分離済み）
 * - IUserRepository -> SqliteUserRepository（分離済み）
 * - IActivityLogRepository -> SqliteActivityLogRepository（Phase 4B完了）
 * - IActivityPromptRepository -> SqliteActivityPromptRepository（Phase 4B完了）
 */

import { SqliteActivityLogRepository } from './specialized/SqliteActivityLogRepository';
import { SqliteApiCostRepository } from './specialized/SqliteApiCostRepository';
import { SqliteTodoRepository } from './specialized/SqliteTodoRepository';
import { SqliteMessageClassificationRepository } from './specialized/SqliteMessageClassificationRepository';
import { SqliteUserRepository } from './specialized/SqliteUserRepository';
import { SqliteActivityPromptRepository } from './specialized/SqliteActivityPromptRepository';
import { IUnifiedRepository, UserStats, UserTimezone, TimezoneChange, TimezoneNotification } from './interfaces';
import { 
  CreateTodoRequest, UpdateTodoRequest, Todo, TodoPriority, TodoStatus, GetTodosOptions,
  MessageClassification, MessageClassificationHistory
} from '../types/todo';
import { CostAlert } from '../types/costAlert';
import { UserInfo } from '../types/database';
import {
  ActivityLog,
  CreateActivityLogRequest,
  AnalysisCache,
  CreateAnalysisCacheRequest,
  DailyAnalysisResult,
  BusinessDateInfo
} from '../types/activityLog';
import {
  ActivityPromptSettings,
  CreateActivityPromptSettingsRequest,
  UpdateActivityPromptSettingsRequest
} from '../types/activityPrompt';

/**
 * Phase 4B完了: 完全分離CompositeRepository
 * 全インターフェースを専用リポジトリに完全委譲
 */
export class PartialCompositeRepository implements IUnifiedRepository {
  private activityLogRepo: SqliteActivityLogRepository;
  private apiCostRepo: SqliteApiCostRepository;
  private todoRepo: SqliteTodoRepository;
  private messageClassificationRepo: SqliteMessageClassificationRepository;
  private userRepo: SqliteUserRepository;
  private activityPromptRepo: SqliteActivityPromptRepository;

  constructor(databasePath: string) {
    // 全インターフェースを専用リポジトリに委譲
    this.activityLogRepo = new SqliteActivityLogRepository(databasePath);
    this.apiCostRepo = new SqliteApiCostRepository(databasePath);
    this.todoRepo = new SqliteTodoRepository(databasePath);
    this.messageClassificationRepo = new SqliteMessageClassificationRepository(databasePath);
    this.userRepo = new SqliteUserRepository(databasePath);
    this.activityPromptRepo = new SqliteActivityPromptRepository(databasePath);
  }

  /**
   * データベース初期化（全専用リポジトリを初期化）
   */
  async initializeDatabase(): Promise<void> {
    // メインのDBスキーマは activityLogRepo で初期化
    await this.activityLogRepo.ensureSchema();
    
    // 各専用リポジトリのスキーマを確実に初期化
    await this.apiCostRepo.ensureSchema();
    await this.todoRepo.ensureSchema();
    await this.messageClassificationRepo.ensureSchema();
    await this.userRepo.ensureSchema();
    await this.activityPromptRepo.ensureSchema();
  }

  /**
   * データベース接続を閉じる
   */
  async close(): Promise<void> {
    // DatabaseConnectionは共有インスタンスなので、一度だけ閉じる
    const db = (this.activityLogRepo as any).db;
    if (db && typeof db.close === 'function') {
      await db.close();
    }
  }

  /**
   * スキーマ確認（互換性のため）
   */
  async ensureSchema(): Promise<void> {
    await this.initializeDatabase();
  }

  // =============================================================================
  // IActivityLogRepository - 分離済みリポジトリに委譲
  // =============================================================================
  
  async saveLog(request: CreateActivityLogRequest): Promise<ActivityLog> {
    return this.activityLogRepo.saveLog(request);
  }

  async getLogsByDate(userId: string, businessDate: string, includeDeleted?: boolean): Promise<ActivityLog[]> {
    return this.activityLogRepo.getLogsByDate(userId, businessDate, includeDeleted);
  }

  async getLogsByDateRange(userId: string, startDate: string, endDate: string, includeDeleted?: boolean): Promise<ActivityLog[]> {
    return this.activityLogRepo.getLogsByDateRange(userId, startDate, endDate, includeDeleted);
  }

  async getLogById(id: string): Promise<ActivityLog | null> {
    return this.activityLogRepo.getLogById(id);
  }

  async updateLog(logId: string, newContent: string): Promise<ActivityLog> {
    return this.activityLogRepo.updateLog(logId, newContent);
  }

  async deleteLog(logId: string): Promise<ActivityLog> {
    return this.activityLogRepo.deleteLog(logId);
  }

  async saveAnalysisCache(request: CreateAnalysisCacheRequest): Promise<AnalysisCache> {
    return this.activityLogRepo.saveAnalysisCache(request);
  }

  async getAnalysisCache(userId: string, businessDate: string): Promise<AnalysisCache | null> {
    return this.activityLogRepo.getAnalysisCache(userId, businessDate);
  }

  async clearExpiredCache(): Promise<void> {
    return this.activityLogRepo.clearExpiredCache();
  }

  // 不足しているIActivityLogRepositoryメソッド
  async permanentDeleteLog(logId: string): Promise<boolean> {
    return this.activityLogRepo.permanentDeleteLog(logId);
  }

  async restoreLog(logId: string): Promise<ActivityLog> {
    return this.activityLogRepo.restoreLog(logId);
  }

  async updateAnalysisCache(userId: string, businessDate: string, analysisResult: DailyAnalysisResult, logCount: number): Promise<AnalysisCache> {
    return this.activityLogRepo.updateAnalysisCache(userId, businessDate, analysisResult, logCount);
  }

  async deleteAnalysisCache(userId: string, businessDate: string): Promise<boolean> {
    return this.activityLogRepo.deleteAnalysisCache(userId, businessDate);
  }

  async isCacheValid(userId: string, businessDate: string, currentLogCount: number): Promise<boolean> {
    return this.activityLogRepo.isCacheValid(userId, businessDate, currentLogCount);
  }

  async getLogCount(userId: string, includeDeleted?: boolean): Promise<number> {
    return this.activityLogRepo.getLogCount(userId, includeDeleted);
  }

  async getLogCountByDate(userId: string, businessDate: string, includeDeleted?: boolean): Promise<number> {
    return this.activityLogRepo.getLogCountByDate(userId, businessDate, includeDeleted);
  }

  async getLatestLogs(userId: string, limit?: number): Promise<ActivityLog[]> {
    return this.activityLogRepo.getLatestLogs(userId, limit);
  }

  async cleanupOldCaches(olderThanDays: number): Promise<number> {
    return this.activityLogRepo.cleanupOldCaches(olderThanDays);
  }

  calculateBusinessDate(date: string, timezone: string): BusinessDateInfo {
    return this.activityLogRepo.calculateBusinessDate(date, timezone);
  }

  async isConnected(): Promise<boolean> {
    return this.activityLogRepo.isConnected();
  }

  async withTransaction<T>(operation: () => Promise<T>): Promise<T> {
    return this.activityLogRepo.withTransaction(operation);
  }

  async updateLogMatching(logId: string, matchInfo: {
    matchStatus?: string;
    matchedLogId?: string;
    similarityScore?: number;
  }): Promise<void> {
    return this.activityLogRepo.updateLogMatching(logId, matchInfo);
  }

  async getUnmatchedLogs(userId: string, logType: string, businessDate?: string): Promise<ActivityLog[]> {
    return this.activityLogRepo.getUnmatchedLogs(userId, logType, businessDate);
  }

  async getMatchedLogPairs(userId: string, businessDate?: string): Promise<{ startLog: ActivityLog; endLog: ActivityLog }[]> {
    return this.activityLogRepo.getMatchedLogPairs(userId, businessDate);
  }

  getDatabase() {
    return this.activityLogRepo.getDatabase();
  }

  async getAllUserTimezonesForScheduler(): Promise<Array<{
    userId: string;
    timezone: string;
  }>> {
    return this.activityLogRepo.getAllUserTimezonesForScheduler();
  }

  async getUnprocessedNotifications(): Promise<TimezoneNotification[]> {
    return this.activityLogRepo.getUnprocessedNotifications();
  }

  async markNotificationAsProcessed(notificationId: string): Promise<void> {
    return this.activityLogRepo.markNotificationAsProcessed(notificationId);
  }

  async getBusinessDateInfo(userId: string, timezone: string): Promise<BusinessDateInfo> {
    return this.activityLogRepo.getBusinessDateInfo(userId, timezone);
  }

  // スケジューラー関連（ActivityLogRepositoryから委譲）
  async getUserTimezoneChanges(since?: Date): Promise<TimezoneChange[]> {
    return this.activityLogRepo.getUserTimezoneChanges(since);
  }

  async getUserTimezone(userId: string): Promise<string | null> {
    return this.activityLogRepo.getUserTimezone(userId);
  }

  async saveUserTimezone(userId: string, timezone: string): Promise<void> {
    return this.activityLogRepo.saveUserTimezone(userId, timezone);
  }

  // =============================================================================
  // IApiCostRepository - 分離済みリポジトリに委譲
  // =============================================================================
  
  async recordApiCall(operation: string, inputTokens: number, outputTokens: number): Promise<void> {
    return this.apiCostRepo.recordApiCall(operation, inputTokens, outputTokens);
  }

  async getTodayStats(timezone?: string): Promise<{
    totalCalls: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    estimatedCost: number;
    operationBreakdown: Record<string, { calls: number; inputTokens: number; outputTokens: number; cost: number }>;
  }> {
    return this.apiCostRepo.getTodayStats(timezone);
  }

  async checkCostAlerts(timezone?: string): Promise<CostAlert | null> {
    return this.apiCostRepo.checkCostAlerts(timezone);
  }

  async generateDailyReport(timezone: string): Promise<string> {
    return this.apiCostRepo.generateDailyReport(timezone);
  }

  // =============================================================================
  // ITodoRepository - 分離済みリポジトリに委譲
  // =============================================================================
  
  async createTodo(request: CreateTodoRequest): Promise<Todo> {
    return this.todoRepo.createTodo(request);
  }

  async getTodoById(id: string): Promise<Todo | null> {
    return this.todoRepo.getTodoById(id);
  }

  async getTodosByUserId(userId: string, options?: GetTodosOptions): Promise<Todo[]> {
    return this.todoRepo.getTodosByUserId(userId, options);
  }

  async updateTodo(id: string, updates: UpdateTodoRequest): Promise<void> {
    await this.todoRepo.updateTodo(id, updates);
  }

  async updateTodoStatus(id: string, status: TodoStatus): Promise<void> {
    await this.todoRepo.updateTodoStatus(id, status);
  }

  async deleteTodo(id: string): Promise<void> {
    await this.todoRepo.deleteTodo(id);
  }

  // 不足しているTODOメソッド
  async searchTodos(userId: string, keyword: string): Promise<Todo[]> {
    return this.todoRepo.searchTodos(userId, keyword);
  }

  async getTodoStats(userId: string): Promise<{
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    cancelled: number;
    overdue: number;
    todayCompleted: number;
    weekCompleted: number;
  }> {
    return this.todoRepo.getTodoStats(userId);
  }

  async getTodosWithDueDate(userId: string): Promise<Todo[]> {
    return this.todoRepo.getTodosWithDueDate(userId);
  }

  async getTodosByActivityId(activityLogId: string): Promise<Todo[]> {
    return this.todoRepo.getTodosByActivityId(activityLogId);
  }

  async getTodosByDateRange(userId: string, startDate: string, endDate: string): Promise<Todo[]> {
    return this.todoRepo.getTodosByDateRange(userId, startDate, endDate);
  }

  async getTodosByStatusOptimized(userId: string, statuses: TodoStatus[]): Promise<Todo[]> {
    return this.todoRepo.getTodosByStatusOptimized(userId, statuses);
  }

  // =============================================================================
  // IMessageClassificationRepository - 分離済みリポジトリに委譲
  // =============================================================================
  
  async recordClassification(
    userId: string,
    messageContent: string,
    aiClassification: MessageClassification,
    aiConfidence: number,
    userClassification?: MessageClassification,
    feedback?: string
  ): Promise<MessageClassificationHistory> {
    return this.messageClassificationRepo.recordClassification(
      userId,
      messageContent,
      aiClassification,
      aiConfidence,
      userClassification,
      feedback
    );
  }

  async getClassificationHistory(userId: string, limit = 10): Promise<MessageClassificationHistory[]> {
    return this.messageClassificationRepo.getClassificationHistory(userId, limit);
  }

  async updateClassificationFeedback(id: string, userClassification: MessageClassification, feedback?: string): Promise<void> {
    return this.messageClassificationRepo.updateClassificationFeedback(id, userClassification, feedback);
  }

  async getClassificationAccuracy(userId?: string): Promise<{
    classification: MessageClassification;
    totalCount: number;
    correctCount: number;
    accuracy: number;
    avgConfidence: number;
  }[]> {
    return this.messageClassificationRepo.getClassificationAccuracy(userId);
  }

  // =============================================================================
  // IUserRepository - 分離済みリポジトリに委譲
  // =============================================================================
  
  async userExists(userId: string): Promise<boolean> {
    return this.userRepo.userExists(userId);
  }

  async registerUser(userId: string, username: string): Promise<void> {
    return this.userRepo.registerUser(userId, username);
  }

  async getUserInfo(userId: string): Promise<UserInfo | null> {
    return this.userRepo.getUserInfo(userId);
  }

  async getAllUsers(): Promise<UserInfo[]> {
    return this.userRepo.getAllUsers();
  }

  async getUserStats(userId: string): Promise<UserStats> {
    return this.userRepo.getUserStats(userId);
  }

  async updateLastSeen(userId: string): Promise<void> {
    return this.userRepo.updateLastSeen(userId);
  }

  // =============================================================================
  // IActivityPromptRepository - 分離済みリポジトリに委譲
  // =============================================================================
  
  async createSettings(request: CreateActivityPromptSettingsRequest): Promise<ActivityPromptSettings> {
    return this.activityPromptRepo.createSettings(request);
  }

  async getSettings(userId: string): Promise<ActivityPromptSettings | null> {
    return this.activityPromptRepo.getSettings(userId);
  }

  async updateSettings(userId: string, update: UpdateActivityPromptSettingsRequest): Promise<void> {
    return this.activityPromptRepo.updateSettings(userId, update);
  }

  async deleteSettings(userId: string): Promise<void> {
    return this.activityPromptRepo.deleteSettings(userId);
  }

  async getEnabledSettings(): Promise<ActivityPromptSettings[]> {
    return this.activityPromptRepo.getEnabledSettings();
  }

  async getUsersToPromptAt(hour: number, minute: number): Promise<string[]> {
    return this.activityPromptRepo.getUsersToPromptAt(hour, minute);
  }

  async enablePrompt(userId: string): Promise<void> {
    return this.activityPromptRepo.enablePrompt(userId);
  }

  async disablePrompt(userId: string): Promise<void> {
    return this.activityPromptRepo.disablePrompt(userId);
  }

  async settingsExists(userId: string): Promise<boolean> {
    return this.activityPromptRepo.settingsExists(userId);
  }

  // =============================================================================
  // Phase 4B完了: 全インターフェース分離完成
  // =============================================================================
  
  // 全てのインターフェースが専用リポジトリに完全委譲されました:
  // ✅ IActivityLogRepository -> SqliteActivityLogRepository
  // ✅ IApiCostRepository -> SqliteApiCostRepository  
  // ✅ ITodoRepository -> SqliteTodoRepository
  // ✅ IMessageClassificationRepository -> SqliteMessageClassificationRepository
  // ✅ IUserRepository -> SqliteUserRepository
  // ✅ IActivityPromptRepository -> SqliteActivityPromptRepository
}