/**
 * SummaryService テストスイート
 * 日次サマリー生成機能のテスト
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { SummaryService } from '../../services/summaryService';
import { DailySummary, ActivityRecord, CategoryTotal } from '../../types';
import { IDatabaseRepository, IAnalysisService } from '../../repositories/interfaces';

describe('SummaryService', () => {
  let summaryService: SummaryService;
  let mockRepository: jest.Mocked<IDatabaseRepository>;
  let mockAnalysisService: jest.Mocked<IAnalysisService>;

  beforeEach(() => {
    // インターフェースベースのモック作成
    mockRepository = {
      initialize: jest.fn(),
      close: jest.fn(),
      getUserTimezone: jest.fn(),
      setUserTimezone: jest.fn(),
      saveActivityRecord: jest.fn(),
      getActivityRecords: jest.fn(),
      getActivityRecordsByTimeSlot: jest.fn(),
      saveDailySummary: jest.fn(),
      getDailySummary: jest.fn(),
      updateActivityTime: jest.fn(),
    };

    mockAnalysisService = {
      analyzeActivity: jest.fn(),
      generateDailySummary: jest.fn(),
      getCostStats: jest.fn(),
      getDailyCostReport: jest.fn(),
      checkCostAlerts: jest.fn(),
    };

    summaryService = new SummaryService(mockRepository, mockAnalysisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateDailySummary', () => {
    test('既存のサマリーがある場合はそれを返す', async () => {
      // Arrange
      const userId = 'test-user';
      const timezone = 'Asia/Tokyo';
      const businessDate = '2025-06-29';

      const existingSummary: DailySummary = {
        date: businessDate,
        categoryTotals: [],
        totalMinutes: 480,
        insights: 'テスト感想',
        motivation: 'テスト励まし',
        generatedAt: '2025-06-29T10:00:00.000Z'
      };

      mockRepository.getDailySummary.mockResolvedValue(existingSummary);
      mockRepository.getActivityRecords.mockResolvedValue([]); // undefinedを回避

      // Act
      const result = await summaryService.generateDailySummary(userId, timezone, businessDate);

      // Assert
      expect(result).toEqual(existingSummary);
      expect(mockRepository.getDailySummary).toHaveBeenCalledWith(userId, timezone, businessDate);
    });

    test('既存のサマリーがない場合は新規生成する', async () => {
      // Arrange
      const userId = 'test-user';
      const timezone = 'Asia/Tokyo';
      const businessDate = '2025-06-29';

      const mockActivities: ActivityRecord[] = [
        {
          id: '1',
          userId,
          timeSlot: '2025-06-29 09:00:00',
          originalText: 'プログラミング作業',
          analysis: {
            category: '仕事',
            subCategory: 'プログラミング',
            structuredContent: 'コード作成',
            estimatedMinutes: 60,
            productivityLevel: 4
          },
          category: '仕事',
          subCategory: 'プログラミング',
          createdAt: '2025-06-29 09:30:00',
          updatedAt: '2025-06-29 09:30:00'
        }
      ];

      const generatedSummary: DailySummary = {
        date: businessDate,
        categoryTotals: [{
          category: '仕事',
          totalMinutes: 60,
          recordCount: 1,
          averageProductivity: 4,
          subCategories: [{
            subCategory: 'プログラミング',
            totalMinutes: 60,
            recordCount: 1,
            averageProductivity: 4
          }]
        }],
        totalMinutes: 60,
        insights: '生成された感想',
        motivation: '生成された励まし',
        generatedAt: '2025-06-29T10:00:00.000Z'
      };

      mockRepository.getDailySummary.mockResolvedValue(null);
      mockRepository.getActivityRecords.mockResolvedValue(mockActivities);
      mockAnalysisService.generateDailySummary.mockResolvedValue(generatedSummary);
      mockRepository.saveDailySummary.mockResolvedValue(undefined);

      // Act
      const result = await summaryService.generateDailySummary(userId, timezone, businessDate);

      // Assert
      expect(result).toEqual(generatedSummary);
      expect(mockRepository.getActivityRecords).toHaveBeenCalledWith(userId, timezone, businessDate);
      expect(mockAnalysisService.generateDailySummary).toHaveBeenCalledWith(mockActivities, businessDate);
      expect(mockRepository.saveDailySummary).toHaveBeenCalledWith(generatedSummary, timezone);
    });

    test('活動記録がない場合は空のサマリーを返す', async () => {
      // Arrange
      const userId = 'test-user';
      const timezone = 'Asia/Tokyo';
      const businessDate = '2025-06-29';

      mockRepository.getDailySummary.mockResolvedValue(null);
      mockRepository.getActivityRecords.mockResolvedValue([]);

      // Act
      const result = await summaryService.generateDailySummary(userId, timezone, businessDate);

      // Assert
      expect(result.totalMinutes).toBe(0);
      expect(result.categoryTotals).toEqual([]);
      expect(result.date).toBe(businessDate);
    });
  });

  describe('formatBriefSummary', () => {
    test('サマリーを正しくフォーマットする', () => {
      // Arrange
      const summary: DailySummary = {
        date: '2025-06-29',
        categoryTotals: [
          {
            category: '仕事',
            totalMinutes: 150, // 2時間30分
            recordCount: 3,
            averageProductivity: 4,
            subCategories: [
              {
                subCategory: 'プログラミング',
                totalMinutes: 90,
                recordCount: 2,
                averageProductivity: 4
              },
              {
                subCategory: 'ミーティング',
                totalMinutes: 60,
                recordCount: 1,
                averageProductivity: 3
              }
            ]
          },
          {
            category: '休憩',
            totalMinutes: 30,
            recordCount: 1,
            averageProductivity: 3,
            subCategories: [
              {
                subCategory: 'コーヒーブレイク',
                totalMinutes: 30,
                recordCount: 1,
                averageProductivity: 3
              }
            ]
          }
        ],
        totalMinutes: 180, // 3時間
        insights: 'テスト感想',
        motivation: 'テスト励まし',
        generatedAt: '2025-06-29T10:00:00.000Z'
      };

      // Act
      const result = summaryService.formatBriefSummary(summary);

      // Assert
      expect(result).toContain('📊 **今日の活動サマリー**');
      expect(result).toContain('⏱️ 総活動時間: **3時間0分**');
      expect(result).toContain('• **仕事**: 2h30m');
      expect(result).toContain('  - プログラミング: 1h30m');
      expect(result).toContain('  - ミーティング: 1h0m');
      expect(result).toContain('• **休憩**: 30m');
      expect(result).toContain('  - コーヒーブレイク: 30m');
    });

    test('分のみの場合は正しくフォーマットする', () => {
      // Arrange
      const summary: DailySummary = {
        date: '2025-06-29',
        categoryTotals: [
          {
            category: '休憩',
            totalMinutes: 45,
            recordCount: 1,
            averageProductivity: 3,
            subCategories: []
          }
        ],
        totalMinutes: 45,
        insights: 'テスト感想',
        motivation: 'テスト励まし',
        generatedAt: '2025-06-29T10:00:00.000Z'
      };

      // Act
      const result = summaryService.formatBriefSummary(summary);

      // Assert
      expect(result).toContain('⏱️ 総活動時間: **45分**');
      expect(result).toContain('• **休憩**: 45m');
    });

    test('空のサマリーを正しく処理する', () => {
      // Arrange
      const summary: DailySummary = {
        date: '2025-06-29',
        categoryTotals: [],
        totalMinutes: 0,
        insights: '',
        motivation: '',
        generatedAt: '2025-06-29T10:00:00.000Z'
      };

      // Act
      const result = summaryService.formatBriefSummary(summary);

      // Assert
      expect(result).toContain('📊 **今日の活動サマリー**');
      expect(result).toContain('⏱️ 総活動時間: **0分**');
      expect(result).toContain('活動内訳');
    });
  });

  describe('buildDetailedCategoryBreakdown', () => {
    test('カテゴリとサブカテゴリを正しいインデントで表示する', () => {
      // Arrange
      const categoryTotals: CategoryTotal[] = [
        {
          category: '仕事',
          totalMinutes: 120,
          recordCount: 2,
          averageProductivity: 4,
          subCategories: [
            {
              subCategory: 'プログラミング',
              totalMinutes: 90,
              recordCount: 1,
              averageProductivity: 4
            },
            {
              subCategory: 'ミーティング',
              totalMinutes: 30,
              recordCount: 1,
              averageProductivity: 3
            }
          ]
        }
      ];

      // Act
      const result = (summaryService as any).buildDetailedCategoryBreakdown(categoryTotals);

      // Assert
      expect(result).toContain('• **仕事**: 2h0m');
      expect(result).toContain('  - プログラミング: 1h30m');
      expect(result).toContain('  - ミーティング: 30m');
    });

    test('サブカテゴリがない場合は正しく処理する', () => {
      // Arrange
      const categoryTotals: CategoryTotal[] = [
        {
          category: '仕事',
          totalMinutes: 60,
          recordCount: 1,
          averageProductivity: 4,
          subCategories: []
        }
      ];

      // Act
      const result = (summaryService as any).buildDetailedCategoryBreakdown(categoryTotals);

      // Assert
      expect(result).toContain('• **仕事**: 1h0m');
      expect(result).not.toContain('  -');
    });
  });

  describe('エラーハンドリング', () => {
    test('リポジトリエラーが適切に処理される', async () => {
      // Arrange
      const userId = 'test-user';
      const timezone = 'Asia/Tokyo';
      const businessDate = '2025-06-29';

      mockRepository.getDailySummary.mockRejectedValue(new Error('Database Error'));
      mockRepository.getActivityRecords.mockResolvedValue([]); // undefinedを回避

      // Act & Assert
      await expect(
        summaryService.generateDailySummary(userId, timezone, businessDate)
      ).rejects.toThrow('Database Error');
    });

    test('分析サービスエラーが適切に処理される', async () => {
      // Arrange
      const userId = 'test-user';
      const timezone = 'Asia/Tokyo';
      const businessDate = '2025-06-29';

      const mockActivities = [
        {
          id: '1',
          userId: 'test-user',
          timeSlot: '2025-06-29 09:00:00',
          originalText: 'テスト活動',
          analysis: {
            category: 'テスト',
            structuredContent: 'テスト内容',
            estimatedMinutes: 30,
            productivityLevel: 3
          },
          category: 'テスト',
          createdAt: '2025-06-29 09:30:00',
          updatedAt: '2025-06-29 09:30:00'
        }
      ];

      mockRepository.getDailySummary.mockResolvedValue(null);
      mockRepository.getActivityRecords.mockResolvedValue(mockActivities);
      mockAnalysisService.generateDailySummary.mockRejectedValue(new Error('AI Service Error'));

      // Act & Assert
      await expect(
        summaryService.generateDailySummary(userId, timezone, businessDate)
      ).rejects.toThrow('AI Service Error');
    });
  });
});