/**
 * マルチユーザー対応の最小限テスト
 * 問題の根本原因を特定するためのシンプルなテスト
 */

import { SqliteActivityLogRepository } from '../../repositories/sqliteActivityLogRepository';
import { ActivityLoggingIntegration } from '../../integration/activityLoggingIntegration';
import { Message } from 'discord.js';
import * as fs from 'fs';
import * as path from 'path';

describe('マルチユーザー対応最小限テスト', () => {
  let repository: SqliteActivityLogRepository;
  let integration: ActivityLoggingIntegration;
  const testDbPath = './test_data/minimal_test.db';

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
      enableAutoAnalysis: false, // 自動分析を無効化
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

  test('handleMessageが false を返す原因の特定', async () => {
    const userId = 'test_user_123';
    const mockMessage = {
      author: { id: userId, username: 'testuser', bot: false },
      content: 'テストメッセージ',
      guild: null,
      channel: { isDMBased: () => true },
      reply: jest.fn().mockResolvedValue(undefined),
      react: jest.fn().mockResolvedValue(undefined)
    } as unknown as Message;

    console.log('=== 詳細デバッグ開始 ===');
    console.log('1. 入力パラメーター確認');
    console.log('- ユーザーID:', userId);
    console.log('- メッセージ内容:', mockMessage.content);
    console.log('- メッセージ長:', mockMessage.content.length);
    console.log('- Bot判定:', mockMessage.author.bot);
    console.log('- Guild存在:', !!mockMessage.guild);
    console.log('- isDMBased:', mockMessage.channel.isDMBased());

    console.log('2. handleMessage実行前');
    
    // エラーキャッチ
    let result: boolean;
    try {
      console.log('3. handleMessage実行中...');
      result = await integration.handleMessage(mockMessage);
      console.log('4. handleMessage実行完了');
      console.log('- 結果:', result);
    } catch (error) {
      console.error('5. handleMessage実行エラー:', error);
      console.error('- エラー詳細:', {
        name: (error as Error).name,
        message: (error as Error).message,
        stack: (error as Error).stack?.split('\n').slice(0, 5).join('\n')
      });
      result = false;
    }

    console.log('6. 事後確認');
    
    // ユーザー登録状態確認
    try {
      const userExists = await repository.userExists(userId);
      console.log('- ユーザー存在:', userExists);
      
      if (userExists) {
        const userInfo = await repository.getUserInfo(userId);
        console.log('- ユーザー情報:', userInfo);
        
        const logs = await repository.getActivityRecords(userId, 'Asia/Tokyo');
        console.log('- 活動ログ数:', logs.length);
        if (logs.length > 0) {
          console.log('- 最新ログ:', logs[0]);
        }
      }
    } catch (dbError) {
      console.error('- データベース確認エラー:', dbError);
    }

    // モック呼び出し確認
    const replyMock = mockMessage.reply as jest.Mock;
    const reactMock = mockMessage.react as jest.Mock;
    console.log('- reply呼び出し回数:', replyMock.mock.calls.length);
    console.log('- react呼び出し回数:', reactMock.mock.calls.length);
    
    if (replyMock.mock.calls.length > 0) {
      console.log('- reply呼び出し内容:', replyMock.mock.calls);
    }

    console.log('=== 詳細デバッグ終了 ===');

    // テスト結果は参考程度に（デバッグが目的）
    console.log('最終結果:', result ? '成功' : '失敗');
  });

  test('コマンドの動作確認', async () => {
    const userId = 'command_test_user';
    const mockMessage = {
      author: { id: userId, username: 'commanduser', bot: false },
      content: '!help',
      guild: null,
      channel: { isDMBased: () => true },
      reply: jest.fn().mockResolvedValue(undefined)
    } as unknown as Message;

    console.log('=== コマンドテスト ===');
    console.log('コマンド:', mockMessage.content);
    console.log('startsWith(!):', mockMessage.content.startsWith('!'));

    try {
      const result = await integration.handleMessage(mockMessage);
      console.log('コマンド処理結果:', result);
      
      const replyMock = mockMessage.reply as jest.Mock;
      console.log('reply呼び出し回数:', replyMock.mock.calls.length);
      
      // コマンドは成功するはず
      expect(result).toBe(true);
    } catch (error) {
      console.error('コマンドテストエラー:', error);
      throw error;
    }
  });
});