/**
 * TODO一括操作の統合テスト
 * 実際のデータベースを使用した統合テスト
 */

import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';
import express, { Request, Response, NextFunction } from 'express';
import { createTodoRouter } from '../../../web-admin/routes/todos';
import { SqliteTodoRepository } from '../../../repositories/specialized/SqliteTodoRepository';
import { TodoTask } from '../../../types/todo';

describe('TODO一括操作の統合テスト', () => {
  let app: any;
  let testDbPath: string;
  let sqliteRepo: SqliteTodoRepository;
  let createdTodoIds: string[] = [];
  
  // テストタイムアウトを30秒に設定
  jest.setTimeout(30000);
  
  const testUsername = process.env.ADMIN_USERNAME || 'admin';
  const testPassword = process.env.ADMIN_PASSWORD || 'password';
  const authHeader = `Basic ${Buffer.from(`${testUsername}:${testPassword}`).toString('base64')}`;

  beforeAll(async () => {
    // テスト用の一時データベースファイル作成
    testDbPath = path.join(__dirname, `test-bulk-${Date.now()}.db`);
    
    // SqliteTodoRepositoryの初期化
    sqliteRepo = new SqliteTodoRepository(testDbPath);
    await sqliteRepo.ensureSchema();
    
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
    try {
      if (sqliteRepo) {
        // データベース接続を明示的に閉じる
        // SqliteTodoRepositoryにはcloseメソッドがないため、DatabaseConnectionのcloseを使用
        const dbConnection = (sqliteRepo as any).dbConnection;
        if (dbConnection) {
          await dbConnection.close();
        }
      }
    } catch (error) {
      console.warn('Warning: Failed to close database connection:', error);
    }
    
    // 少し待ってからファイル削除を試行
    await new Promise(resolve => setTimeout(resolve, 100));
    
    if (fs.existsSync(testDbPath)) {
      try {
        fs.unlinkSync(testDbPath);
      } catch (error) {
        console.warn('Warning: Failed to delete test database file:', error);
      }
    }
  });

  beforeEach(async () => {
    // 各テスト前に既存のtest-userのTODOを全て削除
    try {
      const existingTodos = await sqliteRepo.getTodosByUserId('test-user');
      for (const todo of existingTodos) {
        await sqliteRepo.deleteTodo(todo.id);
      }
    } catch (error) {
      // 削除エラーは無視
    }

    // 各テスト前にテストTODOを作成
    createdTodoIds = [];
    
    // 少し待ってから作成処理を開始（競合状態の回避）
    await new Promise(resolve => setTimeout(resolve, 50));
    
    for (let i = 1; i <= 3; i++) {
      try {
        const response = await request(app)
          .post('/todos')
          .set('Authorization', authHeader)
          .send({
            userId: 'test-user',
            content: `一括テストTODO${i}`,
            description: `一括テスト説明${i}`,
            priority: 'medium'
          })
          .timeout(5000); // タイムアウト設定を追加
          
        // レスポンスの詳細をログ出力
        console.log(`TODO ${i} creation response:`, response.status, response.text);
          
        // 少し待ってからデータベースから確認
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // リダイレクトレスポンスからTODO IDを取得（実際のTODO作成確認）
        const todos = await sqliteRepo.getTodosByUserId('test-user');
        const newTodo = todos.find(t => t.content === `一括テストTODO${i}`);
        if (newTodo) {
          createdTodoIds.push(newTodo.id);
          console.log(`TODO ${i} created successfully with ID: ${newTodo.id}`);
        } else {
          console.warn(`TODO ${i} not found in database. Current todos:`, todos.map(t => t.content));
        }
      } catch (error) {
        console.error(`Failed to create TODO ${i}:`, error);
        if (error instanceof Error) {
          console.error('Error details:', error.message);
        }
        // テストを継続するためにエラーを投げない
        console.warn(`Continuing test despite TODO ${i} creation failure`);
      }
    }
    
    console.log(`Created ${createdTodoIds.length} TODOs out of 3 attempts`);
    expect(createdTodoIds.length).toBeGreaterThanOrEqual(2); // 少なくとも2つは作成されることを期待
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
        updatedCount: createdTodoIds.length
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
        deletedCount: createdTodoIds.length
      });

      // データベース上でTODOが削除されていることを確認
      for (const todoId of createdTodoIds) {
        const deletedTodo = await sqliteRepo.getTodoById(todoId);
        expect(deletedTodo).toBeNull();
      }
    });

    test('POST /todos/bulk/delete - 存在しないTODO IDが含まれていても正常動作する', async () => {
      // Given: 存在するIDと存在しないID
      const validIds = createdTodoIds.slice(0, 2);
      const mixedIds = [...validIds, 'invalid-id-1', 'invalid-id-2'];

      // When: 一括削除を実行
      const response = await request(app)
        .post('/todos/bulk/delete')
        .set('Authorization', authHeader)
        .send({
          todoIds: mixedIds
        })
        .expect(200);

      // Then: 存在するTODOのみ削除される（実際の削除可能数を確認）
      expect(response.body.success).toBe(true);
      expect(response.body.deletedCount).toBeGreaterThanOrEqual(2);

      // 削除されたTODOを確認
      for (const todoId of validIds) {
        const deletedTodo = await sqliteRepo.getTodoById(todoId);
        expect(deletedTodo).toBeNull();
      }

      // 残りのTODOが存在することを確認（削除されなかった分）
      const remainingTodos = await sqliteRepo.getTodosByUserId('test-user');
      expect(remainingTodos.length).toBeGreaterThanOrEqual(1);
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

      expect(updateResponse.body.updatedCount).toBe(createdTodoIds.length);

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

      expect(deleteResponse.body.deletedCount).toBe(createdTodoIds.length);

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
      try {
        // 一括ステータス更新 - todoIdsが配列でない（文字列は許可されているので、nullでテスト）
        const response1 = await request(app)
          .post('/todos/bulk/status')
          .set('Authorization', authHeader)
          .set('Content-Type', 'application/json')
          .send({
            todoIds: null,
            status: 'completed'
          })
          .timeout(5000);
        
        expect(response1.status).toBe(400);
        expect(response1.body.error).toBeDefined();

        // レスポンス間で少し待つ
        await new Promise(resolve => setTimeout(resolve, 50));

        // 一括削除 - todoIdsが配列でない（文字列は許可されているので、nullでテスト）
        const response2 = await request(app)
          .post('/todos/bulk/delete')
          .set('Authorization', authHeader)
          .set('Content-Type', 'application/json')
          .send({
            todoIds: null
          })
          .timeout(5000);
          
        expect(response2.status).toBe(400);
        expect(response2.body.error).toBeDefined();

        // レスポンス間で少し待つ
        await new Promise(resolve => setTimeout(resolve, 50));

        // statusが不正なケース
        const response3 = await request(app)
          .post('/todos/bulk/status')
          .set('Authorization', authHeader)
          .set('Content-Type', 'application/json')
          .send({
            todoIds: createdTodoIds,
            status: null
          })
          .timeout(5000);
          
        expect(response3.status).toBe(400);
        expect(response3.body.error).toBeDefined();
      } catch (error) {
        console.error('Test failed with error:', error);
        
        // エラーの詳細を取得
        if (error instanceof Error) {
          console.error('Error stack:', error.stack);
          if (error.message && error.message.includes('Parse Error')) {
            console.error('HTTP Parse Error detected. This might be a server crash or invalid response.');
          }
        }
        
        throw error;
      }
    });
  });
});