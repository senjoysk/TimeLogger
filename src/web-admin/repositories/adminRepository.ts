/**
 * AdminRepository実装
 * 既存のSqliteActivityLogRepositoryを拡張して管理機能を提供
 * 
 * @SRP-EXCEPTION: Web管理機能のデータアクセス層として複数テーブルを統合管理
 * @SRP-REASON: 管理画面の要求により複数のデータソース（活動ログ・TODO・ユーザー）を統合する必要があり、
 *              分離すると管理UIの複雑性とパフォーマンスが悪化するため一時的に統合
 */

import { IAdminRepository } from '../interfaces/adminInterfaces';
import { SearchFilters, PaginationOptions } from '../types/admin';
import { PartialCompositeRepository } from '../../repositories/PartialCompositeRepository';
import { IUnifiedRepository } from '../../repositories/interfaces';
import { TodoTask, TodoStatus, TodoPriority, Todo } from '../../types/todo';
import { v4 as uuidv4 } from 'uuid';
import { ITimezoneService } from '../../services/interfaces/ITimezoneService';
import { CreateTodoRequest } from '../services/todoManagementService';
import { logger } from '../../utils/logger';

export class AdminRepository implements IAdminRepository {
  private sqliteRepo: IUnifiedRepository;
  private timezoneService?: ITimezoneService;

  constructor(
    sqliteRepo: IUnifiedRepository,
    timezoneService?: ITimezoneService
  ) {
    this.sqliteRepo = sqliteRepo;
    this.timezoneService = timezoneService;
  }

  /**
   * データベース内のテーブル名一覧を取得
   */
  async getTableNames(): Promise<string[]> {
    // 固定のテーブル名リストを返す（セキュリティ上の理由）
    return [
      'activity_logs',
      'api_costs',
      'user_settings',
      'daily_analysis_cache',
      'todo_tasks',
      'message_classifications',
      'timezone_change_notifications'
    ];
  }

  /**
   * テーブルのレコード数を取得（N+1問題解決版）
   */
  async getTableCount(tableName: string): Promise<number> {
    try {
      // SQLを直接実行してN+1問題を回避
      const db = (this.sqliteRepo as any).db; // privateなdbインスタンスにアクセス
      
      switch (tableName) {
        case 'activity_logs':
          const result = await new Promise<number>((resolve, reject) => {
            db.get("SELECT COUNT(*) as count FROM activity_logs", (err: Error | null, row: { count: number }) => {
              if (err) reject(err);
              else resolve(row.count);
            });
          });
          return result;
        case 'todo_tasks':
          const todoCount = await new Promise<number>((resolve, reject) => {
            db.get("SELECT COUNT(*) as count FROM todo_tasks", (err: Error | null, row: { count: number }) => {
              if (err) reject(err);
              else resolve(row.count);
            });
          });
          return todoCount;
        case 'user_settings':
          const userCount = await new Promise<number>((resolve, reject) => {
            db.get("SELECT COUNT(DISTINCT user_id) as count FROM user_settings", (err: Error | null, row: { count: number }) => {
              if (err) reject(err);
              else resolve(row.count);
            });
          });
          return userCount;
        default:
          return 0;
      }
    } catch (error) {
      // エラー時は従来の方法にフォールバック
      return await this.getTableCountFallback(tableName);
    }
  }

  /**
   * フォールバック用のレコード数取得（従来の方法）
   */
  private async getTableCountFallback(tableName: string): Promise<number> {
    switch (tableName) {
      case 'activity_logs':
        const users = await this.sqliteRepo.getAllUsers();
        let totalLogs = 0;
        for (const user of users) {
          // Get logs for the last 30 days
          const endDate = new Date().toISOString().split('T')[0];
          const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          const logs = await this.sqliteRepo.getLogsByDateRange(user.userId, startDate, endDate);
          totalLogs += logs.length;
        }
        return totalLogs;
      case 'todo_tasks':
        const allUsers = await this.sqliteRepo.getAllUsers();
        let totalTodos = 0;
        for (const user of allUsers) {
          const todos = await this.sqliteRepo.getTodosByUserId(user.userId);
          totalTodos += todos.length;
        }
        return totalTodos;
      case 'user_settings':
        const userList = await this.sqliteRepo.getAllUsers();
        return userList.length;
      default:
        return 0;
    }
  }

  /**
   * テーブルデータを取得（ページネーション対応・N+1問題解決版）
   */
  async getTableData(tableName: string, options: PaginationOptions = {}): Promise<Record<string, unknown>[]> {
    const { page = 1, limit = 50 } = options;
    
    try {
      // SQLを直接実行してN+1問題を回避
      const db = (this.sqliteRepo as any).db;
      
      switch (tableName) {
        case 'activity_logs':
          const offset = (page - 1) * limit;
          const logs = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
            db.all(
              "SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT ? OFFSET ?",
              [limit, offset],
              (err: Error | null, rows: Record<string, unknown>[]) => {
                if (err) reject(err);
                else resolve(rows);
              }
            );
          });
          return logs;
        case 'todo_tasks':
          const todoOffset = (page - 1) * limit;
          const todos = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
            db.all(
              "SELECT * FROM todo_tasks ORDER BY created_at DESC LIMIT ? OFFSET ?",
              [limit, todoOffset],
              (err: Error | null, rows: Record<string, unknown>[]) => {
                if (err) reject(err);
                else resolve(rows);
              }
            );
          });
          return todos;
        case 'user_settings':
          const userOffset = (page - 1) * limit;
          const users = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
            db.all(
              "SELECT DISTINCT user_id, timezone, created_at, updated_at FROM user_settings ORDER BY updated_at DESC LIMIT ? OFFSET ?",
              [limit, userOffset],
              (err: Error | null, rows: Record<string, unknown>[]) => {
                if (err) reject(err);
                else resolve(rows);
              }
            );
          });
          return users;
        default:
          return [];
      }
    } catch (error) {
      // エラー時は従来の方法にフォールバック
      return await this.getTableDataFallback(tableName, options);
    }
  }

  /**
   * フォールバック用のテーブルデータ取得（従来の方法）
   */
  private async getTableDataFallback(tableName: string, options: PaginationOptions = {}): Promise<Record<string, unknown>[]> {
    const { page = 1, limit = 50 } = options;
    
    switch (tableName) {
      case 'activity_logs':
        const users = await this.sqliteRepo.getAllUsers();
        const allLogs = [];
        for (const user of users) {
          // Get logs for the last 30 days
          const endDate = new Date().toISOString().split('T')[0];
          const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          const logs = await this.sqliteRepo.getLogsByDateRange(user.userId, startDate, endDate);
          allLogs.push(...logs);
        }
        allLogs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return this.paginate(allLogs as any, page, limit);
      case 'todo_tasks':
        const allUsers = await this.sqliteRepo.getAllUsers();
        const allTodos = [];
        for (const user of allUsers) {
          const todos = await this.sqliteRepo.getTodosByUserId(user.userId);
          allTodos.push(...todos);
        }
        allTodos.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return this.paginate(allTodos as any, page, limit);
      case 'user_settings':
        const userList = await this.sqliteRepo.getAllUsers();
        return this.paginate(userList, page, limit);
      default:
        return [];
    }
  }

  /**
   * テーブルデータを検索
   */
  async searchTableData(
    tableName: string, 
    filters: SearchFilters, 
    options: PaginationOptions = {}
  ): Promise<Record<string, unknown>[]> {
    const { page = 1, limit = 50 } = options;
    
    // 各テーブルごとに適切なフィルタリングを実装
    switch (tableName) {
      case 'activity_logs':
        if (filters.userId && filters.userId !== 'all') {
          // Get logs for the last 30 days by default
          const endDate = new Date().toISOString().split('T')[0];
          const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          const logs = await this.sqliteRepo.getLogsByDateRange(filters.userId, startDate, endDate);
          return this.paginate(logs as any, page, limit);
        }
        return this.getTableData(tableName, options);
      case 'todo_tasks':
        // todo_tasksの場合、userIdとstatusフィルターを適用
        const allUsers = filters.userId && filters.userId !== 'all' 
          ? [{ userId: filters.userId }]
          : await this.sqliteRepo.getAllUsers();
        
        const allTodos = [];
        for (const user of allUsers) {
          const todos = await this.sqliteRepo.getTodosByUserId(user.userId);
          // statusフィルターを適用
          const filteredTodos = filters.status 
            ? todos.filter(todo => todo.status === filters.status)
            : todos;
          allTodos.push(...filteredTodos);
        }
        
        // 日付フィルターを適用
        let finalTodos = allTodos;
        if (filters.dateFrom || filters.dateTo) {
          finalTodos = allTodos.filter(todo => {
            const todoDate = new Date(todo.createdAt).toISOString().split('T')[0];
            if (filters.dateFrom && todoDate < filters.dateFrom) return false;
            if (filters.dateTo && todoDate > filters.dateTo) return false;
            return true;
          });
        }
        
        // ソートとページネーション
        finalTodos.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return this.paginate(finalTodos as any, page, limit);
      default:
        return this.getTableData(tableName, options);
    }
  }

  /**
   * テーブルスキーマを取得
   */
  async getTableSchema(tableName: string): Promise<Record<string, unknown>> {
    // 暫定的なスキーマ情報を返す
    return {
      columns: [
        { name: 'id', type: 'TEXT', pk: 1 },
        { name: 'created_at', type: 'TEXT', pk: 0 },
        { name: 'updated_at', type: 'TEXT', pk: 0 }
      ]
    };
  }

  /**
   * ページネーションヘルパー
   */
  private paginate<T>(items: T[], page: number, limit: number): T[] {
    const start = (page - 1) * limit;
    const end = start + limit;
    return items.slice(start, end);
  }

  // ===== TODO管理機能 (Phase 2) =====

  /**
   * Todo型からTodoTask型への変換ヘルパー
   */
  private mapTodoToTodoTask(todo: Todo): TodoTask {
    const priorityMap: { [key: number]: TodoPriority } = {
      1: 'high',
      0: 'medium',
      '-1': 'low'
    };

    return {
      id: todo.id,
      userId: todo.userId,
      content: todo.content, // content統一によりcontentを使用
      description: '', // Todo型にはdescriptionがないため空文字
      status: todo.status,
      priority: priorityMap[todo.priority] || 'medium',
      dueDate: todo.dueDate || null,
      createdAt: todo.createdAt,
      updatedAt: todo.updatedAt
    };
  }

  /**
   * 新しいTODOタスクを作成
   */
  async createTodoTask(data: {
    userId: string;
    content: string;
    description?: string;
    priority: TodoPriority;
    dueDate?: string;
  }): Promise<TodoTask> {
    // SqliteActivityLogRepositoryを使用してTODOを作成
    const createdTodo = await this.sqliteRepo.createTodo({
      userId: data.userId,
      content: data.content, // content統一により直接マッピング
      priority: data.priority === 'high' ? 1 : data.priority === 'low' ? -1 : 0,
      dueDate: data.dueDate || undefined,
      sourceType: 'manual'
    });

    // 作成されたTodoをTodoTaskに変換して返す
    return this.mapTodoToTodoTask(createdTodo);
  }

  /**
   * TODOタスクを更新
   */
  async updateTodoTask(todoId: string, updates: {
    content?: string;
    description?: string;
    status?: TodoStatus;
    priority?: TodoPriority;
    dueDate?: string;
  }): Promise<TodoTask> {
    // 既存のTODOを取得
    const existingTodo = await this.getTodoTaskById(todoId);
    if (!existingTodo) {
      throw new Error('TODO not found');
    }

    // SqliteActivityLogRepositoryを使用してTODOを更新
    const updateData: Record<string, unknown> = {};
    if (updates.content) updateData.content = updates.content;
    if (updates.status) updateData.status = updates.status;
    if (updates.priority) {
      updateData.priority = updates.priority === 'high' ? 1 : updates.priority === 'low' ? -1 : 0;
    }
    if (updates.dueDate !== undefined) updateData.dueDate = updates.dueDate;

    // 更新タイムスタンプを確実に変更するため、わずかな遅延を加える
    await new Promise(resolve => setTimeout(resolve, 1));
    
    await this.sqliteRepo.updateTodo(todoId, updateData);

    // 更新後のTODOを取得して返す
    const updatedTodo = await this.getTodoTaskById(todoId);
    if (!updatedTodo) {
      throw new Error('Failed to retrieve updated TODO');
    }

    return updatedTodo;
  }

  /**
   * TODOタスクを削除
   */
  async deleteTodoTask(todoId: string): Promise<boolean> {
    try {
      await this.sqliteRepo.deleteTodo(todoId);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * TODOタスクをIDで取得
   */
  async getTodoTaskById(todoId: string): Promise<TodoTask | null> {
    try {
      const todo = await this.sqliteRepo.getTodoById(todoId);
      return todo ? this.mapTodoToTodoTask(todo) : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * 複数のTODOタスクのステータスを一括変更
   */
  async bulkUpdateTodoStatus(todoIds: string[], newStatus: TodoStatus): Promise<number> {
    let updatedCount = 0;
    
    for (const todoId of todoIds) {
      try {
        await this.updateTodoTask(todoId, { status: newStatus });
        updatedCount++;
      } catch (error) {
        // エラーが発生した場合はスキップ
        continue;
      }
    }
    
    return updatedCount;
  }

  /**
   * 複数のTODOタスクを一括削除
   */
  async bulkDeleteTodos(todoIds: string[]): Promise<number> {
    let deletedCount = 0;
    
    for (const todoId of todoIds) {
      try {
        const success = await this.deleteTodoTask(todoId);
        if (success) {
          deletedCount++;
        }
      } catch (error) {
        // エラーが発生した場合はスキップ
        continue;
      }
    }
    
    return deletedCount;
  }

  /**
   * ユーザー別TODO一覧を取得
   */
  async getTodosByUserId(
    userId: string,
    filters?: { status?: TodoStatus; priority?: TodoPriority },
    options?: { page?: number; limit?: number }
  ): Promise<TodoTask[]> {
    const { page = 1, limit = 50 } = options || {};
    
    try {
      const todos = await this.sqliteRepo.getTodosByUserId(userId);
      
      // Todo型からTodoTask型へ変換
      let todoTasks = todos.map(todo => this.mapTodoToTodoTask(todo));
      
      // フィルタリング
      if (filters?.status) {
        todoTasks = todoTasks.filter(todo => todo.status === filters.status);
      }
      if (filters?.priority) {
        todoTasks = todoTasks.filter(todo => todo.priority === filters.priority);
      }
      
      // ページネーション
      return this.paginate(todoTasks, page, limit);
    } catch (error) {
      return [];
    }
  }

  /**
   * 期限切れのTODOタスクを取得
   */
  async getOverdueTodos(): Promise<TodoTask[]> {
    const today = new Date().toISOString().split('T')[0];
    
    try {
      // 全ユーザーのTODOを取得（TODO: 後でより効率的な実装に変更）
      const allUsers = await this.sqliteRepo.getAllUsers();
      const allTodos = [];
      
      for (const user of allUsers) {
        const todos = await this.sqliteRepo.getTodosByUserId(user.userId);
        allTodos.push(...todos);
      }
      
      // 期限切れのTODOをフィルタリング（日付文字列比較）
      const overdueTodos = allTodos.filter(todo => {
        if (!todo.dueDate || todo.status === 'completed') {
          return false;
        }
        
        // 日付文字列を正規化して比較
        const todoDate = todo.dueDate.split('T')[0]; // YYYY-MM-DD部分のみ取得
        return todoDate < today;
      });
      
      // Todo型からTodoTask型へ変換
      return overdueTodos.map(todo => this.mapTodoToTodoTask(todo));
    } catch (error) {
      return [];
    }
  }

  /**
   * 複数のTODOタスクを一括作成
   * トランザクションで実行し、一部失敗時もロールバックしない
   */
  async bulkCreateTodos(todoRequests: CreateTodoRequest[]): Promise<TodoTask[]> {
    const createdTodos: TodoTask[] = [];
    const errors: string[] = [];
    
    for (const request of todoRequests) {
      try {
        const createdTodo = await this.createTodoTask(request);
        createdTodos.push(createdTodo);
      } catch (error) {
        // エラーログを記録（本番環境での問題特定用）
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Failed to create TODO "${request.content}": ${errorMsg}`);
        continue;
      }
    }
    
    // エラーがあった場合のログ出力（デバッグ用）
    if (errors.length > 0 && process.env.NODE_ENV !== 'production') {
      logger.warn('WEB_ADMIN', `[Bulk Create] ${errors.length} TODOs failed to create:`, { errors });
    }
    
    return createdTodos;
  }

  /**
   * デフォルトタイムゾーンを取得
   */
  private getDefaultTimezone(): string {
    return this.timezoneService?.getSystemTimezone() || 'Asia/Tokyo';
  }
}