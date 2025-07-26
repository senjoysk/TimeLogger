/**
 * IntegratedServer統合テスト
 * basePathの設定を確認
 */

import request from 'supertest';
import { IntegratedServer } from '../server';
import path from 'path';
import fs from 'fs';
import { getTestDbPath, cleanupTestDatabase } from '../utils/testDatabasePath';

describe('IntegratedServer Tests', () => {
  let server: IntegratedServer;
  let app: any;
  const testDbPath = getTestDbPath(__filename);

  beforeAll(async () => {
    // テスト用の環境変数を設定
    process.env.ADMIN_USERNAME = 'testuser';
    process.env.ADMIN_PASSWORD = 'testpass';
    process.env.NODE_ENV = 'test';
    // SKIP_MIGRATIONS環境変数は廃止されました
    process.env.PORT = '3003'; // テスト用ポート
    
    // テスト用データベースが存在する場合は削除
    cleanupTestDatabase(testDbPath);
    
    // IntegratedServerを初期化
    server = new IntegratedServer(testDbPath);
    await server.initialize();
    
    // Express appを取得（privateメソッドなのでanyでキャスト）
    app = (server as any).app;
  });

  afterAll(async () => {
    // テスト用データベースをクリーンアップ
    cleanupTestDatabase(testDbPath);
  });

  describe('Admin App Mount', () => {
    test('AdminアプリがMIX環境では/adminパスでアクセスできる', async () => {
      const response = await request(app)
        .get('/admin/health')
        .auth('testuser', 'testpass')
        .expect(200);
      
      expect(response.body.status).toBe('ok');
    });

    test('AdminアプリのbasePathが/adminに設定される', async () => {
      // AdminServerのappインスタンスを取得
      const adminApp = (server as any).adminServer.getExpressApp();
      
      // basePathが/adminに設定されているか確認
      expect(adminApp.locals.basePath).toBe('/admin');
    });

    test('Admin画面のリンクが/admin付きで生成される', async () => {
      const response = await request(app)
        .get('/admin')
        .auth('testuser', 'testpass');
      
      // HTMLレスポンスの中にbasePathが正しく設定されているか確認
      expect(response.text).toContain('href="/admin/tables"');
      expect(response.text).not.toContain('href="/tables"');
    });
  });

  describe('Root Path', () => {
    test('ルートパスが正常に表示される', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);
      
      expect(response.text).toContain('TimeLogger Bot');
      expect(response.text).toContain('href="/admin"');
    });
  });

  describe('Health Check', () => {
    test('ヘルスチェックが正常に動作する', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);
      
      expect(response.body.status).toBe('ok');
      expect(response.body.services).toEqual({
        bot: 'running',
        admin: 'running'
      });
    });
  });
});