/**
 * SummaryService テストスイート
 * 日次サマリー生成機能のテスト
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { SummaryService } from '../../services/summaryService';
import { DailySummary, ActivityRecord } from '../../types';
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
    test('活動記録がない場合は空のサマリーを返す', async () => {
      // Arrange
      const userId = 'test-user';
      const timezone = 'Asia/Tokyo';
      const businessDate = '2025-06-29';

      mockRepository.getActivityRecords.mockResolvedValue([]);
      mockRepository.saveDailySummary.mockResolvedValue();

      // Act
      const result = await summaryService.generateDailySummary(userId, timezone, businessDate);

      // Assert
      expect(result.date).toBe(businessDate);
      expect(result.categoryTotals).toEqual([]);
      expect(result.totalMinutes).toBe(0);
      expect(result.insights).toBe('今日は活動記録がありませんでした。明日はぜひ記録してみましょう！');
      expect(result.motivation).toBe('新しい一日、新しい可能性。明日も素晴らしい日になりますように！');
      expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(mockRepository.getActivityRecords).toHaveBeenCalledWith(userId, timezone, businessDate);
      // 空のサマリーの場合は保存されない
      expect(mockRepository.saveDailySummary).not.toHaveBeenCalled();
    });

    test('活動記録がある場合はAIサマリーを生成する', async () => {
      // Arrange
      const userId = 'test-user';
      const timezone = 'Asia/Tokyo';
      const businessDate = '2025-06-29';

      const mockActivities: ActivityRecord[] = [
        {
          id: '1',
          userId,
          timeSlot: '11:00-11:30',
          originalText: 'プログラミング作業',
          category: '仕事',
          subCategory: 'プログラミング',
          analysis: {
            category: '仕事',
            subCategory: 'プログラミング',
            structuredContent: 'コード作成',
            estimatedMinutes: 60,
            productivityLevel: 4,
            startTime: '11:00',
            endTime: '11:30'
          },
          createdAt: '2025-06-29T02:30:00.000Z',
          updatedAt: '2025-06-29T02:30:00.000Z'
        }
      ];

      const generatedSummary: DailySummary = {
        date: businessDate,
        categoryTotals: [
          {
            category: '仕事',
            totalMinutes: 60,
            recordCount: 1,
            averageProductivity: 4,
            subCategories: [
              {
                subCategory: 'プログラミング',
                totalMinutes: 60,
                recordCount: 1,
                averageProductivity: 4
              }
            ]
          }
        ],
        totalMinutes: 60,
        insights: 'AIが生成した感想',
        motivation: 'AIが生成した励まし',
        generatedAt: '2025-06-29T15:00:00.000Z'
      };

      // モック設定
      mockRepository.getActivityRecords.mockResolvedValue(mockActivities);
      mockAnalysisService.generateDailySummary.mockResolvedValue(generatedSummary);
      mockRepository.saveDailySummary.mockResolvedValue();

      // Act
      const result = await summaryService.generateDailySummary(userId, timezone, businessDate);

      // Assert
      expect(result).toEqual(generatedSummary);
      expect(mockRepository.getActivityRecords).toHaveBeenCalledWith(userId, timezone, businessDate);
      expect(mockAnalysisService.generateDailySummary).toHaveBeenCalledWith(mockActivities, businessDate);
      expect(mockRepository.saveDailySummary).toHaveBeenCalledWith(generatedSummary, timezone);
    });

    test('AI分析でエラーが発生した場合はエラーを伝播する', async () => {
      // Arrange
      const userId = 'test-user';
      const timezone = 'Asia/Tokyo';
      const businessDate = '2025-06-29';

      const mockActivities: ActivityRecord[] = [
        {
          id: '1',
          userId,
          timeSlot: '11:00-11:30',
          originalText: 'テスト活動',
          category: 'テスト',
          analysis: {
            category: 'テスト',
            structuredContent: 'テスト',
            estimatedMinutes: 30,
            productivityLevel: 3,
            startTime: '11:00',
            endTime: '11:30'
          },
          createdAt: '2025-06-29T02:30:00.000Z',
          updatedAt: '2025-06-29T02:30:00.000Z'
        }
      ];

      mockRepository.getActivityRecords.mockResolvedValue(mockActivities);
      mockAnalysisService.generateDailySummary.mockRejectedValue(new Error('AI Analysis Error'));

      // Act & Assert
      await expect(
        summaryService.generateDailySummary(userId, timezone, businessDate)
      ).rejects.toThrow('AI Analysis Error');
    });
  });

  describe('getDailySummary', () => {
    test('既存サマリーがある場合はそれを返す', async () => {
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

      // Act
      const result = await summaryService.getDailySummary(userId, timezone, businessDate);

      // Assert
      expect(result).toEqual(existingSummary);
      expect(mockRepository.getDailySummary).toHaveBeenCalledWith(userId, timezone, businessDate);
    });

    test('既存サマリーがない場合は新規生成する', async () => {
      // Arrange
      const userId = 'test-user';
      const timezone = 'Asia/Tokyo';
      const businessDate = '2025-06-29';

      mockRepository.getDailySummary.mockResolvedValue(null);
      mockRepository.getActivityRecords.mockResolvedValue([]);
      mockRepository.saveDailySummary.mockResolvedValue();

      // Act
      const result = await summaryService.getDailySummary(userId, timezone, businessDate);

      // Assert
      expect(result.date).toBe(businessDate);
      expect(result.totalMinutes).toBe(0);
      expect(mockRepository.getDailySummary).toHaveBeenCalledWith(userId, timezone, businessDate);
    });
  });

  describe('エラーハンドリング', () => {
    test('リポジトリエラーが適切に処理される', async () => {
      // Arrange
      const userId = 'test-user';
      const timezone = 'Asia/Tokyo';
      const businessDate = '2025-06-29';
      
      const error = new Error('Database Error');
      mockRepository.getActivityRecords.mockRejectedValue(error);

      // Act & Assert
      await expect(
        summaryService.generateDailySummary(userId, timezone, businessDate)
      ).rejects.toThrow('Database Error');
    });

    test('サマリー保存エラーが適切に処理される', async () => {
      // Arrange
      const userId = 'test-user';
      const timezone = 'Asia/Tokyo';
      const businessDate = '2025-06-29';
      
      const mockActivities: ActivityRecord[] = [
        {
          id: '1',
          userId,
          timeSlot: '11:00-11:30',
          originalText: 'テスト活動',
          category: 'テスト',
          analysis: {
            category: 'テスト',
            structuredContent: 'テスト',
            estimatedMinutes: 30,
            productivityLevel: 3
          },
          createdAt: '2025-06-29T02:30:00.000Z',
          updatedAt: '2025-06-29T02:30:00.000Z'
        }
      ];
      
      const generatedSummary: DailySummary = {
        date: businessDate,
        categoryTotals: [],
        totalMinutes: 30,
        insights: 'AIテスト',
        motivation: 'AIテスト',
        generatedAt: '2025-06-29T15:00:00.000Z'
      };
      
      mockRepository.getActivityRecords.mockResolvedValue(mockActivities);
      mockAnalysisService.generateDailySummary.mockResolvedValue(generatedSummary);
      mockRepository.saveDailySummary.mockRejectedValue(new Error('Save Error'));

      // Act & Assert
      await expect(
        summaryService.generateDailySummary(userId, timezone, businessDate)
      ).rejects.toThrow('Save Error');
    });
  });

  describe('formatDailySummary', () => {
    test('サマリーを正しくフォーマットする', () => {
      // Arrange
      const timezone = 'Asia/Tokyo';
      const summary: DailySummary = {
        date: '2025-06-29',
        categoryTotals: [
          {
            category: '仕事',
            totalMinutes: 120,
            recordCount: 1,
            averageProductivity: 4,
            subCategories: [
              {
                subCategory: 'プログラミング',
                totalMinutes: 120,
                recordCount: 1,
                averageProductivity: 4
              }
            ]
          }
        ],
        totalMinutes: 120,
        insights: 'テスト感想',
        motivation: 'テスト励まし',
        generatedAt: '2025-06-29T10:00:00.000Z'
      };

      // Act
      const result = summaryService.formatDailySummary(summary, timezone);

      // Assert
      expect(result).toContain('📊');
      expect(result).toContain('仕事');
      expect(result).toContain('2時間');
      expect(result).toContain('テスト感想');
      expect(result).toContain('テスト励まし');
    });

    test('空のサマリーも正しくフォーマットする', () => {
      // Arrange
      const timezone = 'Asia/Tokyo';
      const summary: DailySummary = {
        date: '2025-06-29',
        categoryTotals: [],
        totalMinutes: 0,
        insights: '今日は活動記録がありませんでした。',
        motivation: '明日はぜひ記録してみましょう！',
        generatedAt: '2025-06-29T10:00:00.000Z'
      };

      // Act
      const result = summaryService.formatDailySummary(summary, timezone);

      // Assert
      expect(result).toContain('📊');
      expect(result).toContain('今日は活動記録がありませんでした');
      expect(result).toContain('明日はぜひ記録してみましょう');
    });
  });
});