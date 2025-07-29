/**
 * ActivityLogService テストスイート
 * 新活動記録システムの基本機能テスト
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ActivityLogService } from '../../services/activityLogService';
import { 
  ActivityLog, 
  CreateActivityLogRequest,
  EditLogRequest,
  DeleteLogRequest,
  ActivityLogError 
} from '../../types/activityLog';

// モックRepository
const mockRepository = {
  saveLog: jest.fn(),
  getLogsByDate: jest.fn(),
  getLogById: jest.fn(),
  updateLog: jest.fn(),
  deleteLog: jest.fn(),
  getLatestLogs: jest.fn(),
  getLogCount: jest.fn(),
  getLogCountByDate: jest.fn(),
  getLogsByDateRange: jest.fn(),
  calculateBusinessDate: jest.fn(),
  isConnected: jest.fn(),
  withTransaction: jest.fn(),
  // キャッシュ関連
  saveAnalysisCache: jest.fn(),
  getAnalysisCache: jest.fn(),
  updateAnalysisCache: jest.fn(),
  deleteAnalysisCache: jest.fn(),
  isCacheValid: jest.fn(),
  cleanupOldCaches: jest.fn(),
  // その他
  permanentDeleteLog: jest.fn(),
  restoreLog: jest.fn(),
  close: jest.fn(),
  initialize: jest.fn(),
  searchLogs: jest.fn(),
  getLogsForEdit: jest.fn(),
} as any;

describe('ActivityLogService', () => {
  let service: ActivityLogService;
  const mockUserId = 'test-user-123';
  const mockTimezone = 'Asia/Tokyo';

  beforeEach(() => {
    // モックをリセット
    jest.clearAllMocks();
    
    // サービスインスタンスを作成（GeminiServiceモックも追加）
    const mockGeminiService = {} as any; // 簡易モック
    service = new ActivityLogService(mockRepository as any, mockGeminiService);

    // 基本的なモック設定（今日の日付: 2025-07-29）
    mockRepository.calculateBusinessDate.mockReturnValue({
      businessDate: '2025-07-29',
      startTime: '2025-07-28T20:00:00.000Z',
      endTime: '2025-07-29T19:59:59.999Z',
      timezone: mockTimezone
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('recordActivity', () => {
    test('正常な活動記録が保存される', async () => {
      // Arrange
      const content = 'プログラミングをしています';
      const expectedLog: ActivityLog = {
        id: 'test-log-id',
        userId: mockUserId,
        content,
        inputTimestamp: '2025-07-29T10:00:00.000Z',
        businessDate: '2025-07-29',
        isDeleted: false,
        createdAt: '2025-07-29T10:00:00.000Z',
        updatedAt: '2025-07-29T10:00:00.000Z'
      };

      mockRepository.saveLog.mockResolvedValue(expectedLog);

      // Act
      const result = await service.recordActivity(mockUserId, content, mockTimezone);

      // Assert
      expect(result).toEqual(expectedLog);
      expect(mockRepository.saveLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUserId,
          content: content,
          businessDate: '2025-07-29'
        })
      );
    });

    test('空の内容でエラーが発生する', async () => {
      // Act & Assert
      await expect(service.recordActivity(mockUserId, '', mockTimezone))
        .rejects
        .toThrow(ActivityLogError);
      
      await expect(service.recordActivity(mockUserId, '   ', mockTimezone))
        .rejects
        .toThrow(ActivityLogError);
    });

    test('長すぎる内容でエラーが発生する', async () => {
      // Arrange
      const longContent = 'a'.repeat(2001);

      // Act & Assert
      await expect(service.recordActivity(mockUserId, longContent, mockTimezone))
        .rejects
        .toThrow(ActivityLogError);
    });

    test('Repository エラーが適切に処理される', async () => {
      // Arrange
      const content = 'テスト活動';
      mockRepository.saveLog.mockRejectedValue(new ActivityLogError('Database error', 'SAVE_ERROR'));

      // Act & Assert
      await expect(service.recordActivity(mockUserId, content, mockTimezone))
        .rejects
        .toThrow(ActivityLogError);
    });
  });

  describe('getLogsForDate', () => {
    test('指定日のログが取得される', async () => {
      // Arrange
      const targetDate = '2025-07-29';
      const expectedLogs: ActivityLog[] = [
        {
          id: 'log-1',
          userId: mockUserId,
          content: 'ログ1',
          inputTimestamp: '2025-07-29T09:00:00.000Z',
          businessDate: targetDate,
          isDeleted: false,
          createdAt: '2025-07-29T09:00:00.000Z',
          updatedAt: '2025-07-29T09:00:00.000Z'
        },
        {
          id: 'log-2',
          userId: mockUserId,
          content: 'ログ2',
          inputTimestamp: '2025-07-29T10:00:00.000Z',
          businessDate: targetDate,
          isDeleted: false,
          createdAt: '2025-07-29T10:00:00.000Z',
          updatedAt: '2025-07-29T10:00:00.000Z'
        }
      ];

      mockRepository.getLogsByDate.mockResolvedValue(expectedLogs);

      // Act
      const result = await service.getLogsForDate(mockUserId, targetDate, mockTimezone);

      // Assert
      expect(result).toEqual(expectedLogs);
      expect(mockRepository.getLogsByDate).toHaveBeenCalledWith(mockUserId, targetDate, false);
    });

    test('日付未指定時は今日の日付が使用される', async () => {
      // Arrange
      mockRepository.getLogsByDate.mockResolvedValue([]);

      // Act
      await service.getLogsForDate(mockUserId, undefined, mockTimezone);

      // Assert
      expect(mockRepository.getLogsByDate).toHaveBeenCalledWith(mockUserId, '2025-07-29', false);
    });
  });

  describe('editLog', () => {
    test('ログが正常に編集される', async () => {
      // Arrange
      const logId = 'test-log-id';
      const newContent = '編集後の内容';
      const editRequest: EditLogRequest = {
        logId,
        newContent,
        timezone: mockTimezone
      };

      const existingLog: ActivityLog = {
        id: logId,
        userId: mockUserId,
        content: '編集前の内容',
        inputTimestamp: '2025-07-29T10:00:00.000Z',
        businessDate: '2025-07-29',
        isDeleted: false,
        createdAt: '2025-07-29T10:00:00.000Z',
        updatedAt: '2025-07-29T10:00:00.000Z'
      };

      const updatedLog: ActivityLog = {
        ...existingLog,
        content: newContent,
        updatedAt: '2025-07-29T11:00:00.000Z'
      };

      mockRepository.getLogById.mockResolvedValue(existingLog);
      mockRepository.updateLog.mockResolvedValue(updatedLog);

      // Act
      const result = await service.editLog(editRequest);

      // Assert
      expect(result).toEqual(updatedLog);
      expect(mockRepository.updateLog).toHaveBeenCalledWith(logId, newContent);
    });

    test('存在しないログの編集でエラーが発生する', async () => {
      // Arrange
      const editRequest: EditLogRequest = {
        logId: 'non-existent-id',
        newContent: '新しい内容',
        timezone: mockTimezone
      };

      mockRepository.getLogById.mockResolvedValue(null);

      // Act & Assert
      await expect(service.editLog(editRequest))
        .rejects
        .toThrow(ActivityLogError);
    });

    test('削除済みログの編集でエラーが発生する', async () => {
      // Arrange
      const deletedLog: ActivityLog = {
        id: 'deleted-log-id',
        userId: mockUserId,
        content: '削除済みログ',
        inputTimestamp: '2025-07-29T10:00:00.000Z',
        businessDate: '2025-07-29',
        isDeleted: true,
        createdAt: '2025-07-29T10:00:00.000Z',
        updatedAt: '2025-07-29T10:00:00.000Z'
      };

      const editRequest: EditLogRequest = {
        logId: deletedLog.id,
        newContent: '新しい内容',
        timezone: mockTimezone
      };

      mockRepository.getLogById.mockResolvedValue(deletedLog);

      // Act & Assert
      await expect(service.editLog(editRequest))
        .rejects
        .toThrow(ActivityLogError);
    });

    test('空の新しい内容でエラーが発生する', async () => {
      // Arrange
      const editRequest: EditLogRequest = {
        logId: 'test-log-id',
        newContent: '',
        timezone: mockTimezone
      };

      // Act & Assert
      await expect(service.editLog(editRequest))
        .rejects
        .toThrow(ActivityLogError);
    });
  });

  describe('deleteLog', () => {
    test('ログが正常に削除される', async () => {
      // Arrange
      const logId = 'test-log-id';
      const deleteRequest: DeleteLogRequest = {
        logId,
        timezone: mockTimezone
      };

      const existingLog: ActivityLog = {
        id: logId,
        userId: mockUserId,
        content: 'テストログ',
        inputTimestamp: '2025-07-29T10:00:00.000Z',
        businessDate: '2025-07-29',
        isDeleted: false,
        createdAt: '2025-07-29T10:00:00.000Z',
        updatedAt: '2025-07-29T10:00:00.000Z'
      };

      const deletedLog: ActivityLog = {
        ...existingLog,
        isDeleted: true,
        updatedAt: '2025-07-29T11:00:00.000Z'
      };

      mockRepository.getLogById.mockResolvedValue(existingLog);
      mockRepository.deleteLog.mockResolvedValue(deletedLog);

      // Act
      const result = await service.deleteLog(deleteRequest);

      // Assert
      expect(result).toEqual(deletedLog);
      expect(mockRepository.deleteLog).toHaveBeenCalledWith(logId);
    });

    test('存在しないログの削除でエラーが発生する', async () => {
      // Arrange
      const deleteRequest: DeleteLogRequest = {
        logId: 'non-existent-id',
        timezone: mockTimezone
      };

      mockRepository.getLogById.mockResolvedValue(null);

      // Act & Assert
      await expect(service.deleteLog(deleteRequest))
        .rejects
        .toThrow(ActivityLogError);
    });

    test('既に削除済みのログでエラーが発生する', async () => {
      // Arrange
      const deletedLog: ActivityLog = {
        id: 'deleted-log-id',
        userId: mockUserId,
        content: '削除済みログ',
        inputTimestamp: '2025-07-29T10:00:00.000Z',
        businessDate: '2025-07-29',
        isDeleted: true,
        createdAt: '2025-07-29T10:00:00.000Z',
        updatedAt: '2025-07-29T10:00:00.000Z'
      };

      const deleteRequest: DeleteLogRequest = {
        logId: deletedLog.id,
        timezone: mockTimezone
      };

      mockRepository.getLogById.mockResolvedValue(deletedLog);

      // Act & Assert
      await expect(service.deleteLog(deleteRequest))
        .rejects
        .toThrow(ActivityLogError);
    });
  });

  describe('getStatistics', () => {
    test('統計情報が正常に取得される', async () => {
      // Arrange
      mockRepository.getLogCount.mockResolvedValue(100);
      mockRepository.getLogCountByDate.mockResolvedValue(5);
      mockRepository.getLogsByDateRange.mockResolvedValue(new Array(20).fill({}));

      // Act
      const result = await service.getStatistics(mockUserId);

      // Assert
      expect(result).toEqual({
        totalLogs: 100,
        todayLogs: 5,
        weekLogs: 20,
        averageLogsPerDay: 3.3
      });
    });
  });

  describe('formatLogsForEdit', () => {
    test('編集用フォーマットが正常に生成される', () => {
      // Arrange
      const logs: ActivityLog[] = [
        {
          id: 'log-1',
          userId: mockUserId,
          content: 'プログラミングをしていました',
          inputTimestamp: '2025-07-29T01:30:00.000Z', // 10:30 JST
          businessDate: '2025-07-29',
          isDeleted: false,
          createdAt: '2025-07-29T01:30:00.000Z',
          updatedAt: '2025-07-29T01:30:00.000Z'
        },
        {
          id: 'log-2',
          userId: mockUserId,
          content: '会議に参加していました。非常に長い内容のテストケースです。50文字を超える場合は切り詰められる予定です。',
          inputTimestamp: '2025-07-29T02:00:00.000Z', // 11:00 JST
          businessDate: '2025-07-29',
          isDeleted: false,
          createdAt: '2025-07-29T02:00:00.000Z',
          updatedAt: '2025-07-29T02:00:00.000Z'
        }
      ];

      // Act
      const result = service.formatLogsForEdit(logs, 'Asia/Tokyo');

      // Assert
      expect(result).toContain('📝 **今日の活動ログ一覧:**');
      expect(result).toContain('1. [10:30] プログラミングをしていました');
      expect(result).toContain('2. [11:00] 会議に参加していました。非常に長い内容のテストケースです。50文字を超える場合は切り詰められる...');
      expect(result).toContain('**使用方法:**');
      expect(result).toContain('`!edit <番号> <新しい内容>`');
    });

    test('ログが空の場合のメッセージが生成される', () => {
      // Act
      const result = service.formatLogsForEdit([], mockTimezone);

      // Assert
      expect(result).toBe('📝 今日の活動ログはまだありません。');
    });
  });

  describe('calculateBusinessDate', () => {
    test('業務日が正常に計算される', () => {
      // Act
      const result = service.calculateBusinessDate(mockTimezone);

      // Assert
      expect(mockRepository.calculateBusinessDate).toHaveBeenCalled();
      expect(result).toEqual({
        businessDate: '2025-07-29',
        startTime: '2025-07-28T20:00:00.000Z',
        endTime: '2025-07-29T19:59:59.999Z',
        timezone: mockTimezone
      });
    });

    test('特定日時の業務日が計算される', () => {
      // Arrange
      const targetDate = '2025-07-29T15:00:00.000Z';

      // Act
      service.calculateBusinessDate(mockTimezone, targetDate);

      // Assert
      expect(mockRepository.calculateBusinessDate).toHaveBeenCalledWith(targetDate, mockTimezone);
    });
  });
});