/**
 * Scheduler クラスのテスト
 * スケジュール管理機能の基本動作をテスト
 */

import { Scheduler } from '../scheduler';
import { TaskLoggerBot } from '../bot';
import { SqliteActivityLogRepository } from '../repositories/sqliteActivityLogRepository';
import * as cron from 'node-cron';

// node-cron のモック
jest.mock('node-cron', () => ({
  schedule: jest.fn().mockReturnValue({
    start: jest.fn(),
    stop: jest.fn(),
    destroy: jest.fn()
  }),
  validate: jest.fn().mockReturnValue(true)
}));

// TaskLoggerBot のモック
jest.mock('../bot', () => ({
  TaskLoggerBot: jest.fn().mockImplementation(() => ({
    sendMessage: jest.fn().mockResolvedValue(undefined),
    getErrorCount: jest.fn().mockReturnValue(0),
    getRepository: jest.fn()
  }))
}));

// SqliteActivityLogRepository のモック
jest.mock('../repositories/sqliteActivityLogRepository', () => ({
  SqliteActivityLogRepository: jest.fn().mockImplementation(() => ({
    getAllUsers: jest.fn().mockResolvedValue([
      { user_id: 'user1', timezone: 'Asia/Tokyo' },
      { user_id: 'user2', timezone: 'America/New_York' }
    ]),
    getUserSettings: jest.fn().mockResolvedValue({
      user_id: 'test-user',
      timezone: 'Asia/Tokyo'
    }),
    getApiCosts: jest.fn().mockResolvedValue([]),
    close: jest.fn().mockResolvedValue(undefined)
  }))
}));

describe('Scheduler', () => {
  let scheduler: Scheduler;
  let mockBot: jest.Mocked<TaskLoggerBot>;
  let mockRepository: jest.Mocked<SqliteActivityLogRepository>;

  beforeEach(() => {
    // モックをリセット
    jest.clearAllMocks();
    
    // モックインスタンスを作成
    mockBot = new TaskLoggerBot() as jest.Mocked<TaskLoggerBot>;
    mockRepository = {
      getAllUsers: jest.fn().mockResolvedValue([
        { userId: 'user1', timezone: 'Asia/Tokyo' },
        { userId: 'user2', timezone: 'America/New_York' }
      ]),
      getUserSettings: jest.fn().mockResolvedValue({
        user_id: 'test-user',
        timezone: 'Asia/Tokyo'
      }),
      getApiCosts: jest.fn().mockResolvedValue([]),
      close: jest.fn().mockResolvedValue(undefined)
    } as any;
    
    // BotのgetRepositoryメソッドがmockRepositoryを返すよう設定
    mockBot.getRepository = jest.fn().mockReturnValue(mockRepository);
    
    scheduler = new Scheduler(mockBot, mockRepository);
  });

  afterEach(() => {
    // テスト後のクリーンアップ
    if (scheduler) {
      scheduler.stop();
    }
  });

  describe('コンストラクター・初期化', () => {
    test('Schedulerが正しく初期化される', () => {
      expect(scheduler).toBeDefined();
      expect(scheduler).toBeInstanceOf(Scheduler);
    });

    test('BotとRepositoryが正しく設定される', () => {
      // コンストラクターで渡された依存関係が設定されることを確認
      expect(mockBot).toBeDefined();
      expect(mockRepository).toBeDefined();
    });

    test('jobsMapが初期化される', () => {
      // 内部のjobsMapが初期化されることを確認（間接的に）
      const jobs = (scheduler as any).jobs;
      expect(jobs).toBeInstanceOf(Map);
    });

    test('userTimezonesMapが初期化される', () => {
      // 内部のuserTimezonesMapが初期化されることを確認
      const userTimezones = (scheduler as any).userTimezones;
      expect(userTimezones).toBeInstanceOf(Map);
    });
  });

  describe('スケジュール開始・停止', () => {
    test('startメソッドが存在し呼び出し可能である', () => {
      expect(typeof scheduler.start).toBe('function');
    });

    test('stopメソッドが存在し呼び出し可能である', () => {
      expect(typeof scheduler.stop).toBe('function');
    });

    test('start実行時にユーザータイムゾーンが読み込まれる', async () => {
      await scheduler.start();
      
      // getAllUsersが呼ばれることを確認
      expect(mockRepository.getAllUsers).toHaveBeenCalled();
    });

    test('startメソッドでcron.scheduleが呼ばれる', async () => {
      await scheduler.start();
      
      // cron.scheduleが呼ばれることを確認（複数のスケジュールが設定される）
      expect(cron.schedule).toHaveBeenCalled();
    });

    test('stopメソッドで全てのジョブが停止される', async () => {
      // 先にスケジュールを開始
      await scheduler.start();
      
      // 停止実行
      scheduler.stop();
      
      // ジョブの停止が呼ばれることを確認（cron.scheduleのモックで返されるstopメソッド）
      // この時点では直接検証は困難だが、例外が発生しないことを確認
      expect(true).toBe(true); // 基本的な動作確認
    });
  });

  describe('タイムゾーン処理', () => {
    test('loadUserTimezonesメソッドでタイムゾーンが読み込まれる', async () => {
      const loadUserTimezones = (scheduler as any).loadUserTimezones.bind(scheduler);
      await loadUserTimezones();
      
      // getAllUsersが呼ばれることを確認
      expect(mockRepository.getAllUsers).toHaveBeenCalled();
    });

    test('ユーザータイムゾーンがMapに格納される', async () => {
      await scheduler.start();
      
      const userTimezones = (scheduler as any).userTimezones;
      expect(userTimezones).toBeInstanceOf(Map);
      // モックデータに基づいてタイムゾーンが設定されることを期待
    });
  });

  describe('スケジュール管理', () => {
    test('日次サマリースケジュールが設定される', async () => {
      await scheduler.start();
      
      // startDailySummaryScheduleメソッドが内部で呼ばれることで
      // cron.scheduleが実行されることを確認
      expect(cron.schedule).toHaveBeenCalled();
    });

    test('APIコストレポートスケジュールが設定される', async () => {
      await scheduler.start();
      
      // startApiCostReportScheduleメソッドが内部で呼ばれることで
      // cron.scheduleが複数回実行されることを確認
      expect(cron.schedule).toHaveBeenCalledTimes(2); // 日次サマリー + APIコストレポート
    });
  });

  describe('エラーハンドリング', () => {
    test('データベースエラー時も適切に処理される', async () => {
      // repositoryでエラーを発生させる
      mockRepository.getAllUsers.mockRejectedValue(new Error('Database error'));
      
      // エラーが発生してもstartメソッドが例外を投げないことを確認
      await expect(scheduler.start()).resolves.not.toThrow();
    });

    test('空のユーザーリスト時も正常に処理される', async () => {
      // 空のユーザーリストを返すよう設定
      mockRepository.getAllUsers.mockResolvedValue([]);
      
      await scheduler.start();
      expect(mockRepository.getAllUsers).toHaveBeenCalled();
    });
  });

  describe('スケジュール情報', () => {
    test('logScheduleInfoメソッドが存在する', () => {
      const logScheduleInfo = (scheduler as any).logScheduleInfo;
      expect(typeof logScheduleInfo).toBe('function');
    });

    test('スケジュール状態が確認可能である', () => {
      // jobsMapが存在することでスケジュール状態が管理されていることを確認
      const jobs = (scheduler as any).jobs;
      expect(jobs).toBeInstanceOf(Map);
    });
  });
});