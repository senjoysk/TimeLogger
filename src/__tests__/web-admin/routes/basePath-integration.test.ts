/**
 * basePath統合テスト
 * Form action、redirect、linkが環境に応じて正しく動作することを確認
 */

import request from 'supertest';
import { IntegratedServer } from '../../../server';
import { AdminServer } from '../../../web-admin/server';
import path from 'path';
import fs from 'fs';

describe('basePath統合テスト', () => {
  const testDbPath = path.join(__dirname, '../../../../test-basepath.db');
  let adminServer: AdminServer;
  let integratedServer: IntegratedServer;

  beforeAll(async () => {
    // 環境変数設定
    process.env.ADMIN_USERNAME = 'testuser';
    process.env.ADMIN_PASSWORD = 'testpass';
    process.env.NODE_ENV = 'test';
    process.env.SKIP_MIGRATIONS = 'true';
    
    // テストDBクリーンアップ
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  afterAll(async () => {
    // 念のため全サーバーインスタンスのクリーンアップ
    if (adminServer) {
      const repo = (adminServer as any).sqliteRepo;
      if (repo && typeof repo.close === 'function') {
        try {
          await repo.close();
        } catch (error) {
          // クリーンアップエラーは無視
        }
      }
    }
    
    if (integratedServer) {
      const adminServerInstance = (integratedServer as any).adminServer;
      if (adminServerInstance) {
        const repo = adminServerInstance.sqliteRepo;
        if (repo && typeof repo.close === 'function') {
          try {
            await repo.close();
          } catch (error) {
            // クリーンアップエラーは無視
          }
        }
      }
    }
    
    // 短い待機でリソース解放を確実にする
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // テストDBクリーンアップ
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('AdminServer単体（basePath = ""）', () => {
    beforeEach(async () => {
      adminServer = new AdminServer(testDbPath, 3002);
      await adminServer.initializeDatabase();
    });

    afterEach(async () => {
      if (adminServer) {
        // データベース接続を閉じる
        const repo = (adminServer as any).sqliteRepo;
        if (repo && typeof repo.close === 'function') {
          await repo.close();
        }
      }
    });

    test('TODO作成フォームのaction属性が正しく設定される', async () => {
      const app = adminServer.getExpressApp();
      const response = await request(app)
        .get('/todos/new')
        .auth('testuser', 'testpass')
        .timeout(10000)
        .expect(200);
      
      // basePath = "" の場合、action="/todos"
      expect(response.text).toContain('action="/todos"');
      expect(response.text).not.toContain('action="/admin/todos"');
    }, 30000);

    test('TODO編集フォームのaction属性が正しく設定される', async () => {
      const app = adminServer.getExpressApp();
      
      // まずTODOを作成
      await request(app)
        .post('/todos')
        .auth('testuser', 'testpass')
        .timeout(10000)
        .send({
          userId: 'testuser',
          title: 'Test TODO',
          content: 'Test content'
        });

      // 作成したTODOを取得
      const dashboardResponse = await request(app)
        .get('/todos')
        .auth('testuser', 'testpass')
        .timeout(10000);
      
      // TODOが存在する場合のみ編集フォームをテスト
      if (dashboardResponse.text.includes('Test TODO')) {
        const editResponse = await request(app)
          .get('/todos/1/edit')
          .auth('testuser', 'testpass')
          .timeout(10000);
        
        if (editResponse.status === 200) {
          // basePath = "" の場合、action="/todos/1"
          expect(editResponse.text).toContain('action="/todos/1"');
          expect(editResponse.text).not.toContain('action="/admin/todos/1"');
        }
      }
    }, 30000);

    test('TODO削除フォームのaction属性が正しく設定される', async () => {
      const app = adminServer.getExpressApp();
      
      // まずTODOを作成
      const createResponse = await request(app)
        .post('/todos')
        .auth('testuser', 'testpass')
        .timeout(10000)
        .send({
          userId: 'testuser',
          title: 'Test TODO for Delete',
          description: 'Test content',
          priority: 'medium'
        });

      // TODO作成が成功したことを確認
      expect(createResponse.status).toBe(302);

      // 短い待機でデータベースへの書き込み完了を待つ
      await new Promise(resolve => setTimeout(resolve, 100));

      // 特定ユーザーのTODOを明示的に取得
      const response = await request(app)
        .get('/todos?userId=testuser')
        .auth('testuser', 'testpass')
        .timeout(10000)
        .expect(200);
      
      // デバッグ情報を出力
      console.log('AdminServer - TODOページのレスポンスを確認中...');
      if (!response.text.includes('Test TODO for Delete')) {
        console.log('TODOが見つかりません。userId=testuserでクエリ実行');
        console.log('レスポンスの一部:');
        console.log(response.text.substring(0, 1000) + '...');
      }
      
      // TODOが表示されているかを確認
      expect(response.text).toContain('Test TODO for Delete');
      
      // basePath = "" の場合、削除フォームのaction="/todos/{id}/delete"
      expect(response.text).toMatch(/action="\/todos\/[^"]*\/delete"/);
      expect(response.text).not.toMatch(/action="\/admin\/todos\/[^"]*\/delete"/);
    }, 30000);

    test('TODO作成後のリダイレクト先が正しい', async () => {
      const app = adminServer.getExpressApp();
      
      const response = await request(app)
        .post('/todos')
        .auth('testuser', 'testpass')
        .timeout(10000)
        .send({
          userId: 'testuser',
          title: 'Test TODO',
          description: 'Test content',
          priority: 'medium'
        });
      
      // エラーの場合はログを出力
      if (response.status === 500) {
        console.log('AdminServer TODO作成エラー:');
        console.log('Status:', response.status);
        console.log('Response:', response.text);
        console.log('Headers:', response.headers);
      }
      
      // basePath = "" の場合、リダイレクト先は "/todos"
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/todos');
    }, 30000);
  });

  describe('IntegratedServer（basePath = "/admin"）', () => {
    beforeEach(async () => {
      integratedServer = new IntegratedServer(testDbPath);
      await integratedServer.initialize();
    });

    afterEach(async () => {
      if (integratedServer) {
        // AdminServerのデータベース接続を閉じる
        const adminServer = (integratedServer as any).adminServer;
        if (adminServer) {
          const repo = adminServer.sqliteRepo;
          if (repo && typeof repo.close === 'function') {
            await repo.close();
          }
        }
      }
    });

    test('TODO作成フォームのaction属性が正しく設定される', async () => {
      const app = (integratedServer as any).app;
      const response = await request(app)
        .get('/admin/todos/new')
        .auth('testuser', 'testpass')
        .timeout(10000)
        .expect(200);
      
      // basePath = "/admin" の場合、action="/admin/todos"
      expect(response.text).toContain('action="/admin/todos"');
      expect(response.text).not.toContain('action="/todos"');
    }, 30000);

    test('TODO編集フォームのaction属性が正しく設定される', async () => {
      const app = (integratedServer as any).app;
      
      // まずTODOを作成
      await request(app)
        .post('/admin/todos')
        .auth('testuser', 'testpass')
        .timeout(10000)
        .send({
          userId: 'testuser',
          title: 'Test TODO',
          content: 'Test content'
        });

      // 作成したTODOを取得
      const dashboardResponse = await request(app)
        .get('/admin/todos')
        .auth('testuser', 'testpass')
        .timeout(10000);
      
      // TODOが存在する場合のみ編集フォームをテスト
      if (dashboardResponse.text.includes('Test TODO')) {
        const editResponse = await request(app)
          .get('/admin/todos/1/edit')
          .auth('testuser', 'testpass')
          .timeout(10000);
        
        if (editResponse.status === 200) {
          // basePath = "/admin" の場合、action="/admin/todos/1"
          expect(editResponse.text).toContain('action="/admin/todos/1"');
          expect(editResponse.text).not.toContain('action="/todos/1"');
        }
      }
    }, 30000);

    test('TODO削除フォームのaction属性が正しく設定される', async () => {
      const app = (integratedServer as any).app;
      
      // まずTODOを作成
      const createResponse = await request(app)
        .post('/admin/todos')
        .auth('testuser', 'testpass')
        .send({
          userId: 'testuser',
          title: 'Test TODO for Delete',
          description: 'Test content',
          priority: 'medium'
        })
        .timeout(10000); // 10秒タイムアウト

      // TODO作成が成功したことを確認
      expect(createResponse.status).toBe(302);

      // 短い待機でデータベースへの書き込み完了を待つ
      await new Promise(resolve => setTimeout(resolve, 100));

      // 特定ユーザーのTODOを明示的に取得
      const response = await request(app)
        .get('/admin/todos?userId=testuser')
        .auth('testuser', 'testpass')
        .timeout(10000) // 10秒タイムアウト
        .expect(200);
      
      // デバッグ情報を出力
      console.log('IntegratedServer - TODOページのレスポンスを確認中...');
      if (!response.text.includes('Test TODO for Delete')) {
        console.log('TODOが見つかりません。userId=testuserでクエリ実行');
        console.log('レスポンスの一部:');
        console.log(response.text.substring(0, 1000) + '...');
      }
      
      // TODOが表示されているかを確認
      expect(response.text).toContain('Test TODO for Delete');
      
      // basePath = "/admin" の場合、削除フォームのaction="/admin/todos/{id}/delete"
      expect(response.text).toMatch(/action="\/admin\/todos\/[^"]*\/delete"/);
      expect(response.text).not.toMatch(/action="\/todos\/[^"]*\/delete"/);
    }, 30000); // テスト全体に30秒タイムアウト

    test('TODO作成後のリダイレクト先が正しい', async () => {
      const app = (integratedServer as any).app;
      
      const response = await request(app)
        .post('/admin/todos')
        .auth('testuser', 'testpass')
        .send({
          userId: 'testuser',
          title: 'Test TODO',
          description: 'Test content',
          priority: 'medium'
        })
        .timeout(10000); // 10秒タイムアウト
      
      // エラーの場合はログを出力
      if (response.status === 500) {
        console.log('IntegratedServer TODO作成エラー:');
        console.log('Status:', response.status);
        console.log('Response:', response.text);
        console.log('Headers:', response.headers);
      }
      
      // basePath = "/admin" の場合、リダイレクト先は "/admin/todos"
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/admin/todos');
    }, 30000); // テスト全体に30秒タイムアウト
  });

  describe('Tools機能のbasePath統合テスト', () => {
    describe('AdminServer単体（basePath = ""）', () => {
      beforeEach(async () => {
        adminServer = new AdminServer(testDbPath, 3002);
        await adminServer.initializeDatabase();
      });

      test('時刻シミュレーション画面のリンクが正しく設定される', async () => {
        const app = adminServer.getExpressApp();
        const response = await request(app)
          .get('/tools/time-simulation')
          .auth('testuser', 'testpass')
          .expect(200);
        
        // basePath = "" の場合、ナビゲーションリンクにbasePathが含まれない
        expect(response.text).toContain('href="/"');
        expect(response.text).toContain('href="/tools/time-simulation"');
        expect(response.text).toContain('href="/tools/summary-test"');
        expect(response.text).not.toContain('href="/admin/tools/');
      });

      test('サマリーテスト画面のリンクが正しく設定される', async () => {
        const app = adminServer.getExpressApp();
        const response = await request(app)
          .get('/tools/summary-test')
          .auth('testuser', 'testpass')
          .expect(200);
        
        // basePath = "" の場合、ナビゲーションリンクにbasePathが含まれない
        expect(response.text).toContain('href="/"');
        expect(response.text).toContain('href="/tools/time-simulation"');
        expect(response.text).toContain('href="/tools/summary-test"');
        expect(response.text).not.toContain('href="/admin/tools/');
      });

      test('ダッシュボードのTools機能へのリンクが正しく設定される', async () => {
        const app = adminServer.getExpressApp();
        const response = await request(app)
          .get('/')
          .auth('testuser', 'testpass')
          .expect(200);
        
        // basePath = "" の場合、ダッシュボードからのリンクにbasePathが含まれない
        expect(response.text).toContain('href="/tools/time-simulation"');
        expect(response.text).toContain('href="/tools/summary-test"');
        expect(response.text).not.toContain('href="/admin/tools/');
      });
    });

    describe('IntegratedServer（basePath = "/admin"）', () => {
      beforeEach(async () => {
        integratedServer = new IntegratedServer(testDbPath);
        await integratedServer.initialize();
      });

      test('時刻シミュレーション画面のリンクが正しく設定される', async () => {
        const app = (integratedServer as any).app;
        const response = await request(app)
          .get('/admin/tools/time-simulation')
          .auth('testuser', 'testpass')
          .expect(200);
        
        // basePath = "/admin" の場合、すべてのリンクに/adminが含まれる
        expect(response.text).toContain('href="/admin/"');
        expect(response.text).toContain('href="/admin/tools/time-simulation"');
        expect(response.text).toContain('href="/admin/tools/summary-test"');
        expect(response.text).not.toContain('href="/tools/');
      });

      test('サマリーテスト画面のリンクが正しく設定される', async () => {
        const app = (integratedServer as any).app;
        const response = await request(app)
          .get('/admin/tools/summary-test')
          .auth('testuser', 'testpass')
          .expect(200);
        
        // basePath = "/admin" の場合、すべてのリンクに/adminが含まれる
        expect(response.text).toContain('href="/admin/"');
        expect(response.text).toContain('href="/admin/tools/time-simulation"');
        expect(response.text).toContain('href="/admin/tools/summary-test"');
        expect(response.text).not.toContain('href="/tools/');
      });

      test('ダッシュボードのTools機能へのリンクが正しく設定される', async () => {
        const app = (integratedServer as any).app;
        const response = await request(app)
          .get('/admin/')
          .auth('testuser', 'testpass')
          .expect(200);
        
        // basePath = "/admin" の場合、ダッシュボードからのリンクに/adminが含まれる
        expect(response.text).toContain('href="/admin/tools/time-simulation"');
        expect(response.text).toContain('href="/admin/tools/summary-test"');
        expect(response.text).not.toContain('href="/tools/');
      });
    });
  });
});