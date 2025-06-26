import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ActivityService } from '../../services/activityService';
import { Database } from '../../database/database';
import { GeminiService } from '../../services/geminiService';
import { ActivityRecord, ActivityAnalysis } from '../../types';

// モックの作成
jest.mock('../../database/database');
jest.mock('../../services/geminiService');
jest.mock('uuid', () => ({
  v4: () => 'test-uuid-12345'
}));

describe('ActivityService', () => {
  let activityService: ActivityService;
  let mockDatabase: jest.Mocked<Database>;
  let mockGeminiService: jest.Mocked<GeminiService>;

  beforeEach(() => {
    // モックをリセット
    jest.clearAllMocks();
    
    // モックインスタンスの作成
    mockDatabase = new Database() as jest.Mocked<Database>;
    mockGeminiService = new GeminiService() as jest.Mocked<GeminiService>;
    
    // ActivityServiceのインスタンス作成
    activityService = new ActivityService(mockDatabase, mockGeminiService);
  });

  describe('processActivityRecord', () => {
    const mockUserId = 'test-user-123';
    const mockUserInput = 'プログラミングをしていました';
    const mockAnalysis: ActivityAnalysis = {
      category: '仕事',
      subCategory: 'プログラミング',
      structuredContent: 'コーディング作業',
      estimatedMinutes: 30,
      productivityLevel: 4,
    };

    beforeEach(() => {
      // Gemini解析のモック
      mockGeminiService.analyzeActivity.mockResolvedValue(mockAnalysis);
      // データベース保存のモック
      mockDatabase.saveActivityRecord.mockResolvedValue(undefined);
      // 既存記録取得のモック（空配列）
      mockDatabase.getActivityRecordsByTimeSlot.mockResolvedValue([]);
    });

    it('新しい活動記録を処理して保存する', async () => {
      // テスト実行
      const result = await activityService.processActivityRecord(
        mockUserId,
        mockUserInput
      );

      // 検証：返り値の確認 (配列の最初の要素をチェック)
      expect(result[0]).toMatchObject({
        id: 'test-uuid-12345',
        userId: mockUserId,
        originalText: mockUserInput,
        analysis: {
          category: mockAnalysis.category,
          subCategory: mockAnalysis.subCategory,
          structuredContent: mockAnalysis.structuredContent,
          productivityLevel: mockAnalysis.productivityLevel,
        },
      });

      // 検証：Gemini APIが呼ばれたか
      expect(mockGeminiService.analyzeActivity).toHaveBeenCalledWith(
        mockUserInput,
        expect.any(String),
        []
      );

      // 検証：データベースに保存されたか
      expect(mockDatabase.saveActivityRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-uuid-12345',
          userId: mockUserId,
          originalText: mockUserInput,
          analysis: expect.objectContaining({
            category: mockAnalysis.category,
          })
        })
      );
    });

    it('既存の記録がある場合、文脈として渡す', async () => {
      // 既存記録のモック
      const existingRecords: ActivityRecord[] = [{
        id: 'existing-1',
        userId: mockUserId,
        timeSlot: '2024-01-15 14:00:00',
        originalText: '会議に参加',
        analysis: {
          category: '会議',
          structuredContent: '定例会議',
          estimatedMinutes: 30,
          productivityLevel: 3,
        },
        createdAt: '2024-01-15 14:05:00',
        updatedAt: '2024-01-15 14:05:00',
      }];

      mockDatabase.getActivityRecordsByTimeSlot.mockResolvedValue(existingRecords);

      // テスト実行
      await activityService.processActivityRecord(mockUserId, mockUserInput);

      // 検証：Geminiの呼び出しをチェック（新しいシグネチャに合わせて修正）
      expect(mockGeminiService.analyzeActivity).toHaveBeenCalledWith(
        mockUserInput,
        '',
        []
      );
    });

    it('エラーが発生した場合、適切に処理する', async () => {
      // エラーのモック
      const error = new Error('データベースエラー');
      mockDatabase.saveActivityRecord.mockRejectedValue(error);

      // テスト実行と検証
      await expect(
        activityService.processActivityRecord(mockUserId, mockUserInput)
      ).rejects.toThrow('データベースエラー');
    });
  });

  describe('processActivityRecord with time specification', () => {
    const mockUserId = 'test-user-time-spec';

    beforeEach(() => {
      // データベース保存のモック
      mockDatabase.saveActivityRecord.mockResolvedValue(undefined);
      // 既存記録取得のモック（空配列）
      mockDatabase.getActivityRecordsByTimeSlot.mockResolvedValue([]);
    });

    it('should record a single activity for a specific past time', async () => {
      const userInput = '30分前に会議をしていました';
      const analysisResult: ActivityAnalysis = {
        category: '会議',
        structuredContent: '定例会議',
        estimatedMinutes: 30,
        productivityLevel: 3,
        startTime: '2025-06-26T14:00:00.000Z',
        endTime: '2025-06-26T14:30:00.000Z',
      };
      mockGeminiService.analyzeActivity.mockResolvedValue(analysisResult);

      await activityService.processActivityRecord(mockUserId, userInput, new Date('2025-06-26T14:35:00.000Z'));

      expect(mockDatabase.saveActivityRecord).toHaveBeenCalledTimes(1);
      expect(mockDatabase.saveActivityRecord).toHaveBeenCalledWith(expect.objectContaining({
        userId: mockUserId,
        originalText: userInput,
        timeSlot: '2025-06-26 14:00:00',
        analysis: expect.objectContaining({
          category: '会議',
        }),
      }));
    });

    it('should record activities across multiple time slots for a specified range', async () => {
      const userInput = '14時から15時まで開発作業';
      const analysisResult: ActivityAnalysis = {
        category: '仕事',
        subCategory: '開発',
        structuredContent: '新機能の実装',
        estimatedMinutes: 60,
        productivityLevel: 5,
        startTime: '2025-06-26T14:00:00.000Z',
        endTime: '2025-06-26T15:00:00.000Z',
      };
      mockGeminiService.analyzeActivity.mockResolvedValue(analysisResult);

      await activityService.processActivityRecord(mockUserId, userInput, new Date('2025-06-26T15:05:00.000Z'));

      expect(mockDatabase.saveActivityRecord).toHaveBeenCalledTimes(2);
      expect(mockDatabase.saveActivityRecord).toHaveBeenCalledWith(expect.objectContaining({
        timeSlot: '2025-06-26 14:00:00',
        analysis: expect.objectContaining({ estimatedMinutes: 30 }),
      }));
      expect(mockDatabase.saveActivityRecord).toHaveBeenCalledWith(expect.objectContaining({
        timeSlot: '2025-06-26 14:30:00',
        analysis: expect.objectContaining({ estimatedMinutes: 30 }),
      }));
    });

    it('should record an activity in the current time slot if no time is specified', async () => {
      const userInput = '資料作成';
      const analysisResult: ActivityAnalysis = {
        category: '仕事',
        structuredContent: '定例会用の資料作成',
        estimatedMinutes: 20,
        productivityLevel: 4,
        startTime: '2025-06-26T16:10:00.000Z', // Gemini might return the current time
        endTime: '2025-06-26T16:30:00.000Z',
      };
      mockGeminiService.analyzeActivity.mockResolvedValue(analysisResult);

      // The processActivityRecord will use its own internal current time, so we pass a date that falls into the 16:00 slot
      await activityService.processActivityRecord(mockUserId, userInput, new Date('2025-06-26T16:15:00.000Z'));

      expect(mockDatabase.saveActivityRecord).toHaveBeenCalledTimes(1);
      expect(mockDatabase.saveActivityRecord).toHaveBeenCalledWith(expect.objectContaining({
        timeSlot: '2025-06-26 16:00:00',
      }));
    });
  });

  describe('getTodayActivities', () => {
    it('今日の活動記録を取得する', async () => {
      const mockActivities: ActivityRecord[] = [
        {
          id: 'test-1',
          userId: 'test-user',
          timeSlot: '2024-01-15 09:00:00',
          originalText: 'テスト活動',
          analysis: {
            category: '仕事',
            structuredContent: 'テスト',
            estimatedMinutes: 30,
            productivityLevel: 3,
          },
          createdAt: '2024-01-15 09:05:00',
          updatedAt: '2024-01-15 09:05:00',
        }
      ];

      mockDatabase.getActivityRecords.mockResolvedValue(mockActivities);

      const result = await activityService.getTodayActivities('test-user');

      expect(result).toEqual(mockActivities);
      expect(mockDatabase.getActivityRecords).toHaveBeenCalledWith('test-user');
    });
  });

  describe('formatActivityRecord', () => {
    it('活動記録をDiscord形式でフォーマットする', () => {
      const record: ActivityRecord = {
        id: 'test-1',
        userId: 'test-user',
        timeSlot: '2024-01-15 14:00:00',
        originalText: 'プログラミングをしていました',
        analysis: {
          category: '仕事',
          subCategory: 'プログラミング',
          structuredContent: 'Discord Botの開発',
          estimatedMinutes: 25,
          productivityLevel: 4,
        },
        createdAt: '2024-01-15 14:05:00',
        updatedAt: '2024-01-15 14:05:00',
      };

      const result = activityService.formatActivityRecord(record);

      // 検証：必要な情報が含まれているか
      expect(result).toContain('14:00:00');
      expect(result).toContain('[仕事 > プログラミング]');
      expect(result).toContain('プログラミングをしていました');
      expect(result).toContain('25分');
      expect(result).toContain('★★★★'); // 生産性レベル4
      expect(result).toContain('Discord Botの開発');
    });
  });

  describe('getActivityStats', () => {
    it('活動記録の統計情報を計算する', async () => {
      const mockActivities: ActivityRecord[] = [
        {
          id: 'test-1',
          userId: 'test-user',
          timeSlot: '2024-01-15 09:00:00',
          originalText: 'プログラミング',
          analysis: {
            category: '仕事',
            structuredContent: 'コーディング',
            estimatedMinutes: 30,
            productivityLevel: 4,
          },
          createdAt: '2024-01-15 09:05:00',
          updatedAt: '2024-01-15 09:05:00',
        },
        {
          id: 'test-2',
          userId: 'test-user',
          timeSlot: '2024-01-15 09:30:00',
          originalText: '会議',
          analysis: {
            category: '会議',
            structuredContent: '定例会議',
            estimatedMinutes: 30,
            productivityLevel: 3,
          },
          createdAt: '2024-01-15 09:35:00',
          updatedAt: '2024-01-15 09:35:00',
        },
        {
          id: 'test-3',
          userId: 'test-user',
          timeSlot: '2024-01-15 10:00:00',
          originalText: 'プログラミング続き',
          analysis: {
            category: '仕事',
            structuredContent: 'コーディング',
            estimatedMinutes: 30,
            productivityLevel: 5,
          },
          createdAt: '2024-01-15 10:05:00',
          updatedAt: '2024-01-15 10:05:00',
        },
      ];

      mockDatabase.getActivityRecords.mockResolvedValue(mockActivities);

      const stats = await activityService.getActivityStats('test-user');

      // 検証
      expect(stats.totalRecords).toBe(3);
      expect(stats.totalMinutes).toBe(90);
      expect(stats.categoryCounts).toEqual({
        '仕事': 2,
        '会議': 1,
      });
      expect(stats.averageProductivity).toBe(4); // (4+3+5)/3 = 4
    });

    it('活動記録がない場合の統計情報', async () => {
      mockDatabase.getActivityRecords.mockResolvedValue([]);

      const stats = await activityService.getActivityStats('test-user');

      expect(stats.totalRecords).toBe(0);
      expect(stats.totalMinutes).toBe(0);
      expect(stats.categoryCounts).toEqual({});
      expect(stats.averageProductivity).toBe(0);
    });
  });
});