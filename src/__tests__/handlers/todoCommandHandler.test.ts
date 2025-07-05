/**
 * TodoCommandHandler のテスト
 * TDD開発: Red Phase - まず失敗するテストを書く
 */

import { Message, ButtonInteraction, User, Guild } from 'discord.js';
import { TodoCommandHandler } from '../../handlers/todoCommandHandler';
import { ITodoRepository, IMessageClassificationRepository } from '../../repositories/interfaces';
import { GeminiService } from '../../services/geminiService';
import { MessageClassificationService } from '../../services/messageClassificationService';
import { Todo, CreateTodoRequest, ClassificationResult } from '../../types/todo';

// モックインターフェース実装
class MockTodoRepository implements ITodoRepository {
  private todos: Todo[] = [];
  private nextId = 1;

  async createTodo(request: CreateTodoRequest): Promise<Todo> {
    const todo: Todo = {
      id: `todo-${this.nextId++}`,
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
    if (todo) {
      Object.assign(todo, update);
      todo.updatedAt = new Date().toISOString();
    }
  }

  async updateTodoStatus(id: string, status: any): Promise<void> {
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

  async getTodoStats() { 
    return { 
      total: 0, 
      pending: 0, 
      completed: 0, 
      inProgress: 0,
      cancelled: 0,
      todayCompleted: 0,
      weekCompleted: 0
    }; 
  }
  async getTodosWithDueDate() { return []; }
  async getTodosByActivityId() { return []; }
}

class MockMessageClassificationRepository implements IMessageClassificationRepository {
  async recordClassification() { return {} as any; }
  async updateClassificationFeedback() {}
  async getClassificationAccuracy() { return []; }
  async getClassificationHistory() { return []; }
}

class MockGeminiService {
  async classifyMessageWithAI(message: string): Promise<ClassificationResult> {
    return {
      classification: 'TODO',
      confidence: 0.8,
      reason: 'モックAI分析結果'
    };
  }
}

class MockMessageClassificationService {
  async classifyMessage(message: string): Promise<ClassificationResult> {
    if (message.includes('TODO')) {
      return {
        classification: 'TODO',
        confidence: 0.9,
        reason: 'TODOキーワードが含まれています'
      };
    }
    return {
      classification: 'UNCERTAIN',
      confidence: 0.3,
      reason: '分類が困難です'
    };
  }
}

// Discord.jsオブジェクトのモック
const createMockMessage = (content: string, userId: string = 'test-user'): any => ({
  content,
  author: { id: userId } as User,
  reply: jest.fn().mockResolvedValue({}),
  guild: {} as Guild
});

const createMockButtonInteraction = (customId: string, userId: string = 'test-user'): any => ({
  customId,
  user: { id: userId } as User,
  reply: jest.fn().mockResolvedValue({}),
  update: jest.fn().mockResolvedValue({}),
  replied: false
});

describe('TodoCommandHandler', () => {
  let handler: TodoCommandHandler;
  let mockTodoRepo: MockTodoRepository;
  let mockClassificationRepo: MockMessageClassificationRepository;
  let mockGeminiService: MockGeminiService;
  let mockClassificationService: MockMessageClassificationService;

  beforeEach(() => {
    mockTodoRepo = new MockTodoRepository();
    mockClassificationRepo = new MockMessageClassificationRepository();
    mockGeminiService = new MockGeminiService();
    mockClassificationService = new MockMessageClassificationService();
    
    handler = new TodoCommandHandler(
      mockTodoRepo,
      mockClassificationRepo,
      mockGeminiService as any,
      mockClassificationService as any
    );
  });

  afterEach(() => {
    // リソースクリーンアップ
    if (handler && typeof handler.destroy === 'function') {
      handler.destroy();
    }
  });

  describe('handleCommand', () => {
    test('TODO一覧表示コマンドが正しく動作する', async () => {
      // 事前にTODOを作成
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
    });

    test('TODO追加コマンドが正しく動作する', async () => {
      const message = createMockMessage('!todo add 新しいTODO', 'test-user') as Message;
      
      await handler.handleCommand(message, 'test-user', ['add', '新しいTODO'], 'Asia/Tokyo');
      
      expect(message.reply).toHaveBeenCalledWith('✅ TODO「新しいTODO」を追加しました！');
      
      const todos = await mockTodoRepo.getTodosByUserId('test-user');
      expect(todos).toHaveLength(1);
      expect(todos[0].content).toBe('新しいTODO');
    });

    test('TODO完了コマンドが正しく動作する', async () => {
      // 事前にTODOを作成
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

    test('TODO編集コマンドが正しく動作する', async () => {
      // 事前にTODOを作成
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

    test('TODO削除コマンドが正しく動作する', async () => {
      // 事前にTODOを作成
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

    test('TODO検索コマンドが正しく動作する', async () => {
      // 複数のTODOを作成
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

    test('ヘルプコマンドが正しく動作する', async () => {
      const message = createMockMessage('!todo help', 'test-user') as Message;
      
      await handler.handleCommand(message, 'test-user', ['help'], 'Asia/Tokyo');
      
      expect(message.reply).toHaveBeenCalled();
      const replyCall = (message.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall).toHaveProperty('embeds');
      expect(replyCall.embeds[0].data.title).toBe('📋 TODOコマンドヘルプ');
    });

    test('不正なコマンドでエラーメッセージが表示される', async () => {
      const message = createMockMessage('!todo add', 'test-user') as Message;
      
      await handler.handleCommand(message, 'test-user', ['add'], 'Asia/Tokyo');
      
      expect(message.reply).toHaveBeenCalled();
      const replyText = (message.reply as jest.Mock).mock.calls[0][0];
      expect(replyText).toContain('❌');
      expect(replyText).toContain('TODO内容を入力してください');
    });

    test('存在しないTODOに対する操作でエラーメッセージが表示される', async () => {
      const message = createMockMessage('!todo done invalid-id', 'test-user') as Message;
      
      await handler.handleCommand(message, 'test-user', ['done', 'invalid-id'], 'Asia/Tokyo');
      
      expect(message.reply).toHaveBeenCalledWith('❌ 指定されたTODOが見つかりません。');
    });

    test('他のユーザーのTODOに対する操作が拒否される', async () => {
      // 他のユーザーのTODOを作成
      const todo = await mockTodoRepo.createTodo({
        userId: 'other-user',
        content: '他のユーザーのTODO'
      });

      const message = createMockMessage(`!todo done ${todo.id}`, 'test-user') as Message;
      
      await handler.handleCommand(message, 'test-user', ['done', todo.id], 'Asia/Tokyo');
      
      expect(message.reply).toHaveBeenCalledWith('❌ 他のユーザーのTODOは操作できません。');
    });
  });

  describe('handleMessageClassification', () => {
    test('TODOメッセージが正しく分類される', async () => {
      const message = createMockMessage('プレゼン資料をTODOとして作成する', 'test-user') as Message;
      message.reply = jest.fn().mockResolvedValue({});
      
      await handler.handleMessageClassification(message, 'test-user', 'Asia/Tokyo');
      
      expect(message.reply).toHaveBeenCalled();
      const replyCall = (message.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall).toHaveProperty('embeds');
      expect(replyCall).toHaveProperty('components');
      expect(replyCall.embeds[0].data.title).toBe('📋 AI分析結果');
    });

    test('不明確なメッセージが適切に処理される', async () => {
      const message = createMockMessage('うーん', 'test-user') as Message;
      message.reply = jest.fn().mockResolvedValue({});
      
      await handler.handleMessageClassification(message, 'test-user', 'Asia/Tokyo');
      
      expect(message.reply).toHaveBeenCalled();
      const replyCall = (message.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall).toHaveProperty('embeds');
      expect(replyCall.embeds[0].data.title).toBe('❓ AI分析結果');
    });
  });

  describe('handleButtonInteraction', () => {
    test('TODO完了ボタンが正しく動作する', async () => {
      // 事前にTODOを作成
      const todo = await mockTodoRepo.createTodo({
        userId: 'test-user',
        content: 'テスト用TODO'
      });

      const interaction = createMockButtonInteraction(`todo_complete_${todo.id}`, 'test-user') as ButtonInteraction;
      
      await handler.handleButtonInteraction(interaction, 'test-user', 'Asia/Tokyo');
      
      expect(interaction.reply).toHaveBeenCalled();
      const replyCall = (interaction.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall.content).toContain('🎉');
      expect(replyCall.content).toContain('完了しました');
      
      const updatedTodo = await mockTodoRepo.getTodoById(todo.id);
      expect(updatedTodo?.status).toBe('completed');
    });

    test('TODO開始ボタンが正しく動作する', async () => {
      // 事前にTODOを作成
      const todo = await mockTodoRepo.createTodo({
        userId: 'test-user',
        content: 'テスト用TODO'
      });

      const interaction = createMockButtonInteraction(`todo_start_${todo.id}`, 'test-user') as ButtonInteraction;
      
      await handler.handleButtonInteraction(interaction, 'test-user', 'Asia/Tokyo');
      
      expect(interaction.reply).toHaveBeenCalled();
      const replyCall = (interaction.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall.content).toContain('🚀');
      expect(replyCall.content).toContain('開始しました');
      
      const updatedTodo = await mockTodoRepo.getTodoById(todo.id);
      expect(updatedTodo?.status).toBe('in_progress');
    });

    test('TODO削除ボタンが正しく動作する', async () => {
      // 事前にTODOを作成
      const todo = await mockTodoRepo.createTodo({
        userId: 'test-user',
        content: 'テスト用TODO'
      });

      const interaction = createMockButtonInteraction(`todo_delete_${todo.id}`, 'test-user') as ButtonInteraction;
      
      await handler.handleButtonInteraction(interaction, 'test-user', 'Asia/Tokyo');
      
      expect(interaction.reply).toHaveBeenCalled();
      const replyCall = (interaction.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall.content).toContain('🗑️');
      expect(replyCall.content).toContain('削除しました');
      
      const deletedTodo = await mockTodoRepo.getTodoById(todo.id);
      expect(deletedTodo).toBeNull();
    });

    test('存在しないTODOに対するボタン操作でエラーメッセージが表示される', async () => {
      const interaction = createMockButtonInteraction('todo_complete_invalid-id', 'test-user') as ButtonInteraction;
      
      await handler.handleButtonInteraction(interaction, 'test-user', 'Asia/Tokyo');
      
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
      
      await handler.handleButtonInteraction(interaction, 'test-user', 'Asia/Tokyo');
      
      expect(interaction.reply).toHaveBeenCalled();
      const replyCall = (interaction.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall.content).toBe('❌ 他のユーザーのTODOは操作できません。');
      expect(replyCall.ephemeral).toBe(true);
    });

    test('無効なカスタムIDでエラーメッセージが表示される', async () => {
      const interaction = createMockButtonInteraction('invalid_button_id', 'test-user') as ButtonInteraction;
      
      await handler.handleButtonInteraction(interaction, 'test-user', 'Asia/Tokyo');
      
      expect(interaction.reply).toHaveBeenCalled();
      const replyCall = (interaction.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall.content).toBe('❌ 未知のボタン操作です。');
      expect(replyCall.ephemeral).toBe(true);
    });
  });

  describe('コマンドパース', () => {
    test('引数なしでリスト表示コマンドとして解析される', async () => {
      const message = createMockMessage('!todo', 'test-user') as Message;
      
      await handler.handleCommand(message, 'test-user', [], 'Asia/Tokyo');
      
      expect(message.reply).toHaveBeenCalled();
    });

    test('無効なコマンドでエラーメッセージが表示される', async () => {
      const message = createMockMessage('!todo invalid', 'test-user') as Message;
      
      await handler.handleCommand(message, 'test-user', ['invalid'], 'Asia/Tokyo');
      
      expect(message.reply).toHaveBeenCalled();
      const replyCall = (message.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall).toContain('❌');
      expect(replyCall).toContain('未知のコマンド');
    });
  });
});