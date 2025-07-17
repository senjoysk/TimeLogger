/**
 * Production環境での開発ツールアクセス制限テスト
 * 
 * production環境では時刻シミュレーションとサマリーテスト機能が
 * 完全に無効化されることをテスト（404エラー）
 * 
 * セキュリティ要件:
 * - Production環境では開発ツールへのアクセスを完全に遮断
 * - Development/Staging環境では正常に動作
 * - 404エラーで機能の存在自体を隠蔽
 */

import request from 'supertest';
import { AdminServer } from '../../../web-admin/server';
import path from 'path';
import fs from 'fs';

describe('Production環境での開発ツールアクセス制限', () => {
  const testDbPath = path.join(__dirname, '../../../../test-production-restriction.db');
  let adminServer: AdminServer;
  let originalNodeEnv: string | undefined;

  beforeAll(async () => {
    // 元のNODE_ENV を保存
    originalNodeEnv = process.env.NODE_ENV;
    
    // 環境変数設定
    process.env.ADMIN_USERNAME = 'testuser';
    process.env.ADMIN_PASSWORD = 'testpass';
    process.env.SKIP_MIGRATIONS = 'true';
    
    // テストDBクリーンアップ
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  afterAll(async () => {
    // NODE_ENVを復元
    if (originalNodeEnv !== undefined) {
      process.env.NODE_ENV = originalNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }
    
    // テストDBクリーンアップ
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  // adminServerの初期化は各テストグループ内で行う

  afterEach(async () => {
    if (adminServer) {
      // サーバーのクリーンアップ（必要に応じて）
    }
  });

  describe('Production環境での開発ツール画面アクセス制限', () => {
    beforeEach(async () => {
      // Production環境に設定
      process.env.NODE_ENV = 'production';
      // 環境変更後にサーバーを初期化
      adminServer = new AdminServer(testDbPath, 3004);
      await adminServer.initializeDatabase();
    });

    test('Production環境で /tools/time-simulation が404エラーになる', async () => {
      const app = adminServer.getExpressApp();
      
      // Production環境では開発ツールページが無効化される
      await request(app)
        .get('/tools/time-simulation')
        .auth('testuser', 'testpass')
        .expect(404);
    });

    test('Production環境で /tools/summary-test が404エラーになる', async () => {
      const app = adminServer.getExpressApp();
      
      // Production環境では開発ツールページが無効化される
      await request(app)
        .get('/tools/summary-test')
        .auth('testuser', 'testpass')
        .expect(404);
    });

    test('Production環境で時刻シミュレーションAPIが404エラーになる', async () => {
      const app = adminServer.getExpressApp();
      
      // Production環境では開発ツールAPIが無効化される
      await request(app)
        .get('/tools/api/time-simulation/current')
        .auth('testuser', 'testpass')
        .expect(404);
    });

    test('Production環境でサマリーテストAPIが404エラーになる', async () => {
      const app = adminServer.getExpressApp();
      
      // Production環境では開発ツールAPIが無効化される
      await request(app)
        .get('/tools/api/summary-test/status')
        .auth('testuser', 'testpass')
        .expect(404);
    });
  });

  describe('Development環境での開発ツール正常動作確認', () => {
    beforeEach(async () => {
      // Development環境に設定
      process.env.NODE_ENV = 'development';
      // 環境変更後にサーバーを初期化
      adminServer = new AdminServer(testDbPath, 3004);
      await adminServer.initializeDatabase();
    });

    test('Development環境では /tools/time-simulation が正常に動作する', async () => {
      const app = adminServer.getExpressApp();
      
      const response = await request(app)
        .get('/tools/time-simulation')
        .auth('testuser', 'testpass')
        .expect(200);
      
      expect(response.text).toContain('時刻シミュレーション');
    });

    test('Development環境では時刻シミュレーションAPIが動作する', async () => {
      const app = adminServer.getExpressApp();
      
      const response = await request(app)
        .get('/tools/api/time-simulation/current')
        .auth('testuser', 'testpass');
      
      // 404以外（ルーティングが設定されている）ことを確認
      expect(response.status).not.toBe(404);
    });
  });

  describe('Staging環境での開発ツール正常動作確認', () => {
    beforeEach(async () => {
      // Staging環境に設定
      process.env.NODE_ENV = 'staging';
      // 環境変更後にサーバーを初期化
      adminServer = new AdminServer(testDbPath, 3004);
      await adminServer.initializeDatabase();
    });

    test('Staging環境では /tools/time-simulation が正常に動作する', async () => {
      const app = adminServer.getExpressApp();
      
      const response = await request(app)
        .get('/tools/time-simulation')
        .auth('testuser', 'testpass')
        .expect(200);
      
      expect(response.text).toContain('時刻シミュレーション');
    });

    test('Staging環境では時刻シミュレーションAPIが動作する', async () => {
      const app = adminServer.getExpressApp();
      
      const response = await request(app)
        .get('/tools/api/time-simulation/current')
        .auth('testuser', 'testpass');
      
      // 404以外（ルーティングが設定されている）ことを確認
      expect(response.status).not.toBe(404);
    });
  });
});