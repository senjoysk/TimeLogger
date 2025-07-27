/**
 * SqliteTodoRepository テスト
 * Phase 1: TODO専用リポジトリ分離テスト
 */

import { SqliteTodoRepository } from '../../repositories/specialized/SqliteTodoRepository';
import { DatabaseConnection } from '../../repositories/base/DatabaseConnection';
import { cleanupTestDatabaseFiles } from '../setup';
import { TodoError, TodoStatus } from '../../types/todo';
import * as path from 'path';
import * as fs from 'fs';

describe('SqliteTodoRepository分離テスト（実装済み）', () => {
  let repository: SqliteTodoRepository;
  let dbConnection: DatabaseConnection;
  const testDbPath = path.join(__dirname, '../../test-data/test-todo-repository.db');

  beforeEach(async () => {
    // テストDB用ディレクトリ作成
    const testDir = path.dirname(testDbPath);
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // 既存DBファイルの削除
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Repository初期化
    repository = new SqliteTodoRepository(testDbPath);
    dbConnection = DatabaseConnection.getInstance(testDbPath);
    await dbConnection.initializeDatabase();
  });

  afterEach(async () => {
    try {
      await dbConnection.close();
      await cleanupTestDatabaseFiles();
    } catch (error) {
      console.warn('⚠️ クリーンアップ中にエラー:', error);
    }
  });

  describe('TODO基本CRUD操作', () => {
    test('新しいTODOタスクを作成できる', async () => {
      // Arrange
      const request = {
        userId: 'test-user-123',
        content: 'Test TODO Task',
        priority: 1, // 高優先度: 1
        dueDate: '2024-12-31',
        sourceType: 'manual' as const,
        aiConfidence: 0.8
      };

      // Act
      const todo = await repository.createTodo(request);

      // Assert
      expect(todo).toBeDefined();
      expect(todo.id).toBeDefined();
      expect(todo.userId).toBe(request.userId);
      expect(todo.content).toBe(request.content);
      expect(todo.priority).toBe(request.priority);
      expect(todo.dueDate).toBe(request.dueDate);
      expect(todo.sourceType).toBe(request.sourceType);
      expect(todo.aiConfidence).toBe(request.aiConfidence);
      expect(todo.status).toBe('pending');
      expect(todo.completedAt).toBeUndefined();
      expect(todo.createdAt).toBeDefined();
      expect(todo.updatedAt).toBeDefined();
    });

    test('TODOをIDで取得できる', async () => {
      // Arrange
      const request = {
        userId: 'test-user-123',
        content: 'Test TODO Task',
        priority: 0 // 通常優先度: 0
      };
      const createdTodo = await repository.createTodo(request);

      // Act
      const retrievedTodo = await repository.getTodoById(createdTodo.id);

      // Assert
      expect(retrievedTodo).toBeDefined();
      expect(retrievedTodo!.id).toBe(createdTodo.id);
      expect(retrievedTodo!.content).toBe(createdTodo.content);
      expect(retrievedTodo!.userId).toBe(createdTodo.userId);
    });

    test('存在しないTODOを取得するとnullが返る', async () => {
      // Act
      const retrievedTodo = await repository.getTodoById('non-existent-id');

      // Assert
      expect(retrievedTodo).toBeNull();
    });

    test('TODOを更新できる', async () => {
      // Arrange
      const request = {
        userId: 'test-user-123',
        content: 'Original content',
        priority: -1 // 低優先度: -1
      };
      const createdTodo = await repository.createTodo(request);

      const update = {
        content: 'Updated content',
        status: 'in_progress' as TodoStatus,
        priority: 1 // 高優先度: 1
      };

      // Act
      await repository.updateTodo(createdTodo.id, update);

      // 更新されたTODOを取得
      const updatedTodo = await repository.getTodoById(createdTodo.id);

      // Assert
      expect(updatedTodo).toBeDefined();
      expect(updatedTodo!.content).toBe(update.content);
      expect(updatedTodo!.status).toBe(update.status);
      expect(updatedTodo!.priority).toBe(update.priority);
      expect(updatedTodo!.updatedAt).not.toBe(createdTodo.updatedAt);
    });

    test('TODOステータスを更新できる', async () => {
      // Arrange
      const request = {
        userId: 'test-user-123',
        content: 'Test TODO',
        priority: 0 // 通常優先度: 0
      };
      const createdTodo = await repository.createTodo(request);

      // Act
      await repository.updateTodoStatus(createdTodo.id, 'completed');

      // 更新されたTODOを取得
      const updatedTodo = await repository.getTodoById(createdTodo.id);

      // Assert
      expect(updatedTodo).toBeDefined();
      expect(updatedTodo!.status).toBe('completed');
      expect(updatedTodo!.completedAt).not.toBeNull();
      expect(updatedTodo!.completedAt).toBeDefined();
    });

    test('TODOを削除できる（論理削除）', async () => {
      // Arrange
      const request = {
        userId: 'test-user-123',
        content: 'Test TODO',
        priority: 0 // 通常優先度: 0
      };
      const createdTodo = await repository.createTodo(request);

      // Act
      await repository.deleteTodo(createdTodo.id);

      // 削除されたTODOは取得できないことを確認
      const deletedTodo = await repository.getTodoById(createdTodo.id);

      // Assert
      expect(deletedTodo).toBeNull();
    });
  });

  describe('TODO検索・フィルタリング機能', () => {
    beforeEach(async () => {
      // テストデータ作成
      await repository.createTodo({
        userId: 'test-user-123',
        content: 'Pending TODO',
        priority: 1 // 高優先度: 1
      });

      const inProgressTodo = await repository.createTodo({
        userId: 'test-user-123',
        content: 'In Progress TODO',
        priority: 0 // 通常優先度: 0
      });
      await repository.updateTodoStatus(inProgressTodo.id, 'in_progress');

      const completedTodo = await repository.createTodo({
        userId: 'test-user-123',
        content: 'Completed TODO',
        priority: -1 // 低優先度: -1
      });
      await repository.updateTodoStatus(completedTodo.id, 'completed');

      // 他のユーザーのTODO
      await repository.createTodo({
        userId: 'other-user',
        content: 'Other user TODO',
        priority: 0 // 通常優先度: 0
      });
    });

    test('ユーザーIDでTODO一覧を取得できる', async () => {
      // Act
      const todos = await repository.getTodosByUserId('test-user-123');

      // Assert
      expect(todos).toHaveLength(3);
      expect(todos.every(todo => todo.userId === 'test-user-123')).toBe(true);
    });

    test('ステータスでフィルタリングできる', async () => {
      // Act
      const pendingTodos = await repository.getTodosByUserId('test-user-123', {
        status: 'pending'
      });

      // Assert
      expect(pendingTodos).toHaveLength(1);
      expect(pendingTodos[0].status).toBe('pending');
      expect(pendingTodos[0].content).toBe('Pending TODO');
    });

    test('完了状態でフィルタリングできる', async () => {
      // Act
      const completedTodos = await repository.getTodosByUserId('test-user-123', {
        status: 'completed'
      });

      // Assert
      expect(completedTodos).toHaveLength(1);
      expect(completedTodos[0].completedAt).not.toBeNull();
    });

    test('キーワード検索ができる', async () => {
      // Act
      const searchResults = await repository.searchTodos('test-user-123', 'Progress');

      // Assert
      expect(searchResults).toHaveLength(1);
      expect(searchResults[0].content).toBe('In Progress TODO');
    });

    test('ステータス指定で最適化取得ができる', async () => {
      // Act
      const activeTodos = await repository.getTodosByStatusOptimized('test-user-123', [
        'pending',
        'in_progress'
      ]);

      // Assert
      expect(activeTodos).toHaveLength(2);
      expect(activeTodos.every(todo => 
        todo.status === 'pending' || todo.status === 'in_progress'
      )).toBe(true);
    });
  });

  describe('TODO統計機能', () => {
    beforeEach(async () => {
      // 統計用テストデータ作成
      await repository.createTodo({
        userId: 'stats-user',
        content: 'Pending TODO 1',
        priority: 1 // 高優先度: 1
      });

      await repository.createTodo({
        userId: 'stats-user',
        content: 'Pending TODO 2',
        priority: 0 // 通常優先度: 0
      });

      const inProgressTodo = await repository.createTodo({
        userId: 'stats-user',
        content: 'In Progress TODO',
        priority: 1 // 高優先度: 1
      });
      await repository.updateTodoStatus(inProgressTodo.id, 'in_progress');

      const completedTodo = await repository.createTodo({
        userId: 'stats-user',
        content: 'Completed TODO',
        priority: -1 // 低優先度: -1
      });
      await repository.updateTodoStatus(completedTodo.id, 'completed');
    });

    test('TODO統計を取得できる', async () => {
      // Act
      const stats = await repository.getTodoStats('stats-user');

      // Assert
      expect(stats.total).toBe(4);
      expect(stats.pending).toBe(2);
      expect(stats.inProgress).toBe(1);
      expect(stats.completed).toBe(1);
    });

    test('データがないユーザーの統計は0になる', async () => {
      // Act
      const stats = await repository.getTodoStats('empty-user');

      // Assert
      expect(stats.total).toBe(0);
      expect(stats.pending).toBe(0);
      expect(stats.inProgress).toBe(0);
      expect(stats.completed).toBe(0);
    });
  });

  describe('期日管理機能', () => {
    test('期日付きTODOを取得できる', async () => {
      // Arrange
      await repository.createTodo({
        userId: 'due-user',
        content: 'TODO with due date',
        priority: 1, // 高優先度: 1
        dueDate: '2024-12-31'
      });

      await repository.createTodo({
        userId: 'due-user',
        content: 'TODO without due date',
        priority: 0 // 通常優先度: 0
      });

      // Act
      const dueTodos = await repository.getTodosWithDueDate('due-user');

      // Assert
      expect(dueTodos).toHaveLength(1);
      expect(dueTodos[0].dueDate).toBe('2024-12-31');
    });

    test('指定日付より前の期日のTODOを取得できる', async () => {
      // Arrange
      await repository.createTodo({
        userId: 'due-user',
        content: 'Early due TODO',
        priority: 1, // 高優先度: 1
        dueDate: '2024-06-01'
      });

      await repository.createTodo({
        userId: 'due-user',
        content: 'Late due TODO',
        priority: 0, // 通常優先度: 0
        dueDate: '2024-12-31'
      });

      // Act
      const earlyDueTodos = await repository.getTodosWithDueDate('due-user', '2024-07-01');

      // Assert
      expect(earlyDueTodos).toHaveLength(1);
      expect(earlyDueTodos[0].content).toBe('Early due TODO');
    });
  });

  describe('エラーハンドリング', () => {
    test('無効なデータでTODO作成するとエラーになる', async () => {
      // Act & Assert
      await expect(repository.createTodo({
        userId: '',  // 空のユーザーID
        content: '',  // 空のコンテンツ
        priority: 0 // 通常優先度: 0
      })).rejects.toThrow(TodoError);
    });

    test('存在しないTODOを更新しようとしてもエラーにならない', async () => {
      // Act & Assert
      await expect(repository.updateTodo('non-existent-id', {
        content: 'Updated content'
      })).resolves.not.toThrow();
    });
  });

  describe('データベース統合テスト', () => {
    test('テーブルが自動作成される', async () => {
      // API呼び出しでテーブル作成をトリガー
      await repository.createTodo({
        userId: 'test',
        content: 'Test',
        priority: 0 // 通常優先度: 0
      });

      // テーブルが存在することを確認
      const tables = await dbConnection.all(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='todo_tasks'
      `);
      
      expect(tables).toHaveLength(1);
      expect(tables[0].name).toBe('todo_tasks');
    });
  });
});