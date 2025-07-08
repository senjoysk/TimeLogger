/**
 * ITodoRepositoryインターフェースのテスト
 * TDD開発: Red Phase - まず失敗するテストを書く
 */

import { ITodoRepository } from '../../repositories/interfaces';
import { Todo, TodoStatus, CreateTodoRequest, UpdateTodoRequest, GetTodosOptions, TodoStats } from '../../types/todo';
import { v4 as uuidv4 } from 'uuid';

// モックリポジトリの実装（TDD Green Phase）
class MockTodoRepository implements ITodoRepository {
  private todos: Todo[] = [];
  
  async createTodo(request: CreateTodoRequest): Promise<Todo> {
    const todo: Todo = {
      id: uuidv4(),
      userId: request.userId,
      content: request.content,
      status: 'pending',
      priority: request.priority || 0,
      dueDate: request.dueDate,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sourceType: request.sourceType || 'manual',
      relatedActivityId: request.relatedActivityId,
      aiConfidence: request.aiConfidence,
    };
    this.todos.push(todo);
    return todo;
  }
  
  async getTodoById(id: string): Promise<Todo | null> {
    return this.todos.find(todo => todo.id === id) || null;
  }
  
  async getTodosByUserId(userId: string, options?: GetTodosOptions): Promise<Todo[]> {
    let results = this.todos.filter(todo => todo.userId === userId);
    
    if (options?.status) {
      results = results.filter(todo => todo.status === options.status);
    }
    
    if (options?.orderBy === 'priority') {
      results.sort((a, b) => b.priority - a.priority);
    }
    
    return results;
  }
  
  async updateTodo(id: string, update: UpdateTodoRequest): Promise<void> {
    const todo = this.todos.find(t => t.id === id);
    if (todo) {
      // 少し時間を置いて更新時刻を変更
      await new Promise(resolve => setTimeout(resolve, 10));
      Object.assign(todo, update);
      todo.updatedAt = new Date().toISOString();
    }
  }
  
  async updateTodoStatus(id: string, status: TodoStatus): Promise<void> {
    const todo = this.todos.find(t => t.id === id);
    if (todo) {
      todo.status = status;
      todo.updatedAt = new Date().toISOString();
      if (status === 'completed') {
        todo.completedAt = new Date().toISOString();
      }
    }
  }
  
  async deleteTodo(id: string): Promise<void> {
    const index = this.todos.findIndex(t => t.id === id);
    if (index !== -1) {
      this.todos.splice(index, 1);
    }
  }
  
  async searchTodos(userId: string, keyword: string): Promise<Todo[]> {
    return this.todos.filter(todo => 
      todo.userId === userId && 
      todo.content.toLowerCase().includes(keyword.toLowerCase())
    );
  }
  
  async getTodoStats(userId: string): Promise<TodoStats> {
    const userTodos = this.todos.filter(todo => todo.userId === userId);
    return {
      total: userTodos.length,
      pending: userTodos.filter(t => t.status === 'pending').length,
      inProgress: userTodos.filter(t => t.status === 'in_progress').length,
      completed: userTodos.filter(t => t.status === 'completed').length,
      cancelled: userTodos.filter(t => t.status === 'cancelled').length,
      todayCompleted: 0,
      weekCompleted: 0,
    };
  }
  
  async getTodosWithDueDate(userId: string, beforeDate?: string): Promise<Todo[]> {
    return this.todos.filter(todo => todo.userId === userId && todo.dueDate);
  }
  
  async getTodosByActivityId(activityId: string): Promise<Todo[]> {
    return this.todos.filter(todo => todo.relatedActivityId === activityId);
  }
  
  // パフォーマンス最適化メソッド
  async getTodosByDateRange(userId: string, startDate: string, endDate: string): Promise<Todo[]> {
    return this.todos.filter(todo => {
      if (todo.userId !== userId) return false;
      if (!todo.dueDate) return false;
      return todo.dueDate >= startDate && todo.dueDate <= endDate;
    });
  }
  
  async getTodosByStatusOptimized(userId: string, statuses: TodoStatus[]): Promise<Todo[]> {
    return this.todos.filter(todo => 
      todo.userId === userId && statuses.includes(todo.status)
    );
  }
}

describe('ITodoRepository', () => {
  let repository: ITodoRepository;

  // モックリポジトリの実装（後で実際の実装に置き換える）
  beforeEach(() => {
    repository = new MockTodoRepository();
  });

  describe('createTodo', () => {
    test('新しいTODOを作成できる', async () => {
      const request: CreateTodoRequest = {
        userId: 'user123',
        content: 'テストTODOタスク',
        priority: 0,
        sourceType: 'manual'
      };

      const result = await repository.createTodo(request);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.userId).toBe(request.userId);
      expect(result.content).toBe(request.content);
      expect(result.status).toBe('pending');
      expect(result.priority).toBe(request.priority);
      expect(result.sourceType).toBe(request.sourceType);
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    test('AI提案によるTODOを作成できる', async () => {
      const request: CreateTodoRequest = {
        userId: 'user123',
        content: 'AI提案タスク',
        priority: 1,
        sourceType: 'ai_suggested',
        aiConfidence: 0.85,
        relatedActivityId: 'activity123'
      };

      const result = await repository.createTodo(request);

      expect(result.sourceType).toBe('ai_suggested');
      expect(result.aiConfidence).toBe(0.85);
      expect(result.relatedActivityId).toBe('activity123');
    });
  });

  describe('getTodoById', () => {
    test('IDでTODOを取得できる', async () => {
      const createRequest: CreateTodoRequest = {
        userId: 'user123',
        content: 'テストタスク',
      };
      const created = await repository.createTodo(createRequest);
      
      const result = await repository.getTodoById(created.id);

      expect(result).toBeDefined();
      expect(result?.id).toBe(created.id);
    });

    test('存在しないIDの場合はnullを返す', async () => {
      const result = await repository.getTodoById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('getTodosByUserId', () => {
    test('ユーザーIDでTODO一覧を取得できる', async () => {
      const userId = 'user123';
      
      // テストデータを作成
      await repository.createTodo({ userId, content: 'タスク1' });
      await repository.createTodo({ userId, content: 'タスク2' });
      
      const results = await repository.getTodosByUserId(userId);

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(2);
      results.forEach(todo => {
        expect(todo.userId).toBe(userId);
      });
    });

    test('ステータスでフィルタリングできる', async () => {
      const userId = 'user123';
      
      // 異なるステータスのTODOを作成
      const todo1 = await repository.createTodo({ userId, content: 'タスク1' });
      const todo2 = await repository.createTodo({ userId, content: 'タスク2' });
      
      await repository.updateTodoStatus(todo2.id, 'completed');
      
      const status: TodoStatus = 'pending';
      const results = await repository.getTodosByUserId(userId, { status });

      expect(results.length).toBe(1);
      results.forEach(todo => {
        expect(todo.status).toBe(status);
      });
    });

    test('優先度でソートできる', async () => {
      const userId = 'user123';
      
      // 異なる優先度のTODOを作成
      await repository.createTodo({ userId, content: 'タスク1', priority: 1 });
      await repository.createTodo({ userId, content: 'タスク2', priority: 0 });
      await repository.createTodo({ userId, content: 'タスク3', priority: -1 });
      
      const results = await repository.getTodosByUserId(userId, { orderBy: 'priority' });

      expect(results.length).toBe(3);
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].priority).toBeGreaterThanOrEqual(results[i].priority);
      }
    });
  });

  describe('updateTodo', () => {
    test('TODOを更新できる', async () => {
      const created = await repository.createTodo({
        userId: 'user123',
        content: '元のタスク'
      });
      
      const update: UpdateTodoRequest = {
        content: '更新されたタスク',
        priority: 1,
        dueDate: new Date().toISOString()
      };

      await repository.updateTodo(created.id, update);
      const updated = await repository.getTodoById(created.id);

      expect(updated?.content).toBe(update.content);
      expect(updated?.priority).toBe(update.priority);
      expect(updated?.dueDate).toBe(update.dueDate);
      expect(updated?.updatedAt).not.toBe(updated?.createdAt);
    });

    test('ステータスを更新できる', async () => {
      const created = await repository.createTodo({
        userId: 'user123',
        content: 'テストタスク'
      });
      
      const newStatus: TodoStatus = 'completed';

      await repository.updateTodoStatus(created.id, newStatus);
      const updated = await repository.getTodoById(created.id);

      expect(updated?.status).toBe(newStatus);
      expect(updated?.completedAt).toBeDefined();
    });
  });

  describe('deleteTodo', () => {
    test('TODOを削除できる', async () => {
      const created = await repository.createTodo({
        userId: 'user123',
        content: 'テストタスク'
      });
      
      await repository.deleteTodo(created.id);
      const result = await repository.getTodoById(created.id);

      expect(result).toBeNull();
    });
  });

  describe('searchTodos', () => {
    test('キーワードでTODOを検索できる', async () => {
      const userId = 'user123';
      const keyword = 'プレゼン';
      
      // テストデータを作成
      await repository.createTodo({ userId, content: 'プレゼン資料を作成する' });
      await repository.createTodo({ userId, content: '会議の準備をする' });
      
      const results = await repository.searchTodos(userId, keyword);

      expect(results.length).toBe(1);
      results.forEach(todo => {
        expect(todo.content.toLowerCase()).toContain(keyword.toLowerCase());
      });
    });
  });

  describe('getTodoStats', () => {
    test('TODO統計を取得できる', async () => {
      const userId = 'user123';
      
      // テストデータを作成
      const todo1 = await repository.createTodo({ userId, content: 'タスク1' });
      const todo2 = await repository.createTodo({ userId, content: 'タスク2' });
      await repository.updateTodoStatus(todo2.id, 'completed');
      
      const stats = await repository.getTodoStats(userId);

      expect(stats).toBeDefined();
      expect(stats.total).toBe(2);
      expect(stats.pending).toBe(1);
      expect(stats.completed).toBe(1);
      expect(stats.inProgress).toBe(0);
      expect(stats.cancelled).toBe(0);
    });
  });
});