/**
 * TodoManagementService単体テスト
 * Phase 2: TODO管理機能のTDD実装
 */

import { TodoManagementService } from '../../../web-admin/services/todoManagementService';
import { AdminRepository } from '../../../web-admin/repositories/adminRepository';
import { PartialCompositeRepository } from '../../../repositories/PartialCompositeRepository';
import { TodoTask, TodoStatus, TodoPriority } from '../../../types/todo';
import { getTestDbPath } from '../../../utils/testDatabasePath';

// モック
jest.mock('../../../web-admin/repositories/adminRepository');
jest.mock('../../../repositories/PartialCompositeRepository');
const mockAdminRepository = AdminRepository as jest.MockedClass<typeof AdminRepository>;
const mockSqliteRepo = PartialCompositeRepository as jest.MockedClass<typeof PartialCompositeRepository>;

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
        content: 'Test TODO Task',
        description: 'Test description',
        priority: 'high' as TodoPriority,
        dueDate: '2024-12-31'
      };

      const expectedTodo: TodoTask = {
        id: 'todo-123',
        userId: 'test-user-123',
        content: 'Test TODO Task',
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
        content: 'Updated TODO Task',
        status: 'in_progress' as TodoStatus,
        priority: 'medium' as TodoPriority
      };

      const updatedTodo: TodoTask = {
        id: todoId,
        userId: 'test-user-123',
        content: 'Updated TODO Task',
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
        content: 'Test TODO Task',
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

  describe('TODO一括操作機能のテスト（修正・追加）', () => {
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

    test('存在しないTODO IDが含まれていても正常動作する - 一括ステータス更新', async () => {
      // Arrange
      const todoIds = ['todo-1', 'todo-2', 'invalid-id'];
      const newStatus: TodoStatus = 'in_progress';
      const expectedCount = 2; // 存在する2件のみ更新

      mockRepository.bulkUpdateTodoStatus.mockResolvedValue(expectedCount);

      // Act
      const result = await service.bulkUpdateStatus(todoIds, newStatus);

      // Assert
      expect(result).toBe(expectedCount);
      expect(mockRepository.bulkUpdateTodoStatus).toHaveBeenCalledWith(todoIds, newStatus);
    });

    test('存在しないTODO IDが含まれていても正常動作する - 一括削除', async () => {
      // Arrange
      const todoIds = ['todo-1', 'todo-2', 'invalid-id'];
      const expectedCount = 2; // 存在する2件のみ削除

      mockRepository.bulkDeleteTodos.mockResolvedValue(expectedCount);

      // Act
      const result = await service.bulkDelete(todoIds);

      // Assert
      expect(result).toBe(expectedCount);
      expect(mockRepository.bulkDeleteTodos).toHaveBeenCalledWith(todoIds);
    });

    test('空の配列で一括ステータス更新を実行すると0件更新される', async () => {
      // Arrange
      const todoIds: string[] = [];
      const newStatus: TodoStatus = 'completed';
      const expectedCount = 0;

      mockRepository.bulkUpdateTodoStatus.mockResolvedValue(expectedCount);

      // Act
      const result = await service.bulkUpdateStatus(todoIds, newStatus);

      // Assert
      expect(result).toBe(expectedCount);
      expect(mockRepository.bulkUpdateTodoStatus).toHaveBeenCalledWith(todoIds, newStatus);
    });

    test('空の配列で一括削除を実行すると0件削除される', async () => {
      // Arrange
      const todoIds: string[] = [];
      const expectedCount = 0;

      mockRepository.bulkDeleteTodos.mockResolvedValue(expectedCount);

      // Act
      const result = await service.bulkDelete(todoIds);

      // Assert
      expect(result).toBe(expectedCount);
      expect(mockRepository.bulkDeleteTodos).toHaveBeenCalledWith(todoIds);
    });

    test('異なるステータスへの一括更新が正常動作する', async () => {
      // Arrange
      const todoIds = ['todo-1', 'todo-2'];
      const statuses: TodoStatus[] = ['pending', 'in_progress', 'completed'];
      
      // 各ステータスについてテスト
      for (const status of statuses) {
        mockRepository.bulkUpdateTodoStatus.mockResolvedValue(todoIds.length);

        // Act
        const result = await service.bulkUpdateStatus(todoIds, status);

        // Assert
        expect(result).toBe(todoIds.length);
        expect(mockRepository.bulkUpdateTodoStatus).toHaveBeenCalledWith(todoIds, status);
      }
    });

    test('一括操作の統合テスト - ステータス更新後に削除', async () => {
      // Arrange
      const todoIds = ['todo-1', 'todo-2', 'todo-3'];
      
      // 最初にステータス更新
      mockRepository.bulkUpdateTodoStatus.mockResolvedValue(3);
      const updateResult = await service.bulkUpdateStatus(todoIds, 'completed');
      expect(updateResult).toBe(3);

      // 次に一括削除
      mockRepository.bulkDeleteTodos.mockResolvedValue(3);
      const deleteResult = await service.bulkDelete(todoIds);
      expect(deleteResult).toBe(3);

      // Assert
      expect(mockRepository.bulkUpdateTodoStatus).toHaveBeenCalledWith(todoIds, 'completed');
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
          content: 'High Priority TODO',
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
          content: 'Overdue TODO',
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
        content: '',  // 空のコンテンツ
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

  describe('🔴 Red Phase: TODO一括作成機能', () => {
    test('連番付きTODOを一括作成できる', async () => {
      // Arrange
      const request = {
        userId: 'test-user-123',
        baseName: 'テストタスク',
        count: 5,
        priority: 'medium' as TodoPriority
      };

      const expectedTodos: TodoTask[] = [
        {
          id: 'todo-bulk-1',
          userId: 'test-user-123',
          content: 'テストタスク001',
          description: '',
          status: 'pending',
          priority: 'medium',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z'
        },
        {
          id: 'todo-bulk-2',
          userId: 'test-user-123',
          content: 'テストタスク002',
          description: '',
          status: 'pending',
          priority: 'medium',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z'
        },
        {
          id: 'todo-bulk-3',
          userId: 'test-user-123',
          content: 'テストタスク003',
          description: '',
          status: 'pending',
          priority: 'medium',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z'
        },
        {
          id: 'todo-bulk-4',
          userId: 'test-user-123',
          content: 'テストタスク004',
          description: '',
          status: 'pending',
          priority: 'medium',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z'
        },
        {
          id: 'todo-bulk-5',
          userId: 'test-user-123',
          content: 'テストタスク005',
          description: '',
          status: 'pending',
          priority: 'medium',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z'
        }
      ];

      mockRepository.bulkCreateTodos.mockResolvedValue(expectedTodos);

      // Act
      const result = await service.bulkCreateTodos(request);

      // Assert
      expect(result).toEqual(expectedTodos);
      expect(result).toHaveLength(5);
      expect(result[0].content).toBe('テストタスク001');
      expect(result[4].content).toBe('テストタスク005');
      expect(mockRepository.bulkCreateTodos).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({
          userId: 'test-user-123',
          content: 'テストタスク001',
          priority: 'medium'
        }),
        expect.objectContaining({
          userId: 'test-user-123',
          content: 'テストタスク002',
          priority: 'medium'
        }),
        expect.objectContaining({
          userId: 'test-user-123',
          content: 'テストタスク003',
          priority: 'medium'
        }),
        expect.objectContaining({
          userId: 'test-user-123',
          content: 'テストタスク004',
          priority: 'medium'
        }),
        expect.objectContaining({
          userId: 'test-user-123',
          content: 'テストタスク005',
          priority: 'medium'
        })
      ]));
    });

    test('一括作成時のバリデーション - userIdが空の場合エラー', async () => {
      // Arrange
      const request = {
        userId: '',
        baseName: 'テストタスク',
        count: 5,
        priority: 'medium' as TodoPriority
      };

      // Act & Assert
      await expect(service.bulkCreateTodos(request)).rejects.toThrow('Invalid bulk create request: userId is required');
    });

    test('一括作成時のバリデーション - baseNameが空の場合エラー', async () => {
      // Arrange
      const request = {
        userId: 'test-user-123',
        baseName: '',
        count: 5,
        priority: 'medium' as TodoPriority
      };

      // Act & Assert
      await expect(service.bulkCreateTodos(request)).rejects.toThrow('Invalid bulk create request: baseName is required');
    });

    test('一括作成時のバリデーション - countが0以下の場合エラー', async () => {
      // Arrange
      const request = {
        userId: 'test-user-123',
        baseName: 'テストタスク',
        count: 0,
        priority: 'medium' as TodoPriority
      };

      // Act & Assert
      await expect(service.bulkCreateTodos(request)).rejects.toThrow('Invalid bulk create request: count must be between 1 and 100');
    });

    test('一括作成時のバリデーション - countが100を超える場合エラー', async () => {
      // Arrange
      const request = {
        userId: 'test-user-123',
        baseName: 'テストタスク',
        count: 101,
        priority: 'medium' as TodoPriority
      };

      // Act & Assert
      await expect(service.bulkCreateTodos(request)).rejects.toThrow('Invalid bulk create request: count must be between 1 and 100');
    });

    test('一括作成時のバリデーション - 無効なpriorityの場合エラー', async () => {
      // Arrange
      const request = {
        userId: 'test-user-123',
        baseName: 'テストタスク',
        count: 5,
        priority: 'invalid' as TodoPriority
      };

      // Act & Assert
      await expect(service.bulkCreateTodos(request)).rejects.toThrow('Invalid bulk create request: invalid priority');
    });

    test('10個以上のTODO作成時も正しく連番が生成される', async () => {
      // Arrange
      const request = {
        userId: 'test-user-123',
        baseName: 'タスク',
        count: 15,
        priority: 'low' as TodoPriority
      };

      const expectedTodos: TodoTask[] = [];
      for (let i = 1; i <= 15; i++) {
        expectedTodos.push({
          id: `todo-bulk-${i}`,
          userId: 'test-user-123',
          content: `タスク${String(i).padStart(3, '0')}`,
          description: '',
          status: 'pending',
          priority: 'low',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z'
        });
      }

      mockRepository.bulkCreateTodos.mockResolvedValue(expectedTodos);

      // Act
      const result = await service.bulkCreateTodos(request);

      // Assert
      expect(result).toHaveLength(15);
      expect(result[0].content).toBe('タスク001');
      expect(result[9].content).toBe('タスク010');
      expect(result[14].content).toBe('タスク015');
    });
  });
});