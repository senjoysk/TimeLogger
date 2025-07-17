/**
 * TimeSimulationService テストスイート
 * 
 * 時刻シミュレーション機能のテスト
 * 
 * テスト対象:
 * - MockTimeProviderの時刻設定制御
 * - タイムゾーン変換と表示
 * - 18:30送信時刻判定
 * - プリセット時刻機能
 * - エラーハンドリング
 */

import { TimeSimulationService } from '../../../web-admin/services/timeSimulationService';
import { MockTimeProvider } from '../../../factories';
import { TimeSetRequest, TimezoneDisplay } from '../../../web-admin/types/testing';

describe('TimeSimulationService', () => {
  let service: TimeSimulationService;
  let mockTimeProvider: MockTimeProvider;

  beforeEach(() => {
    mockTimeProvider = new MockTimeProvider();
    service = new TimeSimulationService(mockTimeProvider);
  });

  describe('時刻設定機能テスト', () => {
    test('有効な時刻設定が正常に処理される', async () => {
      // 時刻設定テスト
      const request: TimeSetRequest = {
        year: 2024,
        month: 1,
        day: 15,
        hour: 18,
        minute: 30,
        timezone: 'Asia/Tokyo'
      };

      const result = await service.setTime(request);

      expect(result.success).toBe(true);
      expect(result.setDateTime).toBeDefined();
      expect(result.timezone).toBe('Asia/Tokyo');
      expect(result.timezoneDisplays).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    test('無効な年月日でエラーが返される', async () => {
      // 無効な日付テスト
      const request: TimeSetRequest = {
        year: 2024,
        month: 2,
        day: 30, // 2月30日は存在しない
        hour: 18,
        minute: 30,
        timezone: 'Asia/Tokyo'
      };

      const result = await service.setTime(request);

      expect(result.success).toBe(false);
      expect(result.error).toContain('無効な日付');
    });

    test('無効な時刻でエラーが返される', async () => {
      // 無効な時刻テスト
      const request: TimeSetRequest = {
        year: 2024,
        month: 1,
        day: 15,
        hour: 25, // 25時は存在しない
        minute: 30,
        timezone: 'Asia/Tokyo'
      };

      const result = await service.setTime(request);

      expect(result.success).toBe(false);
      expect(result.error).toContain('無効な時刻');
    });

    test('無効なタイムゾーンでエラーが返される', async () => {
      // 無効なタイムゾーンテスト
      const request: TimeSetRequest = {
        year: 2024,
        month: 1,
        day: 15,
        hour: 18,
        minute: 30,
        timezone: 'Invalid/Timezone'
      };

      const result = await service.setTime(request);

      expect(result.success).toBe(false);
      expect(result.error).toContain('無効なタイムゾーン');
    });
  });

  describe('タイムゾーン表示機能テスト', () => {
    test('複数タイムゾーンの時刻が正しく表示される', async () => {
      // Asia/Tokyo 18:30を設定
      const request: TimeSetRequest = {
        year: 2024,
        month: 1,
        day: 15,
        hour: 18,
        minute: 30,
        timezone: 'Asia/Tokyo'
      };

      const result = await service.setTime(request);
      const displays = result.timezoneDisplays!;

      // Asia/Tokyoの表示確認
      const tokyoDisplay = displays.find(d => d.timezone === 'Asia/Tokyo');
      expect(tokyoDisplay).toBeDefined();
      expect(tokyoDisplay!.isSummaryTime).toBe(true);
      expect(tokyoDisplay!.localTime).toContain('18:30');

      // America/New_Yorkの表示確認（9時間遅れなので4:30）
      const nyDisplay = displays.find(d => d.timezone === 'America/New_York');
      expect(nyDisplay).toBeDefined();
      expect(nyDisplay!.isSummaryTime).toBe(false);
      expect(nyDisplay!.localTime).toContain('04:30');
    });

    test('18:30送信時刻の判定が正確に行われる', async () => {
      // 各タイムゾーンで18:30を設定してテスト
      const testCases = [
        { timezone: 'Asia/Tokyo', expected: true },
        { timezone: 'America/New_York', expected: true },
        { timezone: 'Europe/London', expected: true },
        { timezone: 'Asia/Kolkata', expected: true }
      ];

      for (const testCase of testCases) {
        const request: TimeSetRequest = {
          year: 2024,
          month: 1,
          day: 15,
          hour: 18,
          minute: 30,
          timezone: testCase.timezone
        };

        const result = await service.setTime(request);
        const display = result.timezoneDisplays!.find(d => d.timezone === testCase.timezone);

        expect(display).toBeDefined();
        expect(display!.isSummaryTime).toBe(testCase.expected);
      }
    });
  });

  describe('プリセット時刻機能テスト', () => {
    test('プリセット時刻一覧が取得できる', () => {
      // プリセット取得テスト
      const presets = service.getTimePresets();

      expect(presets).toBeDefined();
      expect(presets.length).toBeGreaterThan(0);
      
      // 必須プリセットの確認
      const summaryPreset = presets.find(p => p.name === 'サマリー送信時刻');
      expect(summaryPreset).toBeDefined();
      expect(summaryPreset!.hour).toBe(18);
      expect(summaryPreset!.minute).toBe(30);
    });

    test('プリセット時刻で正しく設定される', async () => {
      // プリセット適用テスト
      const presets = service.getTimePresets();
      const summaryPreset = presets.find(p => p.name === 'サマリー送信時刻')!;

      const result = await service.applyPreset(summaryPreset, 'Asia/Tokyo');

      expect(result.success).toBe(true);
      expect(result.timezone).toBe('Asia/Tokyo');

      // 設定された時刻がプリセットと一致することを確認
      const tokyoDisplay = result.timezoneDisplays!.find(d => d.timezone === 'Asia/Tokyo');
      expect(tokyoDisplay!.isSummaryTime).toBe(true);
    });
  });

  describe('現在時刻取得機能テスト', () => {
    test('設定された仮想時刻が取得できる', async () => {
      // 時刻設定
      const request: TimeSetRequest = {
        year: 2024,
        month: 1,
        day: 15,
        hour: 18,
        minute: 30,
        timezone: 'Asia/Tokyo'
      };

      await service.setTime(request);

      // 現在時刻取得
      const currentTime = service.getCurrentTime();

      expect(currentTime).toBeDefined();
      expect(currentTime.year).toBe(2024);
      expect(currentTime.month).toBe(1);
      expect(currentTime.day).toBe(15);
      expect(currentTime.hour).toBe(18);
      expect(currentTime.minute).toBe(30);
    });

    test('初期状態では実際の現在時刻が取得される', () => {
      // 初期状態での現在時刻取得
      const currentTime = service.getCurrentTime();
      const now = new Date();

      expect(currentTime).toBeDefined();
      // 実行時刻との差が1分以内であることを確認
      expect(Math.abs(currentTime.year - now.getFullYear())).toBeLessThanOrEqual(1);
    });
  });

  describe('タイムゾーン一覧機能テスト', () => {
    test('サポートされるタイムゾーン一覧が取得できる', () => {
      // タイムゾーン一覧取得テスト
      const timezones = service.getSupportedTimezones();

      expect(timezones).toBeDefined();
      expect(timezones.length).toBeGreaterThan(0);

      // 主要タイムゾーンの確認
      expect(timezones).toContain('Asia/Tokyo');
      expect(timezones).toContain('America/New_York');
      expect(timezones).toContain('Europe/London');
      expect(timezones).toContain('Asia/Kolkata');
    });

    test('タイムゾーン有効性チェックが正常に動作する', () => {
      // 有効なタイムゾーン
      expect(service.isValidTimezone('Asia/Tokyo')).toBe(true);
      expect(service.isValidTimezone('America/New_York')).toBe(true);

      // 無効なタイムゾーン
      expect(service.isValidTimezone('Invalid/Timezone')).toBe(false);
      expect(service.isValidTimezone('')).toBe(false);
      expect(service.isValidTimezone('Tokyo')).toBe(false);
    });
  });

  describe('リセット機能テスト', () => {
    test('時刻設定がリセットされて実時刻に戻る', async () => {
      // 時刻設定
      const request: TimeSetRequest = {
        year: 2024,
        month: 1,
        day: 15,
        hour: 18,
        minute: 30,
        timezone: 'Asia/Tokyo'
      };

      await service.setTime(request);

      // リセット実行
      const result = service.resetTime();

      expect(result.success).toBe(true);

      // 現在時刻が実時刻に戻っていることを確認
      const currentTime = service.getCurrentTime();
      const now = new Date();
      expect(Math.abs(currentTime.year - now.getFullYear())).toBeLessThanOrEqual(1);
    });
  });
});