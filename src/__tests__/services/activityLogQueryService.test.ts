/**
 * 🔴 Red Phase: ActivityLogQueryServiceのテスト
 * データ取得・検索専門サービスのテスト実装
 */

import { ActivityLogQueryService } from '../../services/activityLogQueryService';
import { IActivityLogRepository } from '../../repositories/activityLogRepository';
import { ITimezoneService } from '../../services/interfaces/ITimezoneService';
import { ActivityLog } from '../../types/activityLog';

describe('🔴 Red Phase: ActivityLogQueryServiceのテスト', () => {
  let service: ActivityLogQueryService;
  let mockRepository: any;
  let mockTimezoneService: any;

  beforeEach(() => {
    // 簡略化されたモック
    mockRepository = {
      getLogsByDate: jest.fn(),
      getLatestLogs: jest.fn(),
      searchLogs: jest.fn(),
      getLogCount: jest.fn(),
      getLogCountByDate: jest.fn(),
      getLogsByDateRange: jest.fn(),
      calculateBusinessDate: jest.fn(),
    };

    mockTimezoneService = {
      getCurrentTime: jest.fn(),
    };

    service = new ActivityLogQueryService(
      mockRepository,
      mockTimezoneService
    );
  });

  describe('getLogsForDate', () => {
    test('指定日のログを取得する', async () => {
      const userId = 'user123';
      const businessDate = '2024-07-29';
      const timezone = 'Asia/Tokyo';

      const expectedLogs: ActivityLog[] = [
        {
          id: 'log1',
          userId,
          content: 'プロジェクト会議',
          inputTimestamp: '2024-07-29T10:00:00.000Z',
          businessDate,
          isDeleted: false,
          createdAt: '2024-07-29T10:00:00.000Z',
          updatedAt: '2024-07-29T10:00:00.000Z',
        },
      ];

      mockRepository.getLogsByDate.mockResolvedValue(expectedLogs);

      const result = await service.getLogsForDate(userId, businessDate, timezone);

      expect(result).toEqual(expectedLogs);
      expect(mockRepository.getLogsByDate).toHaveBeenCalledWith(userId, businessDate, false);
    });

    test('業務日未指定時は今日のログを取得する', async () => {
      const userId = 'user123';
      const timezone = 'Asia/Tokyo';
      const todayBusinessDate = '2024-07-29';

      const expectedLogs: ActivityLog[] = [];

      mockRepository.calculateBusinessDate.mockReturnValue({
        businessDate: todayBusinessDate,
        inputDate: '2024-07-29T10:00:00.000Z',
        timezone,
      });
      mockRepository.getLogsByDate.mockResolvedValue(expectedLogs);

      const result = await service.getLogsForDate(userId, undefined, timezone);

      expect(result).toEqual(expectedLogs);
      expect(mockRepository.calculateBusinessDate).toHaveBeenCalled();
      expect(mockRepository.getLogsByDate).toHaveBeenCalledWith(userId, todayBusinessDate, false);
    });
  });

  describe('getLatestLogs', () => {
    test('最新ログを指定件数取得する', async () => {
      const userId = 'user123';
      const count = 3;

      const expectedLogs: ActivityLog[] = [
        {
          id: 'log3',
          userId,
          content: '最新ログ3',
          inputTimestamp: '2024-07-29T12:00:00.000Z',
          businessDate: '2024-07-29',
          isDeleted: false,
          createdAt: '2024-07-29T12:00:00.000Z',
          updatedAt: '2024-07-29T12:00:00.000Z',
        },
        {
          id: 'log2',
          userId,
          content: '最新ログ2',
          inputTimestamp: '2024-07-29T11:00:00.000Z',
          businessDate: '2024-07-29',
          isDeleted: false,
          createdAt: '2024-07-29T11:00:00.000Z',
          updatedAt: '2024-07-29T11:00:00.000Z',
        },
      ];

      mockRepository.getLatestLogs.mockResolvedValue(expectedLogs);

      const result = await service.getLatestLogs(userId, count);

      expect(result).toEqual(expectedLogs);
      expect(mockRepository.getLatestLogs).toHaveBeenCalledWith(userId, count);
    });

    test('件数未指定時はデフォルト5件取得する', async () => {
      const userId = 'user123';
      const expectedLogs: ActivityLog[] = [];

      mockRepository.getLatestLogs.mockResolvedValue(expectedLogs);

      const result = await service.getLatestLogs(userId);

      expect(result).toEqual(expectedLogs);
      expect(mockRepository.getLatestLogs).toHaveBeenCalledWith(userId, 5);
    });
  });

  describe('searchLogs', () => {
    test('キーワードでログを検索する', async () => {
      const userId = 'user123';
      const query = '会議';
      const timezone = 'Asia/Tokyo';
      const limit = 10;

      const expectedLogs: ActivityLog[] = [
        {
          id: 'log1',
          userId,
          content: 'プロジェクト会議を実施',
          inputTimestamp: '2024-07-29T10:00:00.000Z',
          businessDate: '2024-07-29',
          isDeleted: false,
          createdAt: '2024-07-29T10:00:00.000Z',
          updatedAt: '2024-07-29T10:00:00.000Z',
        },
      ];

      const allLogs = [
        ...expectedLogs,
        {
          id: 'log2',
          userId,
          content: 'その他の作業',
          inputTimestamp: '2024-07-29T09:00:00.000Z',
          businessDate: '2024-07-29',
          isDeleted: false,
          createdAt: '2024-07-29T09:00:00.000Z',
          updatedAt: '2024-07-29T09:00:00.000Z',
        },
      ];

      mockRepository.calculateBusinessDate.mockReturnValue({
        businessDate: '2024-07-29',
        inputDate: '2024-07-29T10:00:00.000Z',
        timezone,
      });
      mockRepository.getLogsByDateRange.mockResolvedValue(allLogs);

      const result = await service.searchLogs(userId, query, timezone, limit);

      expect(result).toEqual(expectedLogs);
      expect(mockRepository.getLogsByDateRange).toHaveBeenCalled();
    });

    test('空のクエリでエラーが発生する', async () => {
      const userId = 'user123';
      const query = '';
      const timezone = 'Asia/Tokyo';

      await expect(
        service.searchLogs(userId, query, timezone)
      ).rejects.toThrow('検索クエリが空です');
    });
  });

  describe('getStatistics', () => {
    test('ユーザー統計情報を取得する', async () => {
      const userId = 'user123';
      
      mockRepository.getLogCount.mockResolvedValue(100);
      mockRepository.getLogCountByDate.mockResolvedValue(5);
      mockRepository.getLogsByDateRange.mockResolvedValue([
        { id: '1' }, { id: '2' }, { id: '3' }
      ]);
      mockRepository.calculateBusinessDate.mockReturnValue({
        businessDate: '2024-07-29',
        inputDate: '2024-07-29T10:00:00.000Z',
        timezone: 'Asia/Tokyo',
      });

      const result = await service.getStatistics(userId);

      expect(result).toEqual({
        totalLogs: 100,
        todayLogs: 5,
        weekLogs: 3,
        averageLogsPerDay: 3.3,
      });
      expect(mockRepository.getLogCount).toHaveBeenCalledWith(userId);
    });
  });
});