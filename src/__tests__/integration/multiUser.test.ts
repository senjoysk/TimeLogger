/**
 * マルチユーザー対応の統合テスト
 * TDD Red-Green-Refactor サイクルに従って実装
 */

import { SqliteActivityLogRepository } from '../../repositories/sqliteActivityLogRepository';
import { ActivityLoggingIntegration } from '../../integration/activityLoggingIntegration';
import { Message } from 'discord.js';
import { config } from '../../config';
import * as fs from 'fs';
import * as path from 'path';

// モックを全面削除し、実際のサービスでテストする
// これにより、マルチユーザー機能が実際の環境で正常に動作することを確認

describe('マルチユーザー対応統合テスト', () => {
  let repository: SqliteActivityLogRepository;
  let integration: ActivityLoggingIntegration;
  const testDbPath = './test_data/multiuser_test.db';

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
      geminiApiKey: process.env.GOOGLE_API_KEY || 'test-key', // 実際のAPIキーを使用
      debugMode: true,
      defaultTimezone: 'Asia/Tokyo',
      enableAutoAnalysis: false, // テストでは自動分析を無効化
      cacheValidityMinutes: 60,
      targetUserId: '770478489203507241'
    };

    integration = new ActivityLoggingIntegration(integrationConfig);
    await integration.initialize();
    
    // 統合テストのデバッグ情報
    console.log('Integration initialized. Config:', {
      databasePath: integrationConfig.databasePath,
      enableAutoAnalysis: integrationConfig.enableAutoAnalysis,
      debugMode: integrationConfig.debugMode
    });
    
    // サービスが正常に初期化されたか確認
    const healthCheck = await integration.healthCheck();
    console.log('Health check result:', healthCheck);
  });

  afterEach(async () => {
    await integration.shutdown();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('🔴 Red Phase: 現在の制限による失敗テスト', () => {
    test('マルチユーザー対応により制限が解除されている', async () => {
      // マルチユーザー対応により、全てのユーザーが利用可能になった
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

      // マルチユーザー対応により、全てのユーザーが処理される
      console.log('=== 処理開始 ===');
      
      // エラーログを捕捉
      const originalConsoleError = console.error;
      const errorLogs: string[] = [];
      console.error = (...args: any[]) => {
        errorLogs.push(args.join(' '));
        originalConsoleError(...args);
      };

      let result1: boolean, result2: boolean;
      try {
        console.log('メッセージ1処理開始...');
        result1 = await integration.handleMessage(mockMessage1);
        console.log('メッセージ1処理完了:', result1);
        
        console.log('メッセージ2処理開始...');
        result2 = await integration.handleMessage(mockMessage2);
        console.log('メッセージ2処理完了:', result2);

        // デバッグ情報
        console.log('最終結果 - Result1:', result1, 'Result2:', result2);
        
        // エラーログ確認
        if (errorLogs.length > 0) {
          console.log('=== 発生したエラー ===');
          errorLogs.forEach((log, index) => {
            console.log(`Error ${index + 1}:`, log);
          });
        }
        
        // ユーザー登録状態確認
        const user1Exists = await repository.userExists(user1Id);
        const user2Exists = await repository.userExists(user2Id);
        console.log('ユーザー1存在:', user1Exists);
        console.log('ユーザー2存在:', user2Exists);
        
        // reply呼び出し確認
        const reply1Calls = (mockMessage1.reply as jest.Mock).mock.calls.length;
        const reply2Calls = (mockMessage2.reply as jest.Mock).mock.calls.length;
        console.log('Reply1呼び出し回数:', reply1Calls);
        console.log('Reply2呼び出し回数:', reply2Calls);
        
      } finally {
        console.error = originalConsoleError;
      }
      
      // 全てのユーザーが成功
      expect(result1).toBe(true);
      expect(result2).toBe(true);

      // データが適切に分離されていることを確認
      const user1Logs = await repository.getActivityRecords(user1Id, 'Asia/Tokyo');
      const user2Logs = await repository.getActivityRecords(user2Id, 'Asia/Tokyo');
      
      expect(user1Logs).toHaveLength(1);
      expect(user2Logs).toHaveLength(1);
      expect(user1Logs[0].userId).toBe(user1Id);
      expect(user2Logs[0].userId).toBe(user2Id);
    });
  });

  describe('🟢 Green Phase: マルチユーザー対応後の期待テスト', () => {
    test('複数ユーザーが同時に利用可能（実装後の期待動作）', async () => {
      // このテストは現在失敗するが、実装後に成功することを期待
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

      // 両ユーザーが成功することを期待（現在は失敗）
      const result1 = await integration.handleMessage(mockMessage1);
      const result2 = await integration.handleMessage(mockMessage2);

      // デバッグ情報
      console.log('Result1:', result1);
      console.log('Result2:', result2);
      
      // 実装後は両方とも true を返すことを期待
      expect(result1).toBe(true);
      expect(result2).toBe(true);

      // データが適切に分離されていることを確認
      const user1Logs = await repository.getActivityRecords(user1Id, 'Asia/Tokyo');
      const user2Logs = await repository.getActivityRecords(user2Id, 'Asia/Tokyo');

      expect(user1Logs).toHaveLength(1);
      expect(user2Logs).toHaveLength(1);
      expect(user1Logs[0].content).toBe('プロジェクトA開始');
      expect(user2Logs[0].content).toBe('会議参加');
      expect(user1Logs[0].userId).toBe(user1Id);
      expect(user2Logs[0].userId).toBe(user2Id);
    });

    test('新規ユーザーの自動登録機能（実装後の期待動作）', async () => {
      const newUserId = 'newuser_555555555';
      const mockNewUserMessage = {
        author: { id: newUserId, username: 'newuser', bot: false },
        content: '初回メッセージ',
        guild: null,
        channel: { isDMBased: () => true },
        reply: jest.fn().mockResolvedValue(undefined),
        react: jest.fn().mockResolvedValue(undefined)
      } as unknown as Message;

      // 新規ユーザーが自動的に登録されることを期待
      const result = await integration.handleMessage(mockNewUserMessage);
      console.log('New user result:', result);
      expect(result).toBe(true);

      // ウェルカムメッセージが送信されることを確認
      expect(mockNewUserMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('TimeLoggerへようこそ')
      );

      // ユーザー設定が自動作成されることを確認
      const userSettings = await repository.getUserInfo(newUserId);
      expect(userSettings).toBeDefined();
      expect(userSettings?.timezone).toBe('Asia/Tokyo');
    });

    test('既存ユーザーの継続利用（実装後の期待動作）', async () => {
      const existingUserId = 'existing_user_123';
      
      // 既存ユーザーを事前に登録
      await repository.registerUser(existingUserId, 'existinguser');

      const mockExistingUserMessage = {
        author: { id: existingUserId, username: 'existinguser', bot: false },
        content: 'プロジェクトの作業を継続中',
        guild: null,
        channel: { isDMBased: () => true },
        reply: jest.fn().mockResolvedValue(undefined),
        react: jest.fn().mockResolvedValue(undefined)
      } as unknown as Message;

      // 既存ユーザーは通常通り処理される
      const result = await integration.handleMessage(mockExistingUserMessage);
      console.log('Existing user result:', result);
      expect(result).toBe(true);

      // ウェルカムメッセージは送信されない（既存ユーザーのため）
      // 注意: TODO分類システムが動作するため、分類メッセージは送信される可能性がある
      const replyMock = mockExistingUserMessage.reply as jest.Mock;
      
      // ウェルカムメッセージではなく、TODO分類メッセージまたは何も送信されない
      if (replyMock.mock.calls.length > 0) {
        // TODO分類システムの動作を確認（オブジェクトの場合はembedsを確認）
        const replyContent = replyMock.mock.calls[0][0];
        if (typeof replyContent === 'string') {
          expect(replyContent).not.toMatch(/TimeLoggerへようこそ/);
        } else if (replyContent && replyContent.embeds) {
          // TODO分類システムのembedsにウェルカムメッセージが含まれていないことを確認
          const embedContent = JSON.stringify(replyContent.embeds);
          expect(embedContent).not.toMatch(/TimeLoggerへようこそ/);
        }
      }

      // ログが正常に保存される
      const userLogs = await repository.getActivityRecords(existingUserId, 'Asia/Tokyo');
      expect(userLogs).toHaveLength(1);
      expect(userLogs[0].content).toBe('プロジェクトの作業を継続中');
    });
  });

  describe('♻️ Refactor Phase: データ分離とセキュリティテスト', () => {
    test('ユーザー間でのデータ完全分離', async () => {
      // 複数ユーザーのデータを作成
      const users = [
        { id: 'user1_111', username: 'user1', content: 'user1のログ' },
        { id: 'user2_222', username: 'user2', content: 'user2のログ' },
        { id: 'user3_333', username: 'user3', content: 'user3のログ' }
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
        console.log(`User ${user.id} result:`, result);
        expect(result).toBe(true);
      }

      // 各ユーザーが自分のデータのみアクセス可能
      for (const user of users) {
        const userLogs = await repository.getActivityRecords(user.id, 'Asia/Tokyo');
        expect(userLogs).toHaveLength(1);
        expect(userLogs[0].content).toBe(user.content);
        expect(userLogs[0].userId).toBe(user.id);
      }

      // 他のユーザーのデータは含まれない
      const user1Logs = await repository.getActivityRecords('user1_111', 'Asia/Tokyo');
      expect(user1Logs.some((log: any) => log.userId !== 'user1_111')).toBe(false);
    }, 60000); // 60秒に延長

    test('エラーハンドリング：データベースエラー時の処理', async () => {
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
});