/**
 * 夜間サスペンドAPI エンドポイントテスト
 * TDD: Red Phase - 失敗するテストを先に書く
 */

import request from 'supertest';
import { NightSuspendServer } from '../../api/nightSuspendServer';

describe('🔴 Red Phase: 夜間サスペンドAPI エンドポイント', () => {
  let server: NightSuspendServer;
  let app: any;

  beforeAll(async () => {
    // テスト環境変数を設定
    process.env.SHUTDOWN_TOKEN = 'test-shutdown-token';
    process.env.WAKE_TOKEN = 'test-wake-token';
    process.env.RECOVERY_TOKEN = 'test-recovery-token';
    process.env.PORT = '3001';
    
    server = new NightSuspendServer();
    app = server.getApp();
  });

  afterAll(async () => {
    if (server) {
      await server.stop();
    }
  });

  describe('🌙 /api/night-suspend エンドポイント', () => {
    test('認証トークンなしでアクセスすると401エラーを返す', async () => {
      const response = await request(app)
        .post('/api/night-suspend')
        .send({ action: 'prepare_suspend' });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('No token provided');
    });

    test('無効なトークンでアクセスすると403エラーを返す', async () => {
      const response = await request(app)
        .post('/api/night-suspend')
        .set('Authorization', 'Bearer invalid-token')
        .send({ action: 'prepare_suspend' });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Invalid token');
    });

    test('正しいトークンでアクセスすると夜間サスペンド準備を実行', async () => {
      const response = await request(app)
        .post('/api/night-suspend')
        .set('Authorization', 'Bearer test-shutdown-token')
        .send({ action: 'prepare_suspend' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ready_for_suspend');
      expect(response.body.message).toContain('夜間サスペンド準備完了');
    });

    test('サスペンド準備中にBotの現在処理を完了する', async () => {
      const response = await request(app)
        .post('/api/night-suspend')
        .set('Authorization', 'Bearer test-shutdown-token')
        .send({ action: 'prepare_suspend' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ready_for_suspend');
      expect(response.body.suspend_time).toBeDefined();
    });
  });

  describe('🌅 /api/wake-up エンドポイント', () => {
    test('認証トークンなしでアクセスすると401エラーを返す', async () => {
      const response = await request(app)
        .post('/api/wake-up')
        .send({ trigger: 'morning_recovery' });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('No token provided');
    });

    test('無効なトークンでアクセスすると403エラーを返す', async () => {
      const response = await request(app)
        .post('/api/wake-up')
        .set('Authorization', 'Bearer invalid-token')
        .send({ trigger: 'morning_recovery' });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Invalid token');
    });

    test('正しいトークンでアクセスすると朝の起動処理を実行', async () => {
      const response = await request(app)
        .post('/api/wake-up')
        .set('Authorization', 'Bearer test-wake-token')
        .send({ trigger: 'morning_recovery' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('waking_up');
      expect(response.body.message).toContain('朝の起動処理開始');
    });

    test('起動処理でBotの初期化を実行', async () => {
      const response = await request(app)
        .post('/api/wake-up')
        .set('Authorization', 'Bearer test-wake-token')
        .send({ trigger: 'morning_recovery' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('waking_up');
      expect(response.body.wake_time).toBeDefined();
    });
  });

  describe('🔄 /api/morning-recovery エンドポイント', () => {
    test('認証トークンなしでアクセスすると401エラーを返す', async () => {
      const response = await request(app)
        .post('/api/morning-recovery')
        .send({ trigger: 'github_actions' });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('No token provided');
    });

    test('無効なトークンでアクセスすると403エラーを返す', async () => {
      const response = await request(app)
        .post('/api/morning-recovery')
        .set('Authorization', 'Bearer invalid-token')
        .send({ trigger: 'github_actions' });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Invalid token');
    });

    test('正しいトークンでアクセスすると朝のメッセージリカバリを実行', async () => {
      const response = await request(app)
        .post('/api/morning-recovery')
        .set('Authorization', 'Bearer test-recovery-token')
        .send({ trigger: 'github_actions' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('recovery_complete');
      expect(response.body.processed_messages).toBeDefined();
    });

    test('リカバリ処理で夜間メッセージを処理', async () => {
      const response = await request(app)
        .post('/api/morning-recovery')
        .set('Authorization', 'Bearer test-recovery-token')
        .send({ trigger: 'github_actions' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('recovery_complete');
      expect(response.body.recovery_time).toBeDefined();
      expect(typeof response.body.processed_messages).toBe('number');
    });
  });

  describe('🔍 /health エンドポイント', () => {
    test('ヘルスチェックエンドポイントは認証なしでアクセス可能', async () => {
      const response = await request(app)
        .get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
      expect(response.body.timestamp).toBeDefined();
    });

    test('ヘルスチェックで基本的なシステム情報を返す', async () => {
      const response = await request(app)
        .get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
      expect(response.body.uptime).toBeDefined();
      expect(response.body.memory).toBeDefined();
    });
  });

  describe('📊 /api/suspend-status エンドポイント', () => {
    test('サスペンド状態を確認できる', async () => {
      const response = await request(app)
        .get('/api/suspend-status');

      expect(response.status).toBe(200);
      expect(response.body.is_suspended).toBeDefined();
      expect(response.body.last_suspend_time).toBeDefined();
    });

    test('サスペンド状態の詳細情報を返す', async () => {
      const response = await request(app)
        .get('/api/suspend-status');

      expect(response.status).toBe(200);
      expect(response.body.is_suspended).toBe(false);
      expect(response.body.next_suspend_time).toBeDefined();
    });
  });

  describe('🚫 存在しないエンドポイント', () => {
    test('存在しないエンドポイントにアクセスすると404エラーを返す', async () => {
      const response = await request(app)
        .get('/api/nonexistent');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Not found');
    });
  });
});