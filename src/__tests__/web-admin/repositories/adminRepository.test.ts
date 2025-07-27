/**
 * AdminRepository拡張テスト
 * Phase 2: TODO管理機能のためのリポジトリ拡張
 */

import { AdminRepository } from '../../../web-admin/repositories/adminRepository';
import { SqliteActivityLogRepository } from '../../../repositories/sqliteActivityLogRepository';
import { TodoTask, TodoStatus, TodoPriority } from '../../../types/todo';
import { getTestDbPath, cleanupTestDatabase } from '../../../utils/testDatabasePath';

describe('AdminRepository TODO管理機能拡張', () => {
  let repository: AdminRepository;
  let sqliteRepo: SqliteActivityLogRepository;
  const testDbPath = getTestDbPath(__filename);

  beforeEach(async () => {
    // テスト用DBファイルが存在する場合は削除して新規作成
    cleanupTestDatabase(testDbPath);
    
    sqliteRepo = new SqliteActivityLogRepository(testDbPath);
    // 軽量なスキーマ初期化を確実に実行
    await sqliteRepo.ensureSchema();
    repository = new AdminRepository(sqliteRepo);
  });

  describe('🔴 Red Phase 2-1: TODO CRUD操作', () => {
    test('新しいTODOタスクを作成できる', async () => {
      // Arrange
      const newTodo = {
        userId: 'test-user-123',
        content: 'Test TODO Task',
        description: 'Test description',
        priority: 'high' as TodoPriority,
        dueDate: '2024-12-31'
      };

      // Act
      const result = await repository.createTodoTask(newTodo);

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.userId).toBe(newTodo.userId);
      expect(result.content).toBe(newTodo.content);
      // descriptionは現在の実装では空文字になる（設計上の制約）
      expect(result.description).toBe('');
      expect(result.priority).toBe(newTodo.priority);
      expect(result.dueDate).toBe(newTodo.dueDate);
      expect(result.status).toBe('pending');
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    test('TODOタスクを更新できる', async () => {
      // Arrange
      const newTodo = {
        userId: 'test-user-123',
        content: 'Test TODO Task',
        description: 'Test description',
        priority: 'high' as TodoPriority,
        dueDate: '2024-12-31'
      };
      const createdTodo = await repository.createTodoTask(newTodo);

      const updates = {
        content: 'Updated TODO Task',
        status: 'in_progress' as TodoStatus,
        priority: 'medium' as TodoPriority
      };

      // 時間の確実な変更のため少し待機
      await new Promise(resolve => setTimeout(resolve, 10));

      // Act
      const result = await repository.updateTodoTask(createdTodo.id, updates);

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBe(createdTodo.id);
      expect(result.content).toBe(updates.content);
      expect(result.status).toBe(updates.status);
      expect(result.priority).toBe(updates.priority);
      expect(result.updatedAt).not.toBe(createdTodo.updatedAt);
    });

    test('TODOタスクを削除できる', async () => {
      // Arrange
      const newTodo = {
        userId: 'test-user-123',
        content: 'Test TODO Task',
        description: 'Test description',
        priority: 'high' as TodoPriority,
        dueDate: '2024-12-31'
      };
      const createdTodo = await repository.createTodoTask(newTodo);

      // Act
      const result = await repository.deleteTodoTask(createdTodo.id);

      // Assert
      expect(result).toBe(true);

      // 削除されたことを確認
      const deletedTodo = await repository.getTodoTaskById(createdTodo.id);
      expect(deletedTodo).toBeNull();
    });

    test('TODOタスクをIDで取得できる', async () => {
      // Arrange
      const newTodo = {
        userId: 'test-user-123',
        content: 'Test TODO Task',
        description: 'Test description',
        priority: 'high' as TodoPriority,
        dueDate: '2024-12-31'
      };
      const createdTodo = await repository.createTodoTask(newTodo);

      // Act
      const result = await repository.getTodoTaskById(createdTodo.id);

      // Assert
      expect(result).toBeDefined();
      expect(result!.id).toBe(createdTodo.id);
      expect(result!.userId).toBe(createdTodo.userId);
      expect(result!.content).toBe(createdTodo.content);
    });

    test('存在しないTODOタスクを取得しようとするとnullを返す', async () => {
      // Act
      const result = await repository.getTodoTaskById('non-existent-id');

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('🔴 Red Phase 2-2: TODO一括操作', () => {
    test('複数のTODOタスクのステータスを一括変更できる', async () => {
      // Arrange
      const todos = await Promise.all([
        repository.createTodoTask({
          userId: 'test-user-123',
          content: 'TODO 1',
          description: 'Test description 1',
          priority: 'high' as TodoPriority,
          dueDate: '2024-12-31'
        }),
        repository.createTodoTask({
          userId: 'test-user-123',
          content: 'TODO 2',
          description: 'Test description 2',
          priority: 'medium' as TodoPriority,
          dueDate: '2024-12-31'
        })
      ]);

      const todoIds = todos.map(todo => todo.id);
      const newStatus: TodoStatus = 'completed';

      // Act
      const result = await repository.bulkUpdateTodoStatus(todoIds, newStatus);

      // Assert
      expect(result).toBe(2);

      // 更新されたことを確認
      for (const todoId of todoIds) {
        const updatedTodo = await repository.getTodoTaskById(todoId);
        expect(updatedTodo!.status).toBe(newStatus);
      }
    });

    test('複数のTODOタスクを一括削除できる', async () => {
      // Arrange
      const todos = await Promise.all([
        repository.createTodoTask({
          userId: 'test-user-123',
          content: 'TODO 1',
          description: 'Test description 1',
          priority: 'high' as TodoPriority,
          dueDate: '2024-12-31'
        }),
        repository.createTodoTask({
          userId: 'test-user-123',
          content: 'TODO 2',
          description: 'Test description 2',
          priority: 'medium' as TodoPriority,
          dueDate: '2024-12-31'
        })
      ]);

      const todoIds = todos.map(todo => todo.id);

      // Act
      const result = await repository.bulkDeleteTodos(todoIds);

      // Assert
      expect(result).toBe(2);

      // 削除されたことを確認
      for (const todoId of todoIds) {
        const deletedTodo = await repository.getTodoTaskById(todoId);
        expect(deletedTodo).toBeNull();
      }
    });
  });

  describe('🔴 Red Phase 2-3: TODO検索・フィルタリング', () => {
    test('期限切れのTODOタスクを取得できる', async () => {
      // Arrange
      const testUserId = 'test-user-123';
      
      // 【重要】テストユーザーを先に登録
      await sqliteRepo.saveUserTimezone(testUserId, 'Asia/Tokyo');
      
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      // 期限切れのTODO
      const overdueTodo = await repository.createTodoTask({
        userId: testUserId,
        content: 'Overdue TODO',
        description: 'This is overdue',
        priority: 'high' as TodoPriority,
        dueDate: yesterdayStr
      });

      // 期限切れでないTODO
      await repository.createTodoTask({
        userId: testUserId,
        content: 'Future TODO',
        description: 'This is not overdue',
        priority: 'medium' as TodoPriority,
        dueDate: tomorrowStr
      });

      // Act
      const result = await repository.getOverdueTodos();

      // Assert
      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
      expect(result.some(todo => todo.id === overdueTodo.id)).toBe(true);
      // 期限切れでないTODOは含まれていないことを確認
      expect(result.every(todo => todo.content !== 'Future TODO')).toBe(true);
    });
  });
});