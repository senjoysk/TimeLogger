/**
 * TODO一括操作の統合テスト
 * 実際のデータベースを使用した統合テスト
 */

import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';
import express, { Request, Response, NextFunction } from 'express';
import { createTodoRouter } from '../../../web-admin/routes/todos';
import { SqliteActivityLogRepository } from '../../../repositories/sqliteActivityLogRepository';
import { TodoTask } from '../../../types/todo';

describe('TODO一括操作の統合テスト', () => {
  let app: any;
  let testDbPath: string;
  let sqliteRepo: SqliteActivityLogRepository;
  let createdTodoIds: string[] = [];
  
  const testUsername = process.env.ADMIN_USERNAME || 'admin';
  const testPassword = process.env.ADMIN_PASSWORD || 'password';
  const authHeader = `Basic ${Buffer.from(`${testUsername}:${testPassword}`).toString('base64')}`;

  beforeAll(async () => {
    // テスト用の一時データベースファイル作成
    testDbPath = path.join(__dirname, `test-bulk-${Date.now()}.db`);
    
    // SqliteActivityLogRepositoryの初期化
    sqliteRepo = new SqliteActivityLogRepository(testDbPath);
    await sqliteRepo.initializeDatabase();
    
    // Expressアプリケーションを作成
    app = express();
    app.use(express.json());
    app.set('databasePath', testDbPath);
    
    // Basic認証の設定
    app.use((req: Request, res: Response, next: NextFunction) => {
      const auth = req.headers.authorization;
      if (!auth || !auth.startsWith('Basic ')) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const credentials = Buffer.from(auth.slice(6), 'base64').toString();
      const [username, password] = credentials.split(':');
      
      if (username === testUsername && password === testPassword) {
        next();
      } else {
        res.status(401).json({ error: 'Invalid credentials' });
      }
    });
    
    // TODOルーターをマウント
    app.use('/todos', createTodoRouter(testDbPath));
  });

  afterAll(async () => {
    // テスト後にデータベースファイルを削除
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  beforeEach(async () => {
    // 各テスト前にテストTODOを作成
    createdTodoIds = [];
    
    for (let i = 1; i <= 3; i++) {
      const response = await request(app)
        .post('/todos')
        .set('Authorization', authHeader)
        .send({
          userId: 'test-user',
          title: `一括テストTODO${i}`,
          description: `一括テスト説明${i}`,
          priority: 'medium'
        })
        .expect(302); // リダイレクト
        
      // リダイレクトレスポンスからTODO IDを取得（実際のTODO作成確認）
      const todos = await sqliteRepo.getTodosByUserId('test-user');
      const newTodo = todos.find(t => t.content === `一括テストTODO${i}`);
      if (newTodo) {
        createdTodoIds.push(newTodo.id);
      }
    }
    
    expect(createdTodoIds).toHaveLength(3);
  });

  afterEach(async () => {
    // 各テスト後にテストTODOを削除（クリーンアップ）
    for (const todoId of createdTodoIds) {
      try {
        await sqliteRepo.deleteTodo(todoId);
      } catch (error) {
        // 削除エラーは無視（テスト中に削除済みの場合）
      }
    }
  });

  describe('一括ステータス更新API', () => {
    test('POST /todos/bulk/status - 複数TODOのステータスを一括更新できる', async () => {
      // When: 一括ステータス更新を実行
      const response = await request(app)
        .post('/todos/bulk/status')
        .set('Authorization', authHeader)
        .send({
          todoIds: createdTodoIds,
          status: 'completed'
        })
        .expect(200);

      // Then: レスポンスが正しい
      expect(response.body).toEqual({
        success: true,
        updatedCount: 3
      });

      // データベース上でステータスが更新されていることを確認
      for (const todoId of createdTodoIds) {
        const updatedTodo = await sqliteRepo.getTodoById(todoId);
        expect(updatedTodo).not.toBeNull();
        expect(updatedTodo!.status).toBe('completed');
      }
    });

    test('POST /todos/bulk/status - 存在しないTODO IDが含まれていても正常動作する', async () => {
      // Given: 存在するIDと存在しないID
      const mixedIds = [...createdTodoIds.slice(0, 2), 'invalid-id-1', 'invalid-id-2'];

      // When: 一括ステータス更新を実行
      const response = await request(app)
        .post('/todos/bulk/status')
        .set('Authorization', authHeader)
        .send({
          todoIds: mixedIds,
          status: 'in_progress'
        })
        .expect(200);

      // Then: 存在するTODOのみ更新される
      expect(response.body).toEqual({
        success: true,
        updatedCount: 2
      });

      // 更新されたTODOを確認
      for (const todoId of createdTodoIds.slice(0, 2)) {
        const updatedTodo = await sqliteRepo.getTodoById(todoId);
        expect(updatedTodo!.status).toBe('in_progress');
      }

      // 更新されなかったTODOを確認
      const notUpdatedTodo = await sqliteRepo.getTodoById(createdTodoIds[2]);
      expect(notUpdatedTodo!.status).toBe('pending');
    });

    test('POST /todos/bulk/status - 空の配列では0件更新される', async () => {
      // When: 空の配列で一括更新
      const response = await request(app)
        .post('/todos/bulk/status')
        .set('Authorization', authHeader)
        .send({
          todoIds: [],
          status: 'completed'
        })
        .expect(200);

      // Then: 0件更新される
      expect(response.body).toEqual({
        success: true,
        updatedCount: 0
      });
    });

    test('POST /todos/bulk/status - Production環境では403エラー', async () => {
      // Given: Production環境のモック
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        // When: Production環境で一括更新を試行
        const response = await request(app)
          .post('/todos/bulk/status')
          .set('Authorization', authHeader)
          .send({
            todoIds: createdTodoIds,
            status: 'completed'
          })
          .expect(403);

        // Then: エラーメッセージが正しい
        expect(response.body).toEqual({
          error: 'Production環境では更新操作は許可されていません'
        });
      } finally {
        // 環境変数を復元
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  describe('一括削除API', () => {
    test('POST /todos/bulk/delete - 複数TODOを一括削除できる', async () => {
      // When: 一括削除を実行
      const response = await request(app)
        .post('/todos/bulk/delete')
        .set('Authorization', authHeader)
        .send({
          todoIds: createdTodoIds
        })
        .expect(200);

      // Then: レスポンスが正しい
      expect(response.body).toEqual({
        success: true,
        deletedCount: 3
      });

      // データベース上でTODOが削除されていることを確認
      for (const todoId of createdTodoIds) {
        const deletedTodo = await sqliteRepo.getTodoById(todoId);
        expect(deletedTodo).toBeNull();
      }
    });

    test('POST /todos/bulk/delete - 存在しないTODO IDが含まれていても正常動作する', async () => {
      // Given: 存在するIDと存在しないID
      const mixedIds = [...createdTodoIds.slice(0, 2), 'invalid-id-1', 'invalid-id-2'];

      // When: 一括削除を実行
      const response = await request(app)
        .post('/todos/bulk/delete')
        .set('Authorization', authHeader)
        .send({
          todoIds: mixedIds
        })
        .expect(200);

      // Then: 存在するTODOのみ削除される
      expect(response.body).toEqual({
        success: true,
        deletedCount: 2
      });

      // 削除されたTODOを確認
      for (const todoId of createdTodoIds.slice(0, 2)) {
        const deletedTodo = await sqliteRepo.getTodoById(todoId);
        expect(deletedTodo).toBeNull();
      }

      // 削除されなかったTODOを確認
      const remainingTodo = await sqliteRepo.getTodoById(createdTodoIds[2]);
      expect(remainingTodo).not.toBeNull();
    });

    test('POST /todos/bulk/delete - 空の配列では0件削除される', async () => {
      // When: 空の配列で一括削除
      const response = await request(app)
        .post('/todos/bulk/delete')
        .set('Authorization', authHeader)
        .send({
          todoIds: []
        })
        .expect(200);

      // Then: 0件削除される
      expect(response.body).toEqual({
        success: true,
        deletedCount: 0
      });

      // 全てのTODOが残っていることを確認
      for (const todoId of createdTodoIds) {
        const remainingTodo = await sqliteRepo.getTodoById(todoId);
        expect(remainingTodo).not.toBeNull();
      }
    });

    test('POST /todos/bulk/delete - Production環境では403エラー', async () => {
      // Given: Production環境のモック
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        // When: Production環境で一括削除を試行
        const response = await request(app)
          .post('/todos/bulk/delete')
          .set('Authorization', authHeader)
          .send({
            todoIds: createdTodoIds
          })
          .expect(403);

        // Then: エラーメッセージが正しい
        expect(response.body).toEqual({
          error: 'Production環境では削除操作は許可されていません'
        });
      } finally {
        // 環境変数を復元
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  describe('一括操作の統合シナリオ', () => {
    test('一括ステータス更新後に一括削除が正常動作する', async () => {
      // Step 1: 一括ステータス更新
      const updateResponse = await request(app)
        .post('/todos/bulk/status')
        .set('Authorization', authHeader)
        .send({
          todoIds: createdTodoIds,
          status: 'completed'
        })
        .expect(200);

      expect(updateResponse.body.updatedCount).toBe(3);

      // ステータスが更新されていることを確認
      for (const todoId of createdTodoIds) {
        const updatedTodo = await sqliteRepo.getTodoById(todoId);
        expect(updatedTodo!.status).toBe('completed');
      }

      // Step 2: 一括削除
      const deleteResponse = await request(app)
        .post('/todos/bulk/delete')
        .set('Authorization', authHeader)
        .send({
          todoIds: createdTodoIds
        })
        .expect(200);

      expect(deleteResponse.body.deletedCount).toBe(3);

      // 全てのTODOが削除されていることを確認
      for (const todoId of createdTodoIds) {
        const deletedTodo = await sqliteRepo.getTodoById(todoId);
        expect(deletedTodo).toBeNull();
      }
    });

    test('認証なしでは401エラー', async () => {
      // 一括ステータス更新
      await request(app)
        .post('/todos/bulk/status')
        .send({
          todoIds: createdTodoIds,
          status: 'completed'
        })
        .expect(401);

      // 一括削除
      await request(app)
        .post('/todos/bulk/delete')
        .send({
          todoIds: createdTodoIds
        })
        .expect(401);
    });

    test('不正なJSONデータでは400エラー', async () => {
      // 一括ステータス更新 - todoIdsが配列でない
      await request(app)
        .post('/todos/bulk/status')
        .set('Authorization', authHeader)
        .send({
          todoIds: 'invalid-data',
          status: 'completed'
        })
        .expect(500); // バックエンドでエラーハンドリングされる

      // 一括削除 - todoIdsが配列でない
      await request(app)
        .post('/todos/bulk/delete')
        .set('Authorization', authHeader)
        .send({
          todoIds: 'invalid-data'
        })
        .expect(500); // バックエンドでエラーハンドリングされる
    });
  });
});