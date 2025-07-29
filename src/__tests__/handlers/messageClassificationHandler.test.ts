/**
 * 🔴 Red Phase: MessageClassificationHandler のテスト - 実装前なので失敗する
 * TDD開発: AIメッセージ分析の責任分離
 */

import { Message, ButtonInteraction } from 'discord.js';
import { MessageClassificationHandler } from '../../handlers/messageClassificationHandler';
import { ITodoRepository, IMessageClassificationRepository } from '../../repositories/interfaces';
import { IGeminiService } from '../../services/interfaces/IGeminiService';
import { IMessageClassificationService } from '../../services/messageClassificationService';
import { Todo, CreateTodoRequest, ClassificationResult } from '../../types/todo';

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

  // 他のメソッドは簡易実装
  async getTodoById(id: string): Promise<Todo | null> { 
    return this.todos.find(todo => todo.id === id) || null;
  }
  async getTodosByUserId(userId: string): Promise<Todo[]> { 
    return this.todos.filter(todo => todo.userId === userId);
  }
  async updateTodo(id: string, update: any): Promise<void> {}
  async updateTodoStatus(id: string, status: any): Promise<void> {}
  async deleteTodo(id: string): Promise<void> {}
  async searchTodos(userId: string, keyword: string): Promise<Todo[]> { return []; }
  async getTodoStats(userId: string) { 
    return { total: 0, pending: 0, completed: 0, inProgress: 0, cancelled: 0, overdue: 0, todayCompleted: 0, weekCompleted: 0 }; 
  }
  async getTodosWithDueDate() { return []; }
  async getTodosByActivityId() { return []; }
  async getTodosByDateRange() { return []; }
  async getTodosByStatusOptimized(userId: string, statuses: string[]) { return []; }
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
  author: { id: userId },
  reply: jest.fn().mockResolvedValue({})
});

const createMockButtonInteraction = (customId: string, userId: string = 'test-user'): any => ({
  customId,
  user: { id: userId },
  reply: jest.fn().mockResolvedValue({}),
  update: jest.fn().mockResolvedValue({}),
  replied: false
});

describe('🔴 Red Phase: MessageClassificationHandler分離テスト', () => {
  let handler: MessageClassificationHandler;
  let mockTodoRepo: MockTodoRepository;
  let mockClassificationRepo: MockMessageClassificationRepository;
  let mockGeminiService: MockGeminiService;
  let mockClassificationService: MockMessageClassificationService;

  beforeEach(() => {
    mockTodoRepo = new MockTodoRepository();
    mockClassificationRepo = new MockMessageClassificationRepository();
    mockGeminiService = new MockGeminiService();
    mockClassificationService = new MockMessageClassificationService();
    
    handler = new MessageClassificationHandler(
      mockTodoRepo,
      mockClassificationRepo,
      mockGeminiService as any,
      mockClassificationService as any
    );
  });

  afterEach(() => {
    if (handler && typeof handler.destroy === 'function') {
      handler.destroy();
    }
  });

  describe('メッセージ分類処理', () => {
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

  describe('ボタンインタラクション処理', () => {
    test('TODO確認ボタンが正しく動作する', async () => {
      // 事前にセッションを設定
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
      
      await handler.handleClassificationButton(interaction, 'confirm', 'TODO', sessionId, 'test-user', 'Asia/Tokyo');
      
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
      
      await handler.handleIgnoreButton(interaction, sessionId, 'test-user');
      
      expect(interaction.update).toHaveBeenCalled();
      const updateCall = (interaction.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.content).toBe('❌ メッセージを無視しました。');
      
      // セッションが削除されたことを確認
      expect(activeSessions.has(sessionId)).toBe(false);
    });

    test('存在しないセッションでエラーメッセージが表示される', async () => {
      const interaction = createMockButtonInteraction('confirm_TODO_nonexistent-session', 'test-user') as ButtonInteraction;
      
      await handler.handleClassificationButton(interaction, 'confirm', 'TODO', 'nonexistent-session', 'test-user', 'Asia/Tokyo');
      
      expect(interaction.reply).toHaveBeenCalled();
      const replyCall = (interaction.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall.content).toBe('❌ セッションが見つからないか、権限がありません。');
      expect(replyCall.ephemeral).toBe(true);
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
        timestamp: new Date(Date.now() - SESSION_TIMEOUT - 1000)
      };
      
      // 有効なセッションを作成
      const validSession = {
        sessionId: 'valid-session',
        userId: 'test-user',
        originalMessage: '有効なメッセージ',
        result: { classification: 'TODO', confidence: 0.8, reason: 'テスト' },
        timestamp: new Date()
      };
      
      activeSessions.set('expired-session', expiredSession);
      activeSessions.set('valid-session', validSession);
      
      expect(activeSessions.size).toBe(2);
      
      // クリーンアップ実行
      await (handler as any).cleanupExpiredSessions();
      
      // 期限切れセッションが削除され、有効なセッションは残ることを確認
      expect(activeSessions.size).toBe(1);
      expect(activeSessions.has('valid-session')).toBe(true);
      expect(activeSessions.has('expired-session')).toBe(false);
    });

    test('destroy メソッドでクリーンアップタイマーが停止される', () => {
      const cleanupInterval = (handler as any).cleanupInterval;
      expect(cleanupInterval).toBeDefined();
      
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      
      handler.destroy();
      
      expect(clearIntervalSpy).toHaveBeenCalledWith(cleanupInterval);
      expect((handler as any).cleanupInterval).toBeUndefined();
      
      clearIntervalSpy.mockRestore();
    });
  });

  describe('エラーハンドリング', () => {
    test('メッセージ分類時のエラーが適切に処理される', async () => {
      jest.spyOn(mockClassificationService, 'classifyMessage').mockRejectedValueOnce(new Error('AI接続エラー'));
      
      const message = createMockMessage('テストメッセージ', 'test-user') as Message;
      
      await handler.handleMessageClassification(message, 'test-user', 'Asia/Tokyo');
      
      expect(message.reply).toHaveBeenCalled();
      const replyCall = (message.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall).toBe('❌ メッセージの分析中にエラーが発生しました。');
    });
  });
});