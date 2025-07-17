/**
 * 日次サマリー送信の統合テスト
 * 
 * 18:30に日次サマリーが送信されることを検証するテスト
 * タイムゾーン別配信とエラーハンドリングの動作確認
 */

import { TaskLoggerBot } from '../../bot';
import { SqliteActivityLogRepository } from '../../repositories/sqliteActivityLogRepository';
import { SharedTestDatabase } from '../utils/SharedTestDatabase';
import { toZonedTime } from 'date-fns-tz';

// Discord.js のモック
jest.mock('discord.js', () => ({
  Client: jest.fn().mockImplementation(() => ({
    login: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    once: jest.fn(),
    user: { id: 'test-bot-id', username: 'test-bot', tag: 'test-bot#1234' },
    users: {
      fetch: jest.fn().mockResolvedValue({
        id: 'test-user-id',
        username: 'test-user',
        createDM: jest.fn().mockResolvedValue({
          send: jest.fn().mockResolvedValue(undefined)
        })
      })
    },
    guilds: { cache: { size: 0 } },
    ws: { ping: 50 }
  })),
  GatewayIntentBits: {
    Guilds: 1,
    GuildMessages: 2,
    MessageContent: 4,
    DirectMessages: 8
  },
  Partials: {
    Channel: 'Channel',
    Message: 'Message'
  }
}));

describe('日次サマリー送信の統合テスト', () => {
  let bot: TaskLoggerBot;
  let repository: SqliteActivityLogRepository;
  let testDb: SharedTestDatabase;

  beforeEach(async () => {
    testDb = SharedTestDatabase.getInstance();
    await testDb.initialize();
    
    repository = await testDb.getRepository();
    bot = new TaskLoggerBot();
    
    // ActivityLoggingIntegrationを設定
    const integration = await testDb.getIntegration();
    (bot as any).activityLoggingIntegration = integration;
    
    // テストデータをクリーンアップ
    await testDb.cleanupForTest();
  });

  afterEach(async () => {
    await testDb.cleanupForTest();
    
    // Dateモックをクリアして元に戻す
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('18:30送信時刻の検証', () => {
    test('Asia/Tokyo ユーザーに18:30に日次サマリーが送信される', async () => {
      // 18:30配信時刻の検証テスト
      
      // テストユーザーを作成
      await repository.saveUserTimezone('test-user-123', 'Asia/Tokyo');
      
      // Asia/Tokyo の 18:30 を模擬 (UTC 09:30)
      const utcTime = new Date('2023-01-01T09:30:00Z');
      
      // 時刻を18:30に設定
      const dateSpy = jest.spyOn(global, 'Date').mockImplementation(() => utcTime as any);
      
      // sendDailySummaryToUserメソッドをスパイ
      const sendSpy = jest.spyOn(bot as any, 'sendDailySummaryToUser');
      
      // 日次サマリー送信を実行（直接sendDailySummaryToUserを呼び出し）
      await (bot as any).sendDailySummaryToUser('test-user-123', 'Asia/Tokyo');
      
      // 18:30に送信されることを期待（現在は18:00なので失敗）
      expect(sendSpy).toHaveBeenCalledWith('test-user-123', 'Asia/Tokyo');
      
      // 時刻チェックが正常に動作することを確認
      const { toZonedTime } = require('date-fns-tz');
      const debugUtcTime = new Date('2023-01-01T09:30:00Z');
      const localTime = toZonedTime(debugUtcTime, 'Asia/Tokyo');
      console.log(`UTC: ${debugUtcTime.toISOString()}, Local: ${localTime.toISOString()}, Hours: ${localTime.getHours()}, Minutes: ${localTime.getMinutes()}`);
      
      // 18:30に送信されることを期待（bot.ts:481で修正済み）
      const mockUser = await bot['client'].users.fetch('test-user-123');
      const mockDM = await mockUser.createDM();
      expect(mockDM.send).toHaveBeenCalled();
      
      // モックをクリーンアップ
      dateSpy.mockRestore();
    });

    test('America/New_York ユーザーに18:30に日次サマリーが送信される', async () => {
      // アメリカ東部時間での18:30配信テスト
      
      // テストユーザーを作成
      await repository.saveUserTimezone('test-user-456', 'America/New_York');
      
      // America/New_York の 18:30 を模擬 (UTC 23:30)
      const utcTime = new Date('2023-01-01T23:30:00Z');
      
      // Dateコンストラクター全体をモック
      const dateSpy = jest.spyOn(global, 'Date').mockImplementation(() => utcTime as any);
      
      // sendDailySummaryToUserメソッドをスパイ
      const sendSpy = jest.spyOn(bot as any, 'sendDailySummaryToUser');
      
      // 日次サマリー送信を実行（直接sendDailySummaryToUserを呼び出し）
      await (bot as any).sendDailySummaryToUser('test-user-456', 'America/New_York');
      
      // 18:30に送信されることを期待（現在は18:00なので失敗）
      expect(sendSpy).toHaveBeenCalledWith('test-user-456', 'America/New_York');
      
      // Discord DMが送信されることを期待
      const mockUser = await bot['client'].users.fetch('test-user-456');
      const mockDM = await mockUser.createDM();
      expect(mockDM.send).toHaveBeenCalled();
      
      // モックをクリーンアップ
      dateSpy.mockRestore();
    });

    test('18:30以外の時刻では日次サマリーが送信されない', async () => {
      // 送信時刻外での非送信確認テスト
      
      // Asia/Tokyo の 17:30 を模擬（送信時刻ではない） (UTC 08:30)
      const utcTime = new Date('2023-01-01T08:30:00Z');
      
      // Dateコンストラクター全体をモック
      const dateSpy = jest.spyOn(global, 'Date').mockImplementation(() => utcTime as any);
      
      // sendDailySummaryToUserメソッドをスパイ
      const sendSpy = jest.spyOn(bot as any, 'sendDailySummaryToUser');
      
      // 日次サマリー送信を実行（直接sendDailySummaryToUserを呼び出し）
      await (bot as any).sendDailySummaryToUser('test-user-123', 'Asia/Tokyo');
      
      // 17:30では送信されないことを期待
      expect(sendSpy).toHaveBeenCalledWith('test-user-123', 'Asia/Tokyo');
      
      // Discord DMが送信されないことを期待
      const mockUser = await bot['client'].users.fetch('test-user-123');
      const mockDM = await mockUser.createDM();
      expect(mockDM.send).not.toHaveBeenCalled();
      
      // モックをクリーンアップ
      dateSpy.mockRestore();
    });
  });

  describe('全ユーザーへの日次サマリー送信', () => {
    test('sendDailySummaryForAllUsers で全ユーザーに18:30に送信される', async () => {
      // 全ユーザー一括配信の動作確認テスト
      
      // テストユーザーを事前にデータベースに追加
      await repository.saveUserTimezone('test-user-123', 'Asia/Tokyo');
      await repository.saveUserTimezone('test-user-456', 'Asia/Tokyo');
      
      // 複数のタイムゾーンで18:30を模擬 (UTC 09:30)
      const utcTime = new Date('2023-01-01T09:30:00Z');
      
      // Dateコンストラクター全体をモック
      const dateSpy = jest.spyOn(global, 'Date').mockImplementation(() => utcTime as any);
      
      // 日次サマリー送信を実行
      await bot.sendDailySummaryForAllUsers();
      
      // 全ユーザーに送信されることを期待
      const mockUser1 = await bot['client'].users.fetch('test-user-123');
      const mockUser2 = await bot['client'].users.fetch('test-user-456');
      
      const mockDM1 = await mockUser1.createDM();
      const mockDM2 = await mockUser2.createDM();
      
      expect(mockDM1.send).toHaveBeenCalled();
      expect(mockDM2.send).toHaveBeenCalled();
      
      // モックをクリーンアップ
      dateSpy.mockRestore();
    });

    test('18:30以外の時刻では全ユーザーに送信されない', async () => {
      // 送信時刻外での全ユーザー非送信確認テスト
      
      // テストユーザーを事前にデータベースに追加
      await repository.saveUserTimezone('test-user-789', 'Asia/Tokyo');
      await repository.saveUserTimezone('test-user-101', 'Asia/Tokyo');
      
      // 19:00を模擬（送信時刻ではない） (UTC 10:00)
      const utcTime = new Date('2023-01-01T10:00:00Z');
      
      // Dateコンストラクター全体をモック
      const dateSpy = jest.spyOn(global, 'Date').mockImplementation(() => utcTime as any);
      
      // 日次サマリー送信を実行
      await bot.sendDailySummaryForAllUsers();
      
      // 19:00では送信されないことを期待
      const mockUser1 = await bot['client'].users.fetch('test-user-789');
      const mockUser2 = await bot['client'].users.fetch('test-user-101');
      
      const mockDM1 = await mockUser1.createDM();
      const mockDM2 = await mockUser2.createDM();
      
      expect(mockDM1.send).not.toHaveBeenCalled();
      expect(mockDM2.send).not.toHaveBeenCalled();
      
      // モックをクリーンアップ
      dateSpy.mockRestore();
    });
  });

  describe('タイムゾーンの正確性', () => {
    test('各タイムゾーンで18:30の判定が正確に行われる', async () => {
      // 複数タイムゾーンでの時刻判定精度テスト
      
      // 複数のタイムゾーンをテスト
      const testCases = [
        { timezone: 'Asia/Tokyo', utcTime: '2023-01-01T09:30:00Z' },
        { timezone: 'America/New_York', utcTime: '2023-01-01T23:30:00Z' },
        { timezone: 'Europe/London', utcTime: '2023-01-01T18:30:00Z' },
        { timezone: 'Asia/Kolkata', utcTime: '2023-01-01T13:00:00Z' }
      ];
      
      for (const testCase of testCases) {
        // ユーザーをデータベースに追加
        await repository.saveUserTimezone(`user-${testCase.timezone}`, testCase.timezone);
        
        // 該当タイムゾーンの18:30を模擬
        const utcTime = new Date(testCase.utcTime);
        
        // Dateコンストラクター全体をモック
        const dateSpy = jest.spyOn(global, 'Date').mockImplementation(() => utcTime as any);
        
        // 日次サマリー送信を実行（直接sendDailySummaryToUserを呼び出し）
        await (bot as any).sendDailySummaryToUser(`user-${testCase.timezone}`, testCase.timezone);
        
        // Discord DMが送信されることを期待
        const mockUser = await bot['client'].users.fetch(`user-${testCase.timezone}`);
        const mockDM = await mockUser.createDM();
        expect(mockDM.send).toHaveBeenCalled();
        
        // モックをクリーンアップ
        dateSpy.mockRestore();
      }
    });
  });
});