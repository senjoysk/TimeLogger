/**
 * DynamicReportScheduler テストスイート
 * 
 * 🔴 Red Phase: 動的cronスケジューラーの失敗するテストを作成
 * 
 * テスト対象:
 * - タイムゾーン追加時のcronジョブ作成
 * - 同一UTC時刻でのcron再利用
 * - ユーザー離脱時のcron削除
 * - UTC時刻計算の正確性
 */

import { DynamicReportScheduler } from '../../services/dynamicReportScheduler';

// モック
jest.mock('node-cron');
const mockCron = require('node-cron');

describe('DynamicReportScheduler', () => {
  let scheduler: DynamicReportScheduler;
  let mockCronJob: any;

  beforeEach(() => {
    // cronジョブのモック
    mockCronJob = {
      destroy: jest.fn(),
    };
    mockCron.schedule = jest.fn().mockReturnValue(mockCronJob);
    
    scheduler = new DynamicReportScheduler();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('🔴 Red Phase: cronジョブ作成テスト', () => {
    test('should create cron job for new timezone', async () => {
      // 🔴 Red: まだ実装していないのでエラーになる
      
      // 初期状態: cronジョブなし
      expect(scheduler.getActiveJobCount()).toBe(0);
      
      // Asia/Tokyo追加
      await scheduler.onTimezoneChanged('user1', null, 'Asia/Tokyo');
      
      // UTC 09:30用のcronジョブが作成される
      expect(scheduler.getActiveJobCount()).toBe(1);
      expect(scheduler.hasJobForUtcTime(9, 30)).toBe(true);
      
      // cronスケジュールが正しく設定される
      expect(mockCron.schedule).toHaveBeenCalledWith(
        '30 9 * * *', // Asia/Tokyo 18:30 = UTC 09:30
        expect.any(Function)
      );
    });

    test('should reuse existing cron for same UTC time', async () => {
      // 🔴 Red: UTC時刻の重複利用テスト
      
      // Asia/Tokyo (UTC 09:30)
      await scheduler.onTimezoneChanged('user1', null, 'Asia/Tokyo');
      expect(scheduler.getActiveJobCount()).toBe(1);
      
      // Asia/Seoul (UTC 09:30) - 同じUTC時刻
      await scheduler.onTimezoneChanged('user2', null, 'Asia/Seoul');
      expect(scheduler.getActiveJobCount()).toBe(1); // 増えない
      
      // cronは一度だけ作成される
      expect(mockCron.schedule).toHaveBeenCalledTimes(1);
    });

    test('should remove cron when no users in timezone', async () => {
      // 🔴 Red: 不要cronの削除テスト
      
      // ユーザー追加
      await scheduler.onTimezoneChanged('user1', null, 'Asia/Tokyo');
      expect(scheduler.getActiveJobCount()).toBe(1);
      
      // ユーザーが別タイムゾーンに移動
      await scheduler.onTimezoneChanged('user1', 'Asia/Tokyo', 'America/New_York');
      
      // Asia/Tokyo用が削除、America/New_York用が作成
      expect(scheduler.hasJobForUtcTime(9, 30)).toBe(false);
      expect(scheduler.hasJobForUtcTime(23, 30)).toBe(true);
      expect(mockCronJob.destroy).toHaveBeenCalledTimes(1);
    });
  });

  describe('🔴 Red Phase: UTC時刻計算テスト', () => {
    test('should calculate correct UTC time for Asia/Tokyo', () => {
      // 🔴 Red: タイムゾーン→UTC変換テスト
      const utcTime = scheduler.calculateUtcTimeFor1830('Asia/Tokyo');
      expect(utcTime).toEqual({ hour: 9, minute: 30 });
    });
    
    test('should calculate correct UTC time for America/New_York', () => {
      const utcTime = scheduler.calculateUtcTimeFor1830('America/New_York');
      expect(utcTime).toEqual({ hour: 23, minute: 30 });
    });
    
    test('should calculate correct UTC time for Asia/Kolkata', () => {
      // Asia/Kolkata は UTC+5:30なので、18:30 IST = 13:00 UTC
      const utcTime = scheduler.calculateUtcTimeFor1830('Asia/Kolkata');
      expect(utcTime).toEqual({ hour: 13, minute: 0 });
    });
    
    test('should calculate correct UTC time for Europe/London', () => {
      // Europe/London は UTC+0なので、18:30 GMT = 18:30 UTC
      const utcTime = scheduler.calculateUtcTimeFor1830('Europe/London');
      expect(utcTime).toEqual({ hour: 18, minute: 30 });
    });
  });

  describe('🔴 Red Phase: ユーザー管理テスト', () => {
    test('should track users by timezone', async () => {
      // 🔴 Red: タイムゾーン別ユーザー管理
      
      await scheduler.onTimezoneChanged('user1', null, 'Asia/Tokyo');
      await scheduler.onTimezoneChanged('user2', null, 'Asia/Tokyo');
      await scheduler.onTimezoneChanged('user3', null, 'America/New_York');
      
      // タイムゾーン別ユーザー数
      expect(scheduler.getUserCountForTimezone('Asia/Tokyo')).toBe(2);
      expect(scheduler.getUserCountForTimezone('America/New_York')).toBe(1);
      expect(scheduler.getUserCountForTimezone('Europe/London')).toBe(0);
    });

    test('should handle user timezone changes correctly', async () => {
      // 🔴 Red: ユーザーのタイムゾーン変更
      
      // 初期設定
      await scheduler.onTimezoneChanged('user1', null, 'Asia/Tokyo');
      expect(scheduler.getUserCountForTimezone('Asia/Tokyo')).toBe(1);
      
      // タイムゾーン変更
      await scheduler.onTimezoneChanged('user1', 'Asia/Tokyo', 'Europe/London');
      expect(scheduler.getUserCountForTimezone('Asia/Tokyo')).toBe(0);
      expect(scheduler.getUserCountForTimezone('Europe/London')).toBe(1);
    });
  });

  describe('🔴 Red Phase: 初期化テスト', () => {
    test('should initialize with existing user timezones', async () => {
      // 🔴 Red: アプリ起動時の既存ユーザー読み込み
      
      // モックデータ準備
      const mockRepository = {
        getAllUserTimezones: jest.fn().mockResolvedValue([
          { user_id: 'user1', timezone: 'Asia/Tokyo' },
          { user_id: 'user2', timezone: 'Asia/Tokyo' },
          { user_id: 'user3', timezone: 'America/New_York' },
          { user_id: 'user4', timezone: 'Asia/Kolkata' },
        ])
      };
      
      scheduler.setRepository(mockRepository);
      
      // 初期化実行
      await scheduler.initialize();
      
      // 必要なcronジョブが作成される
      expect(scheduler.getActiveJobCount()).toBe(3); // UTC 09:30, 23:30, 13:00
      expect(scheduler.hasJobForUtcTime(9, 30)).toBe(true);   // Asia/Tokyo
      expect(scheduler.hasJobForUtcTime(23, 30)).toBe(true);  // America/New_York  
      expect(scheduler.hasJobForUtcTime(13, 0)).toBe(true);   // Asia/Kolkata
    });

    test('should handle empty user list during initialization', async () => {
      // 🔴 Red: ユーザーがいない場合の初期化
      
      const mockRepository = {
        getAllUserTimezones: jest.fn().mockResolvedValue([])
      };
      
      scheduler.setRepository(mockRepository);
      await scheduler.initialize();
      
      // cronジョブなし
      expect(scheduler.getActiveJobCount()).toBe(0);
    });
  });

  describe('🔴 Red Phase: エラーハンドリングテスト', () => {
    test('should handle invalid timezone gracefully', async () => {
      // 🔴 Red: 無効なタイムゾーンの処理
      
      await expect(async () => {
        await scheduler.onTimezoneChanged('user1', null, 'Invalid/Timezone');
      }).not.toThrow();
      
      // エラーが発生してもcronジョブは作成されない
      expect(scheduler.getActiveJobCount()).toBe(0);
    });

    test('should handle cron creation failure gracefully', async () => {
      // 🔴 Red: cron作成失敗時の処理
      
      mockCron.schedule.mockImplementation(() => {
        throw new Error('Cron creation failed');
      });
      
      await expect(async () => {
        await scheduler.onTimezoneChanged('user1', null, 'Asia/Tokyo');
      }).not.toThrow();
      
      expect(scheduler.getActiveJobCount()).toBe(0);
    });
  });

  describe('🔴 Red Phase: 状態管理テスト', () => {
    test('should provide active job status', () => {
      // 🔴 Red: アクティブなcronジョブの状態取得
      
      expect(scheduler.getActiveCronSchedule()).toEqual([]);
      expect(scheduler.getActiveJobCount()).toBe(0);
      expect(scheduler.getTimezoneDistribution()).toEqual({});
    });

    test('should provide debug information', async () => {
      // 🔴 Red: デバッグ情報の提供
      
      await scheduler.onTimezoneChanged('user1', null, 'Asia/Tokyo');
      await scheduler.onTimezoneChanged('user2', null, 'America/New_York');
      
      const debugInfo = scheduler.getDebugInfo();
      expect(debugInfo).toHaveProperty('activeJobs');
      expect(debugInfo).toHaveProperty('timezoneUserMap');
      expect(debugInfo).toHaveProperty('utcTimeToTimezones');
    });
  });
});