/**
 * TimezoneServiceのテスト
 */

import { TimezoneService } from '../../services/timezoneService';

describe('TimezoneServiceのテスト', () => {
  let timezoneService: TimezoneService;
  let mockRepository: any;

  beforeEach(() => {
    // モックリポジトリを作成
    mockRepository = {
      getUserTimezone: jest.fn(),
    };
    
    // 環境変数をテスト用に設定
    process.env.TZ = 'Asia/Tokyo';
  });

  afterEach(() => {
    // 環境変数のクリーンアップ
    delete process.env.ADMIN_DISPLAY_TIMEZONE;
  });

  describe('getUserTimezone', () => {
    test('リポジトリが注入されていない場合はデフォルト値を返す', async () => {
      timezoneService = new TimezoneService();
      const result = await timezoneService.getUserTimezone('user123');

      expect(result).toBe('Asia/Tokyo');
    });

    test('リポジトリからタイムゾーンを取得できる場合', async () => {
      mockRepository.getUserTimezone.mockResolvedValue('Asia/Kolkata');
      timezoneService = new TimezoneService(mockRepository);
      
      const result = await timezoneService.getUserTimezone('user123');

      expect(result).toBe('Asia/Kolkata');
      expect(mockRepository.getUserTimezone).toHaveBeenCalledWith('user123');
    });

    test('リポジトリからnullが返された場合はデフォルト値を返す', async () => {
      mockRepository.getUserTimezone.mockResolvedValue(null);
      timezoneService = new TimezoneService(mockRepository);
      
      const result = await timezoneService.getUserTimezone('user123');

      expect(result).toBe('Asia/Tokyo');
      expect(mockRepository.getUserTimezone).toHaveBeenCalledWith('user123');
    });

    test('リポジトリでエラーが発生した場合はデフォルト値を返す', async () => {
      mockRepository.getUserTimezone.mockRejectedValue(new Error('DB Error'));
      timezoneService = new TimezoneService(mockRepository);
      
      const result = await timezoneService.getUserTimezone('user123');

      expect(result).toBe('Asia/Tokyo');
      expect(mockRepository.getUserTimezone).toHaveBeenCalledWith('user123');
    });
  });

  describe('getSystemTimezone', () => {
    test('環境変数TZからタイムゾーンを取得する', () => {
      timezoneService = new TimezoneService();
      const result = timezoneService.getSystemTimezone();

      expect(result).toBe('Asia/Tokyo');
    });

    test('環境変数が未設定の場合はデフォルトを返す', () => {
      delete process.env.TZ;
      timezoneService = new TimezoneService();
      
      const result = timezoneService.getSystemTimezone();

      expect(result).toBe('Asia/Tokyo');
    });
  });

  describe('getAdminDisplayTimezone', () => {
    test('Cookieタイムゾーンが有効な場合はそれを返す', () => {
      timezoneService = new TimezoneService();
      const result = timezoneService.getAdminDisplayTimezone('UTC');

      expect(result).toBe('UTC');
    });

    test('Cookieタイムゾーンが無効な場合はシステムデフォルトを返す', () => {
      timezoneService = new TimezoneService();
      const result = timezoneService.getAdminDisplayTimezone('Invalid/Timezone');

      expect(result).toBe('Asia/Tokyo');
    });

    test('Cookieタイムゾーンがない場合は環境変数を確認する', () => {
      process.env.ADMIN_DISPLAY_TIMEZONE = 'Asia/Kolkata';
      timezoneService = new TimezoneService();

      const result = timezoneService.getAdminDisplayTimezone();

      expect(result).toBe('Asia/Kolkata');
    });

    test('Cookie・環境変数ともにない場合はシステムデフォルトを返す', () => {
      delete process.env.ADMIN_DISPLAY_TIMEZONE;
      timezoneService = new TimezoneService();

      const result = timezoneService.getAdminDisplayTimezone();

      expect(result).toBe('Asia/Tokyo');
    });
  });

  describe('getSupportedTimezones', () => {
    test('サポートされる3つのタイムゾーンを返す', () => {
      timezoneService = new TimezoneService();
      const result = timezoneService.getSupportedTimezones();

      expect(result).toEqual(['Asia/Tokyo', 'Asia/Kolkata', 'UTC']);
    });
  });

  describe('validateTimezone', () => {
    test('有効なタイムゾーンの場合はtrueを返す', () => {
      timezoneService = new TimezoneService();
      expect(timezoneService.validateTimezone('Asia/Tokyo')).toBe(true);
      expect(timezoneService.validateTimezone('UTC')).toBe(true);
      expect(timezoneService.validateTimezone('Asia/Kolkata')).toBe(true);
    });

    test('無効なタイムゾーンの場合はfalseを返す', () => {
      timezoneService = new TimezoneService();
      expect(timezoneService.validateTimezone('Invalid/Timezone')).toBe(false);
      expect(timezoneService.validateTimezone('')).toBe(false);
    });
  });
});