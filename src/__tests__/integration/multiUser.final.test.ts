/**
 * マルチユーザー対応の最終統合テスト
 * 実際のサービス環境でのシンプルで信頼性の高いテスト
 */

import { SqliteActivityLogRepository } from '../../repositories/sqliteActivityLogRepository';
import { ActivityLoggingIntegration } from '../../integration/activityLoggingIntegration';
import { Message } from 'discord.js';
import * as fs from 'fs';
import * as path from 'path';

describe('マルチユーザー対応最終統合テスト', () => {
  let repository: SqliteActivityLogRepository;
  let integration: ActivityLoggingIntegration;
  const testDbPath = './test_data/final_test.db';

  beforeEach(async () => {
    // テスト用データベースの準備
    const testDir = path.dirname(testDbPath);
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    
    // 既存のテストDBを削除
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    repository = new SqliteActivityLogRepository(testDbPath);
    await repository.initializeDatabase();

    const integrationConfig = {
      databasePath: testDbPath,
      geminiApiKey: process.env.GOOGLE_API_KEY || 'test-key',
      debugMode: true,
      defaultTimezone: 'Asia/Tokyo',
      enableAutoAnalysis: false, // 自動分析を無効化でテスト高速化
      cacheValidityMinutes: 60,
      targetUserId: '770478489203507241'
    };

    integration = new ActivityLoggingIntegration(integrationConfig);
    await integration.initialize();
  });

  afterEach(async () => {
    await integration.shutdown();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  test('マルチユーザー基本機能の統合テスト', async () => {
    const user1Id = 'user1_123456789';
    const user2Id = 'user2_987654321';

    const mockMessage1 = {
      author: { id: user1Id, username: 'testuser1', bot: false },
      content: 'プロジェクトA開始',
      guild: null,
      channel: { isDMBased: () => true },
      reply: jest.fn().mockResolvedValue(undefined),
      react: jest.fn().mockResolvedValue(undefined)
    } as unknown as Message;

    const mockMessage2 = {
      author: { id: user2Id, username: 'testuser2', bot: false },
      content: '会議参加',
      guild: null,
      channel: { isDMBased: () => true },
      reply: jest.fn().mockResolvedValue(undefined),
      react: jest.fn().mockResolvedValue(undefined)
    } as unknown as Message;

    // 両ユーザーのメッセージを処理
    const result1 = await integration.handleMessage(mockMessage1);
    const result2 = await integration.handleMessage(mockMessage2);

    // 基本検証: 両ユーザーが正常に処理される
    expect(result1).toBe(true);
    expect(result2).toBe(true);

    // ユーザー登録確認
    const user1Exists = await repository.userExists(user1Id);
    const user2Exists = await repository.userExists(user2Id);
    expect(user1Exists).toBe(true);
    expect(user2Exists).toBe(true);

    // ウェルカムメッセージ送信確認
    const reply1Mock = mockMessage1.reply as jest.Mock;
    const reply2Mock = mockMessage2.reply as jest.Mock;
    expect(reply1Mock).toHaveBeenCalledWith(expect.stringContaining('TimeLoggerへようこそ'));
    expect(reply2Mock).toHaveBeenCalledWith(expect.stringContaining('TimeLoggerへようこそ'));

    // データ分離確認
    const user1Logs = await repository.getActivityRecords(user1Id, 'Asia/Tokyo');
    const user2Logs = await repository.getActivityRecords(user2Id, 'Asia/Tokyo');
    
    expect(user1Logs).toHaveLength(1);
    expect(user2Logs).toHaveLength(1);
    expect(user1Logs[0].userId).toBe(user1Id);
    expect(user2Logs[0].userId).toBe(user2Id);
    expect(user1Logs[0].content).toBe('プロジェクトA開始');
    expect(user2Logs[0].content).toBe('会議参加');
  }, 30000);

  test('既存ユーザーの継続利用テスト', async () => {
    const existingUserId = 'existing_user_123';
    
    // 既存ユーザーを事前に登録
    await repository.registerUser(existingUserId, 'existinguser');

    const mockExistingUserMessage = {
      author: { id: existingUserId, username: 'existinguser', bot: false },
      content: '2回目のメッセージ',
      guild: null,
      channel: { isDMBased: () => true },
      reply: jest.fn().mockResolvedValue(undefined),
      react: jest.fn().mockResolvedValue(undefined)
    } as unknown as Message;

    // 既存ユーザーのメッセージ処理
    const result = await integration.handleMessage(mockExistingUserMessage);
    expect(result).toBe(true);

    // ウェルカムメッセージは送信されない（既存ユーザーのため）
    const replyMock = mockExistingUserMessage.reply as jest.Mock;
    expect(replyMock).not.toHaveBeenCalled();

    // ログが正常に保存される
    const userLogs = await repository.getActivityRecords(existingUserId, 'Asia/Tokyo');
    expect(userLogs).toHaveLength(1);
    expect(userLogs[0].content).toBe('2回目のメッセージ');
  }, 30000);

  test('コマンド処理のマルチユーザー対応テスト', async () => {
    const user1Id = 'command_user1';
    const user2Id = 'command_user2';

    const mockHelpCommand1 = {
      author: { id: user1Id, username: 'commanduser1', bot: false },
      content: '!help',
      guild: null,
      channel: { isDMBased: () => true },
      reply: jest.fn().mockResolvedValue(undefined)
    } as unknown as Message;

    const mockHelpCommand2 = {
      author: { id: user2Id, username: 'commanduser2', bot: false },
      content: '!help',
      guild: null,
      channel: { isDMBased: () => true },
      reply: jest.fn().mockResolvedValue(undefined)
    } as unknown as Message;

    // 両ユーザーのコマンドを処理
    const result1 = await integration.handleMessage(mockHelpCommand1);
    const result2 = await integration.handleMessage(mockHelpCommand2);

    // コマンドは常に成功
    expect(result1).toBe(true);
    expect(result2).toBe(true);

    // 両ユーザーが自動登録される
    const user1Exists = await repository.userExists(user1Id);
    const user2Exists = await repository.userExists(user2Id);
    expect(user1Exists).toBe(true);
    expect(user2Exists).toBe(true);

    // ヘルプメッセージが送信される
    const reply1Mock = mockHelpCommand1.reply as jest.Mock;
    const reply2Mock = mockHelpCommand2.reply as jest.Mock;
    expect(reply1Mock).toHaveBeenCalledWith(expect.stringContaining('TimeLogger 活動記録システム'));
    expect(reply2Mock).toHaveBeenCalledWith(expect.stringContaining('TimeLogger 活動記録システム'));
  }, 30000);

  test('データ完全分離テスト', async () => {
    const users = [
      { id: 'user_data1', username: 'datauser1', content: 'user1のデータ' },
      { id: 'user_data2', username: 'datauser2', content: 'user2のデータ' },
      { id: 'user_data3', username: 'datauser3', content: 'user3のデータ' }
    ];

    // 各ユーザーのメッセージを処理
    for (const user of users) {
      const mockMessage = {
        author: { id: user.id, username: user.username, bot: false },
        content: user.content,
        guild: null,
        channel: { isDMBased: () => true },
        reply: jest.fn().mockResolvedValue(undefined),
        react: jest.fn().mockResolvedValue(undefined)
      } as unknown as Message;

      const result = await integration.handleMessage(mockMessage);
      expect(result).toBe(true);
    }

    // 各ユーザーが自分のデータのみアクセス可能
    for (const user of users) {
      const userLogs = await repository.getActivityRecords(user.id, 'Asia/Tokyo');
      expect(userLogs).toHaveLength(1);
      expect(userLogs[0].content).toBe(user.content);
      expect(userLogs[0].userId).toBe(user.id);

      // 他のユーザーのデータが含まれていないことを確認
      const hasOtherUserData = userLogs.some(log => log.userId !== user.id);
      expect(hasOtherUserData).toBe(false);
    }
  }, 30000);

  test('エラーハンドリングテスト', async () => {
    // データベース接続を切断してエラーを発生させる
    await repository.close();

    const mockMessage = {
      author: { id: 'error_user', username: 'erroruser', bot: false },
      content: 'エラーテストメッセージ',
      guild: null,
      channel: { isDMBased: () => true },
      reply: jest.fn().mockResolvedValue(undefined)
    } as unknown as Message;

    // エラーが適切に処理されることを確認
    const result = await integration.handleMessage(mockMessage);
    expect(result).toBe(false);

    // エラーメッセージが返されることを確認
    const replyMock = mockMessage.reply as jest.Mock;
    expect(replyMock).toHaveBeenCalledWith(expect.stringContaining('❌'));
  }, 30000);
});