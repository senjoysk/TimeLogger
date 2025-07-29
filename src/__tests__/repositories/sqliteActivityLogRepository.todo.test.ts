/**
 * SqliteActivityLogRepositoryのTODO機能テスト
 * TDD Refactor Phase - 実際のDB実装をテスト
 */

import { PartialCompositeRepository } from '../../repositories/PartialCompositeRepository';
import { CreateTodoRequest, TodoStatus, Todo } from '../../types/todo';
import { getTestDbPath, cleanupTestDatabase } from '../../utils/testDatabasePath';

describe('PartialCompositeRepository TODO機能', () => {
  let repository: PartialCompositeRepository;
  let testDbPath: string;

  beforeEach(async () => {
    // テスト用一時データベースファイル
    testDbPath = getTestDbPath(__filename);
    cleanupTestDatabase(testDbPath);

    repository = new PartialCompositeRepository(testDbPath);
    
    // PartialCompositeRepositoryの標準初期化を使用
    await repository.initializeDatabase();
    
    // テストデータを完全にクリーンアップ
    await cleanupAllTestData();
  });

  afterEach(async () => {
    // テスト後のクリーンアップ
    await cleanupAllTestData();
    await repository.close();
    
    // テストファイルを削除
    cleanupTestDatabase(testDbPath);
  });

  // テストデータクリーンアップ用ヘルパー関数
  async function cleanupAllTestData(): Promise<void> {
    try {
      // 全ユーザーを取得してデータを削除
      const users = await repository.getAllUsers();
      for (const user of users) {
        // 全ログを削除
        const logs = await repository.getLogsByDateRange(
          user.userId, 
          '1900-01-01', 
          '2100-12-31'
        );
        for (const log of logs) {
          await repository.permanentDeleteLog(log.id);
        }
        
        // 全TODOを削除
        const todos = await repository.getTodosByUserId(user.userId);
        for (const todo of todos) {
          await repository.deleteTodo(todo.id);
        }
      }
    } catch (error) {
      // エラーが発生してもテストを継続
      console.warn('テストデータクリーンアップで軽微なエラー:', error);
    }
  }

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
      // まず関連するアクティビティログを作成
      const activityResult = await repository.saveLog({
        userId: 'user123',
        content: '関連する活動ログ',
        inputTimestamp: new Date().toISOString(),
        businessDate: new Date().toISOString().split('T')[0]
      });

      const request: CreateTodoRequest = {
        userId: 'user123',
        content: 'AI提案タスク',
        priority: 1,
        sourceType: 'ai_suggested',
        aiConfidence: 0.85,
        relatedActivityId: activityResult.id
      };

      const result = await repository.createTodo(request);

      expect(result.sourceType).toBe('ai_suggested');
      expect(result.aiConfidence).toBe(0.85);
      expect(result.relatedActivityId).toBe(activityResult.id);
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
      expect(result?.content).toBe(createRequest.content);
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
      expect(results[0].status).toBe(status);
      expect(results[0].id).toBe(todo1.id);
    });

    test('優先度でソートできる', async () => {
      const userId = 'user123';
      
      // 異なる優先度のTODOを作成
      await repository.createTodo({ userId, content: 'タスク1', priority: 1 });
      await repository.createTodo({ userId, content: 'タスク2', priority: 0 });
      await repository.createTodo({ userId, content: 'タスク3', priority: -1 });
      
      const results = await repository.getTodosByUserId(userId, { orderBy: 'priority' });

      expect(results.length).toBe(3);
      expect(results[0].priority).toBe(1);
      expect(results[1].priority).toBe(0);
      expect(results[2].priority).toBe(-1);
    });
  });

  describe('updateTodo', () => {
    test('TODOを更新できる', async () => {
      const created = await repository.createTodo({
        userId: 'user123',
        content: '元のタスク'
      });
      
      const update = {
        content: '更新されたタスク',
        priority: 1,
        dueDate: new Date().toISOString()
      };

      // 時間差を作るために少し待つ
      await new Promise(resolve => setTimeout(resolve, 1));
      
      await repository.updateTodo(created.id, update);
      const updated = await repository.getTodoById(created.id);

      expect(updated?.content).toBe(update.content);
      expect(updated?.priority).toBe(update.priority);
      expect(updated?.dueDate).toBe(update.dueDate);
      expect(updated?.updatedAt).not.toBe(created.updatedAt);
    });
  });

  describe('updateTodoStatus', () => {
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
      expect(results[0].content).toContain(keyword);
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

  describe('getTodosWithDueDate', () => {
    test('期日があるTODOを取得できる', async () => {
      const userId = 'user123';
      const dueDate = new Date().toISOString();
      
      await repository.createTodo({ userId, content: 'タスク1', dueDate });
      await repository.createTodo({ userId, content: 'タスク2' }); // 期日なし
      
      const results = await repository.getTodosWithDueDate(userId);

      expect(results.length).toBe(1);
      expect(results[0].dueDate).toBe(dueDate);
    });
  });

  describe('getTodosByActivityId', () => {
    test('活動IDに関連するTODOを取得できる', async () => {
      // まず関連するアクティビティログを作成
      const activityResult = await repository.saveLog({
        userId: 'user123',
        content: '関連する活動ログ',
        inputTimestamp: new Date().toISOString(),
        businessDate: new Date().toISOString().split('T')[0]
      });
      
      await repository.createTodo({ 
        userId: 'user123', 
        content: 'タスク1', 
        relatedActivityId: activityResult.id 
      });
      await repository.createTodo({ userId: 'user123', content: 'タスク2' }); // 関連なし
      
      const results = await repository.getTodosByActivityId(activityResult.id);

      expect(results.length).toBe(1);
      expect(results[0].relatedActivityId).toBe(activityResult.id);
    });
  });
});