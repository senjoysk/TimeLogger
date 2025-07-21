/**
 * ナビゲーションリンクのテスト
 * Issue: ナビゲーションバーのリンクが重複パスを生成する問題を防ぐ
 */

import request from 'supertest';
import { IntegratedServer } from '../../../server';
import { AdminServer } from '../../../web-admin/server';
import { getTestDbPath, cleanupTestDatabase } from '../../../utils/testDatabasePath';

describe('ナビゲーションリンクのテスト', () => {
  const testDbPath = getTestDbPath(__filename);
  let adminServer: AdminServer;
  let integratedServer: IntegratedServer;

  beforeAll(async () => {
    // 環境変数設定
    process.env.ADMIN_USERNAME = 'testuser';
    process.env.ADMIN_PASSWORD = 'testpass';
    process.env.NODE_ENV = 'test';
    process.env.SKIP_MIGRATIONS = 'true';
    
    // テストDBクリーンアップ
    cleanupTestDatabase(testDbPath);
  });

  afterAll(async () => {
    // リソースクリーンアップ
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
    
    await new Promise(resolve => setTimeout(resolve, 100));
    cleanupTestDatabase(testDbPath);
  });

  describe('AdminServer単体（basePath = ""）', () => {
    beforeEach(async () => {
      adminServer = new AdminServer(testDbPath, 3002);
      await adminServer.initializeDatabase();
    });

    afterEach(async () => {
      if (adminServer) {
        const repo = (adminServer as any).sqliteRepo;
        if (repo && typeof repo.close === 'function') {
          await repo.close();
        }
      }
    });

    test('ダッシュボードのナビゲーションリンクが正しく設定される', async () => {
      const app = adminServer.getExpressApp();
      const response = await request(app)
        .get('/')
        .auth('testuser', 'testpass')
        .expect(200);
      
      // basePath = "" の場合、ナビゲーションリンクは相対パス
      expect(response.text).toContain('href="/"');  // Dashboard
      expect(response.text).toContain('href="/tables"');  // Tables
      expect(response.text).toContain('href="/todos"');   // TODO管理
      
      // 重複パスが含まれていないことを確認
      expect(response.text).not.toContain('href="//"');
      expect(response.text).not.toContain('href="/tables/tables"');
      expect(response.text).not.toContain('href="/todos/todos"');
    });

    test('テーブル一覧ページのナビゲーションリンクが正しく設定される', async () => {
      const app = adminServer.getExpressApp();
      const response = await request(app)
        .get('/tables')
        .auth('testuser', 'testpass')
        .expect(200);
      
      // ナビゲーションリンクが正しいことを確認
      expect(response.text).toContain('href="/"');  // Dashboard
      expect(response.text).toContain('href="/tables"');  // Tables
      expect(response.text).toContain('href="/todos"');   // TODO管理
      
      // 重複パスエラーが含まれていないことを確認
      expect(response.text).not.toContain('href="/tables/tables"');
      expect(response.text).not.toContain('href="/tables/todos"');
    });

    test('TODO管理ページのナビゲーションリンクが正しく設定される', async () => {
      const app = adminServer.getExpressApp();
      const response = await request(app)
        .get('/todos')
        .auth('testuser', 'testpass')
        .expect(200);
      
      // ナビゲーションリンクが正しいことを確認
      expect(response.text).toContain('href="/"');  // Dashboard
      expect(response.text).toContain('href="/tables"');  // Tables
      expect(response.text).toContain('href="/todos"');   // TODO管理
      
      // 重複パスエラーが含まれていないことを確認
      expect(response.text).not.toContain('href="/todos/tables"');
      expect(response.text).not.toContain('href="/todos/todos"');
    });
  });

  describe('IntegratedServer（basePath = "/admin"）', () => {
    beforeEach(async () => {
      integratedServer = new IntegratedServer(testDbPath);
      await integratedServer.initialize();
    });

    afterEach(async () => {
      if (integratedServer) {
        const adminServer = (integratedServer as any).adminServer;
        if (adminServer) {
          const repo = adminServer.sqliteRepo;
          if (repo && typeof repo.close === 'function') {
            await repo.close();
          }
        }
      }
    });

    test('ダッシュボードのナビゲーションリンクが正しく設定される', async () => {
      const app = (integratedServer as any).app;
      const response = await request(app)
        .get('/admin/')
        .auth('testuser', 'testpass')
        .expect(200);
      
      // basePath = "/admin" の場合、すべてのリンクに/adminが含まれる
      expect(response.text).toContain('href="/admin/"');  // Dashboard
      expect(response.text).toContain('href="/admin/tables"');  // Tables
      expect(response.text).toContain('href="/admin/todos"');   // TODO管理
      
      // 重複パスが含まれていないことを確認
      expect(response.text).not.toContain('href="/admin/admin/"');
      expect(response.text).not.toContain('href="/admin/admin/tables"');
      expect(response.text).not.toContain('href="/admin/admin/todos"');
    });

    test('テーブル一覧ページのナビゲーションリンクが正しく設定される', async () => {
      const app = (integratedServer as any).app;
      const response = await request(app)
        .get('/admin/tables')
        .auth('testuser', 'testpass')
        .expect(200);
      
      // ナビゲーションリンクが正しいことを確認
      expect(response.text).toContain('href="/admin/"');  // Dashboard
      expect(response.text).toContain('href="/admin/tables"');  // Tables
      expect(response.text).toContain('href="/admin/todos"');   // TODO管理
      
      // 重複パスエラーが含まれていないことを確認
      expect(response.text).not.toContain('href="/admin/tables/tables"');
      expect(response.text).not.toContain('href="/admin/tables/todos"');
    });

    test('TODO管理ページのナビゲーションリンクが正しく設定される', async () => {
      const app = (integratedServer as any).app;
      const response = await request(app)
        .get('/admin/todos')
        .auth('testuser', 'testpass')
        .expect(200);
      
      // ナビゲーションリンクが正しいことを確認
      expect(response.text).toContain('href="/admin/"');  // Dashboard
      expect(response.text).toContain('href="/admin/tables"');  // Tables
      expect(response.text).toContain('href="/admin/todos"');   // TODO管理
      
      // 重複パスエラーが含まれていないことを確認
      expect(response.text).not.toContain('href="/admin/todos/tables"');
      expect(response.text).not.toContain('href="/admin/todos/todos"');
    });

    test('開発ツールページのナビゲーションリンクが正しく設定される', async () => {
      const app = (integratedServer as any).app;
      const response = await request(app)
        .get('/admin/tools/time-simulation')
        .auth('testuser', 'testpass')
        .expect(200);
      
      // ナビゲーションリンクが正しいことを確認
      expect(response.text).toContain('href="/admin/"');  // Dashboard
      expect(response.text).toContain('href="/admin/tables"');  // Tables
      expect(response.text).toContain('href="/admin/todos"');   // TODO管理
      expect(response.text).toContain('href="/admin/tools/time-simulation"');
      expect(response.text).toContain('href="/admin/tools/summary-test"');
      
      // 重複パスエラーが含まれていないことを確認
      expect(response.text).not.toContain('href="/admin/tools/tables"');
      expect(response.text).not.toContain('href="/admin/tools/todos"');
      expect(response.text).not.toContain('href="/admin/tools/time-simulation/time-simulation"');
    });
  });

  describe('リンクの重複パスバグ回帰テスト', () => {
    test('どのページでもナビゲーションリンクに重複パスが含まれない', async () => {
      // IntegratedServerでテスト（最も複雑なbasePathケース）
      const integratedServer = new IntegratedServer(testDbPath);
      await integratedServer.initialize();
      
      try {
        const app = (integratedServer as any).app;
        
        // テストするページのリスト
        const testPages = [
          '/admin/',
          '/admin/tables',
          '/admin/todos',
          '/admin/tools/time-simulation',
          '/admin/tools/summary-test'
        ];
        
        for (const page of testPages) {
          const response = await request(app)
            .get(page)
            .auth('testuser', 'testpass')
            .expect(200);
          
          // 具体的な重複パスパターンをチェック
          const duplicatePatterns = [
            /href="[^"]*\/admin\/admin\//,     // /admin/admin/
            /href="[^"]*\/tables\/tables"/,   // /tables/tables
            /href="[^"]*\/todos\/todos"/,     // /todos/todos
            /href="[^"]*\/tools\/tools\//,    // /tools/tools/
          ];
          
          for (const pattern of duplicatePatterns) {
            expect(response.text).not.toMatch(pattern);
          }
        }
      } finally {
        // クリーンアップ
        const adminServer = (integratedServer as any).adminServer;
        if (adminServer) {
          const repo = adminServer.sqliteRepo;
          if (repo && typeof repo.close === 'function') {
            await repo.close();
          }
        }
      }
    });
  });
});