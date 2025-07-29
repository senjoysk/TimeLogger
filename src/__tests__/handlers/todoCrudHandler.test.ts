/**
 * 🔴 Red Phase: TodoCrudHandler のテスト - 実装前なので失敗する
 * TDD開発: コマンド解析とCRUD操作の責任分離
 */

import { Message } from 'discord.js';
import { TodoCrudHandler } from '../../handlers/todoCrudHandler';
import { ITodoRepository } from '../../repositories/interfaces';
import { Todo, CreateTodoRequest } from '../../types/todo';

// モックインターフェース実装
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
    return { 
      total: 0, pending: 0, completed: 0, inProgress: 0,
      cancelled: 0, overdue: 0, todayCompleted: 0, weekCompleted: 0
    }; 
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
const createMockMessage = (content: string, userId: string = 'test-user'): any => ({
  content,
  author: { id: userId },
  reply: jest.fn().mockResolvedValue({})
});

describe('🔴 Red Phase: TodoCrudHandler分離テスト', () => {
  let handler: TodoCrudHandler;
  let mockTodoRepo: MockTodoRepository;

  beforeEach(() => {
    mockTodoRepo = new MockTodoRepository();
    handler = new TodoCrudHandler(mockTodoRepo);
  });

  describe('コマンド解析機能', () => {
    test('TODO追加コマンドが正しく解析される', async () => {
      const message = createMockMessage('!todo add 新しいTODO', 'test-user') as Message;
      
      await handler.handleCommand(message, 'test-user', ['add', '新しいTODO'], 'Asia/Tokyo');
      
      expect(message.reply).toHaveBeenCalledWith('✅ TODO「新しいTODO」を追加しました！');
      
      const todos = await mockTodoRepo.getTodosByUserId('test-user');
      expect(todos).toHaveLength(1);
      expect(todos[0].content).toBe('新しいTODO');
    });

    test('TODO完了コマンドが正しく解析される', async () => {
      const todo = await mockTodoRepo.createTodo({
        userId: 'test-user',
        content: 'テスト用TODO'
      });

      const message = createMockMessage(`!todo done ${todo.id}`, 'test-user') as Message;
      
      await handler.handleCommand(message, 'test-user', ['done', todo.id], 'Asia/Tokyo');
      
      expect(message.reply).toHaveBeenCalledWith(`🎉 TODO「${todo.content}」を完了しました！`);
      
      const updatedTodo = await mockTodoRepo.getTodoById(todo.id);
      expect(updatedTodo?.status).toBe('completed');
    });

    test('不正なコマンドでエラーメッセージが表示される', async () => {
      const message = createMockMessage('!todo add', 'test-user') as Message;
      
      await handler.handleCommand(message, 'test-user', ['add'], 'Asia/Tokyo');
      
      expect(message.reply).toHaveBeenCalled();
      const replyText = (message.reply as jest.Mock).mock.calls[0][0];
      expect(replyText).toContain('❌');
      expect(replyText).toContain('TODO内容を入力してください');
    });
  });

  describe('CRUD操作機能', () => {
    test('TODO一覧表示が正しく動作する', async () => {
      await mockTodoRepo.createTodo({
        userId: 'test-user',
        content: 'テスト用TODO'
      });

      const message = createMockMessage('!todo', 'test-user') as Message;
      
      await handler.handleCommand(message, 'test-user', [], 'Asia/Tokyo');
      
      expect(message.reply).toHaveBeenCalled();
      const replyCall = (message.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall).toHaveProperty('embeds');
      expect(replyCall.embeds[0].data.title).toBe('📋 TODO一覧');
      
      // ボタンコンポーネントの存在を確認
      expect(replyCall).toHaveProperty('components');
      expect(replyCall.components).toBeDefined();
      // 1つのTODOがあるので1つのアクションボタン行がある
      expect(replyCall.components).toHaveLength(1);
    });

    test('11件以上のTODOでページネーション機能が有効になる', async () => {
      // 15件のTODOを作成
      for (let i = 1; i <= 15; i++) {
        await mockTodoRepo.createTodo({
          userId: 'test-user',
          content: `TODO ${i}`
        });
      }

      const message = createMockMessage('!todo', 'test-user') as Message;
      
      await handler.handleCommand(message, 'test-user', [], 'Asia/Tokyo');
      
      expect(message.reply).toHaveBeenCalled();
      const replyCall = (message.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall).toHaveProperty('components');
      
      // ページネーションボタン（1行）+ 最大4つのTODOアクションボタン（4行）= 5行
      expect(replyCall.components).toHaveLength(5);
      
      // 最初のコンポーネントがページネーションボタンであることを確認
      const paginationRow = replyCall.components[0];
      expect(paginationRow.components).toHaveLength(3); // 前・現在・次のページボタン
    });

    test('TODO編集が正しく動作する', async () => {
      const todo = await mockTodoRepo.createTodo({
        userId: 'test-user',
        content: '元のTODO'
      });

      const message = createMockMessage(`!todo edit ${todo.id} 編集されたTODO`, 'test-user') as Message;
      
      await handler.handleCommand(message, 'test-user', ['edit', todo.id, '編集されたTODO'], 'Asia/Tokyo');
      
      expect(message.reply).toHaveBeenCalledWith('✏️ TODO「元のTODO」を「編集されたTODO」に編集しました！');
      
      const updatedTodo = await mockTodoRepo.getTodoById(todo.id);
      expect(updatedTodo?.content).toBe('編集されたTODO');
    });

    test('TODO削除が正しく動作する', async () => {
      const todo = await mockTodoRepo.createTodo({
        userId: 'test-user',
        content: 'テスト用TODO'
      });

      const message = createMockMessage(`!todo delete ${todo.id}`, 'test-user') as Message;
      
      await handler.handleCommand(message, 'test-user', ['delete', todo.id], 'Asia/Tokyo');
      
      expect(message.reply).toHaveBeenCalledWith(`🗑️ TODO「${todo.content}」を削除しました。`);
      
      const deletedTodo = await mockTodoRepo.getTodoById(todo.id);
      expect(deletedTodo).toBeNull();
    });

    test('TODO検索が正しく動作する', async () => {
      await mockTodoRepo.createTodo({
        userId: 'test-user',
        content: '資料を作成する'
      });
      
      await mockTodoRepo.createTodo({
        userId: 'test-user',
        content: '会議に参加する'
      });

      const message = createMockMessage('!todo search 資料', 'test-user') as Message;
      
      await handler.handleCommand(message, 'test-user', ['search', '資料'], 'Asia/Tokyo');
      
      expect(message.reply).toHaveBeenCalled();
      const replyCall = (message.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall).toHaveProperty('embeds');
      expect(replyCall.embeds[0].data.title).toBe('🔍 検索結果: "資料"');
    });
  });

  describe('ヘルプ機能', () => {
    test('ヘルプコマンドが正しく動作する', async () => {
      const message = createMockMessage('!todo help', 'test-user') as Message;
      
      await handler.showHelp(message);
      
      expect(message.reply).toHaveBeenCalled();
      const replyCall = (message.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall).toHaveProperty('embeds');
      expect(replyCall.embeds[0].data.title).toBe('📋 TODOコマンドヘルプ');
    });
  });

  describe('短縮ID対応', () => {
    test('短縮IDでTODO操作ができる', async () => {
      const testTodo = await mockTodoRepo.createTodo({
        userId: 'test-user',
        content: '短縮IDテスト',
        priority: 0,
      });

      const shortId = testTodo.id.substring(0, 8);
      const message = createMockMessage(`!todo done ${shortId}`, 'test-user') as Message;
      
      await handler.handleCommand(message, 'test-user', ['done', shortId], 'Asia/Tokyo');
      
      expect(message.reply).toHaveBeenCalledWith('🎉 TODO「短縮IDテスト」を完了しました！');
      
      const updatedTodo = await mockTodoRepo.getTodoById(testTodo.id);
      expect(updatedTodo?.status).toBe('completed');
    });
  });
});