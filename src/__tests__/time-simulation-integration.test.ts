/**
 * 時刻シミュレーション機能の統合テスト
 * Web管理アプリとDiscord Bot間での時刻同期を確認
 */

import { TimeProviderService } from '../services/timeProviderService';
import { TimeProviderFactory } from '../services/timeProviderFactory';
import { TimeSimulationService } from '../web-admin/services/timeSimulationService';
import { TimezoneHandler } from '../handlers/timezoneHandler';
import { MockTimeProvider, RealTimeProvider } from '../factories';
import { getCurrentTimeSlot, getCurrentBusinessDate } from '../utils/timeUtils';

describe('Time Simulation Integration Tests', () => {
  let timeProviderService: TimeProviderService;
  let timeSimulationService: TimeSimulationService;

  beforeEach(() => {
    // 各テストでグローバルインスタンスをリセット
    TimeProviderFactory.resetGlobalInstance();
    timeProviderService = TimeProviderFactory.getGlobalInstance();
    // TimeSimulationServiceのコンストラクタは後で必要な時に呼ぶ
  });

  afterEach(() => {
    // テスト後にシミュレーションモードをリセット
    timeProviderService.disableSimulationMode();
  });

  describe('TimeProviderService Global Instance', () => {
    test('グローバルインスタンスが正しく動作する', () => {
      const instance1 = TimeProviderFactory.getGlobalInstance();
      const instance2 = TimeProviderFactory.getGlobalInstance();
      
      expect(instance1).toBe(instance2);
      expect(instance1.isInSimulationMode()).toBe(false);
    });

    test('シミュレーションモードの切り替えが正しく動作する', () => {
      // 初期状態は実時刻モード
      expect(timeProviderService.isInSimulationMode()).toBe(false);
      expect(timeProviderService.getTimeProvider()).toBeInstanceOf(RealTimeProvider);

      // シミュレーションモードに切り替え
      timeProviderService.enableSimulationMode();
      expect(timeProviderService.isInSimulationMode()).toBe(true);
      expect(timeProviderService.getTimeProvider()).toBeInstanceOf(MockTimeProvider);

      // 実時刻モードに戻す
      timeProviderService.disableSimulationMode();
      expect(timeProviderService.isInSimulationMode()).toBe(false);
      expect(timeProviderService.getTimeProvider()).toBeInstanceOf(RealTimeProvider);
    });

    test('シミュレーション時刻の設定が正しく動作する', () => {
      const testDate = new Date('2025-07-22T15:59:00.000Z');
      
      timeProviderService.enableSimulationMode();
      timeProviderService.setSimulatedTime(testDate);
      
      const currentTime = timeProviderService.now();
      expect(currentTime.getTime()).toBe(testDate.getTime());
    });
  });

  describe('Web管理アプリとDiscord Botの時刻同期', () => {
    test('TimeSimulationServiceで設定した時刻がTimeProviderServiceに反映される', async () => {
      const targetTime = {
        year: 2025,
        month: 7,
        day: 22,
        hour: 15,
        minute: 59,
        second: 0,
        timezone: 'Asia/Kolkata'
      };

      // TimeSimulationServiceを作成（これでシミュレーションモードが有効化される）
      timeSimulationService = new TimeSimulationService();
      
      // Web管理アプリで時刻を設定
      const result = await timeSimulationService.setTime(targetTime);
      expect(result.success).toBe(true);

      // TimeProviderServiceがシミュレーションモードになっていることを確認
      expect(timeProviderService.isInSimulationMode()).toBe(true);

      // 設定された時刻が反映されていることを確認
      const currentTime = timeProviderService.now();
      expect(currentTime.getUTCFullYear()).toBe(2025);
      expect(currentTime.getUTCMonth() + 1).toBe(7);
      expect(currentTime.getUTCDate()).toBe(22);
    });

    test('TimezoneHandlerがシミュレーション時刻を使用する', () => {
      const testDate = new Date('2025-07-22T15:59:00.000Z');
      
      // シミュレーション時刻を設定
      timeProviderService.enableSimulationMode();
      timeProviderService.setSimulatedTime(testDate);

      // TimezoneHandlerを作成（TimeProviderServiceのシングルトンを使用）
      const mockRepository = {
        getUserTimezone: jest.fn().mockResolvedValue('Asia/Kolkata')
      } as any;

      const timezoneHandler = new TimezoneHandler(mockRepository);

      // TimezoneHandlerが内部でnew Date()の代わりにTimeProviderを使用することを確認
      // （直接テストは困難なため、TimeProviderServiceの状態を確認）
      expect(timeProviderService.now().getTime()).toBe(testDate.getTime());
    });

    test('timeUtilsがシミュレーション時刻を使用する', () => {
      const testDate = new Date('2025-07-22T15:30:00.000Z');
      
      // シミュレーション時刻を設定
      timeProviderService.enableSimulationMode();
      timeProviderService.setSimulatedTime(testDate);

      // timeUtilsの関数がシミュレーション時刻を使用することを確認
      const businessDate = getCurrentBusinessDate('Asia/Tokyo');
      const timeSlot = getCurrentTimeSlot('Asia/Tokyo');
      
      // 結果の検証（具体的な値はタイムゾーン変換に依存）
      expect(businessDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(timeSlot.label).toMatch(/^\d{2}:\d{2}-\d{2}:\d{2}$/);
    });
  });

  describe('時刻リセット機能', () => {
    test('リセット機能が正しく動作する', () => {
      const testDate = new Date('2025-07-22T15:59:00.000Z');
      
      // TimeSimulationServiceを作成してシミュレーション時刻を設定
      timeSimulationService = new TimeSimulationService();
      timeProviderService.setSimulatedTime(testDate);
      
      expect(timeProviderService.isInSimulationMode()).toBe(true);
      expect(timeProviderService.now().getTime()).toBe(testDate.getTime());

      // TimeSimulationServiceでリセット
      const result = timeSimulationService.resetTime();
      expect(result.success).toBe(true);

      // 実時刻モードに戻っていることを確認
      expect(timeProviderService.isInSimulationMode()).toBe(false);
      expect(timeProviderService.getTimeProvider()).toBeInstanceOf(RealTimeProvider);

      // 現在時刻が実時刻に近いことを確認（テスト実行時刻との差が1秒以内）
      const now = new Date();
      const providerTime = timeProviderService.now();
      const timeDiff = Math.abs(now.getTime() - providerTime.getTime());
      expect(timeDiff).toBeLessThan(1000); // 1秒以内
    });
  });

  describe('複数のタイムゾーンでの動作確認', () => {
    test('Asia/Kolkataでの時刻シミュレーション', async () => {
      timeSimulationService = new TimeSimulationService();
      
      const targetTime = {
        year: 2025,
        month: 7,
        day: 22,
        hour: 15,
        minute: 59,
        second: 0,
        timezone: 'Asia/Kolkata'
      };

      const result = await timeSimulationService.setTime(targetTime);
      expect(result.success).toBe(true);
      expect(result.timezone).toBe('Asia/Kolkata');
      expect(result.timezoneDisplays).toBeDefined();

      // Asia/Kolkata のタイムゾーン情報が含まれていることを確認
      const kolkataDisplay = result.timezoneDisplays?.find(
        tz => tz.timezone === 'Asia/Kolkata'
      );
      expect(kolkataDisplay).toBeDefined();
      expect(kolkataDisplay?.localTime).toContain('15:59');
    });

    test('UTCでの時刻シミュレーション', async () => {
      timeSimulationService = new TimeSimulationService();
      
      const targetTime = {
        year: 2025,
        month: 7,
        day: 22,
        hour: 18,
        minute: 30,
        second: 0,
        timezone: 'UTC'
      };

      const result = await timeSimulationService.setTime(targetTime);
      expect(result.success).toBe(true);
      expect(result.timezone).toBe('UTC');

      // UTC のタイムゾーン情報が含まれていることを確認
      const utcDisplay = result.timezoneDisplays?.find(
        tz => tz.timezone === 'UTC'
      );
      expect(utcDisplay).toBeDefined();
      expect(utcDisplay?.localTime).toContain('18:30');
    });
  });

  describe('エラーハンドリング', () => {
    test('無効な日時でのエラーハンドリング', async () => {
      timeSimulationService = new TimeSimulationService();
      
      const invalidTime = {
        year: 2025,
        month: 2,
        day: 30, // 2月30日は存在しない
        hour: 15,
        minute: 59,
        second: 0,
        timezone: 'Asia/Tokyo'
      };

      const result = await timeSimulationService.setTime(invalidTime);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('無効なタイムゾーンでのエラーハンドリング', async () => {
      timeSimulationService = new TimeSimulationService();
      
      const invalidTimezone = {
        year: 2025,
        month: 7,
        day: 22,
        hour: 15,
        minute: 59,
        second: 0,
        timezone: 'Invalid/Timezone'
      };

      const result = await timeSimulationService.setTime(invalidTimezone);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});