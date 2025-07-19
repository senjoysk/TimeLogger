/**
 * TodoManagementService単体テスト
 * Phase 2: TODO管理機能のTDD実装
 */

import { TodoManagementService } from '../../../web-admin/services/todoManagementService';
import { AdminRepository } from '../../../web-admin/repositories/adminRepository';
import { SqliteActivityLogRepository } from '../../../repositories/sqliteActivityLogRepository';
import { TodoTask, TodoStatus, TodoPriority } from '../../../types/todo';
import { getTestDbPath } from '../../../utils/testDatabasePath';

// モック
jest.mock('../../../web-admin/repositories/adminRepository');
jest.mock('../../../repositories/sqliteActivityLogRepository');
const mockAdminRepository = AdminRepository as jest.MockedClass<typeof AdminRepository>;
const mockSqliteRepo = SqliteActivityLogRepository as jest.MockedClass<typeof SqliteActivityLogRepository>;

describe('TodoManagementService', () => {
  let service: TodoManagementService;
  let mockRepository: jest.Mocked<AdminRepository>;

  beforeEach(async () => {
    const testDbPath = getTestDbPath(__filename);
    const mockSqliteInstance = new mockSqliteRepo(testDbPath) as jest.Mocked<SqliteActivityLogRepository>;
    // モックのメソッドを設定
    mockSqliteInstance.initializeDatabase = jest.fn().mockResolvedValue(undefined);
    
    mockRepository = new mockAdminRepository(mockSqliteInstance) as jest.Mocked<AdminRepository>;
    service = new TodoManagementService(mockRepository);
  });

  describe('🔴 Red Phase 2-1: TODO基本CRUD操作', () => {
    test('新しいTODOタスクを作成できる', async () => {
      // Arrange
      const newTodo = {
        userId: 'test-user-123',
        title: 'Test TODO Task',
        description: 'Test description',
        priority: 'high' as TodoPriority,
        dueDate: '2024-12-31'
      };

      const expectedTodo: TodoTask = {
        id: 'todo-123',
        userId: 'test-user-123',
        title: 'Test TODO Task',
        description: 'Test description',
        status: 'pending',
        priority: 'high',
        dueDate: '2024-12-31',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      };

      mockRepository.createTodoTask.mockResolvedValue(expectedTodo);

      // Act
      const result = await service.createTodo(newTodo);

      // Assert
      expect(result).toEqual(expectedTodo);
      expect(mockRepository.createTodoTask).toHaveBeenCalledWith(newTodo);
    });

    test('TODOタスクを更新できる', async () => {
      // Arrange
      const todoId = 'todo-123';
      const updates = {
        title: 'Updated TODO Task',
        status: 'in_progress' as TodoStatus,
        priority: 'medium' as TodoPriority
      };

      const updatedTodo: TodoTask = {
        id: todoId,
        userId: 'test-user-123',
        title: 'Updated TODO Task',
        description: 'Test description',
        status: 'in_progress',
        priority: 'medium',
        dueDate: '2024-12-31',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T01:00:00.000Z'
      };

      mockRepository.updateTodoTask.mockResolvedValue(updatedTodo);

      // Act
      const result = await service.updateTodo(todoId, updates);

      // Assert
      expect(result).toEqual(updatedTodo);
      expect(mockRepository.updateTodoTask).toHaveBeenCalledWith(todoId, updates);
    });

    test('TODOタスクを削除できる', async () => {
      // Arrange
      const todoId = 'todo-123';
      mockRepository.deleteTodoTask.mockResolvedValue(true);

      // Act
      const result = await service.deleteTodo(todoId);

      // Assert
      expect(result).toBe(true);
      expect(mockRepository.deleteTodoTask).toHaveBeenCalledWith(todoId);
    });

    test('TODOタスクを取得できる', async () => {
      // Arrange
      const todoId = 'todo-123';
      const expectedTodo: TodoTask = {
        id: todoId,
        userId: 'test-user-123',
        title: 'Test TODO Task',
        description: 'Test description',
        status: 'pending',
        priority: 'high',
        dueDate: '2024-12-31',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      };

      mockRepository.getTodoTaskById.mockResolvedValue(expectedTodo);

      // Act
      const result = await service.getTodoById(todoId);

      // Assert
      expect(result).toEqual(expectedTodo);
      expect(mockRepository.getTodoTaskById).toHaveBeenCalledWith(todoId);
    });

    test('存在しないTODOタスクを取得しようとするとnullを返す', async () => {
      // Arrange
      const todoId = 'non-existent-todo';
      mockRepository.getTodoTaskById.mockResolvedValue(null);

      // Act
      const result = await service.getTodoById(todoId);

      // Assert
      expect(result).toBeNull();
      expect(mockRepository.getTodoTaskById).toHaveBeenCalledWith(todoId);
    });
  });

  describe('🔴 Red Phase 2-2: TODO一括操作', () => {
    test('複数のTODOタスクのステータスを一括変更できる', async () => {
      // Arrange
      const todoIds = ['todo-1', 'todo-2', 'todo-3'];
      const newStatus: TodoStatus = 'completed';
      const expectedCount = 3;

      mockRepository.bulkUpdateTodoStatus.mockResolvedValue(expectedCount);

      // Act
      const result = await service.bulkUpdateStatus(todoIds, newStatus);

      // Assert
      expect(result).toBe(expectedCount);
      expect(mockRepository.bulkUpdateTodoStatus).toHaveBeenCalledWith(todoIds, newStatus);
    });

    test('複数のTODOタスクを一括削除できる', async () => {
      // Arrange
      const todoIds = ['todo-1', 'todo-2', 'todo-3'];
      const expectedCount = 3;

      mockRepository.bulkDeleteTodos.mockResolvedValue(expectedCount);

      // Act
      const result = await service.bulkDelete(todoIds);

      // Assert
      expect(result).toBe(expectedCount);
      expect(mockRepository.bulkDeleteTodos).toHaveBeenCalledWith(todoIds);
    });
  });

  describe('🔴 Red Phase 2-3: TODO検索・フィルタリング', () => {
    test('ユーザー別TODO一覧を取得できる', async () => {
      // Arrange
      const userId = 'test-user-123';
      const filters = {
        status: 'pending' as TodoStatus,
        priority: 'high' as TodoPriority
      };
      const options = {
        page: 1,
        limit: 10
      };

      const expectedTodos: TodoTask[] = [
        {
          id: 'todo-1',
          userId: 'test-user-123',
          title: 'High Priority TODO',
          description: 'Urgent task',
          status: 'pending',
          priority: 'high',
          dueDate: '2024-12-31',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z'
        }
      ];

      mockRepository.getTodosByUserId.mockResolvedValue(expectedTodos);

      // Act
      const result = await service.getTodosByUser(userId, filters, options);

      // Assert
      expect(result).toEqual(expectedTodos);
      expect(mockRepository.getTodosByUserId).toHaveBeenCalledWith(userId, filters, options);
    });

    test('期限切れのTODOタスクを取得できる', async () => {
      // Arrange
      const expectedOverdueTodos: TodoTask[] = [
        {
          id: 'todo-overdue',
          userId: 'test-user-123',
          title: 'Overdue TODO',
          description: 'This is overdue',
          status: 'pending',
          priority: 'high',
          dueDate: '2024-01-01',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z'
        }
      ];

      mockRepository.getOverdueTodos.mockResolvedValue(expectedOverdueTodos);

      // Act
      const result = await service.getOverdueTodos();

      // Assert
      expect(result).toEqual(expectedOverdueTodos);
      expect(mockRepository.getOverdueTodos).toHaveBeenCalled();
    });
  });

  describe('🔴 Red Phase 2-4: バリデーション', () => {
    test('無効なデータでTODO作成を試みるとエラーを投げる', async () => {
      // Arrange
      const invalidTodo = {
        userId: '', // 空のユーザーID
        title: '',  // 空のタイトル
        description: 'Test description',
        priority: 'invalid' as TodoPriority, // 無効な優先度
        dueDate: 'invalid-date' // 無効な日付
      };

      // Act & Assert
      await expect(service.createTodo(invalidTodo)).rejects.toThrow('Invalid TODO data');
    });

    test('無効なステータスでTODO更新を試みるとエラーを投げる', async () => {
      // Arrange
      const todoId = 'todo-123';
      const invalidUpdates = {
        status: 'invalid-status' as TodoStatus
      };

      // Act & Assert
      await expect(service.updateTodo(todoId, invalidUpdates)).rejects.toThrow('Invalid TODO status');
    });
  });
});