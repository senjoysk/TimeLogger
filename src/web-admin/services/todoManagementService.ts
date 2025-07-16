/**
 * TodoManagementService実装
 * Phase 2: Green Phase - テストを通す最小実装
 */

import { TodoTask, TodoStatus, TodoPriority } from '../../types/todo';
import { AdminRepository } from '../repositories/adminRepository';

export interface CreateTodoRequest {
  userId: string;
  title: string;
  description?: string;
  priority: TodoPriority;
  dueDate?: string;
}

export interface UpdateTodoRequest {
  title?: string;
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

export class TodoManagementService {
  constructor(private repository: AdminRepository) {}

  /**
   * 新しいTODOタスクを作成
   */
  async createTodo(data: CreateTodoRequest): Promise<TodoTask> {
    // バリデーション
    if (!data.userId || !data.title) {
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
    return await this.repository.bulkDeleteTodos(todoIds);
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
}