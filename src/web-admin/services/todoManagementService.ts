/**
 * TodoManagementService実装
 * Phase 2: Green Phase - テストを通す最小実装
 */

import { TodoTask, TodoStatus, TodoPriority } from '../../types/todo';
import { AdminRepository } from '../repositories/adminRepository';
import { IAdminRepository } from '../interfaces/adminInterfaces';

export interface CreateTodoRequest {
  userId: string;
  content: string;  // titleからcontentに統一
  description?: string;
  priority: TodoPriority;
  dueDate?: string;
}

export interface UpdateTodoRequest {
  content?: string;  // titleからcontentに統一
  description?: string;
  status?: TodoStatus;
  priority?: TodoPriority;
  dueDate?: string;
}

export interface TodoFilters {
  status?: TodoStatus;
  priority?: TodoPriority;
  dueDate?: string;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
}

export interface BulkCreateTodoRequest {
  userId: string;
  baseName: string;
  count: number;
  priority: TodoPriority;
}

export class TodoManagementService {
  constructor(private repository: IAdminRepository) {}

  /**
   * 新しいTODOタスクを作成
   */
  async createTodo(data: CreateTodoRequest): Promise<TodoTask> {
    // バリデーション
    if (!data.userId || !data.content) {
      throw new Error('Invalid TODO data');
    }

    if (!['low', 'medium', 'high'].includes(data.priority)) {
      throw new Error('Invalid TODO data');
    }

    return await this.repository.createTodoTask(data);
  }

  /**
   * TODOタスクを更新
   */
  async updateTodo(todoId: string, updates: UpdateTodoRequest): Promise<TodoTask> {
    // バリデーション
    if (updates.status && !['pending', 'in_progress', 'completed'].includes(updates.status)) {
      throw new Error('Invalid TODO status');
    }

    return await this.repository.updateTodoTask(todoId, updates);
  }

  /**
   * TODOタスクを削除
   */
  async deleteTodo(todoId: string): Promise<boolean> {
    return await this.repository.deleteTodoTask(todoId);
  }

  /**
   * TODOタスクをIDで取得
   */
  async getTodoById(todoId: string): Promise<TodoTask | null> {
    return await this.repository.getTodoTaskById(todoId);
  }

  /**
   * 複数のTODOタスクのステータスを一括変更
   */
  async bulkUpdateStatus(todoIds: string[], newStatus: TodoStatus): Promise<number> {
    return await this.repository.bulkUpdateTodoStatus(todoIds, newStatus);
  }

  /**
   * 複数のTODOタスクを一括削除
   */
  async bulkDelete(todoIds: string[]): Promise<number> {
    try {
      const result = await this.repository.bulkDeleteTodos(todoIds);
      return result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * ユーザー別TODO一覧を取得
   */
  async getTodosByUser(
    userId: string,
    filters?: TodoFilters,
    options?: PaginationOptions
  ): Promise<TodoTask[]> {
    return await this.repository.getTodosByUserId(userId, filters, options);
  }

  /**
   * 期限切れのTODOタスクを取得
   */
  async getOverdueTodos(): Promise<TodoTask[]> {
    return await this.repository.getOverdueTodos();
  }

  /**
   * 連番付きTODOを一括作成
   * 開発環境でのテストデータ作成に使用
   */
  async bulkCreateTodos(request: BulkCreateTodoRequest): Promise<TodoTask[]> {
    // バリデーション
    this.validateBulkCreateRequest(request);

    // 連番付きTODOデータを生成
    const todoRequests: CreateTodoRequest[] = this.generateSequentialTodos(request);

    return await this.repository.bulkCreateTodos(todoRequests);
  }

  /**
   * 一括作成リクエストのバリデーション
   */
  private validateBulkCreateRequest(request: BulkCreateTodoRequest): void {
    if (!request.userId || request.userId.trim().length === 0) {
      throw new Error('Invalid bulk create request: userId is required');
    }

    if (!request.baseName || request.baseName.trim().length === 0) {
      throw new Error('Invalid bulk create request: baseName is required');
    }

    if (!Number.isInteger(request.count) || request.count < 1 || request.count > 100) {
      throw new Error('Invalid bulk create request: count must be between 1 and 100');
    }

    if (!['low', 'medium', 'high'].includes(request.priority)) {
      throw new Error('Invalid bulk create request: invalid priority');
    }
  }

  /**
   * 連番付きTODOデータの生成
   */
  private generateSequentialTodos(request: BulkCreateTodoRequest): CreateTodoRequest[] {
    const todoRequests: CreateTodoRequest[] = [];
    
    for (let i = 1; i <= request.count; i++) {
      const sequentialNumber = String(i).padStart(3, '0');
      todoRequests.push({
        userId: request.userId,
        content: `${request.baseName}${sequentialNumber}`,
        description: '',
        priority: request.priority
      });
    }
    
    return todoRequests;
  }
}