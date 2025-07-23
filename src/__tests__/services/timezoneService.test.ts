/**
 * TimezoneServiceのテスト
 */

import { TimezoneService } from '../../services/timezoneService';

describe('TimezoneServiceのテスト', () => {
  let timezoneService: TimezoneService;

  beforeEach(() => {
    // Cookieベースの実装のため、引数なしでインスタンス化
    timezoneService = new TimezoneService();
    
    // 環境変数をテスト用に設定
    process.env.TZ = 'Asia/Tokyo';
  });

  afterEach(() => {
    // 環境変数のクリーンアップ
    delete process.env.ADMIN_DISPLAY_TIMEZONE;
  });

  describe('getUserTimezone', () => {
    test('常にシステムデフォルトを返す（現在未使用機能）', async () => {
      const result = await timezoneService.getUserTimezone('user123');

      expect(result).toBe('Asia/Tokyo');
    });
  });

  describe('getSystemTimezone', () => {
    test('環境変数TZからタイムゾーンを取得する', () => {
      const result = timezoneService.getSystemTimezone();

      expect(result).toBe('Asia/Tokyo');
    });

    test('環境変数が未設定の場合はデフォルトを返す', () => {
      delete process.env.TZ;
      
      const result = timezoneService.getSystemTimezone();

      expect(result).toBe('Asia/Tokyo');
    });
  });

  describe('getAdminDisplayTimezone', () => {
    test('Cookieタイムゾーンが有効な場合はそれを返す', () => {
      const result = timezoneService.getAdminDisplayTimezone('UTC');

      expect(result).toBe('UTC');
    });

    test('Cookieタイムゾーンが無効な場合はシステムデフォルトを返す', () => {
      const result = timezoneService.getAdminDisplayTimezone('Invalid/Timezone');

      expect(result).toBe('Asia/Tokyo');
    });

    test('Cookieタイムゾーンがない場合は環境変数を確認する', () => {
      process.env.ADMIN_DISPLAY_TIMEZONE = 'Asia/Kolkata';

      const result = timezoneService.getAdminDisplayTimezone();

      expect(result).toBe('Asia/Kolkata');
    });

    test('Cookie・環境変数ともにない場合はシステムデフォルトを返す', () => {
      delete process.env.ADMIN_DISPLAY_TIMEZONE;

      const result = timezoneService.getAdminDisplayTimezone();

      expect(result).toBe('Asia/Tokyo');
    });
  });

  describe('getSupportedTimezones', () => {
    test('サポートされる3つのタイムゾーンを返す', () => {
      const result = timezoneService.getSupportedTimezones();

      expect(result).toEqual(['Asia/Tokyo', 'Asia/Kolkata', 'UTC']);
    });
  });

  describe('validateTimezone', () => {
    test('有効なタイムゾーンの場合はtrueを返す', () => {
      expect(timezoneService.validateTimezone('Asia/Tokyo')).toBe(true);
      expect(timezoneService.validateTimezone('UTC')).toBe(true);
      expect(timezoneService.validateTimezone('Asia/Kolkata')).toBe(true);
    });

    test('無効なタイムゾーンの場合はfalseを返す', () => {
      expect(timezoneService.validateTimezone('Invalid/Timezone')).toBe(false);
      expect(timezoneService.validateTimezone('')).toBe(false);
    });
  });
});