/**
 * 夜間サスペンド機能の統合テスト
 * TDD: Red Phase - 失敗するテストを先に書く
 */

import { NightSuspendServer } from '../../api/nightSuspendServer';
import { MorningMessageRecovery } from '../../services/morningMessageRecovery';
import { SqliteNightSuspendRepository } from '../../repositories/sqliteNightSuspendRepository';
import { Database } from 'sqlite3';
import { Client, Collection, DMChannel, Message, User } from 'discord.js';
import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';

describe('🔴 Red Phase: 夜間サスペンド機能統合テスト', () => {
  let server: NightSuspendServer;
  let database: Database;
  let repository: SqliteNightSuspendRepository;
  let recovery: MorningMessageRecovery;
  let mockClient: jest.Mocked<Client>;
  
  const testDbPath = path.join(__dirname, '../../__test_data__/integration_test.db');
  
  beforeAll(async () => {
    // テスト用データベースディレクトリ作成
    const testDir = path.dirname(testDbPath);
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    
    // テスト用環境変数設定
    process.env.PORT = '0'; // 動的ポート割り当て
    process.env.SHUTDOWN_TOKEN = 'test-shutdown-token';
    process.env.WAKE_TOKEN = 'test-wake-token';
    process.env.RECOVERY_TOKEN = 'test-recovery-token';
  });

  beforeEach(async () => {
    // 既存のテストDBを削除
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    
    // 新しいテスト用データベース作成
    database = new Database(testDbPath);
    await initializeTestDatabase(database);
    
    // リポジトリとサービス初期化
    repository = new SqliteNightSuspendRepository(database);
    
    // Discord Clientのモック作成
    mockClient = createMockDiscordClient();
    recovery = new MorningMessageRecovery(mockClient, repository, {
      targetUserId: 'test-user-123',
      timezone: 'Asia/Tokyo'
    });
    
    // HTTPサーバー作成・起動（MorningMessageRecoveryサービス統合）
    server = new NightSuspendServer(recovery);
    await server.start();
  });

  afterEach(async () => {
    // サーバー停止
    if (server) {
      await server.stop();
    }
    
    // データベース接続終了
    try {
      if (database) {
        database.close();
      }
    } catch (error) {
      // データベースが既に閉じられている場合はエラーを無視
    }
  });

  afterAll(() => {
    // テストDBファイル削除
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('HTTPサーバーとリポジトリの統合', () => {
    test('ヘルスチェックエンドポイントが正常に動作する', async () => {
      const response = await request(server.getApp())
        .get('/health')
        .expect(200);

      expect(response.body).toEqual({
        status: 'healthy',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        memory: expect.any(Object)
      });
    });

    test('サスペンド状態確認エンドポイントが正常に動作する', async () => {
      const response = await request(server.getApp())
        .get('/api/suspend-status')
        .expect(200);

      expect(response.body).toEqual({
        is_suspended: false,
        last_suspend_time: null,
        next_suspend_time: expect.any(String),
        current_time: expect.any(String)
      });
    });

    test('認証なしでのAPI呼び出しが拒否される', async () => {
      await request(server.getApp())
        .post('/api/night-suspend')
        .send({ action: 'prepare_suspend' })
        .expect(401);

      await request(server.getApp())
        .post('/api/wake-up')
        .send({ trigger: 'github_actions' })
        .expect(401);

      await request(server.getApp())
        .post('/api/morning-recovery')
        .send({ trigger: 'github_actions' })
        .expect(401);
    });

    test('正しい認証での夜間サスペンドAPIが動作する', async () => {
      const response = await request(server.getApp())
        .post('/api/night-suspend')
        .set('Authorization', 'Bearer test-shutdown-token')
        .send({ action: 'prepare_suspend' })
        .expect(200);

      expect(response.body).toEqual({
        status: 'ready_for_suspend',
        message: '夜間サスペンド準備完了',
        suspend_time: expect.any(String)
      });
    });

    test('正しい認証での起動APIが動作する', async () => {
      const response = await request(server.getApp())
        .post('/api/wake-up')
        .set('Authorization', 'Bearer test-wake-token')
        .send({ trigger: 'github_actions' })
        .expect(200);

      expect(response.body).toEqual({
        status: 'waking_up',
        message: '朝の起動処理開始',
        wake_time: expect.any(String),
        trigger: 'github_actions'
      });
    });

    test('正しい認証でのメッセージリカバリAPIが動作する', async () => {
      const response = await request(server.getApp())
        .post('/api/morning-recovery')
        .set('Authorization', 'Bearer test-recovery-token')
        .send({ trigger: 'github_actions' })
        .expect(200);

      expect(response.body).toEqual({
        status: 'recovery_complete',
        processed_messages: expect.any(Number),
        recovery_time: expect.any(String),
        trigger: 'github_actions'
      });
    });
  });

  describe('MorningMessageRecoveryとRepositoryの統合', () => {
    test('夜間メッセージリカバリが完全に動作する', async () => {
      // テストデータをリポジトリに事前作成
      const discordMessageId = 'test-message-123';
      
      // メッセージがまだ存在しないことを確認
      const existsBefore = await repository.existsByDiscordMessageId(discordMessageId);
      expect(existsBefore).toBe(false);
      
      // Discord Clientのモック設定
      setupDiscordMocks(mockClient, discordMessageId);
      
      // メッセージリカバリ実行
      const results = await recovery.recoverNightMessages();
      
      // 結果検証
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        id: expect.any(String),
        user_id: 'test-user-123',
        content: 'テスト夜間メッセージ',
        discord_message_id: discordMessageId,
        recovery_processed: true,
        recovery_timestamp: expect.any(String),
        business_date: expect.any(String),
        input_timestamp: expect.any(String)
      });
      
      // データベースに保存されたことを確認
      const existsAfter = await repository.existsByDiscordMessageId(discordMessageId);
      expect(existsAfter).toBe(true);
      
      const savedMessage = await repository.getByDiscordMessageId(discordMessageId);
      expect(savedMessage).toBeDefined();
      expect(savedMessage.recovery_processed).toBe(1); // SQLiteでbooleanは0/1
    });

    test('重複メッセージが適切にスキップされる', async () => {
      const discordMessageId = 'duplicate-message-456';
      
      // 事前にメッセージをDBに保存
      await repository.createActivityLogFromDiscord({
        user_id: 'test-user-123',
        content: '既存メッセージ',
        input_timestamp: new Date().toISOString(),
        business_date: '2025-01-01',
        discord_message_id: discordMessageId,
        recovery_processed: true,
        recovery_timestamp: new Date().toISOString()
      });
      
      // Discord Clientのモック設定（同じメッセージID）
      setupDiscordMocks(mockClient, discordMessageId);
      
      // メッセージリカバリ実行
      const results = await recovery.recoverNightMessages();
      
      // 重複メッセージはスキップされる
      expect(results).toHaveLength(0);
    });

    test('サスペンド状態の保存と取得が正常に動作する', async () => {
      const suspendState = {
        id: 'suspend-state-789',
        user_id: 'test-user-123',
        suspend_time: '2025-01-01T00:00:00Z',
        expected_recovery_time: '2025-01-01T07:00:00Z',
        actual_recovery_time: undefined,
        created_at: new Date().toISOString()
      };
      
      // サスペンド状態保存
      await repository.saveSuspendState(suspendState);
      
      // 保存されたデータを取得
      const retrieved = await repository.getLastSuspendState('test-user-123');
      
      expect(retrieved).toEqual(expect.objectContaining({
        id: suspendState.id,
        user_id: suspendState.user_id,
        suspend_time: suspendState.suspend_time,
        expected_recovery_time: suspendState.expected_recovery_time
      }));
    });
  });

  describe('エンドツーエンド統合テスト', () => {
    test('完全な夜間サスペンド→起動→リカバリサイクルが動作する', async () => {
      // 1. 夜間サスペンド準備
      const suspendResponse = await request(server.getApp())
        .post('/api/night-suspend')
        .set('Authorization', 'Bearer test-shutdown-token')
        .send({ action: 'prepare_suspend' })
        .expect(200);
      
      expect(suspendResponse.body.status).toBe('ready_for_suspend');
      
      // 2. 朝の起動処理
      const wakeResponse = await request(server.getApp())
        .post('/api/wake-up')
        .set('Authorization', 'Bearer test-wake-token')
        .send({ trigger: 'github_actions' })
        .expect(200);
      
      expect(wakeResponse.body.status).toBe('waking_up');
      
      // 3. Discord Clientのモック設定（夜間メッセージあり）
      setupDiscordMocks(mockClient, 'end-to-end-message-123');
      
      // 4. メッセージリカバリ実行
      const recoveryResponse = await request(server.getApp())
        .post('/api/morning-recovery')
        .set('Authorization', 'Bearer test-recovery-token')
        .send({ trigger: 'github_actions' })
        .expect(200);
      
      expect(recoveryResponse.body.status).toBe('recovery_complete');
      
      // 5. データベースに正しく保存されていることを確認
      const exists = await repository.existsByDiscordMessageId('end-to-end-message-123');
      expect(exists).toBe(true);
    });
  });

  describe('エラーハンドリング統合テスト', () => {
    test('データベースエラー時の適切な処理', async () => {
      // データベースを故意に閉じてエラーを発生させる
      database.close();
      
      // リカバリ処理でエラーハンドリングが動作することを確認
      await expect(repository.existsByDiscordMessageId('test-id')).rejects.toThrow();
    });

    test('不正なリクエストデータの処理', async () => {
      // 不正なアクションでのサスペンド要求
      await request(server.getApp())
        .post('/api/night-suspend')
        .set('Authorization', 'Bearer test-shutdown-token')
        .send({ action: 'invalid_action' })
        .expect(400);
    });
  });
});

/**
 * テスト用データベース初期化
 */
async function initializeTestDatabase(db: Database): Promise<void> {
  return new Promise((resolve, reject) => {
    // 必要なテーブル作成（実際のスキーマから抜粋）
    const createTables = `
      CREATE TABLE IF NOT EXISTS activity_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        content TEXT NOT NULL,
        analysis_result TEXT,
        estimated_minutes INTEGER DEFAULT 0,
        actual_minutes INTEGER DEFAULT 0,
        input_timestamp TEXT NOT NULL,
        analysis_timestamp TEXT,
        business_date TEXT NOT NULL,
        discord_message_id TEXT,
        recovery_processed BOOLEAN DEFAULT FALSE,
        recovery_timestamp TEXT
      );

      CREATE TABLE IF NOT EXISTS suspend_states (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        suspend_time TEXT NOT NULL,
        expected_recovery_time TEXT NOT NULL,
        actual_recovery_time TEXT,
        created_at TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_discord_message_id 
      ON activity_logs(discord_message_id) 
      WHERE discord_message_id IS NOT NULL;
    `;

    db.exec(createTables, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Discord Clientのモック作成
 */
function createMockDiscordClient(): jest.Mocked<Client> {
  const mockFetch = jest.fn();
  const mockCreateDM = jest.fn();
  const mockSend = jest.fn();
  const mockMessagesFetch = jest.fn();

  const mockUser = {
    id: 'test-user-123',
    createDM: mockCreateDM,
    send: mockSend,
  } as unknown as jest.Mocked<User>;

  const mockChannel = {
    messages: {
      fetch: mockMessagesFetch,
    },
  } as unknown as jest.Mocked<DMChannel>;

  return {
    users: {
      fetch: mockFetch,
    },
  } as unknown as jest.Mocked<Client>;
}

/**
 * Discord モックの設定
 */
function setupDiscordMocks(mockClient: jest.Mocked<Client>, messageId: string): void {
  const mockSend = jest.fn().mockResolvedValue(undefined);
  const mockCreateDM = jest.fn();
  const mockFetch = jest.fn();
  const mockMessagesFetch = jest.fn();

  const mockUser = {
    id: 'test-user-123',
    createDM: mockCreateDM,
    send: mockSend,
  } as unknown as jest.Mocked<User>;

  const mockChannel = {
    messages: {
      fetch: mockMessagesFetch,
    },
  } as unknown as jest.Mocked<DMChannel>;

  const mockMessages = new Collection<string, Message>();
  // 今日の午前1時（夜間時間帯）のメッセージを作成
  const today = new Date();
  today.setHours(1, 0, 0, 0);
  
  const mockMessage = {
    id: messageId,
    content: 'テスト夜間メッセージ',
    author: { id: 'test-user-123', bot: false },
    createdAt: today,
  } as Message;

  mockMessages.set(messageId, mockMessage);

  // モックの挙動を設定
  mockFetch.mockResolvedValue(mockUser);
  mockCreateDM.mockResolvedValue(mockChannel);
  mockMessagesFetch.mockResolvedValue(mockMessages);

  // mockClientのプロパティを更新
  (mockClient as any).users = { fetch: mockFetch };
}