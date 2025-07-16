import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { ActivityLoggingIntegration } from '../../integration';
import { Message } from 'discord.js';
import { SharedTestDatabase } from '../utils/SharedTestDatabase';

// Discordメッセージのモック（既存のテストと同じパターン）
class MockMessage {
  public content: string;
  public author: { id: string; bot: boolean; tag: string; username: string };
  public guild: null = null; // DM simulation
  public channel: { isDMBased: () => boolean } = { isDMBased: () => true };
  public replies: string[] = [];

  constructor(content: string, userId: string = '770478489203507241', username: string = 'test-user') {
    this.content = content;
    this.author = { id: userId, bot: false, tag: `${username}#0001`, username };
  }

  async reply(message: string): Promise<void> {
    this.replies.push(message);
  }

  async react(emoji: string): Promise<void> {
    // リアクション処理（モック）
  }
}

describe('Multi-user Support Integration Tests', () => {
  let integration: ActivityLoggingIntegration;
  let sharedDb: SharedTestDatabase;

  beforeAll(async () => {
    // 共有データベースの初期化（1回のみ実行）
    sharedDb = SharedTestDatabase.getInstance();
    await sharedDb.initialize();
    integration = await sharedDb.getIntegration();
  });

  afterAll(async () => {
    // 共有データベースの破棄
    await SharedTestDatabase.reset();
  });

  beforeEach(async () => {
    // 各テスト前にデータをクリーンアップ
    await sharedDb.cleanupForTest();
  });

  afterEach(async () => {
    // 各テスト後にもデータをクリーンアップ
    await sharedDb.cleanupForTest();
  });

  describe('🟢 Green Phase: マルチユーザー対応のテスト', () => {
    test('基本的なメッセージ処理の確認', async () => {
      const userId = '770478489203507241';
      const mockMessage = new MockMessage('テストメッセージ', userId, 'TestUser');
      
      const config = (integration as any).config;
      const handleMessage = (integration as any).handleMessage.bind(integration);
      
      // マルチユーザー対応: targetUserId制限なし
      expect(config.targetUserId).toBe(''); // レガシー設定として空文字
      expect(mockMessage.channel.isDMBased()).toBe(true);
      expect(mockMessage.author.bot).toBe(false);
      
      const result = await handleMessage(mockMessage as unknown as Message);
      expect(result).toBe(true);
    }, 10000);

    test('別ユーザーのメッセージ処理確認', async () => {
      const userId = 'different-user-123';
      const mockMessage = new MockMessage('テストメッセージ2', userId, 'TestUser2');
      
      const config = (integration as any).config;
      const handleMessage = (integration as any).handleMessage.bind(integration);
      
      // マルチユーザー対応: 全ユーザーが処理可能
      expect(config.targetUserId).toBe(''); // レガシー設定として空文字
      expect(mockMessage.author.id).toBe('different-user-123');
      
      const result = await handleMessage(mockMessage as unknown as Message);
      // マルチユーザー対応により、すべてのユーザーが処理される
      expect(result).toBe(true);
    }, 10000);

    test('複数ユーザーが同時にメッセージを送信できる', async () => {
      // 🟢 Green Phase: マルチユーザー対応により複数ユーザーが同時利用可能
      
      const user1Id = '770478489203507241';
      const user2Id = 'different-user-123';
      
      const mockMessage1 = new MockMessage('プロジェクトA開始', user1Id, 'User1');
      const mockMessage2 = new MockMessage('会議参加', user2Id, 'User2');
      
      // ActivityLogServiceを直接使用してテストする
      const activityLogService = (integration as any).activityLogService;
      
      // User1のログを直接記録
      await activityLogService.recordActivity(user1Id, 'プロジェクトA開始', 'Asia/Tokyo');
      
      // User2のログを直接記録
      await activityLogService.recordActivity(user2Id, '会議参加', 'Asia/Tokyo');
      
      // 両ユーザーのログが独立して保存されることを確認
      const repository = (integration as any).repository;
      const businessDateInfo = repository.calculateBusinessDate(new Date().toISOString(), 'Asia/Tokyo');
      const today = businessDateInfo.businessDate;
      const user1Logs = await repository.getLogsByDateRange(user1Id, today, today);
      const user2Logs = await repository.getLogsByDateRange(user2Id, today, today);
      
      expect(user1Logs).toHaveLength(1);
      expect(user2Logs).toHaveLength(1); // ✅ マルチユーザー対応により両方のログが保存される
      expect(user1Logs[0].content).toBe('プロジェクトA開始');
      expect(user2Logs[0].content).toBe('会議参加'); // ✅ ログが保存される
    }, 10000);

    test('異なるユーザーのデータが分離されている', async () => {
      // 🟢 Green Phase: マルチユーザー対応により複数ユーザーのデータが分離される
      
      const user1Id = '770478489203507241';
      const user2Id = 'another-user-456';
      const user3Id = 'third-user-789';
      
      // ActivityLogServiceを直接使用してテストする
      const activityLogService = (integration as any).activityLogService;
      
      // 各ユーザーの活動ログを直接記録
      await activityLogService.recordActivity(user1Id, 'タスク1完了', 'Asia/Tokyo');
      await activityLogService.recordActivity(user2Id, 'ミーティング開始', 'Asia/Tokyo');
      await activityLogService.recordActivity(user3Id, 'レビュー実施', 'Asia/Tokyo');
      await activityLogService.recordActivity(user1Id, 'タスク2開始', 'Asia/Tokyo'); // User1の2つ目
      
      // 各ユーザーのログ数を確認
      const repository = (integration as any).repository;
      const businessDateInfo = repository.calculateBusinessDate(new Date().toISOString(), 'Asia/Tokyo');
      const today = businessDateInfo.businessDate;
      const user1Logs = await repository.getLogsByDateRange(user1Id, today, today);
      const user2Logs = await repository.getLogsByDateRange(user2Id, today, today);
      const user3Logs = await repository.getLogsByDateRange(user3Id, today, today);
      
      expect(user1Logs).toHaveLength(2);
      expect(user2Logs).toHaveLength(1); // ✅ マルチユーザー対応により1件
      expect(user3Logs).toHaveLength(1); // ✅ マルチユーザー対応により1件
    }, 10000);

    test('ユーザー制限メッセージが出力されない', async () => {
      // 🟢 Green Phase: マルチユーザー対応により制限メッセージは出力されない
      
      const consoleLogSpy = jest.spyOn(console, 'log');
      const nonTargetUserId = 'non-target-user';
      const mockMessage = new MockMessage('テストメッセージ', nonTargetUserId, 'TestUser');
      
      const handleMessage = (integration as any).handleMessage.bind(integration);
      await handleMessage(mockMessage as unknown as Message);
      
      // マルチユーザー対応により「対象外ユーザー」というログは出力されない
      const restrictionLog = consoleLogSpy.mock.calls.find(call => 
        call[0]?.includes('対象外ユーザー')
      );
      
      // マルチユーザー対応後は制限メッセージが出力されない
      expect(restrictionLog).toBeUndefined(); // ✅ 制限メッセージは出力されない
      
      consoleLogSpy.mockRestore();
    }, 10000);
  });

  describe('🟢 Green Phase: 自動ユーザー登録機能のテスト', () => {
    test('新規ユーザーが自動的に登録される', async () => {
      // 🟢 Green Phase: マルチユーザー対応により新規ユーザーが自動登録される
      
      const newUserId = 'new-user-123456';
      const mockMessage = new MockMessage('初めてのメッセージ', newUserId, 'NewUser');
      
      // リポジトリに直接アクセス
      const repository = (integration as any).repository;
      
      // 初期状態：ユーザーは存在しない
      const existsBefore = await repository.userExists(newUserId);
      expect(existsBefore).toBe(false); // ✅ userExists メソッドが実装済み
      
      // メッセージを処理
      const handleMessage = (integration as any).handleMessage.bind(integration);
      const result = await handleMessage(mockMessage as unknown as Message);
      expect(result).toBe(true);
      
      // ユーザーが自動登録されている
      const existsAfter = await repository.userExists(newUserId);
      expect(existsAfter).toBe(true); // ✅ registerUser メソッドが実装済み
      
      // ウェルカムメッセージとTODO分類の両方が送信される
      expect(mockMessage.replies).toHaveLength(2);
      
      // どちらかの返信にウェルカムメッセージが含まれることを確認
      const allReplies = mockMessage.replies.map(r => typeof r === 'string' ? r : JSON.stringify(r)).join(' ');
      expect(allReplies).toContain('TimeLoggerへようこそ');
    }, 10000);

    test('既存ユーザーには重複登録されない', async () => {
      // 🟢 Green Phase: 既存ユーザーの処理をテスト
      
      const existingUserId = 'existing-user-789';
      const repository = (integration as any).repository;
      
      // 事前にユーザーを登録
      await repository.registerUser(existingUserId, 'ExistingUser'); // ✅ registerUser メソッドが実装済み
      
      const mockMessage = new MockMessage('2回目のメッセージ', existingUserId, 'ExistingUser');
      
      // メッセージを処理
      const handleMessage = (integration as any).handleMessage.bind(integration);
      const result = await handleMessage(mockMessage as unknown as Message);
      expect(result).toBe(true);
      
      // ウェルカムメッセージは送信されず、通常のTODO分類処理が実行される
      // 既存ユーザーの場合、通常の活動ログ処理（TODO分類含む）が実行される
      expect(mockMessage.replies).toHaveLength(1); // TODO分類機能による返信があることが正常
      
      // ウェルカムメッセージでないことを確認
      const reply = mockMessage.replies[0];
      if (typeof reply === 'string') {
        expect(reply).not.toContain('TimeLoggerへようこそ');
      } else {
        // オブジェクト形式の返信（TODO分類結果）の場合
        expect(JSON.stringify(reply)).not.toContain('TimeLoggerへようこそ');
      }
    }, 10000);

    test('ユーザー情報が正しく保存される', async () => {
      // 🟢 Green Phase: ユーザー情報の保存をテスト
      
      const newUserId = 'user-with-info-999';
      const username = 'TestUserWithInfo';
      const mockMessage = new MockMessage('情報保存テスト', newUserId, username);
      
      const repository = (integration as any).repository;
      const handleMessage = (integration as any).handleMessage.bind(integration);
      
      // メッセージを処理
      await handleMessage(mockMessage as unknown as Message);
      
      // ユーザー情報を取得
      const userInfo = await repository.getUserInfo(newUserId); // ✅ getUserInfo メソッドが実装済み
      expect(userInfo).toBeDefined();
      expect(userInfo.userId).toBe(newUserId);
      expect(userInfo.username).toBe(username);
      expect(userInfo.timezone).toBe('Asia/Tokyo'); // デフォルトタイムゾーン
    }, 10000);
  });
});

