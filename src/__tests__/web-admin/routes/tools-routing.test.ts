/**
 * /tools/パスのルーティングテスト
 * 
 * 新機能のURL構造が正しく動作することを確認
 * - 時刻シミュレーション画面
 * - サマリーテスト画面
 * - APIエンドポイント
 */

import request from 'supertest';
import { AdminServer } from '../../../web-admin/server';
import { getTestDbPath, cleanupTestDatabase } from '../../../utils/testDatabasePath';

describe('/tools/パスのルーティングテスト', () => {
  const testDbPath = getTestDbPath(__filename);
  let adminServer: AdminServer;

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
    // テストDBクリーンアップ
    cleanupTestDatabase(testDbPath);
  });

  beforeEach(async () => {
    adminServer = new AdminServer(testDbPath, 3003);
    await adminServer.initializeDatabase();
  });

  afterEach(async () => {
    if (adminServer) {
      // サーバーのクリーンアップ（必要に応じて）
    }
  });

  describe('開発ツール画面のルーティング', () => {
    test('GET /tools/time-simulation が正常に表示される', async () => {
      const app = adminServer.getExpressApp();
      const response = await request(app)
        .get('/tools/time-simulation')
        .auth('testuser', 'testpass')
        .expect(200);
      
      expect(response.text).toContain('時刻シミュレーション');
      expect(response.text).toContain('開発ツール');
      expect(response.text).toContain('TimeLogger 管理画面');
    });

    test('GET /tools/summary-test が正常に表示される', async () => {
      const app = adminServer.getExpressApp();
      const response = await request(app)
        .get('/tools/summary-test')
        .auth('testuser', 'testpass')
        .expect(200);
      
      expect(response.text).toContain('サマリーテスト');
      expect(response.text).toContain('開発ツール');
      expect(response.text).toContain('TimeLogger 管理画面');
    });

    test('認証なしでtools画面にアクセスすると401エラー', async () => {
      const app = adminServer.getExpressApp();
      
      await request(app)
        .get('/tools/time-simulation')
        .expect(401);
        
      await request(app)
        .get('/tools/summary-test')
        .expect(401);
    });
  });

  describe('ナビゲーションリンクの確認', () => {
    test('時刻シミュレーション画面のナビゲーションリンクが正しく設定される', async () => {
      const app = adminServer.getExpressApp();
      const response = await request(app)
        .get('/tools/time-simulation')
        .auth('testuser', 'testpass')
        .expect(200);
      
      // ナビゲーションリンクの確認
      expect(response.text).toContain('href="/"'); // ダッシュボード
      expect(response.text).toContain('href="/tools/time-simulation"'); // 現在のページ
      expect(response.text).toContain('href="/tools/summary-test"'); // サマリーテスト
    });

    test('サマリーテスト画面のナビゲーションリンクが正しく設定される', async () => {
      const app = adminServer.getExpressApp();
      const response = await request(app)
        .get('/tools/summary-test')
        .auth('testuser', 'testpass')
        .expect(200);
      
      // ナビゲーションリンクの確認
      expect(response.text).toContain('href="/"'); // ダッシュボード
      expect(response.text).toContain('href="/tools/time-simulation"'); // 時刻シミュレーション
      expect(response.text).toContain('href="/tools/summary-test"'); // 現在のページ
    });
  });

  describe('APIエンドポイントの存在確認', () => {
    test('時刻シミュレーションAPI パスが設定されている', async () => {
      const app = adminServer.getExpressApp();
      
      // APIエンドポイントのパスが設定されているかを確認
      // 実際のAPIレスポンスではなく、ルーティングが設定されているかを確認
      const response = await request(app)
        .get('/tools/api/time-simulation/current')
        .auth('testuser', 'testpass');
      
      // 404以外（つまりルーティングが設定されている）ことを確認
      expect(response.status).not.toBe(404);
    });

    test('サマリーテストAPI パスが設定されている', async () => {
      const app = adminServer.getExpressApp();
      
      // APIエンドポイントのパスが設定されているかを確認
      const response = await request(app)
        .get('/tools/api/summary-test/status')
        .auth('testuser', 'testpass');
      
      // 404以外（つまりルーティングが設定されている）ことを確認
      expect(response.status).not.toBe(404);
    });
  });

  describe('エラーハンドリング', () => {
    test('存在しないtools サブパスは404エラー', async () => {
      const app = adminServer.getExpressApp();
      
      await request(app)
        .get('/tools/nonexistent')
        .auth('testuser', 'testpass')
        .expect(404);
    });

    test('存在しないAPI サブパスは404エラー', async () => {
      const app = adminServer.getExpressApp();
      
      await request(app)
        .get('/tools/api/nonexistent')
        .auth('testuser', 'testpass')
        .expect(404);
    });
  });
});