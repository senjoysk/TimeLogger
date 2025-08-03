/**
 * ナビゲーションリンクのテスト
 * Issue: ナビゲーションバーのリンクが重複パスを生成する問題を防ぐ
 */

import request from 'supertest';
import { IntegratedServer } from '../../../server';
import { AdminServer } from '../../../web-admin/server';
import { getTestDbPath, cleanupTestDatabase } from '../../../utils/testDatabasePath';
import { SharedRepositoryManager } from '../../../repositories/SharedRepositoryManager';

describe('ナビゲーションリンクのテスト', () => {
  const testDbPath = getTestDbPath(__filename);
  let adminServer: AdminServer;
  let integratedServer: IntegratedServer;

  beforeAll(async () => {
    // 環境変数設定
    process.env.ADMIN_USERNAME = 'testuser';
    process.env.ADMIN_PASSWORD = 'testpass';
    process.env.NODE_ENV = 'test';
    // SKIP_MIGRATIONS環境変数は廃止されました
    
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
    
    // SharedRepositoryManagerをクリア
    try {
      await SharedRepositoryManager.getInstance().clear();
    } catch (error) {
      // クリアエラーは無視
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
      // SharedRepositoryManagerをクリア
      try {
        await SharedRepositoryManager.getInstance().clear();
      } catch (error) {
        // クリアエラーは無視
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
      
      // databasePathが正しく設定されているか確認
      expect(app.get('databasePath')).toBe(testDbPath);
      
      const response = await request(app)
        .get('/todos')
        .auth('testuser', 'testpass');
      
      if (response.status !== 200) {
        console.error('TODO page error status:', response.status);
        console.error('TODO page error text:', response.text);
        console.error('TODO page error body:', response.body);
        console.error('Database path:', app.get('databasePath'));
        console.error('Views path:', app.get('views'));
        console.error('View engine:', app.get('view engine'));
      }
      expect(response.status).toBe(200);
      
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
    let localTestDbPath: string;
    
    beforeEach(async () => {
      // 各テストで独立したDBパスを使用
      localTestDbPath = getTestDbPath(`integrated-${Date.now()}`);
      cleanupTestDatabase(localTestDbPath);
      integratedServer = new IntegratedServer(localTestDbPath);
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
      // SharedRepositoryManagerをクリア
      try {
        await SharedRepositoryManager.getInstance().clear();
      } catch (error) {
        // クリアエラーは無視
      }
      
      // ローカルDBをクリーンアップ
      if (localTestDbPath) {
        cleanupTestDatabase(localTestDbPath);
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
        .auth('testuser', 'testpass');
      
      if (response.status !== 200) {
        console.error('IntegratedServer TODO page error status:', response.status);
        console.error('IntegratedServer TODO page error text:', response.text.substring(0, 500));
        console.error('IntegratedServer TODO page error body:', response.body);
        
        // エラーメッセージを抽出
        const errorMatch = response.text.match(/Error: ([^<]+)/);
        if (errorMatch) {
          console.error('Extracted error message:', errorMatch[1]);
        }
      }
      expect(response.status).toBe(200);
      
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
      // 新しいDBパスを使用して独立性を確保
      const regressionTestDbPath = getTestDbPath('regression-test');
      cleanupTestDatabase(regressionTestDbPath);
      
      const integratedServer = new IntegratedServer(regressionTestDbPath);
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
        // SharedRepositoryManagerをクリア
        await SharedRepositoryManager.getInstance().clear();
        cleanupTestDatabase(regressionTestDbPath);
      }
    });
  });
});