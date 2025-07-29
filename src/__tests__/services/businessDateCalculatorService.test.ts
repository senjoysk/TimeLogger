/**
 * BusinessDateCalculatorServiceのテスト
 * ビジネス日付計算専門サービスのテスト実装
 */

import { BusinessDateCalculatorService } from '../../services/businessDateCalculatorService';
import { IActivityLogRepository } from '../../repositories/activityLogRepository';
import { BusinessDateInfo } from '../../types/activityLog';

describe('BusinessDateCalculatorServiceのテスト', () => {
  let service: BusinessDateCalculatorService;
  let mockRepository: any;

  beforeEach(() => {
    // 簡略化されたモック
    mockRepository = {
      calculateBusinessDate: jest.fn(),
    };

    service = new BusinessDateCalculatorService(mockRepository);
  });

  afterEach(() => {
    // jest.spyOn のクリーンアップ
    jest.restoreAllMocks();
  });

  describe('calculateBusinessDate', () => {
    test('指定日のビジネス日付を計算する', () => {
      const timezone = 'Asia/Tokyo';
      const targetDate = '2024-07-29T10:30:00.000Z';

      const expectedBusinessDateInfo: BusinessDateInfo = {
        businessDate: '2024-07-29',
        startTime: '2024-07-28T20:00:00.000Z', // 5am JST
        endTime: '2024-07-29T19:59:59.999Z',   // 4:59am JST next day
        timezone,
      };

      mockRepository.calculateBusinessDate.mockReturnValue(expectedBusinessDateInfo);

      const result = service.calculateBusinessDate(timezone, targetDate);

      expect(result).toEqual(expectedBusinessDateInfo);
      expect(mockRepository.calculateBusinessDate).toHaveBeenCalledWith(targetDate, timezone);
    });

    test('日付未指定時は現在時刻でビジネス日付を計算する', () => {
      const timezone = 'Asia/Tokyo';
      const now = new Date();
      const nowISOString = now.toISOString();

      const expectedBusinessDateInfo: BusinessDateInfo = {
        businessDate: '2024-07-29',
        startTime: '2024-07-28T20:00:00.000Z', // 5am JST
        endTime: '2024-07-29T19:59:59.999Z',   // 4:59am JST next day
        timezone,
      };

      // Date.now をモック化
      jest.spyOn(global, 'Date').mockImplementation(() => now);
      mockRepository.calculateBusinessDate.mockReturnValue(expectedBusinessDateInfo);

      const result = service.calculateBusinessDate(timezone);

      expect(result).toEqual(expectedBusinessDateInfo);
      expect(mockRepository.calculateBusinessDate).toHaveBeenCalledWith(nowISOString, timezone);
    });

    test('異なるタイムゾーンでビジネス日付を計算する', () => {
      const timezone = 'America/New_York';
      const targetDate = '2024-07-29T02:30:00.000Z'; // NYでは前日

      const expectedBusinessDateInfo: BusinessDateInfo = {
        businessDate: '2024-07-28',
        startTime: '2024-07-27T20:00:00.000Z', // 5am EST prev day
        endTime: '2024-07-28T19:59:59.999Z',   // 4:59am EST
        timezone,
      };

      mockRepository.calculateBusinessDate.mockReturnValue(expectedBusinessDateInfo);

      const result = service.calculateBusinessDate(timezone, targetDate);

      expect(result).toEqual(expectedBusinessDateInfo);
      expect(mockRepository.calculateBusinessDate).toHaveBeenCalledWith(targetDate, timezone);
    });

    test('無効な日付文字列でエラーが発生する', () => {
      const timezone = 'Asia/Tokyo';
      const invalidDate = 'invalid-date';

      mockRepository.calculateBusinessDate.mockImplementation(() => {
        throw new Error('Invalid date');
      });

      expect(() => {
        service.calculateBusinessDate(timezone, invalidDate);
      }).toThrow('ビジネス日付の計算に失敗しました');
    });

    test('リポジトリエラーを適切にハンドリングする', () => {
      const timezone = 'Asia/Tokyo';
      const targetDate = '2024-07-29T10:30:00.000Z';

      mockRepository.calculateBusinessDate.mockImplementation(() => {
        throw new Error('Repository error');
      });

      expect(() => {
        service.calculateBusinessDate(timezone, targetDate);
      }).toThrow('ビジネス日付の計算に失敗しました');
    });
  });

  describe('getCurrentBusinessDate', () => {
    test('現在のビジネス日付文字列を取得する', () => {
      const timezone = 'Asia/Tokyo';
      const now = new Date();
      const nowISOString = now.toISOString();

      const expectedBusinessDateInfo: BusinessDateInfo = {
        businessDate: '2024-07-29',
        startTime: '2024-07-28T20:00:00.000Z', // 5am JST
        endTime: '2024-07-29T19:59:59.999Z',   // 4:59am JST next day
        timezone,
      };

      // Date.now をモック化
      jest.spyOn(global, 'Date').mockImplementation(() => now);
      mockRepository.calculateBusinessDate.mockReturnValue(expectedBusinessDateInfo);

      const result = service.getCurrentBusinessDate(timezone);

      expect(result).toBe('2024-07-29');
      expect(mockRepository.calculateBusinessDate).toHaveBeenCalledWith(nowISOString, timezone);
    });

    test('デフォルトタイムゾーンで現在のビジネス日付を取得する', () => {
      const now = new Date();
      const nowISOString = now.toISOString();

      const expectedBusinessDateInfo: BusinessDateInfo = {
        businessDate: '2024-07-29',
        startTime: '2024-07-28T20:00:00.000Z', // 5am JST
        endTime: '2024-07-29T19:59:59.999Z',   // 4:59am JST next day
        timezone: 'Asia/Tokyo',
      };

      // Date.now をモック化
      jest.spyOn(global, 'Date').mockImplementation(() => now);
      mockRepository.calculateBusinessDate.mockReturnValue(expectedBusinessDateInfo);

      const result = service.getCurrentBusinessDate();

      expect(result).toBe('2024-07-29');
      expect(mockRepository.calculateBusinessDate).toHaveBeenCalledWith(nowISOString, 'Asia/Tokyo');
    });
  });

  describe('isToday', () => {
    test('指定日が今日かどうか判定する', () => {
      const timezone = 'Asia/Tokyo';
      const targetDate = '2024-07-29';
      const now = new Date();
      const nowISOString = now.toISOString();

      const currentBusinessDateInfo: BusinessDateInfo = {
        businessDate: '2024-07-29',
        startTime: '2024-07-28T20:00:00.000Z', // 5am JST
        endTime: '2024-07-29T19:59:59.999Z',   // 4:59am JST next day
        timezone,
      };

      // Date.now をモック化
      jest.spyOn(global, 'Date').mockImplementation(() => now);
      mockRepository.calculateBusinessDate.mockReturnValue(currentBusinessDateInfo);

      const result = service.isToday(targetDate, timezone);

      expect(result).toBe(true);
    });

    test('指定日が今日でない場合はfalseを返す', () => {
      const timezone = 'Asia/Tokyo';
      const targetDate = '2024-07-28';
      const now = new Date();
      const nowISOString = now.toISOString();

      const currentBusinessDateInfo: BusinessDateInfo = {
        businessDate: '2024-07-29',
        startTime: '2024-07-28T20:00:00.000Z', // 5am JST
        endTime: '2024-07-29T19:59:59.999Z',   // 4:59am JST next day
        timezone,
      };

      // Date.now をモック化
      jest.spyOn(global, 'Date').mockImplementation(() => now);
      mockRepository.calculateBusinessDate.mockReturnValue(currentBusinessDateInfo);

      const result = service.isToday(targetDate, timezone);

      expect(result).toBe(false);
    });
  });
});