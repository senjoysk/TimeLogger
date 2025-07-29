/**
 * ActivityLogMatchingCoordinatorServiceのテスト
 * マッチング管理・調整専門サービスのテスト実装
 */

import { ActivityLogMatchingCoordinatorService } from '../../services/activityLogMatchingCoordinatorService';
import { IActivityLogRepository } from '../../repositories/activityLogRepository';
import { IActivityLogMatchingService } from '../../services/activityLogMatchingService';
import { ActivityLog } from '../../types/activityLog';

describe('ActivityLogMatchingCoordinatorServiceのテスト', () => {
  let service: ActivityLogMatchingCoordinatorService;
  let mockRepository: any;
  let mockMatchingService: any;

  beforeEach(() => {
    // 簡略化されたモック
    mockRepository = {
      getUnmatchedLogs: jest.fn(),
      getLogById: jest.fn(),
      updateLogMatching: jest.fn(),
    };

    mockMatchingService = {
      findMatchingCandidatesWithSemantic: jest.fn(),
    };

    service = new ActivityLogMatchingCoordinatorService(
      mockRepository,
      mockMatchingService
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getUnmatchedLogs', () => {
    test('マッチング待ちログを取得する', async () => {
      const userId = 'user123';
      const timezone = 'Asia/Tokyo';

      const startLogs: ActivityLog[] = [
        {
          id: 'start1',
          userId,
          content: '会議を開始しました',
          inputTimestamp: '2024-07-29T10:00:00.000Z',
          businessDate: '2024-07-29',
          isDeleted: false,
          createdAt: '2024-07-29T10:00:00.000Z',
          updatedAt: '2024-07-29T10:00:00.000Z',
          logType: 'start_only',
          matchStatus: 'unmatched',
        },
      ];

      const endLogs: ActivityLog[] = [
        {
          id: 'end1',
          userId,
          content: '会議が終了しました',
          inputTimestamp: '2024-07-29T11:00:00.000Z',
          businessDate: '2024-07-29',
          isDeleted: false,
          createdAt: '2024-07-29T11:00:00.000Z',
          updatedAt: '2024-07-29T11:00:00.000Z',
          logType: 'end_only',
          matchStatus: 'unmatched',
        },
      ];

      mockRepository.getUnmatchedLogs
        .mockResolvedValueOnce(startLogs)
        .mockResolvedValueOnce(endLogs);

      const result = await service.getUnmatchedLogs(userId, timezone);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('start1');
      expect(result[1].id).toBe('end1');
      expect(mockRepository.getUnmatchedLogs).toHaveBeenCalledWith(userId, 'start_only');
      expect(mockRepository.getUnmatchedLogs).toHaveBeenCalledWith(userId, 'end_only');
    });

    test('空の結果を正しく処理する', async () => {
      const userId = 'user123';
      const timezone = 'Asia/Tokyo';

      mockRepository.getUnmatchedLogs
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.getUnmatchedLogs(userId, timezone);

      expect(result).toHaveLength(0);
      expect(result).toEqual([]);
    });
  });

  describe('manualMatchLogs', () => {
    test('手動でログをマッチングする', async () => {
      const startLogId = 'start1';
      const endLogId = 'end1';
      const userId = 'user123';

      const startLog: ActivityLog = {
        id: startLogId,
        userId,
        content: '会議を開始しました',
        inputTimestamp: '2024-07-29T10:00:00.000Z',
        businessDate: '2024-07-29',
        isDeleted: false,
        createdAt: '2024-07-29T10:00:00.000Z',
        updatedAt: '2024-07-29T10:00:00.000Z',
        logType: 'start_only',
        matchStatus: 'unmatched',
      };

      const endLog: ActivityLog = {
        id: endLogId,
        userId,
        content: '会議が終了しました',
        inputTimestamp: '2024-07-29T11:00:00.000Z',
        businessDate: '2024-07-29',
        isDeleted: false,
        createdAt: '2024-07-29T11:00:00.000Z',
        updatedAt: '2024-07-29T11:00:00.000Z',
        logType: 'end_only',
        matchStatus: 'unmatched',
      };

      const updatedStartLog = { ...startLog, matchStatus: 'matched' as const, matchedLogId: endLogId };
      const updatedEndLog = { ...endLog, matchStatus: 'matched' as const, matchedLogId: startLogId };

      mockRepository.getLogById
        .mockResolvedValueOnce(startLog)
        .mockResolvedValueOnce(endLog)
        .mockResolvedValueOnce(updatedStartLog)
        .mockResolvedValueOnce(updatedEndLog);

      mockRepository.updateLogMatching.mockResolvedValue(undefined);

      const result = await service.manualMatchLogs(startLogId, endLogId, userId);

      expect(result.startLog.matchStatus).toBe('matched');
      expect(result.endLog.matchStatus).toBe('matched');
      expect(mockRepository.updateLogMatching).toHaveBeenCalledTimes(2);
    });

    test('存在しないログIDでエラーが発生する', async () => {
      const startLogId = 'nonexistent1';
      const endLogId = 'nonexistent2';
      const userId = 'user123';

      mockRepository.getLogById
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      await expect(
        service.manualMatchLogs(startLogId, endLogId, userId)
      ).rejects.toThrow('指定されたログが見つかりません');
    });

    test('他のユーザーのログでエラーが発生する', async () => {
      const startLogId = 'start1';
      const endLogId = 'end1';
      const userId = 'user123';
      const otherUserId = 'otherUser';

      const startLog: ActivityLog = {
        id: startLogId,
        userId: otherUserId,
        content: '会議を開始しました',
        inputTimestamp: '2024-07-29T10:00:00.000Z',
        businessDate: '2024-07-29',
        isDeleted: false,
        createdAt: '2024-07-29T10:00:00.000Z',
        updatedAt: '2024-07-29T10:00:00.000Z',
        logType: 'start_only',
        matchStatus: 'unmatched',
      };

      const endLog: ActivityLog = {
        id: endLogId,
        userId,
        content: '会議が終了しました',
        inputTimestamp: '2024-07-29T11:00:00.000Z',
        businessDate: '2024-07-29',
        isDeleted: false,
        createdAt: '2024-07-29T11:00:00.000Z',
        updatedAt: '2024-07-29T11:00:00.000Z',
        logType: 'end_only',
        matchStatus: 'unmatched',
      };

      mockRepository.getLogById
        .mockResolvedValueOnce(startLog)
        .mockResolvedValueOnce(endLog);

      await expect(
        service.manualMatchLogs(startLogId, endLogId, userId)
      ).rejects.toThrow('他のユーザーのログをマッチングすることはできません');
    });

    test('不正なログタイプでエラーが発生する', async () => {
      const startLogId = 'log1';
      const endLogId = 'log2';
      const userId = 'user123';

      const log1: ActivityLog = {
        id: startLogId,
        userId,
        content: '完了しました',
        inputTimestamp: '2024-07-29T10:00:00.000Z',
        businessDate: '2024-07-29',
        isDeleted: false,
        createdAt: '2024-07-29T10:00:00.000Z',
        updatedAt: '2024-07-29T10:00:00.000Z',
        logType: 'complete', // 不正なログタイプ
        matchStatus: 'unmatched',
      };

      const log2: ActivityLog = {
        id: endLogId,
        userId,
        content: '他の作業',
        inputTimestamp: '2024-07-29T11:00:00.000Z',
        businessDate: '2024-07-29',
        isDeleted: false,
        createdAt: '2024-07-29T11:00:00.000Z',
        updatedAt: '2024-07-29T11:00:00.000Z',
        logType: 'complete', // 不正なログタイプ
        matchStatus: 'unmatched',
      };

      mockRepository.getLogById
        .mockResolvedValueOnce(log1)
        .mockResolvedValueOnce(log2);

      await expect(
        service.manualMatchLogs(startLogId, endLogId, userId)
      ).rejects.toThrow('開始ログと終了ログのみマッチングできます');
    });
  });

  describe('performAutomaticMatching', () => {
    test('開始ログの自動マッチングを実行する', async () => {
      const userId = 'user123';
      const startLog: ActivityLog = {
        id: 'start1',
        userId,
        content: '会議を開始しました',
        inputTimestamp: '2024-07-29T10:00:00.000Z',
        businessDate: '2024-07-29',
        isDeleted: false,
        createdAt: '2024-07-29T10:00:00.000Z',
        updatedAt: '2024-07-29T10:00:00.000Z',
        logType: 'start_only',
        matchStatus: 'unmatched',
      };

      const endCandidates: ActivityLog[] = [
        {
          id: 'end1',
          userId,
          content: '会議が終了しました',
          inputTimestamp: '2024-07-29T11:00:00.000Z',
          businessDate: '2024-07-29',
          isDeleted: false,
          createdAt: '2024-07-29T11:00:00.000Z',
          updatedAt: '2024-07-29T11:00:00.000Z',
          logType: 'end_only',
          matchStatus: 'unmatched',
        },
      ];

      const matchingCandidates = [
        { logId: 'end1', score: 0.85 }
      ];

      mockRepository.getUnmatchedLogs.mockResolvedValue(endCandidates);
      mockMatchingService.findMatchingCandidatesWithSemantic.mockResolvedValue(matchingCandidates);
      mockRepository.updateLogMatching.mockResolvedValue(undefined);

      await service.performAutomaticMatching(startLog, userId);

      expect(mockRepository.updateLogMatching).toHaveBeenCalledTimes(2);
      expect(mockRepository.updateLogMatching).toHaveBeenCalledWith('start1', {
        matchStatus: 'matched',
        matchedLogId: 'end1',
        similarityScore: 0.85
      });
    });

    test('スコアが閾値以下の場合は自動マッチングしない', async () => {
      const userId = 'user123';
      const startLog: ActivityLog = {
        id: 'start1',
        userId,
        content: '会議を開始しました',
        inputTimestamp: '2024-07-29T10:00:00.000Z',
        businessDate: '2024-07-29',
        isDeleted: false,
        createdAt: '2024-07-29T10:00:00.000Z',
        updatedAt: '2024-07-29T10:00:00.000Z',
        logType: 'start_only',
        matchStatus: 'unmatched',
      };

      const endCandidates: ActivityLog[] = [
        {
          id: 'end1',
          userId,
          content: '別の作業が終了しました',
          inputTimestamp: '2024-07-29T11:00:00.000Z',
          businessDate: '2024-07-29',
          isDeleted: false,
          createdAt: '2024-07-29T11:00:00.000Z',
          updatedAt: '2024-07-29T11:00:00.000Z',
          logType: 'end_only',
          matchStatus: 'unmatched',
        },
      ];

      const matchingCandidates = [
        { logId: 'end1', score: 0.5 } // 閾値0.8以下
      ];

      mockRepository.getUnmatchedLogs.mockResolvedValue(endCandidates);
      mockMatchingService.findMatchingCandidatesWithSemantic.mockResolvedValue(matchingCandidates);
      mockRepository.updateLogMatching.mockResolvedValue(undefined);

      await service.performAutomaticMatching(startLog, userId);

      expect(mockRepository.updateLogMatching).not.toHaveBeenCalled();
    });

    test('マッチング候補がない場合は何もしない', async () => {
      const userId = 'user123';
      const startLog: ActivityLog = {
        id: 'start1',
        userId,
        content: '会議を開始しました',
        inputTimestamp: '2024-07-29T10:00:00.000Z',
        businessDate: '2024-07-29',
        isDeleted: false,
        createdAt: '2024-07-29T10:00:00.000Z',
        updatedAt: '2024-07-29T10:00:00.000Z',
        logType: 'start_only',
        matchStatus: 'unmatched',
      };

      mockRepository.getUnmatchedLogs.mockResolvedValue([]);

      await service.performAutomaticMatching(startLog, userId);

      expect(mockRepository.updateLogMatching).not.toHaveBeenCalled();
    });
  });
});