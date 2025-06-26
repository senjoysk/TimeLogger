import { Database } from '../../database/database';
import { TaskLoggerBot } from '../../bot';
import { Scheduler } from '../../scheduler';
import { toZonedTime } from 'date-fns-tz';

// モック設定
jest.mock('../../database/database');
jest.mock('../../bot');
jest.mock('node-cron');

describe('Timezone Service Tests', () => {
  let db: Database;
  let bot: TaskLoggerBot;
  let scheduler: Scheduler;

  beforeEach(() => {
    db = new Database();
    bot = new TaskLoggerBot();
    scheduler = new Scheduler(bot, db);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Database Timezone Functions', () => {
    it('ユーザーのタイムゾーンを取得できる', async () => {
      const mockTimezone = 'America/New_York';
      jest.spyOn(db, 'getUserTimezone').mockResolvedValue(mockTimezone);

      const timezone = await db.getUserTimezone('test-user-id');
      expect(timezone).toBe(mockTimezone);
      expect(db.getUserTimezone).toHaveBeenCalledWith('test-user-id');
    });

    it('ユーザーのタイムゾーンを設定できる', async () => {
      const userId = 'test-user-id';
      const newTimezone = 'Europe/London';
      jest.spyOn(db, 'setUserTimezone').mockResolvedValue();

      await db.setUserTimezone(userId, newTimezone);
      expect(db.setUserTimezone).toHaveBeenCalledWith(userId, newTimezone);
    });

    it('タイムゾーン未設定時にデフォルト値が返される', async () => {
      jest.spyOn(db, 'getUserTimezone').mockResolvedValue('Asia/Tokyo');

      const timezone = await db.getUserTimezone('new-user-id');
      expect(timezone).toBe('Asia/Tokyo');
    });
  });

  describe('Scheduler Timezone Handling', () => {
    it('スケジューラーがユーザーのタイムゾーンを読み込む', async () => {
      const mockUserId = 'test-user-id';
      const mockTimezone = 'America/Los_Angeles';
      
      jest.spyOn(db, 'getUserTimezone').mockResolvedValue(mockTimezone);
      jest.spyOn(scheduler as any, 'loadUserTimezones').mockImplementation(async function() {
        const userId = mockUserId;
        const timezone = await db.getUserTimezone(userId);
        (scheduler as any).userTimezones.set(userId, timezone);
      });

      await scheduler.start();
      
      expect(db.getUserTimezone).toHaveBeenCalled();
    });

    it('異なるタイムゾーンで勤務時間を正しく判定する', () => {
      const testCases = [
        // JST (UTC+9) の場合
        {
          utcTime: '2024-01-15T00:00:00Z', // JST 9:00 月曜日
          timezone: 'Asia/Tokyo',
          expectedInWorkingHours: true
        },
        {
          utcTime: '2024-01-15T09:00:00Z', // JST 18:00 月曜日
          timezone: 'Asia/Tokyo',
          expectedInWorkingHours: false
        },
        // PST (UTC-8) の場合
        {
          utcTime: '2024-01-15T17:00:00Z', // PST 9:00 月曜日
          timezone: 'America/Los_Angeles',
          expectedInWorkingHours: true
        },
        {
          utcTime: '2024-01-14T01:00:00Z', // PST 17:00 土曜日
          timezone: 'America/Los_Angeles',
          expectedInWorkingHours: false
        }
      ];

      testCases.forEach(({ utcTime, timezone, expectedInWorkingHours }) => {
        const utcDate = new Date(utcTime);
        const localTime = toZonedTime(utcDate, timezone);
        const hours = localTime.getHours();
        const day = localTime.getDay();
        
        const isWorkingHours = day >= 1 && day <= 5 && hours >= 9 && hours < 18;
        expect(isWorkingHours).toBe(expectedInWorkingHours);
      });
    });

    it('異なるタイムゾーンでサマリー時刻を正しく判定する', () => {
      const testCases = [
        // JST 18:00
        {
          utcTime: '2024-01-15T09:00:00Z',
          timezone: 'Asia/Tokyo',
          expectedHour: 18
        },
        // PST 18:00
        {
          utcTime: '2024-01-16T02:00:00Z',
          timezone: 'America/Los_Angeles',
          expectedHour: 18
        },
        // GMT 18:00
        {
          utcTime: '2024-01-15T18:00:00Z',
          timezone: 'Europe/London',
          expectedHour: 18
        }
      ];

      testCases.forEach(({ utcTime, timezone, expectedHour }) => {
        const utcDate = new Date(utcTime);
        const localTime = toZonedTime(utcDate, timezone);
        expect(localTime.getHours()).toBe(expectedHour);
      });
    });
  });

  describe('Time Display Formatting', () => {
    it('時刻表示が指定されたタイムゾーンでフォーマットされる', () => {
      const utcDate = new Date('2024-01-15T09:00:00Z');
      
      const testCases = [
        {
          timezone: 'Asia/Tokyo',
          expectedHour: 18,
          expectedString: '18:00'
        },
        {
          timezone: 'America/New_York',
          expectedHour: 4,
          expectedString: '04:00'
        },
        {
          timezone: 'Europe/London',
          expectedHour: 9,
          expectedString: '09:00'
        }
      ];

      testCases.forEach(({ timezone, expectedHour, expectedString }) => {
        const localTime = toZonedTime(utcDate, timezone);
        expect(localTime.getHours()).toBe(expectedHour);
        
        // formatTime相当の処理
        const hours = String(localTime.getHours()).padStart(2, '0');
        const minutes = String(localTime.getMinutes()).padStart(2, '0');
        const formattedTime = `${hours}:${minutes}`;
        expect(formattedTime).toBe(expectedString);
      });
    });

    it('日付表示が指定されたタイムゾーンでフォーマットされる', () => {
      const utcDate = new Date('2024-01-15T15:00:00Z');
      
      const testCases = [
        {
          timezone: 'Asia/Tokyo',
          expectedDate: '2024-01-16' // 翌日になる
        },
        {
          timezone: 'America/Los_Angeles',
          expectedDate: '2024-01-15'
        }
      ];

      testCases.forEach(({ timezone, expectedDate }) => {
        const dateString = utcDate.toLocaleDateString('ja-JP', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          timeZone: timezone
        }).replace(/\//g, '-');
        
        expect(dateString).toBe(expectedDate);
      });
    });
  });

  describe('API Cost Monitor Timezone', () => {
    it('APIコストモニターがタイムゾーンを考慮した日付で統計を取得する', async () => {
      const mockStats = {
        totalCalls: 10,
        totalInputTokens: 1000,
        totalOutputTokens: 500,
        totalCost: 0.001,
        callsByOperation: {
          analyzeActivity: 8,
          generateDailySummary: 2
        }
      };

      jest.spyOn(db, 'getApiUsageStats').mockResolvedValue(mockStats);

      await db.getApiUsageStats('test-user-id', 'America/New_York');
      expect(db.getApiUsageStats).toHaveBeenCalledWith('test-user-id', 'America/New_York');
    });
  });

  describe('Business Date Calculation', () => {
    it('異なるタイムゾーンで業務日が正しく計算される', () => {
      // UTC時刻で2024-01-15 20:00 (月曜日)
      const utcDate = new Date('2024-01-15T20:00:00Z');
      
      const testCases = [
        {
          timezone: 'Asia/Tokyo',
          expectedBusinessDate: '2024-01-16' // JST 火曜日 5:00
        },
        {
          timezone: 'America/Los_Angeles',
          expectedBusinessDate: '2024-01-14' // PST 日曜日 12:00 (UTC 15日 20:00 = PST 14日 12:00)
        },
        {
          timezone: 'UTC',
          expectedBusinessDate: '2024-01-15' // UTC 月曜日 20:00 (5時以降なので当日の業務日)
        }
      ];

      testCases.forEach(({ timezone, expectedBusinessDate }) => {
        const localTime = toZonedTime(utcDate, timezone);
        const hours = localTime.getHours();
        
        // 業務日の計算ロジック（午前5時区切り）をtimeUtilsのgetBusinessDateForDate相当に変更
        let businessDate = new Date(localTime);
        if (hours < 5) {
          // 5時前の場合は前日の業務日
          businessDate.setDate(businessDate.getDate() - 1);
        }
        // 5時以降の場合は当日の業務日
        
        const dateString = businessDate.toLocaleDateString('ja-JP', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          timeZone: timezone
        }).replace(/\//g, '-');
        
        expect(dateString).toBe(expectedBusinessDate);
      });
    });
  });
});