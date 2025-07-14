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
  async getTodosByDateRange() { return []; }
  async getTodosByStatusOptimized(userId: string, statuses: string[]) { 
    return this.todos.filter(todo => 
      todo.userId === userId && 
      statuses.includes(todo.status)
    ); 
  }
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

// ActivityLogServiceのモック
class MockActivityLogService {
  recordActivity = jest.fn().mockResolvedValue({
    id: 'log-1',
    userId: 'test-user',
    content: 'テスト活動',
    businessDate: '2024-01-07',
    timestamp: new Date().toISOString()
  });
}

describe('TodoCommandHandler', () => {
  let handler: TodoCommandHandler;
  let mockTodoRepo: MockTodoRepository;
  let mockClassificationRepo: MockMessageClassificationRepository;
  let mockGeminiService: MockGeminiService;
  let mockClassificationService: MockMessageClassificationService;
  let mockActivityLogService: MockActivityLogService;

  beforeEach(() => {
    mockTodoRepo = new MockTodoRepository();
    mockClassificationRepo = new MockMessageClassificationRepository();
    mockGeminiService = new MockGeminiService();
    mockClassificationService = new MockMessageClassificationService();
    mockActivityLogService = new MockActivityLogService();
    
    handler = new TodoCommandHandler(
      mockTodoRepo,
      mockClassificationRepo,
      mockGeminiService as any,
      mockClassificationService as any,
      mockActivityLogService as any
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
      
      expect(message.reply).toHaveBeenCalledWith('❌ 指定されたTODOが見つかりません。');
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

  describe('分類ボタン処理', () => {
    test('TODOとして確認するボタンが正しく動作する', async () => {
      // 事前に分類結果を設定
      const sessionId = 'test-session-123';
      const activeSessions = (handler as any).activeSessions;
      activeSessions.set(sessionId, {
        sessionId,
        userId: 'test-user',
        originalMessage: 'プレゼン資料を作成する',
        result: {
          classification: 'TODO',
          confidence: 0.9,
          reason: 'TODOキーワードが含まれています'
        },
        timestamp: new Date()
      });

      const interaction = createMockButtonInteraction(`confirm_TODO_${sessionId}`, 'test-user') as ButtonInteraction;
      interaction.update = jest.fn().mockResolvedValue({});
      
      await handler.handleButtonInteraction(interaction, 'test-user', 'Asia/Tokyo');
      
      expect(interaction.update).toHaveBeenCalled();
      const updateCall = (interaction.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.embeds[0].data.title).toBe('✅ TODO作成完了');
      
      // TODOが実際に作成されたことを確認
      const todos = await mockTodoRepo.getTodosByUserId('test-user');
      expect(todos).toHaveLength(1);
      expect(todos[0].content).toBe('プレゼン資料を作成する');
      expect(todos[0].sourceType).toBe('ai_suggested');
    });

    test('無視ボタンが正しく動作する', async () => {
      const sessionId = 'test-session-456';
      const activeSessions = (handler as any).activeSessions;
      activeSessions.set(sessionId, {
        sessionId,
        userId: 'test-user',
        originalMessage: 'どうでもいいメッセージ',
        result: {
          classification: 'UNCERTAIN',
          confidence: 0.3,
          reason: '分類が困難です'
        },
        timestamp: new Date()
      });

      const interaction = createMockButtonInteraction(`ignore_${sessionId}`, 'test-user') as ButtonInteraction;
      interaction.update = jest.fn().mockResolvedValue({});
      
      await handler.handleButtonInteraction(interaction, 'test-user', 'Asia/Tokyo');
      
      expect(interaction.update).toHaveBeenCalled();
      const updateCall = (interaction.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.content).toBe('❌ メッセージを無視しました。');
      
      // セッションが削除されたことを確認
      expect(activeSessions.has(sessionId)).toBe(false);
    });

    test('存在しないセッションでエラーメッセージが表示される', async () => {
      const interaction = createMockButtonInteraction('confirm_TODO_nonexistent-session', 'test-user') as ButtonInteraction;
      
      await handler.handleButtonInteraction(interaction, 'test-user', 'Asia/Tokyo');
      
      expect(interaction.reply).toHaveBeenCalled();
      const replyCall = (interaction.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall.content).toBe('❌ セッションが見つからないか、権限がありません。');
      expect(replyCall.ephemeral).toBe(true);
    });

    test('他のユーザーのセッションアクセスが拒否される', async () => {
      const sessionId = 'test-session-789';
      const activeSessions = (handler as any).activeSessions;
      activeSessions.set(sessionId, {
        sessionId,
        userId: 'other-user',
        originalMessage: '他のユーザーのメッセージ',
        result: {
          classification: 'TODO',
          confidence: 0.8,
          reason: 'テスト'
        },
        timestamp: new Date()
      });

      const interaction = createMockButtonInteraction(`confirm_TODO_${sessionId}`, 'test-user') as ButtonInteraction;
      
      await handler.handleButtonInteraction(interaction, 'test-user', 'Asia/Tokyo');
      
      expect(interaction.reply).toHaveBeenCalled();
      const replyCall = (interaction.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall.content).toBe('❌ セッションが見つからないか、権限がありません。');
      expect(replyCall.ephemeral).toBe(true);
    });

    test('分類変更ボタンが正しく動作する', async () => {
      const sessionId = 'test-session-change';
      const activeSessions = (handler as any).activeSessions;
      activeSessions.set(sessionId, {
        sessionId,
        userId: 'test-user',
        originalMessage: '会議の内容をメモ',
        result: {
          classification: 'UNCERTAIN',
          confidence: 0.4,
          reason: '分類が困難'
        },
        timestamp: new Date()
      });

      const interaction = createMockButtonInteraction(`classify_MEMO_${sessionId}`, 'test-user') as ButtonInteraction;
      interaction.update = jest.fn().mockResolvedValue({});
      
      await handler.handleButtonInteraction(interaction, 'test-user', 'Asia/Tokyo');
      
      expect(interaction.update).toHaveBeenCalled();
      const updateCall = (interaction.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.content).toBe('📄 メモとして保存されました。');
    });

    test('活動ログとして分類するボタンが正しく動作する', async () => {
      // 実際の本番環境のセッションID形式を使用
      const sessionId = '770478489203507241_1736226160123_abc123';
      const activeSessions = (handler as any).activeSessions;
      activeSessions.set(sessionId, {
        sessionId,
        userId: 'test-user',
        originalMessage: '会議に参加した',
        result: {
          classification: 'TODO',
          confidence: 0.7,
          reason: 'TODOと判定されたが活動ログが適切'
        },
        timestamp: new Date()
      });

      // activity_logを含むカスタムIDでテスト
      const interaction = createMockButtonInteraction(
        `classify_activity_log_${sessionId}`, 
        'test-user'
      ) as ButtonInteraction;
      interaction.update = jest.fn().mockResolvedValue({});
      
      await handler.handleButtonInteraction(interaction, 'test-user', 'Asia/Tokyo');
      
      expect(interaction.update).toHaveBeenCalled();
      const updateCall = (interaction.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.embeds[0].data.title).toBe('📝 活動ログ作成完了');
      expect(updateCall.embeds[0].data.description).toContain('会議に参加した');
      
      // ActivityLogServiceが呼ばれたことを確認
      expect(mockActivityLogService.recordActivity).toHaveBeenCalledWith(
        'test-user',
        '会議に参加した',
        'Asia/Tokyo'
      );
    });

    test('複数ボタンの連続操作でセッションが保持される', async () => {
      const sessionId = 'test-session-multiple';
      const activeSessions = (handler as any).activeSessions;
      activeSessions.set(sessionId, {
        sessionId,
        userId: 'test-user',
        originalMessage: 'テストメッセージ',
        result: {
          classification: 'TODO',
          confidence: 0.8,
          reason: 'TODO候補'
        },
        timestamp: new Date()
      });

      // 最初のボタン操作（無視）- ignoreボタンのカスタムIDは type がない
      const ignoreInteraction = createMockButtonInteraction(
        `ignore_${sessionId}`, 
        'test-user'
      ) as ButtonInteraction;
      ignoreInteraction.update = jest.fn().mockResolvedValue({});
      
      await handler.handleButtonInteraction(ignoreInteraction, 'test-user', 'Asia/Tokyo');
      
      // ignoreボタンではセッションが削除されることを確認
      expect(activeSessions.has(sessionId)).toBe(false);
      
      // 新しいセッションを作成
      activeSessions.set(sessionId, {
        sessionId,
        userId: 'test-user',
        originalMessage: 'テストメッセージ2',
        result: {
          classification: 'TODO',
          confidence: 0.8,
          reason: 'TODO候補'
        },
        timestamp: new Date()
      });
      
      // TODOボタンを押す
      const todoInteraction = createMockButtonInteraction(
        `confirm_todo_${sessionId}`, 
        'test-user'
      ) as ButtonInteraction;
      todoInteraction.update = jest.fn().mockResolvedValue({});
      
      await handler.handleButtonInteraction(todoInteraction, 'test-user', 'Asia/Tokyo');
      
      // 処理後にセッションが削除されることを確認
      expect(activeSessions.has(sessionId)).toBe(false);
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
      expect(replyCall.content).toBe('❌ TODOが見つかりません。');
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

  describe('カスタムID解析の境界ケース', () => {
    test.each([
      // [カスタムID, 期待されるaction, 期待されるtype, 期待されるsessionId]
      ['confirm_todo_session123', 'confirm', 'todo', 'session123'],
      ['classify_activity_log_session123', 'classify', 'activity_log', 'session123'],
      ['classify_activity_log_user_12345_abc', 'classify', 'activity_log', 'user_12345_abc'],
      ['ignore_session123', 'ignore', 'session123', 'session123'],  // ignoreはtypeがない
      ['confirm_activity_log_complex_session_id_123', 'confirm', 'activity_log', 'complex_session_id_123'],
      ['todo_complete_todoId123', 'todo', 'complete', 'todoId123'],
      ['todo_start_todo_with_underscore', 'todo', 'start', 'todo_with_underscore'],
    ])('カスタムID "%s" が正しく解析される', async (customId, expectedAction, expectedType, expectedSessionId) => {
      const interaction = createMockButtonInteraction(customId, 'test-user') as ButtonInteraction;
      
      // handleButtonInteractionの内部ロジックを検証するため、
      // セッションまたはTODOを事前に準備
      if (expectedAction === 'confirm' || expectedAction === 'classify' || expectedAction === 'ignore') {
        const activeSessions = (handler as any).activeSessions;
        activeSessions.set(expectedSessionId, {
          sessionId: expectedSessionId,
          userId: 'test-user',
          originalMessage: 'テストメッセージ',
          result: {
            classification: 'TODO',
            confidence: 0.8,
            reason: 'テスト'
          },
          timestamp: new Date()
        });
      } else if (expectedAction === 'todo') {
        // TODO操作の場合、TODOを作成
        await mockTodoRepo.createTodo({
          userId: 'test-user',
          content: 'テストTODO'
        });
      }
      
      // エラーが発生しないことを確認
      await expect(handler.handleButtonInteraction(interaction, 'test-user', 'Asia/Tokyo')).resolves.not.toThrow();
      
      // interaction.replyまたはinteraction.updateが呼ばれたことを確認
      const replyCalled = (interaction.reply as jest.Mock).mock.calls.length;
      const updateCalled = (interaction.update as jest.Mock).mock.calls.length;
      expect(replyCalled + updateCalled).toBeGreaterThan(0);
    });

    test('新しいセッションID形式（アンダースコアなし）の処理', async () => {
      // 新しい形式のセッションID（generateSessionIdで生成される形式）
      const sessionId = 'q9mcst9l0afppsyh';
      const activeSessions = (handler as any).activeSessions;
      activeSessions.set(sessionId, {
        sessionId,
        userId: 'test-user',
        originalMessage: 'テストメッセージ',
        result: {
          classification: 'TODO',
          confidence: 0.8,
          reason: 'テスト'
        },
        timestamp: new Date()
      });

      const interaction = createMockButtonInteraction(
        `confirm_todo_${sessionId}`, 
        'test-user'
      ) as ButtonInteraction;
      interaction.update = jest.fn().mockResolvedValue({});
      
      await handler.handleButtonInteraction(interaction, 'test-user', 'Asia/Tokyo');
      
      expect(interaction.update).toHaveBeenCalled();
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

    test('空の引数配列でリスト表示として処理される', async () => {
      const message = createMockMessage('!todo list', 'test-user') as Message;
      
      await handler.handleCommand(message, 'test-user', ['list'], 'Asia/Tokyo');
      
      expect(message.reply).toHaveBeenCalled();
      const replyCall = (message.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall).toHaveProperty('embeds');
    });

    test('引数不足でエラーメッセージが表示される', async () => {
      const testCases = [
        { command: ['edit'], expectedError: 'TODO IDと新しい内容を指定してください' },
        { command: ['done'], expectedError: 'TODO IDを指定してください' },
        { command: ['delete'], expectedError: 'TODO IDを指定してください' },
        { command: ['search'], expectedError: '検索キーワードを入力してください' }
      ];

      for (const testCase of testCases) {
        const message = createMockMessage(`!todo ${testCase.command.join(' ')}`, 'test-user') as Message;
        (message.reply as jest.Mock).mockClear();
        
        await handler.handleCommand(message, 'test-user', testCase.command, 'Asia/Tokyo');
        
        expect(message.reply).toHaveBeenCalled();
        const replyCall = (message.reply as jest.Mock).mock.calls[0][0];
        expect(replyCall).toContain('❌');
        expect(replyCall).toContain(testCase.expectedError);
      }
    });
  });

  describe('セッション管理', () => {
    test('期限切れセッションが適切にクリーンアップされる', async () => {
      const activeSessions = (handler as any).activeSessions;
      const SESSION_TIMEOUT = (handler as any).SESSION_TIMEOUT;
      
      // 期限切れのセッションを作成
      const expiredSession = {
        sessionId: 'expired-session',
        userId: 'test-user',
        originalMessage: '期限切れメッセージ',
        result: { classification: 'TODO', confidence: 0.8, reason: 'テスト' },
        timestamp: new Date(Date.now() - SESSION_TIMEOUT - 1000) // 期限切れ
      };
      
      // 有効なセッションを作成
      const validSession = {
        sessionId: 'valid-session',
        userId: 'test-user',
        originalMessage: '有効なメッセージ',
        result: { classification: 'TODO', confidence: 0.8, reason: 'テスト' },
        timestamp: new Date() // 現在時刻
      };
      
      activeSessions.set('expired-session', expiredSession);
      activeSessions.set('valid-session', validSession);
      
      expect(activeSessions.size).toBe(2);
      
      // プライベートメソッドを直接呼び出し
      await (handler as any).cleanupExpiredSessions();
      
      // 期限切れセッションが削除され、有効なセッションは残ることを確認
      expect(activeSessions.size).toBe(1);
      expect(activeSessions.has('valid-session')).toBe(true);
      expect(activeSessions.has('expired-session')).toBe(false);
    });

    test('destroy メソッドでクリーンアップタイマーが停止される', () => {
      const cleanupInterval = (handler as any).cleanupInterval;
      expect(cleanupInterval).toBeDefined();
      
      // spyを設定
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      
      handler.destroy();
      
      expect(clearIntervalSpy).toHaveBeenCalledWith(cleanupInterval);
      expect((handler as any).cleanupInterval).toBeUndefined();
      
      clearIntervalSpy.mockRestore();
    });
  });

  describe('エラーハンドリング', () => {
    test('TODO作成時のエラーが適切に処理される', async () => {
      // TODO作成時にエラーを発生させる
      jest.spyOn(mockTodoRepo, 'createTodo').mockRejectedValueOnce(new Error('データベース接続エラー'));
      
      const message = createMockMessage('!todo add 新しいTODO', 'test-user') as Message;
      
      await handler.handleCommand(message, 'test-user', ['add', '新しいTODO'], 'Asia/Tokyo');
      
      expect(message.reply).toHaveBeenCalled();
      const replyCall = (message.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall).toContain('❌');
      expect(replyCall).toContain('データベース接続エラー');
    });

    test('メッセージ分類時のエラーが適切に処理される', async () => {
      // 分類サービスでエラーを発生させる
      jest.spyOn(mockClassificationService, 'classifyMessage').mockRejectedValueOnce(new Error('AI接続エラー'));
      
      const message = createMockMessage('テストメッセージ', 'test-user') as Message;
      
      await handler.handleMessageClassification(message, 'test-user', 'Asia/Tokyo');
      
      expect(message.reply).toHaveBeenCalled();
      const replyCall = (message.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall).toBe('❌ メッセージの分析中にエラーが発生しました。');
    });

    test('ボタンインタラクション時のエラーが適切に処理される', async () => {
      // TODOリポジトリでエラーを発生させる
      jest.spyOn(mockTodoRepo, 'getTodoById').mockRejectedValueOnce(new Error('データベースエラー'));
      
      const interaction = createMockButtonInteraction('todo_complete_test-id', 'test-user') as ButtonInteraction;
      
      await handler.handleButtonInteraction(interaction, 'test-user', 'Asia/Tokyo');
      
      expect(interaction.reply).toHaveBeenCalled();
      const replyCall = (interaction.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall.content).toBe('❌ ボタン操作の処理中にエラーが発生しました。');
      expect(replyCall.ephemeral).toBe(true);
    });

    test('カスタムIDなしのボタンインタラクションでエラーメッセージが表示される', async () => {
      const interaction = createMockButtonInteraction('', 'test-user') as ButtonInteraction;
      interaction.customId = undefined as any;
      
      await handler.handleButtonInteraction(interaction, 'test-user', 'Asia/Tokyo');
      
      expect(interaction.reply).toHaveBeenCalled();
      const replyCall = (interaction.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall.content).toBe('❌ 無効なボタン操作です。');
      expect(replyCall.ephemeral).toBe(true);
    });
  });

  describe('ヘルパーメソッド', () => {
    test('優先度が正しくフォーマットされる', () => {
      const formatPriority = (handler as any).formatPriority;
      
      expect(formatPriority(1)).toBe('🔴 高');
      expect(formatPriority(0)).toBe('🟡 普通');
      expect(formatPriority(-1)).toBe('🟢 低');
      expect(formatPriority(999)).toBe('🟡 普通'); // defaultケースで普通を返す
    });
  });

  describe('依存関係注入', () => {
    test('ActivityLogServiceが注入されていない場合でも動作する', async () => {
      // ActivityLogServiceなしでハンドラーを作成
      const handlerWithoutActivityLog = new TodoCommandHandler(
        mockTodoRepo,
        mockClassificationRepo,
        mockGeminiService as any,
        mockClassificationService as any
        // ActivityLogServiceを渡さない
      );

      const sessionId = 'test-session-no-activity';
      const activeSessions = (handlerWithoutActivityLog as any).activeSessions;
      activeSessions.set(sessionId, {
        sessionId,
        userId: 'test-user',
        originalMessage: 'テスト活動',
        result: {
          classification: 'ACTIVITY_LOG',
          confidence: 0.8,
          reason: '活動ログ'
        },
        timestamp: new Date()
      });

      const interaction = createMockButtonInteraction(
        `confirm_activity_log_${sessionId}`, 
        'test-user'
      ) as ButtonInteraction;
      interaction.update = jest.fn().mockResolvedValue({});
      
      // エラーが発生せずに処理が完了することを確認
      await expect(
        handlerWithoutActivityLog.handleButtonInteraction(interaction, 'test-user', 'Asia/Tokyo')
      ).resolves.not.toThrow();
      
      expect(interaction.update).toHaveBeenCalled();
      
      // クリーンアップ
      handlerWithoutActivityLog.destroy();
    });

    test('ActivityLogServiceのエラーが適切に処理される', async () => {
      // recordActivityでエラーを発生させる
      mockActivityLogService.recordActivity.mockRejectedValueOnce(
        new Error('データベース接続エラー')
      );

      const sessionId = 'test-session-error';
      const activeSessions = (handler as any).activeSessions;
      activeSessions.set(sessionId, {
        sessionId,
        userId: 'test-user',
        originalMessage: 'エラーテスト',
        result: {
          classification: 'ACTIVITY_LOG',
          confidence: 0.8,
          reason: '活動ログ'
        },
        timestamp: new Date()
      });

      const interaction = createMockButtonInteraction(
        `confirm_activity_log_${sessionId}`, 
        'test-user'
      ) as ButtonInteraction;
      interaction.update = jest.fn().mockResolvedValue({});
      
      await handler.handleButtonInteraction(interaction, 'test-user', 'Asia/Tokyo');
      
      expect(interaction.update).toHaveBeenCalled();
      const updateCall = (interaction.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.content).toBe('❌ 活動ログの作成中にエラーが発生しました。');
    });

    test('正常なActivityLogService注入の確認', async () => {
      // ActivityLogServiceが正しく使用されることを確認
      const sessionId = 'test-session-normal';
      const activeSessions = (handler as any).activeSessions;
      activeSessions.set(sessionId, {
        sessionId,
        userId: 'test-user',
        originalMessage: '正常テスト',
        result: {
          classification: 'ACTIVITY_LOG',
          confidence: 0.9,
          reason: '活動ログとして明確'
        },
        timestamp: new Date()
      });

      const interaction = createMockButtonInteraction(
        `confirm_activity_log_${sessionId}`, 
        'test-user'
      ) as ButtonInteraction;
      interaction.update = jest.fn().mockResolvedValue({});
      
      await handler.handleButtonInteraction(interaction, 'test-user', 'Asia/Tokyo');
      
      // ActivityLogServiceが呼ばれたことを確認
      expect(mockActivityLogService.recordActivity).toHaveBeenCalledTimes(1);
      expect(mockActivityLogService.recordActivity).toHaveBeenCalledWith(
        'test-user',
        '正常テスト',
        'Asia/Tokyo'
      );
      
      // 成功メッセージが表示されることを確認
      expect(interaction.update).toHaveBeenCalled();
      const updateCall = (interaction.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.embeds[0].data.title).toBe('📝 活動ログ作成完了');
    });
  });

  describe('複数行ボタン生成テスト（Discord制限対応）', () => {
    test('5件のTODOが表示されたときに5つのボタン行が生成される', async () => {
      // 5件のTODOを作成
      const todos = [];
      for (let i = 1; i <= 5; i++) {
        const todo = await mockTodoRepo.createTodo({
          userId: 'test-user',
          content: `TODO ${i}`,
          priority: i % 3 - 1, // -1, 0, 1の循環
        });
        todos.push(todo);
      }

      const message = createMockMessage('!todo', 'test-user') as Message;
      message.reply = jest.fn().mockResolvedValue({});
      
      await handler.handleCommand(message, 'test-user', [], 'Asia/Tokyo');
      
      expect(message.reply).toHaveBeenCalled();
      const replyCall = (message.reply as jest.Mock).mock.calls[0][0];
      
      // Embedが正しく生成されていることを確認
      expect(replyCall).toHaveProperty('embeds');
      expect(replyCall.embeds[0].data.title).toBe('📋 TODO一覧');
      
      // 5つのコンポーネント（ActionRow）が生成されることを確認
      expect(replyCall).toHaveProperty('components');
      expect(replyCall.components.length).toBe(5);
    });

    test('10件のTODOが表示されたときに最大5件のボタンが生成される', async () => {
      // 10件のTODOを作成
      const todos = [];
      for (let i = 1; i <= 10; i++) {
        const todo = await mockTodoRepo.createTodo({
          userId: 'test-user',
          content: `TODO ${i}`,
          priority: 0,
        });
        todos.push(todo);
      }

      const message = createMockMessage('!todo', 'test-user') as Message;
      message.reply = jest.fn().mockResolvedValue({});
      
      await handler.handleCommand(message, 'test-user', [], 'Asia/Tokyo');
      
      expect(message.reply).toHaveBeenCalled();
      const replyCall = (message.reply as jest.Mock).mock.calls[0][0];
      
      // Embedが正しく生成されていることを確認
      expect(replyCall).toHaveProperty('embeds');
      expect(replyCall.embeds[0].data.title).toBe('📋 TODO一覧');
      
      // Discord制限により最大5つのコンポーネントが生成される
      expect(replyCall).toHaveProperty('components');
      expect(replyCall.components.length).toBe(5);
    });

    test('6番目以降のTODOは短縮IDコマンドで操作可能である', async () => {
      // 10件のTODOを作成
      const todos = [];
      for (let i = 1; i <= 10; i++) {
        const todo = await mockTodoRepo.createTodo({
          userId: 'test-user',
          content: `TODO ${i}`,
          priority: 0,
        });
        todos.push(todo);
      }

      // 6番目のTODOを短縮IDで完了操作
      const sixthTodo = todos[5]; // 0-indexedなので5番目が6番目
      const shortId = sixthTodo.id.substring(0, 8);
      const message = createMockMessage(`!todo done ${shortId}`, 'test-user') as Message;
      
      await handler.handleCommand(message, 'test-user', ['done', shortId], 'Asia/Tokyo');
      
      expect(message.reply).toHaveBeenCalled();
      const replyCall = (message.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall).toContain('🎉');
      expect(replyCall).toContain('完了しました');
      
      // TODOが実際に完了状態になっていることを確認
      const updatedTodo = await mockTodoRepo.getTodoById(sixthTodo.id);
      expect(updatedTodo?.status).toBe('completed');
    });

    test('TODOが5件以下の場合は従来通り動作する', async () => {
      // 3件のTODOを作成
      const todos = [];
      for (let i = 1; i <= 3; i++) {
        const todo = await mockTodoRepo.createTodo({
          userId: 'test-user',
          content: `TODO ${i}`,
          priority: 0,
        });
        todos.push(todo);
      }

      const message = createMockMessage('!todo', 'test-user') as Message;
      message.reply = jest.fn().mockResolvedValue({});
      
      await handler.handleCommand(message, 'test-user', [], 'Asia/Tokyo');
      
      expect(message.reply).toHaveBeenCalled();
      const replyCall = (message.reply as jest.Mock).mock.calls[0][0];
      
      // Embedが正しく生成されていることを確認
      expect(replyCall).toHaveProperty('embeds');
      expect(replyCall.embeds[0].data.title).toBe('📋 TODO一覧');
      
      // 3つのコンポーネントが生成されることを確認
      expect(replyCall).toHaveProperty('components');
      expect(replyCall.components.length).toBe(3);
    });

    test('ボタンに番号が表示される', async () => {
      // 3件のTODOを作成
      const todos = [];
      for (let i = 1; i <= 3; i++) {
        const todo = await mockTodoRepo.createTodo({
          userId: 'test-user',
          content: `TODO ${i}`,
          priority: 0,
        });
        todos.push(todo);
      }

      const message = createMockMessage('!todo', 'test-user') as Message;
      message.reply = jest.fn().mockResolvedValue({});
      
      await handler.handleCommand(message, 'test-user', [], 'Asia/Tokyo');
      
      expect(message.reply).toHaveBeenCalled();
      const replyCall = (message.reply as jest.Mock).mock.calls[0][0];
      
      // ボタンに番号が表示されていることを確認
      expect(replyCall).toHaveProperty('components');
      const components = replyCall.components;
      
      // 各ボタン行のラベルを確認
      components.forEach((component: any, index: number) => {
        const buttons = component.components;
        const expectedNumber = `${index + 1}.`;
        
        // 各ボタンのラベルに番号が含まれていることを確認
        buttons.forEach((button: any) => {
          expect(button.data.label).toContain(expectedNumber);
        });
      });
    });
  });

  describe('TODO ID表示機能テスト', () => {
    test('TODO一覧でTODO IDが表示される', async () => {
      // 複数のTODOを作成
      const todos = [];
      for (let i = 1; i <= 5; i++) {
        const todo = await mockTodoRepo.createTodo({
          userId: 'test-user',
          content: `テストTODO ${i}`,
          priority: 0,
        });
        todos.push(todo);
      }

      const message = createMockMessage('!todo', 'test-user') as Message;
      message.reply = jest.fn().mockResolvedValue({});
      
      await handler.handleCommand(message, 'test-user', [], 'Asia/Tokyo');
      
      expect(message.reply).toHaveBeenCalled();
      const replyCall = (message.reply as jest.Mock).mock.calls[0][0];
      
      // Embedの内容を確認
      expect(replyCall).toHaveProperty('embeds');
      const embed = replyCall.embeds[0];
      expect(embed.data.title).toBe('📋 TODO一覧');
      
      // TODO IDが表示されていることを確認
      const description = embed.data.description;
      expect(description).toBeDefined();
      
      // 各TODOのIDが短縮形で表示されていることを確認
      todos.forEach((todo, index) => {
        const shortId = todo.id.substring(0, 8);
        expect(description).toContain(`\`${shortId}\``);
        expect(description).toContain(`テストTODO ${index + 1}`);
      });
    });

    test('TODO IDが正しいフォーマットで表示される', async () => {
      const testTodo = await mockTodoRepo.createTodo({
        userId: 'test-user',
        content: 'ID表示テスト',
        priority: 1,
      });

      const message = createMockMessage('!todo', 'test-user') as Message;
      message.reply = jest.fn().mockResolvedValue({});
      
      await handler.handleCommand(message, 'test-user', [], 'Asia/Tokyo');
      
      expect(message.reply).toHaveBeenCalled();
      const replyCall = (message.reply as jest.Mock).mock.calls[0][0];
      
      const description = replyCall.embeds[0].data.description;
      const shortId = testTodo.id.substring(0, 8);
      
      // フォーマットが正しいことを確認: 番号. `ID` アイコン 優先度 内容
      expect(description).toMatch(new RegExp(`1\\. \`${shortId}\` ⏳ 🔴 ID表示テスト`));
    });
  });

  describe('短縮ID検索機能テスト', () => {
    test('短縮IDでTODO編集ができる', async () => {
      const testTodo = await mockTodoRepo.createTodo({
        userId: 'test-user',
        content: '短縮ID編集テスト',
        priority: 0,
      });

      const shortId = testTodo.id.substring(0, 8);
      const message = createMockMessage(`!todo edit ${shortId} 編集後の内容`, 'test-user') as Message;
      
      await handler.handleCommand(message, 'test-user', ['edit', shortId, '編集後の内容'], 'Asia/Tokyo');
      
      expect(message.reply).toHaveBeenCalledWith('✏️ TODO「短縮ID編集テスト」を「編集後の内容」に編集しました！');
      
      const updatedTodo = await mockTodoRepo.getTodoById(testTodo.id);
      expect(updatedTodo?.content).toBe('編集後の内容');
    });

    test('短縮IDでTODO完了ができる', async () => {
      const testTodo = await mockTodoRepo.createTodo({
        userId: 'test-user',
        content: '短縮ID完了テスト',
        priority: 0,
      });

      const shortId = testTodo.id.substring(0, 8);
      const message = createMockMessage(`!todo done ${shortId}`, 'test-user') as Message;
      
      await handler.handleCommand(message, 'test-user', ['done', shortId], 'Asia/Tokyo');
      
      expect(message.reply).toHaveBeenCalledWith('🎉 TODO「短縮ID完了テスト」を完了しました！');
      
      const updatedTodo = await mockTodoRepo.getTodoById(testTodo.id);
      expect(updatedTodo?.status).toBe('completed');
    });

    test('短縮IDでTODO削除ができる', async () => {
      const testTodo = await mockTodoRepo.createTodo({
        userId: 'test-user',
        content: '短縮ID削除テスト',
        priority: 0,
      });

      const shortId = testTodo.id.substring(0, 8);
      const message = createMockMessage(`!todo delete ${shortId}`, 'test-user') as Message;
      
      await handler.handleCommand(message, 'test-user', ['delete', shortId], 'Asia/Tokyo');
      
      expect(message.reply).toHaveBeenCalledWith('🗑️ TODO「短縮ID削除テスト」を削除しました。');
      
      const deletedTodo = await mockTodoRepo.getTodoById(testTodo.id);
      expect(deletedTodo).toBeNull();
    });

    test('短縮IDのボタン操作ができる', async () => {
      const testTodo = await mockTodoRepo.createTodo({
        userId: 'test-user',
        content: '短縮IDボタンテスト',
        priority: 0,
      });

      const shortId = testTodo.id.substring(0, 8);
      const interaction = createMockButtonInteraction(`todo_complete_${shortId}`, 'test-user') as ButtonInteraction;
      
      await handler.handleButtonInteraction(interaction, 'test-user', 'Asia/Tokyo');
      
      expect(interaction.reply).toHaveBeenCalled();
      const replyCall = (interaction.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall.content).toContain('🎉');
      expect(replyCall.content).toContain('完了しました');
      
      const updatedTodo = await mockTodoRepo.getTodoById(testTodo.id);
      expect(updatedTodo?.status).toBe('completed');
    });

    test('存在しない短縮IDでエラーメッセージが表示される', async () => {
      const message = createMockMessage('!todo edit abc12345 新しい内容', 'test-user') as Message;
      
      await handler.handleCommand(message, 'test-user', ['edit', 'abc12345', '新しい内容'], 'Asia/Tokyo');
      
      expect(message.reply).toHaveBeenCalledWith('❌ 指定されたTODOが見つかりません。');
    });

    test('他のユーザーの短縮IDでアクセスが拒否される', async () => {
      const otherUserTodo = await mockTodoRepo.createTodo({
        userId: 'other-user',
        content: '他のユーザーのTODO',
        priority: 0,
      });

      const shortId = otherUserTodo.id.substring(0, 8);
      const message = createMockMessage(`!todo edit ${shortId} 悪意のある編集`, 'test-user') as Message;
      
      await handler.handleCommand(message, 'test-user', ['edit', shortId, '悪意のある編集'], 'Asia/Tokyo');
      
      expect(message.reply).toHaveBeenCalledWith('❌ 指定されたTODOが見つかりません。');
    });
  });
});  