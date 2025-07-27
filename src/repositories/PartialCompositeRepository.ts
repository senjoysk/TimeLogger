/**
 * 段階的移行用PartialCompositeRepository
 * 既存のSqliteActivityLogRepositoryをベースに、分離済みインターフェースのみを専用リポジトリに委譲
 * 
 * 移行戦略:
 * - IApiCostRepository -> SqliteApiCostRepository（分離済み）
 * - ITodoRepository -> SqliteTodoRepository（分離済み）
 * - IMessageClassificationRepository -> SqliteMessageClassificationRepository（分離済み）
 * - IUserRepository -> SqliteUserRepository（分離済み）
 * - その他 -> SqliteActivityLogRepository（元のまま）
 */

import { SqliteActivityLogRepository } from './sqliteActivityLogRepository';
import { SqliteApiCostRepository } from './specialized/SqliteApiCostRepository';
import { SqliteTodoRepository } from './specialized/SqliteTodoRepository';
import { SqliteMessageClassificationRepository } from './specialized/SqliteMessageClassificationRepository';
import { SqliteUserRepository } from './specialized/SqliteUserRepository';
import { IUnifiedRepository, UserStats } from './interfaces';
import { 
  CreateTodoRequest, UpdateTodoRequest, Todo, TodoPriority, TodoStatus, GetTodosOptions,
  MessageClassification, MessageClassificationHistory
} from '../types/todo';
import { CostAlert } from '../types/costAlert';
import { UserInfo } from '../types/database';

/**
 * 段階的移行用PartialCompositeRepository
 * 最小限の変更でActivityLoggingIntegrationが動作するよう設計
 */
export class PartialCompositeRepository extends SqliteActivityLogRepository implements IUnifiedRepository {
  private apiCostRepo: SqliteApiCostRepository;
  private todoRepo: SqliteTodoRepository;
  private messageClassificationRepo: SqliteMessageClassificationRepository;
  private userRepo: SqliteUserRepository;

  constructor(databasePath: string) {
    super(databasePath);
    
    // 分離済み専用リポジトリを初期化
    this.apiCostRepo = new SqliteApiCostRepository(databasePath);
    this.todoRepo = new SqliteTodoRepository(databasePath);
    this.messageClassificationRepo = new SqliteMessageClassificationRepository(databasePath);
    this.userRepo = new SqliteUserRepository(databasePath);
  }

  /**
   * データベース初期化（親クラスのメソッドを使用）
   */
  async initializeDatabase(): Promise<void> {
    await super.initializeDatabase();
    await this.todoRepo.ensureSchema();
    await this.messageClassificationRepo.ensureSchema();
    await this.userRepo.ensureSchema();
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
  // その他のメソッドは親クラス（SqliteActivityLogRepository）をそのまま使用
  // =============================================================================
  
  // 親クラスのメソッドがそのまま利用可能:
  // - saveLog, getLogsByDate, getLogsByDateRange, getLogById, updateLog, deleteLog
  // - getUserTimezone, setUserTimezone, saveActivityPrompt など
  // - その他のIUnifiedRepositoryメソッド
}