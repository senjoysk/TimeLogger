/**
 * TimezoneServiceのテスト
 */

import { TimezoneService } from '../../services/timezoneService';
import { IConfigService } from '../../interfaces/dependencies';
import { IActivityLogRepository } from '../../repositories/activityLogRepository';

describe('🔴 Red Phase: TimezoneServiceのテスト', () => {
  let timezoneService: TimezoneService;
  let mockConfigService: jest.Mocked<IConfigService>;
  let mockRepository: any;

  beforeEach(() => {
    mockConfigService = {
      getDefaultTimezone: jest.fn().mockReturnValue('Asia/Tokyo'),
      getDiscordToken: jest.fn(),
      getGeminiApiKey: jest.fn(),
      getDatabasePath: jest.fn(),
      isDebugMode: jest.fn(),
      getServerPort: jest.fn(),
      validate: jest.fn()
    };

    // モックリポジトリ（any型でgetUserTimezoneメソッドを追加）
    mockRepository = {
      saveLog: jest.fn(),
      getLogsByBusinessDate: jest.fn(),
      getBusinessDateInfo: jest.fn(),
      saveAnalysisCache: jest.fn(),
      getAnalysisCache: jest.fn(),
      getDailyAnalysisResult: jest.fn(),
      // 追加のメソッド（SqliteActivityLogRepositoryにのみ存在）
      getUserTimezone: jest.fn(),
      saveUserTimezone: jest.fn()
    } as any;

    timezoneService = new TimezoneService(mockConfigService, mockRepository);
  });

  describe('getUserTimezone', () => {
    test('ユーザー設定が存在する場合はそれを返す', async () => {
      // ユーザー設定でAsia/Kolkataが設定されている場合
      (mockRepository as any).getUserTimezone.mockResolvedValue('Asia/Kolkata');

      const result = await timezoneService.getUserTimezone('user123');

      expect(result).toBe('Asia/Kolkata');
      expect(mockRepository.getUserTimezone).toHaveBeenCalledWith('user123');
    });

    test('ユーザー設定が存在しない場合はシステムデフォルトを返す', async () => {
      // ユーザー設定が存在しない場合
      (mockRepository as any).getUserTimezone.mockResolvedValue(null);

      const result = await timezoneService.getUserTimezone('user123');

      expect(result).toBe('Asia/Tokyo');
      expect(mockConfigService.getDefaultTimezone).toHaveBeenCalled();
    });

    test('リポジトリエラー時はシステムデフォルトを返す', async () => {
      // データベースエラーが発生した場合
      (mockRepository as any).getUserTimezone.mockRejectedValue(new Error('DB Error'));

      const result = await timezoneService.getUserTimezone('user123');

      expect(result).toBe('Asia/Tokyo');
    });
  });

  describe('getSystemTimezone', () => {
    test('ConfigServiceからデフォルトタイムゾーンを取得する', () => {
      const result = timezoneService.getSystemTimezone();

      expect(result).toBe('Asia/Tokyo');
      expect(mockConfigService.getDefaultTimezone).toHaveBeenCalled();
    });
  });

  describe('getAdminDisplayTimezone', () => {
    test('セッションタイムゾーンが有効な場合はそれを返す', () => {
      const result = timezoneService.getAdminDisplayTimezone('UTC');

      expect(result).toBe('UTC');
    });

    test('セッションタイムゾーンが無効な場合はシステムデフォルトを返す', () => {
      const result = timezoneService.getAdminDisplayTimezone('Invalid/Timezone');

      expect(result).toBe('Asia/Tokyo');
    });

    test('セッションタイムゾーンがない場合はシステムデフォルトを返す', () => {
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