/**
 * 🟢 Green Phase: ActivityLogCrudServiceの簡略化テスト
 * 基本CRUD操作専門サービスの最小限動作確認
 */

import { ActivityLogCrudService } from '../../services/activityLogCrudService';
import { IActivityLogRepository } from '../../repositories/activityLogRepository';
import { IGeminiService } from '../../services/interfaces/IGeminiService';
import { ITimezoneService } from '../../services/interfaces/ITimezoneService';
import { ActivityLog } from '../../types/activityLog';

describe('🟢 Green Phase: ActivityLogCrudServiceの簡略化テスト', () => {
  let service: ActivityLogCrudService;
  let mockRepository: any;
  let mockGeminiService: any;
  let mockTimezoneService: any;

  beforeEach(() => {
    // 簡略化されたモック
    mockRepository = {
      saveLog: jest.fn(),
      getLogById: jest.fn(),
      updateLog: jest.fn(),
      deleteLog: jest.fn(),
    };

    mockGeminiService = {
      analyzeActivity: jest.fn(),
    };

    mockTimezoneService = {
      getCurrentTime: jest.fn(),
    };

    service = new ActivityLogCrudService(
      mockRepository,
      mockGeminiService,
      mockTimezoneService
    );
  });

  describe('recordActivity', () => {
    test('基本的な活動記録が正常に動作する', async () => {
      const userId = 'user123';
      const content = 'プロジェクト会議を実施';
      const timezone = 'Asia/Tokyo';

      const expectedLog: ActivityLog = {
        id: 'log123',
        userId,
        content,
        inputTimestamp: '2024-07-29T10:00:00.000Z',
        businessDate: '2024-07-29',
        isDeleted: false,
        createdAt: '2024-07-29T10:00:00.000Z',
        updatedAt: '2024-07-29T10:00:00.000Z',
      };

      mockRepository.saveLog.mockResolvedValue(expectedLog);

      const result = await service.recordActivity(userId, content, timezone);

      expect(result).toEqual(expectedLog);
      expect(mockRepository.saveLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          content,
        })
      );
    });

    test('空の内容でエラーが発生する', async () => {
      const userId = 'user123';
      const content = '';
      const timezone = 'Asia/Tokyo';

      await expect(
        service.recordActivity(userId, content, timezone)
      ).rejects.toThrow('活動内容が空です');
    });
  });

  describe('editLog', () => {
    test('ログ編集が正常に動作する', async () => {
      const request = {
        logId: 'log123',
        newContent: '更新されたプロジェクト会議',
        timezone: 'Asia/Tokyo',
      };

      const existingLog: ActivityLog = {
        id: 'log123',
        userId: 'user123',
        content: 'プロジェクト会議を実施',
        inputTimestamp: '2024-07-29T10:00:00.000Z',
        businessDate: '2024-07-29',
        isDeleted: false,
        createdAt: '2024-07-29T10:00:00.000Z',
        updatedAt: '2024-07-29T10:00:00.000Z',
      };

      const updatedLog = { ...existingLog, content: request.newContent };

      mockRepository.getLogById.mockResolvedValue(existingLog);
      mockRepository.updateLog.mockResolvedValue(updatedLog);

      const result = await service.editLog(request);

      expect(result).toEqual(updatedLog);
      expect(mockRepository.getLogById).toHaveBeenCalledWith('log123');
      expect(mockRepository.updateLog).toHaveBeenCalledWith('log123', request.newContent);
    });
  });

  describe('deleteLog', () => {
    test('ログ削除が正常に動作する', async () => {
      const request = {
        logId: 'log123',
        timezone: 'Asia/Tokyo',
      };

      const existingLog: ActivityLog = {
        id: 'log123',
        userId: 'user123',
        content: 'プロジェクト会議を実施',
        inputTimestamp: '2024-07-29T10:00:00.000Z',
        businessDate: '2024-07-29',
        isDeleted: false,
        createdAt: '2024-07-29T10:00:00.000Z',
        updatedAt: '2024-07-29T10:00:00.000Z',
      };

      const deletedLog = { ...existingLog, isDeleted: true };

      mockRepository.getLogById.mockResolvedValue(existingLog);
      mockRepository.deleteLog.mockResolvedValue(deletedLog);

      const result = await service.deleteLog(request);

      expect(result).toEqual(deletedLog);
      expect(mockRepository.deleteLog).toHaveBeenCalledWith('log123');
    });
  });
});