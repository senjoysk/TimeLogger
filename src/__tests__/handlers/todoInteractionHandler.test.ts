/**
 * 🔴 Red Phase: TodoInteractionHandler のテスト - 実装前なので失敗する
 * TDD開発: Discord UI操作の責任分離
 */

import { ButtonInteraction } from 'discord.js';
import { TodoInteractionHandler } from '../../handlers/todoInteractionHandler';
import { ITodoRepository } from '../../repositories/interfaces';
import { Todo, CreateTodoRequest } from '../../types/todo';

// モック実装
class MockTodoRepository implements ITodoRepository {
  private todos: Todo[] = [];
  private nextId = 1;

  async createTodo(request: CreateTodoRequest): Promise<Todo> {
    const uniquePrefix = `${this.nextId.toString(36).padStart(8, '0')}`;
    const uuid = `${uniquePrefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const todo: Todo = {
      id: uuid,
      userId: request.userId,
      content: request.content,
      status: 'pending',
      priority: request.priority || 0,
      dueDate: request.dueDate,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: undefined,
      sourceType: request.sourceType || 'manual',
      relatedActivityId: request.relatedActivityId,
      aiConfidence: request.aiConfidence
    };
    this.todos.push(todo);
    this.nextId++;
    return todo;
  }

  async getTodoById(id: string): Promise<Todo | null> {
    return this.todos.find(todo => todo.id === id) || null;
  }

  async getTodosByUserId(userId: string): Promise<Todo[]> {
    return this.todos.filter(todo => todo.userId === userId);
  }

  async updateTodo(id: string, update: any): Promise<void> {
    const todo = this.todos.find(t => t.id === id);
    if (!todo) return;
    Object.assign(todo, update);
    todo.updatedAt = new Date().toISOString();
  }

  async updateTodoStatus(id: string, status: any): Promise<void> {
    const todo = this.todos.find(t => t.id === id);
    if (!todo) return;
    todo.status = status;
    todo.updatedAt = new Date().toISOString();
    if (status === 'completed') {
      todo.completedAt = new Date().toISOString();
    }
  }

  async deleteTodo(id: string): Promise<void> {
    const index = this.todos.findIndex(t => t.id === id);
    if (index === -1) return;
    this.todos.splice(index, 1);
  }

  async searchTodos(userId: string, keyword: string): Promise<Todo[]> {
    return this.todos.filter(todo => 
      todo.userId === userId && 
      todo.content.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  async getTodoStats(userId: string) { 
    return { total: 0, pending: 0, completed: 0, inProgress: 0, cancelled: 0, overdue: 0, todayCompleted: 0, weekCompleted: 0 }; 
  }
  async getTodosWithDueDate() { return []; }
  async getTodosByActivityId() { return []; }
  async getTodosByDateRange() { return []; }
  async getTodosByStatusOptimized(userId: string, statuses: string[]) { 
    return this.todos.filter(todo => 
      todo.userId === userId && 
      statuses.includes(todo.status)
    ); 
  }
}

// Discord.jsオブジェクトのモック
const createMockButtonInteraction = (customId: string, userId: string = 'test-user'): any => ({
  customId,
  user: { id: userId },
  reply: jest.fn().mockResolvedValue({}),
  update: jest.fn().mockResolvedValue({}),
  replied: false
});

describe('🔴 Red Phase: TodoInteractionHandler分離テスト', () => {
  let handler: TodoInteractionHandler;
  let mockTodoRepo: MockTodoRepository;

  beforeEach(() => {
    mockTodoRepo = new MockTodoRepository();
    handler = new TodoInteractionHandler(mockTodoRepo);
  });

  describe('TODOボタンインタラクション', () => {
    test('TODO完了ボタンが正しく動作する', async () => {
      // 事前にTODOを作成
      const todo = await mockTodoRepo.createTodo({
        userId: 'test-user',
        content: 'テスト用TODO'
      });

      const interaction = createMockButtonInteraction(`todo_complete_${todo.id}`, 'test-user') as ButtonInteraction;
      
      await handler.handleTodoActionButton(interaction, 'complete', todo.id, 'test-user', 'Asia/Tokyo');
      
      expect(interaction.reply).toHaveBeenCalled();
      const replyCall = (interaction.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall.content).toContain('🎉');
      expect(replyCall.content).toContain('完了しました');
      
      const updatedTodo = await mockTodoRepo.getTodoById(todo.id);
      expect(updatedTodo?.status).toBe('completed');
    });

    test('優先度変更の選択肢が提示される', async () => {
      // 事前にTODOを作成
      const todo = await mockTodoRepo.createTodo({
        userId: 'test-user',
        content: 'テスト用TODO'
      });

      const interaction = createMockButtonInteraction(`todo_priority_${todo.id}`, 'test-user') as ButtonInteraction;
      
      await handler.handleTodoActionButton(interaction, 'priority', todo.id, 'test-user', 'Asia/Tokyo');
      
      expect(interaction.reply).toHaveBeenCalled();
      const replyCall = (interaction.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall.content).toContain('優先度を選択');
      expect(replyCall.ephemeral).toBe(true);
    });

    test('優先度が更新される', async () => {
      const todo = await mockTodoRepo.createTodo({
        userId: 'test-user',
        content: 'テスト用TODO',
        priority: 0,
      });

      const interaction = createMockButtonInteraction(`todo_priority1_${todo.id}`, 'test-user') as ButtonInteraction;
      
      await handler.handleTodoActionButton(interaction, 'priority1', todo.id, 'test-user', 'Asia/Tokyo');
      
      expect(interaction.reply).toHaveBeenCalled();
      const updated = await mockTodoRepo.getTodoById(todo.id);
      expect(updated?.priority).toBe(1);
    });

    test('TODO削除ボタンが正しく動作する', async () => {
      // 事前にTODOを作成
      const todo = await mockTodoRepo.createTodo({
        userId: 'test-user',
        content: 'テスト用TODO'
      });

      const interaction = createMockButtonInteraction(`todo_delete_${todo.id}`, 'test-user') as ButtonInteraction;
      
      await handler.handleTodoActionButton(interaction, 'delete', todo.id, 'test-user', 'Asia/Tokyo');
      
      expect(interaction.reply).toHaveBeenCalled();
      const replyCall = (interaction.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall.content).toContain('🗑️');
      expect(replyCall.content).toContain('削除しました');
      
      const deletedTodo = await mockTodoRepo.getTodoById(todo.id);
      expect(deletedTodo).toBeNull();
    });

    test('存在しないTODOに対するボタン操作でエラーメッセージが表示される', async () => {
      const interaction = createMockButtonInteraction('todo_complete_invalid-id', 'test-user') as ButtonInteraction;
      
      await handler.handleTodoActionButton(interaction, 'complete', 'invalid-id', 'test-user', 'Asia/Tokyo');
      
      expect(interaction.reply).toHaveBeenCalled();
      const replyCall = (interaction.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall.content).toBe('❌ TODOが見つかりません。');
      expect(replyCall.ephemeral).toBe(true);
    });

    test('他のユーザーのTODOに対するボタン操作が拒否される', async () => {
      // 他のユーザーのTODOを作成
      const todo = await mockTodoRepo.createTodo({
        userId: 'other-user',
        content: '他のユーザーのTODO'
      });

      const interaction = createMockButtonInteraction(`todo_complete_${todo.id}`, 'test-user') as ButtonInteraction;
      
      await handler.handleTodoActionButton(interaction, 'complete', todo.id, 'test-user', 'Asia/Tokyo');
      
      expect(interaction.reply).toHaveBeenCalled();
      const replyCall = (interaction.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall.content).toBe('❌ TODOが見つかりません。');
      expect(replyCall.ephemeral).toBe(true);
    });
  });

  describe('ページネーション機能', () => {
    test('次のページボタンが正しく動作する', async () => {
      // 15件のTODOを作成
      const todos = [];
      for (let i = 1; i <= 15; i++) {
        const todo = await mockTodoRepo.createTodo({
          userId: 'test-user',
          content: `TODO ${i}`,
          priority: 0,
        });
        todos.push(todo);
      }

      const interaction = createMockButtonInteraction('todo_page_next_1', 'test-user') as ButtonInteraction;
      interaction.update = jest.fn().mockResolvedValue({});
      
      await handler.handlePaginationInteraction(interaction, 'next', 1, 'test-user');
      
      expect(interaction.update).toHaveBeenCalled();
      const updateCall = (interaction.update as jest.Mock).mock.calls[0][0];
      
      // 2ページ目の表示を確認
      expect(updateCall.embeds[0].data.title).toContain('(11-15/15件)');
      expect(updateCall.embeds[0].data.title).toContain('ページ 2/2');
    });

    test('前のページボタンが正しく動作する', async () => {
      // 15件のTODOを作成
      for (let i = 1; i <= 15; i++) {
        await mockTodoRepo.createTodo({
          userId: 'test-user',
          content: `TODO ${i}`,
          priority: 0,
        });
      }

      const interaction = createMockButtonInteraction('todo_page_prev_2', 'test-user') as ButtonInteraction;
      interaction.update = jest.fn().mockResolvedValue({});
      
      await handler.handlePaginationInteraction(interaction, 'prev', 2, 'test-user');
      
      expect(interaction.update).toHaveBeenCalled();
      const updateCall = (interaction.update as jest.Mock).mock.calls[0][0];
      
      // 1ページ目の表示を確認
      expect(updateCall.embeds[0].data.title).toContain('(1-10/15件)');
      expect(updateCall.embeds[0].data.title).toContain('ページ 1/2');
    });

    test('ページネーションボタンが正しく生成される', () => {
      const buttons = handler.createPaginationButtons(1, 3);
      
      expect(buttons).toBeDefined();
      expect(buttons.components).toHaveLength(3); // 前のページ、現在ページ、次のページ
      
      // 最初のページでは前のページボタンが無効
      expect((buttons.components[0] as any).data.disabled).toBe(true);
      expect((buttons.components[0] as any).data.label).toContain('◀️ 前のページ');
      
      // 現在のページ情報
      expect((buttons.components[1] as any).data.label).toBe('ページ 1/3');
      expect((buttons.components[1] as any).data.disabled).toBe(true);
      
      // 次のページボタンは有効
      expect((buttons.components[2] as any).data.disabled).toBe(false);
      expect((buttons.components[2] as any).data.label).toContain('次のページ ▶️');
    });
  });

  describe('短縮ID対応', () => {
    test('短縮IDでTODOボタン操作ができる', async () => {
      const testTodo = await mockTodoRepo.createTodo({
        userId: 'test-user',
        content: '短縮IDボタンテスト',
        priority: 0,
      });

      const shortId = testTodo.id.substring(0, 8);
      const interaction = createMockButtonInteraction(`todo_complete_${shortId}`, 'test-user') as ButtonInteraction;
      
      await handler.handleTodoActionButton(interaction, 'complete', shortId, 'test-user', 'Asia/Tokyo');
      
      expect(interaction.reply).toHaveBeenCalled();
      const replyCall = (interaction.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall.content).toContain('🎉');
      expect(replyCall.content).toContain('完了しました');
      
      const updatedTodo = await mockTodoRepo.getTodoById(testTodo.id);
      expect(updatedTodo?.status).toBe('completed');
    });
  });

  describe('エラーハンドリング', () => {
    test('無効なアクションでエラーメッセージが表示される', async () => {
      const todo = await mockTodoRepo.createTodo({
        userId: 'test-user',
        content: 'テスト用TODO'
      });

      const interaction = createMockButtonInteraction(`todo_invalid_${todo.id}`, 'test-user') as ButtonInteraction;
      
      await handler.handleTodoActionButton(interaction, 'invalid', todo.id, 'test-user', 'Asia/Tokyo');
      
      expect(interaction.reply).toHaveBeenCalled();
      const replyCall = (interaction.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall.content).toBe('❌ 未知の操作です。');
      expect(replyCall.ephemeral).toBe(true);
    });
  });
});
