/**
 * ActivityLogCompositeServiceのテスト
 * 分割されたサービス群を統合するコンポジットサービスのテスト実装
 */

import { ActivityLogCompositeService } from '../../services/activityLogCompositeService';
import { ActivityLogCrudService } from '../../services/activityLogCrudService';
import { ActivityLogQueryService } from '../../services/activityLogQueryService';
import { ActivityLogFormattingService } from '../../services/activityLogFormattingService';
import { BusinessDateCalculatorService } from '../../services/businessDateCalculatorService';
import { IActivityLogRepository } from '../../repositories/activityLogRepository';
import { ITimezoneService } from '../../services/interfaces/ITimezoneService';
import { ActivityLog } from '../../types/activityLog';

describe('ActivityLogCompositeServiceのテスト', () => {
  let service: ActivityLogCompositeService;
  let mockRepository: any;
  let mockTimezoneService: any;
  let mockCrudService: jest.Mocked<ActivityLogCrudService>;
  let mockQueryService: jest.Mocked<ActivityLogQueryService>;
  let mockFormattingService: jest.Mocked<ActivityLogFormattingService>;
  let mockDateCalculatorService: jest.Mocked<BusinessDateCalculatorService>;

  beforeEach(() => {
    // リポジトリとタイムゾーンサービスのモック
    mockRepository = {
      saveLog: jest.fn(),
      getLogById: jest.fn(),
      updateLog: jest.fn(),
      deleteLog: jest.fn(),
      getLogsByDate: jest.fn(),
      getLatestLogs: jest.fn(),
      searchLogs: jest.fn(),
      calculateBusinessDate: jest.fn(),
    };

    mockTimezoneService = {
      getCurrentTime: jest.fn(),
    };

    // 各専門サービスのモック
    mockCrudService = {
      recordActivity: jest.fn(),
      editLog: jest.fn(),
      deleteLog: jest.fn(),
    } as any;

    mockQueryService = {
      getLogsForDate: jest.fn(),
      getLatestLogs: jest.fn(),
      searchLogs: jest.fn(),
      getStatistics: jest.fn(),
    } as any;

    mockFormattingService = {
      formatLogsForEdit: jest.fn(),
      formatSearchResults: jest.fn(),
    } as any;

    mockDateCalculatorService = {
      calculateBusinessDate: jest.fn(),
      getCurrentBusinessDate: jest.fn(),
      isToday: jest.fn(),
    } as any;

    service = new ActivityLogCompositeService(
      mockCrudService,
      mockQueryService,
      mockFormattingService,
      mockDateCalculatorService
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('recordActivity', () => {
    test('CRUD サービスに活動記録を委譲する', async () => {
      const userId = 'user123';
      const content = 'プロジェクト会議を実施しました';
      const timezone = 'Asia/Tokyo';
      const inputTime = '2024-07-29T10:30:00.000Z';

      const expectedLog: ActivityLog = {
        id: 'log1',
        userId,
        content,
        inputTimestamp: inputTime,
        businessDate: '2024-07-29',
        isDeleted: false,
        createdAt: inputTime,
        updatedAt: inputTime,
      };

      mockCrudService.recordActivity.mockResolvedValue(expectedLog);

      const result = await service.recordActivity(userId, content, timezone, inputTime);

      expect(result).toEqual(expectedLog);
      expect(mockCrudService.recordActivity).toHaveBeenCalledWith(userId, content, timezone, inputTime, undefined);
    });

    test('AI分析結果付きで活動記録を委譲する', async () => {
      const userId = 'user123';
      const content = 'プロジェクト会議を実施しました';
      const timezone = 'Asia/Tokyo';
      const aiAnalysis = {
        timeEstimation: {
          startTime: '2024-07-29T10:30:00.000Z',
          endTime: '2024-07-29T11:30:00.000Z',
          duration: 60,
          confidence: 0.9,
          source: 'ai_estimation' as const,
        },
        activityContent: {
          mainActivity: 'プロジェクト会議',
          subActivities: [],
          structuredContent: 'プロジェクト会議を実施しました',
          extractedKeywords: ['会議', 'プロジェクト'],
        },
        activityCategory: {
          primaryCategory: '会議',
          subCategory: 'プロジェクト管理',
          tags: ['会議', 'プロジェクト', '管理'],
        },
        analysisMetadata: {
          confidence: 0.9,
          reminderReplyContext: false,
          warnings: [],
        },
      };

      const expectedLog: ActivityLog = {
        id: 'log1',
        userId,
        content,
        inputTimestamp: '2024-07-29T10:30:00.000Z',
        businessDate: '2024-07-29',
        isDeleted: false,
        createdAt: '2024-07-29T10:30:00.000Z',
        updatedAt: '2024-07-29T10:30:00.000Z',
        startTime: aiAnalysis.timeEstimation.startTime,
        endTime: aiAnalysis.timeEstimation.endTime,
        totalMinutes: aiAnalysis.timeEstimation.duration,
        confidence: aiAnalysis.timeEstimation.confidence,
        categories: aiAnalysis.activityCategory.primaryCategory,
        analysisMethod: 'ai_estimation',
      };

      mockCrudService.recordActivity.mockResolvedValue(expectedLog);

      const result = await service.recordActivity(userId, content, timezone, undefined, aiAnalysis);

      expect(result).toEqual(expectedLog);
      expect(mockCrudService.recordActivity).toHaveBeenCalledWith(userId, content, timezone, undefined, aiAnalysis);
    });
  });

  describe('getLogsForDate', () => {
    test('Query サービスに日付別ログ取得を委譲する', async () => {
      const userId = 'user123';
      const businessDate = '2024-07-29';
      const timezone = 'Asia/Tokyo';

      const expectedLogs: ActivityLog[] = [
        {
          id: 'log1',
          userId,
          content: '会議を実施',
          inputTimestamp: '2024-07-29T10:00:00.000Z',
          businessDate,
          isDeleted: false,
          createdAt: '2024-07-29T10:00:00.000Z',
          updatedAt: '2024-07-29T10:00:00.000Z',
        },
      ];

      mockQueryService.getLogsForDate.mockResolvedValue(expectedLogs);

      const result = await service.getLogsForDate(userId, businessDate, timezone);

      expect(result).toEqual(expectedLogs);
      expect(mockQueryService.getLogsForDate).toHaveBeenCalledWith(userId, businessDate, timezone);
    });
  });

  describe('formatLogsForEdit', () => {
    test('Formatting サービスに編集用フォーマットを委譲する', () => {
      const logs: ActivityLog[] = [
        {
          id: 'log1',
          userId: 'user123',
          content: '会議を実施',
          inputTimestamp: '2024-07-29T10:00:00.000Z',
          businessDate: '2024-07-29',
          isDeleted: false,
          createdAt: '2024-07-29T10:00:00.000Z',
          updatedAt: '2024-07-29T10:00:00.000Z',
        },
      ];
      const timezone = 'Asia/Tokyo';
      const expectedFormat = '📝 **今日の活動ログ一覧:**\n\n1. [19:00] 会議を実施\n\n**使用方法:**\n`!edit <番号> <新しい内容>` - ログを編集';

      mockFormattingService.formatLogsForEdit.mockReturnValue(expectedFormat);

      const result = service.formatLogsForEdit(logs, timezone);

      expect(result).toBe(expectedFormat);
      expect(mockFormattingService.formatLogsForEdit).toHaveBeenCalledWith(logs, timezone);
    });
  });

  describe('calculateBusinessDate', () => {
    test('DateCalculator サービスにビジネス日付計算を委譲する', () => {
      const timezone = 'Asia/Tokyo';
      const targetDate = '2024-07-29T10:30:00.000Z';
      const expectedBusinessDateInfo = {
        businessDate: '2024-07-29',
        startTime: '2024-07-28T20:00:00.000Z',
        endTime: '2024-07-29T19:59:59.999Z',
        timezone,
      };

      mockDateCalculatorService.calculateBusinessDate.mockReturnValue(expectedBusinessDateInfo);

      const result = service.calculateBusinessDate(timezone, targetDate);

      expect(result).toEqual(expectedBusinessDateInfo);
      expect(mockDateCalculatorService.calculateBusinessDate).toHaveBeenCalledWith(timezone, targetDate);
    });
  });


  describe('統合機能テスト', () => {
    test('複数サービスを組み合わせた処理フローが正常に動作する', async () => {
      const userId = 'user123';
      const content = 'プロジェクト会議を実施しました';
      const timezone = 'Asia/Tokyo';

      // 1. 活動記録
      const recordedLog: ActivityLog = {
        id: 'log1',
        userId,
        content,
        inputTimestamp: '2024-07-29T10:30:00.000Z',
        businessDate: '2024-07-29',
        isDeleted: false,
        createdAt: '2024-07-29T10:30:00.000Z',
        updatedAt: '2024-07-29T10:30:00.000Z',
      };

      mockCrudService.recordActivity.mockResolvedValue(recordedLog);

      // 2. 日付別ログ取得
      const logsForDate = [recordedLog];
      mockQueryService.getLogsForDate.mockResolvedValue(logsForDate);

      // 3. 編集用フォーマット
      const formattedLogs = '📝 **今日の活動ログ一覧:**\n\n1. [19:30] プロジェクト会議を実施しました\n\n**使用方法:**';
      mockFormattingService.formatLogsForEdit.mockReturnValue(formattedLogs);

      // テスト実行
      const recordResult = await service.recordActivity(userId, content, timezone);
      const logsResult = await service.getLogsForDate(userId, '2024-07-29', timezone);
      const formatResult = service.formatLogsForEdit(logsResult, timezone);

      // 検証
      expect(recordResult).toEqual(recordedLog);
      expect(logsResult).toEqual(logsForDate);
      expect(formatResult).toBe(formattedLogs);

      // 各サービスが適切に呼ばれたことを確認
      expect(mockCrudService.recordActivity).toHaveBeenCalledWith(userId, content, timezone, undefined, undefined);
      expect(mockQueryService.getLogsForDate).toHaveBeenCalledWith(userId, '2024-07-29', timezone);
      expect(mockFormattingService.formatLogsForEdit).toHaveBeenCalledWith(logsResult, timezone);
    });
  });
});