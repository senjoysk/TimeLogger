/**
 * AdminRepository実装
 * 既存のSqliteActivityLogRepositoryを拡張して管理機能を提供
 */

import { IAdminRepository } from '../interfaces/adminInterfaces';
import { SearchFilters, PaginationOptions } from '../types/admin';
import { SqliteActivityLogRepository } from '../../repositories/sqliteActivityLogRepository';
import { TodoTask, TodoStatus, TodoPriority, Todo } from '../../types/todo';
import { v4 as uuidv4 } from 'uuid';

export class AdminRepository implements IAdminRepository {
  private sqliteRepo: SqliteActivityLogRepository;

  constructor(sqliteRepo: SqliteActivityLogRepository) {
    this.sqliteRepo = sqliteRepo;
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
            db.get("SELECT COUNT(*) as count FROM activity_logs", (err: any, row: any) => {
              if (err) reject(err);
              else resolve(row.count);
            });
          });
          return result;
        case 'todo_tasks':
          const todoCount = await new Promise<number>((resolve, reject) => {
            db.get("SELECT COUNT(*) as count FROM todo_tasks", (err: any, row: any) => {
              if (err) reject(err);
              else resolve(row.count);
            });
          });
          return todoCount;
        case 'user_settings':
          const userCount = await new Promise<number>((resolve, reject) => {
            db.get("SELECT COUNT(DISTINCT user_id) as count FROM user_settings", (err: any, row: any) => {
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
          const logs = await this.sqliteRepo.getActivityRecords(user.userId, 'Asia/Tokyo');
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
  async getTableData(tableName: string, options: PaginationOptions = {}): Promise<any[]> {
    const { page = 1, limit = 50 } = options;
    
    try {
      // SQLを直接実行してN+1問題を回避
      const db = (this.sqliteRepo as any).db;
      
      switch (tableName) {
        case 'activity_logs':
          const offset = (page - 1) * limit;
          const logs = await new Promise<any[]>((resolve, reject) => {
            db.all(
              "SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT ? OFFSET ?",
              [limit, offset],
              (err: any, rows: any[]) => {
                if (err) reject(err);
                else resolve(rows);
              }
            );
          });
          return logs;
        case 'todo_tasks':
          const todoOffset = (page - 1) * limit;
          const todos = await new Promise<any[]>((resolve, reject) => {
            db.all(
              "SELECT * FROM todo_tasks ORDER BY created_at DESC LIMIT ? OFFSET ?",
              [limit, todoOffset],
              (err: any, rows: any[]) => {
                if (err) reject(err);
                else resolve(rows);
              }
            );
          });
          return todos;
        case 'user_settings':
          const userOffset = (page - 1) * limit;
          const users = await new Promise<any[]>((resolve, reject) => {
            db.all(
              "SELECT DISTINCT user_id, timezone, created_at, updated_at FROM user_settings ORDER BY updated_at DESC LIMIT ? OFFSET ?",
              [limit, userOffset],
              (err: any, rows: any[]) => {
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
  private async getTableDataFallback(tableName: string, options: PaginationOptions = {}): Promise<any[]> {
    const { page = 1, limit = 50 } = options;
    
    switch (tableName) {
      case 'activity_logs':
        const users = await this.sqliteRepo.getAllUsers();
        const allLogs = [];
        for (const user of users) {
          const logs = await this.sqliteRepo.getActivityRecords(user.userId, 'Asia/Tokyo');
          allLogs.push(...logs);
        }
        allLogs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return this.paginate(allLogs, page, limit);
      case 'todo_tasks':
        const allUsers = await this.sqliteRepo.getAllUsers();
        const allTodos = [];
        for (const user of allUsers) {
          const todos = await this.sqliteRepo.getTodosByUserId(user.userId);
          allTodos.push(...todos);
        }
        allTodos.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return this.paginate(allTodos, page, limit);
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
  ): Promise<any[]> {
    const { page = 1, limit = 50 } = options;
    
    // 各テーブルごとに適切なフィルタリングを実装
    switch (tableName) {
      case 'activity_logs':
        if (filters.userId && filters.userId !== 'all') {
          const logs = await this.sqliteRepo.getActivityRecords(filters.userId, 'Asia/Tokyo');
          return this.paginate(logs, page, limit);
        }
        return this.getTableData(tableName, options);
      case 'todo_tasks':
        if (filters.userId && filters.userId !== 'all') {
          const todos = await this.sqliteRepo.getTodosByUserId(filters.userId);
          return this.paginate(todos, page, limit);
        }
        return this.getTableData(tableName, options);
      default:
        return this.getTableData(tableName, options);
    }
  }

  /**
   * テーブルスキーマを取得
   */
  async getTableSchema(tableName: string): Promise<any> {
    // 暫定的なスキーマ情報を返す
    return [
      { name: 'id', type: 'TEXT', pk: 1 },
      { name: 'created_at', type: 'TEXT', pk: 0 },
      { name: 'updated_at', type: 'TEXT', pk: 0 }
    ];
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
      title: todo.content,
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
    title: string;
    description?: string;
    priority: TodoPriority;
    dueDate?: string;
  }): Promise<TodoTask> {
    // SqliteActivityLogRepositoryを使用してTODOを作成
    const createdTodo = await this.sqliteRepo.createTodo({
      userId: data.userId,
      content: data.title, // titleをcontentにマッピング
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
    title?: string;
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
    const updateData: any = {};
    if (updates.title) updateData.content = updates.title;
    if (updates.status) updateData.status = updates.status;
    if (updates.priority) {
      updateData.priority = updates.priority === 'high' ? 1 : updates.priority === 'low' ? -1 : 0;
    }
    if (updates.dueDate !== undefined) updateData.dueDate = updates.dueDate;

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
}