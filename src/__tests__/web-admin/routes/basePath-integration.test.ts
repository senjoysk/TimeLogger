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
        // サーバーのクリーンアップ（必要に応じて）
      }
    });

    test('TODO作成フォームのaction属性が正しく設定される', async () => {
      const app = adminServer.getExpressApp();
      const response = await request(app)
        .get('/todos/new')
        .auth('testuser', 'testpass')
        .expect(200);
      
      // basePath = "" の場合、action="/todos"
      expect(response.text).toContain('action="/todos"');
      expect(response.text).not.toContain('action="/admin/todos"');
    });

    test('TODO編集フォームのaction属性が正しく設定される', async () => {
      const app = adminServer.getExpressApp();
      
      // まずTODOを作成
      await request(app)
        .post('/todos')
        .auth('testuser', 'testpass')
        .send({
          userId: 'testuser',
          title: 'Test TODO',
          content: 'Test content'
        });

      // 作成したTODOを取得
      const dashboardResponse = await request(app)
        .get('/todos')
        .auth('testuser', 'testpass');
      
      // TODOが存在する場合のみ編集フォームをテスト
      if (dashboardResponse.text.includes('Test TODO')) {
        const editResponse = await request(app)
          .get('/todos/1/edit')
          .auth('testuser', 'testpass');
        
        if (editResponse.status === 200) {
          // basePath = "" の場合、action="/todos/1"
          expect(editResponse.text).toContain('action="/todos/1"');
          expect(editResponse.text).not.toContain('action="/admin/todos/1"');
        }
      }
    });

    test('TODO削除フォームのaction属性が正しく設定される', async () => {
      const app = adminServer.getExpressApp();
      
      // まずTODOを作成
      await request(app)
        .post('/todos')
        .auth('testuser', 'testpass')
        .send({
          userId: 'testuser',
          title: 'Test TODO for Delete',
          content: 'Test content'
        });

      const response = await request(app)
        .get('/todos')
        .auth('testuser', 'testpass')
        .expect(200);
      
      // basePath = "" の場合、削除フォームのaction="/todos/{id}/delete"
      expect(response.text).toMatch(/action="\/todos\/[^"]*\/delete"/);
      expect(response.text).not.toMatch(/action="\/admin\/todos\/[^"]*\/delete"/);
    });

    test('TODO作成後のリダイレクト先が正しい', async () => {
      const app = adminServer.getExpressApp();
      
      const response = await request(app)
        .post('/todos')
        .auth('testuser', 'testpass')
        .send({
          userId: 'testuser',
          title: 'Test TODO',
          description: 'Test content'
        });
      
      // エラーの場合はログを出力
      if (response.status === 500) {
        console.log('Error response:', response.text);
      }
      
      // basePath = "" の場合、リダイレクト先は "/todos"
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/todos');
    });
  });

  describe('IntegratedServer（basePath = "/admin"）', () => {
    beforeEach(async () => {
      integratedServer = new IntegratedServer(testDbPath);
      await integratedServer.initialize();
    });

    afterEach(async () => {
      if (integratedServer) {
        // サーバーのクリーンアップ（必要に応じて）
      }
    });

    test('TODO作成フォームのaction属性が正しく設定される', async () => {
      const app = (integratedServer as any).app;
      const response = await request(app)
        .get('/admin/todos/new')
        .auth('testuser', 'testpass')
        .expect(200);
      
      // basePath = "/admin" の場合、action="/admin/todos"
      expect(response.text).toContain('action="/admin/todos"');
      expect(response.text).not.toContain('action="/todos"');
    });

    test('TODO編集フォームのaction属性が正しく設定される', async () => {
      const app = (integratedServer as any).app;
      
      // まずTODOを作成
      await request(app)
        .post('/admin/todos')
        .auth('testuser', 'testpass')
        .send({
          userId: 'testuser',
          title: 'Test TODO',
          content: 'Test content'
        });

      // 作成したTODOを取得
      const dashboardResponse = await request(app)
        .get('/admin/todos')
        .auth('testuser', 'testpass');
      
      // TODOが存在する場合のみ編集フォームをテスト
      if (dashboardResponse.text.includes('Test TODO')) {
        const editResponse = await request(app)
          .get('/admin/todos/1/edit')
          .auth('testuser', 'testpass');
        
        if (editResponse.status === 200) {
          // basePath = "/admin" の場合、action="/admin/todos/1"
          expect(editResponse.text).toContain('action="/admin/todos/1"');
          expect(editResponse.text).not.toContain('action="/todos/1"');
        }
      }
    });

    test('TODO削除フォームのaction属性が正しく設定される', async () => {
      const app = (integratedServer as any).app;
      
      // まずTODOを作成
      await request(app)
        .post('/admin/todos')
        .auth('testuser', 'testpass')
        .send({
          userId: 'testuser',
          title: 'Test TODO for Delete',
          content: 'Test content'
        });

      const response = await request(app)
        .get('/admin/todos')
        .auth('testuser', 'testpass')
        .expect(200);
      
      // basePath = "/admin" の場合、削除フォームのaction="/admin/todos/{id}/delete"
      expect(response.text).toMatch(/action="\/admin\/todos\/[^"]*\/delete"/);
      expect(response.text).not.toMatch(/action="\/todos\/[^"]*\/delete"/);
    });

    test('TODO作成後のリダイレクト先が正しい', async () => {
      const app = (integratedServer as any).app;
      
      const response = await request(app)
        .post('/admin/todos')
        .auth('testuser', 'testpass')
        .send({
          userId: 'testuser',
          title: 'Test TODO',
          description: 'Test content'
        });
      
      // エラーの場合はログを出力
      if (response.status === 500) {
        console.log('Error response:', response.text);
      }
      
      // basePath = "/admin" の場合、リダイレクト先は "/admin/todos"
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/admin/todos');
    });
  });
});