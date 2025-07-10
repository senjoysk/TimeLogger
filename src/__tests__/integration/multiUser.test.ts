import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { ActivityLoggingIntegration, createDefaultConfig } from '../../integration';
import { Message } from 'discord.js';
import * as path from 'path';
import * as fs from 'fs';

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
  const testDbPath = './test-data/multi-user-test.db';

  beforeEach(async () => {
    // テストデータディレクトリ作成とDBファイル削除
    const testDir = path.dirname(testDbPath);
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // テスト用の設定作成
    const config = createDefaultConfig(testDbPath, 'test-api-key');
    config.debugMode = true;
    config.enableAutoAnalysis = false; // テスト環境では自動分析を無効化
    config.targetUserId = '770478489203507241'; // 既存のデフォルト値

    // 統合クラスの初期化
    integration = new ActivityLoggingIntegration(config);
    await integration.initialize();
  });

  afterEach(async () => {
    if (integration) {
      await integration.shutdown();
    }
    // テスト用DBの削除
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('🔴 Red Phase: ユーザー制限のテスト', () => {
    test('複数ユーザーが同時にメッセージを送信できる', async () => {
      // 🔴 Red Phase: このテストは現在の実装では失敗する
      // 理由: targetUserIdとの比較により、他のユーザーは拒否される
      
      const user1Id = '770478489203507241'; // 現在のtargetUserId
      const user2Id = 'different-user-123';
      
      const mockMessage1 = new MockMessage('プロジェクトA開始', user1Id, 'User1');
      const mockMessage2 = new MockMessage('会議参加', user2Id, 'User2');
      
      // プライベートメソッドにアクセス
      const handleMessage = (integration as any).handleMessage.bind(integration);
      
      // User1のメッセージは処理される
      const result1 = await handleMessage(mockMessage1 as unknown as Message);
      expect(result1).toBe(true);
      
      // User2のメッセージも処理されるべき（現在は失敗する）
      const result2 = await handleMessage(mockMessage2 as unknown as Message);
      expect(result2).toBe(true); // ❌ 現在の実装では false が返される
      
      // 両ユーザーのログが独立して保存されることを確認
      // リポジトリを直接アクセスして確認
      const repository = (integration as any).repository;
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD形式
      const user1Logs = await repository.getLogsByDateRange(user1Id, today, today);
      const user2Logs = await repository.getLogsByDateRange(user2Id, today, today);
      
      expect(user1Logs).toHaveLength(1);
      expect(user2Logs).toHaveLength(1); // ✅ マルチユーザー対応により1件になる
      expect(user1Logs[0].content).toBe('プロジェクトA開始');
      expect(user2Logs[0].content).toBe('会議参加'); // ✅ ログが保存される
    });

    test('異なるユーザーのデータが分離されている', async () => {
      // 🔴 Red Phase: 複数ユーザーのデータ分離をテスト
      
      const user1Id = '770478489203507241';
      const user2Id = 'another-user-456';
      const user3Id = 'third-user-789';
      
      // プライベートメソッドにアクセス
      const handleMessage = (integration as any).handleMessage.bind(integration);
      
      // 各ユーザーが異なるメッセージを送信
      const messages = [
        new MockMessage('タスク1完了', user1Id, 'User1'),
        new MockMessage('ミーティング開始', user2Id, 'User2'),
        new MockMessage('レビュー実施', user3Id, 'User3'),
        new MockMessage('タスク2開始', user1Id, 'User1'), // User1の2つ目
      ];
      
      // 全てのメッセージが処理されるべき
      for (const message of messages) {
        const result = await handleMessage(message as unknown as Message);
        const userId = message.author.id;
        
        if (userId === '770478489203507241') {
          expect(result).toBe(true); // targetUserIdなので成功
        } else {
          expect(result).toBe(true); // ❌ 他のユーザーも成功すべきだが、現在は false
        }
      }
      
      // 各ユーザーのログ数を確認
      const repository = (integration as any).repository;
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD形式
      const user1Logs = await repository.getLogsByDateRange(user1Id, today, today);
      const user2Logs = await repository.getLogsByDateRange(user2Id, today, today);
      const user3Logs = await repository.getLogsByDateRange(user3Id, today, today);
      
      expect(user1Logs).toHaveLength(2);
      expect(user2Logs).toHaveLength(1); // ❌ 現在は 0
      expect(user3Logs).toHaveLength(1); // ❌ 現在は 0
    });

    test('ユーザー制限メッセージが出力されない', async () => {
      // 🔴 Red Phase: 制限メッセージの出力をテスト
      
      const consoleLogSpy = jest.spyOn(console, 'log');
      const nonTargetUserId = 'non-target-user';
      const mockMessage = new MockMessage('テストメッセージ', nonTargetUserId, 'TestUser');
      
      const handleMessage = (integration as any).handleMessage.bind(integration);
      await handleMessage(mockMessage as unknown as Message);
      
      // 現在の実装では「対象外ユーザー」というログが出力される
      const restrictionLog = consoleLogSpy.mock.calls.find(call => 
        call[0]?.includes('対象外ユーザー')
      );
      
      // マルチユーザー対応後は制限メッセージが出力されないべき
      expect(restrictionLog).toBeUndefined(); // ❌ 現在は制限メッセージが見つかる
      
      consoleLogSpy.mockRestore();
    });
  });

  describe('🔴 Red Phase: 自動ユーザー登録機能のテスト', () => {
    test('新規ユーザーが自動的に登録される', async () => {
      // 🔴 Red Phase: このテストは現在の実装では失敗する
      // 理由: userExists と registerUser メソッドが実装されていない
      
      const newUserId = 'new-user-123456';
      const mockMessage = new MockMessage('初めてのメッセージ', newUserId, 'NewUser');
      
      // リポジトリに直接アクセス
      const repository = (integration as any).repository;
      
      // 初期状態：ユーザーは存在しない
      const existsBefore = await repository.userExists(newUserId);
      expect(existsBefore).toBe(false); // ❌ userExists メソッドが存在しない
      
      // メッセージを処理
      const handleMessage = (integration as any).handleMessage.bind(integration);
      const result = await handleMessage(mockMessage as unknown as Message);
      expect(result).toBe(true);
      
      // ユーザーが自動登録されている
      const existsAfter = await repository.userExists(newUserId);
      expect(existsAfter).toBe(true); // ❌ registerUser メソッドが存在しない
      
      // ウェルカムメッセージが送信されている
      expect(mockMessage.replies).toHaveLength(1);
      expect(mockMessage.replies[0]).toContain('TimeLoggerへようこそ'); // ❌ 実装されていない
    });

    test('既存ユーザーには重複登録されない', async () => {
      // 🔴 Red Phase: 既存ユーザーの処理をテスト
      
      const existingUserId = 'existing-user-789';
      const repository = (integration as any).repository;
      
      // 事前にユーザーを登録（getUserInfo メソッドがあると仮定）
      await repository.registerUser(existingUserId, 'ExistingUser'); // ❌ registerUser メソッドが存在しない
      
      const mockMessage = new MockMessage('2回目のメッセージ', existingUserId, 'ExistingUser');
      
      // メッセージを処理
      const handleMessage = (integration as any).handleMessage.bind(integration);
      const result = await handleMessage(mockMessage as unknown as Message);
      expect(result).toBe(true);
      
      // ウェルカムメッセージは送信されない
      expect(mockMessage.replies).toHaveLength(0); // 既存ユーザーなのでウェルカムメッセージなし
    });

    test('ユーザー情報が正しく保存される', async () => {
      // 🔴 Red Phase: ユーザー情報の保存をテスト
      
      const newUserId = 'user-with-info-999';
      const username = 'TestUserWithInfo';
      const mockMessage = new MockMessage('情報保存テスト', newUserId, username);
      
      const repository = (integration as any).repository;
      const handleMessage = (integration as any).handleMessage.bind(integration);
      
      // メッセージを処理
      await handleMessage(mockMessage as unknown as Message);
      
      // ユーザー情報を取得
      const userInfo = await repository.getUserInfo(newUserId); // ❌ getUserInfo メソッドが存在しない
      expect(userInfo).toBeDefined();
      expect(userInfo.userId).toBe(newUserId);
      expect(userInfo.username).toBe(username);
      expect(userInfo.timezone).toBe('Asia/Tokyo'); // デフォルトタイムゾーン
    });
  });
});

