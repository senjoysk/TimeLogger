/**
 * GeminiService テストスイート
 * AI分析機能のテスト
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { GeminiService } from '../../services/geminiService';
import { ActivityRecord, DailySummary, ActivityAnalysis } from '../../types';
import { IApiCostRepository } from '../../repositories/interfaces';

// Gemini AIライブラリのモック
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn()
    })
  }))
}));

describe('GeminiService', () => {
  let geminiService: GeminiService;
  let mockCostRepository: jest.Mocked<IApiCostRepository>;
  let mockModel: any;

  beforeEach(() => {
    // コストリポジトリのモック
    mockCostRepository = {
      recordApiCall: jest.fn(),
      getTodayStats: jest.fn(),
      generateDailyReport: jest.fn(),
      checkCostAlerts: jest.fn()
    };

    // Gemini AI モデルのモック
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    mockModel = {
      generateContent: jest.fn()
    };
    GoogleGenerativeAI.mockImplementation(() => ({
      getGenerativeModel: jest.fn().mockReturnValue(mockModel)
    }));

    // 環境変数設定
    process.env.GOOGLE_API_KEY = 'test-api-key';

    geminiService = new GeminiService(mockCostRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('analyzeActivity', () => {
    test('ユーザー入力を正しく分析する', async () => {
      // Arrange
      const userInput = 'プログラミング作業をしていました';
      const timezone = 'Asia/Tokyo';

      const mockResponse = {
        response: {
          text: () => JSON.stringify({
            category: '仕事',
            subCategory: 'プログラミング',
            structuredContent: 'コード開発作業',
            estimatedMinutes: 60,
            productivityLevel: 4,
            startTime: '2025-06-30T01:00:00.000Z',
            endTime: '2025-06-30T02:00:00.000Z'
          }),
          usageMetadata: {
            promptTokenCount: 100,
            candidatesTokenCount: 150
          }
        }
      };

      mockModel.generateContent.mockResolvedValue(mockResponse);

      // Act
      const result = await geminiService.analyzeActivity(userInput, '09:00-09:30', [], timezone);

      // Assert
      expect(result.category).toBe('仕事');
      expect(result.subCategory).toBe('プログラミング');
      expect(result.structuredContent).toBe('コード開発作業');
      expect(result.estimatedMinutes).toBe(60);
      expect(result.productivityLevel).toBe(4);
      expect(mockCostRepository.recordApiCall).toHaveBeenCalledWith(
        'analyzeActivity',
        100,
        150
      );
    });

    test('不正なJSON応答をハンドリングする', async () => {
      // Arrange
      const userInput = 'テスト入力';
      const timezone = 'Asia/Tokyo';

      const mockResponse = {
        response: {
          text: () => '不正なJSON',
          usageMetadata: {
            promptTokenCount: 50,
            candidatesTokenCount: 25
          }
        }
      };

      mockModel.generateContent.mockResolvedValue(mockResponse);

      // Act & Assert
      await expect(
        geminiService.analyzeActivity(userInput, '09:00-09:30', [], timezone)
      ).rejects.toThrow('AI分析の結果を解析できませんでした');

      expect(mockCostRepository.recordApiCall).toHaveBeenCalledWith(
        'analyzeActivity',
        50,
        25
      );
    });

    test('API呼び出しエラーをハンドリングする', async () => {
      // Arrange
      const userInput = 'テスト入力';
      const timezone = 'Asia/Tokyo';

      mockModel.generateContent.mockRejectedValue(new Error('API Error'));

      // Act & Assert
      await expect(
        geminiService.analyzeActivity(userInput, '09:00-09:30', [], timezone)
      ).rejects.toThrow('AI分析中にエラーが発生しました: API Error');
    });
  });

  describe('generateDailySummary', () => {
    test('活動記録からサマリーを生成する', async () => {
      // Arrange
      const activities: ActivityRecord[] = [
        {
          id: '1',
          userId: 'test-user',
          timeSlot: '2025-06-30 09:00:00',
          originalText: 'プログラミング作業',
          analysis: {
            category: '仕事',
            subCategory: 'プログラミング',
            structuredContent: 'コード開発',
            estimatedMinutes: 60,
            productivityLevel: 4
          },
          category: '仕事',
          subCategory: 'プログラミング',
          createdAt: '2025-06-30 09:30:00',
          updatedAt: '2025-06-30 09:30:00'
        },
        {
          id: '2',
          userId: 'test-user',
          timeSlot: '2025-06-30 10:00:00',
          originalText: 'ミーティング',
          analysis: {
            category: '仕事',
            subCategory: '会議',
            structuredContent: 'チームミーティング参加',
            estimatedMinutes: 30,
            productivityLevel: 3
          },
          category: '仕事',
          subCategory: '会議',
          createdAt: '2025-06-30 10:30:00',
          updatedAt: '2025-06-30 10:30:00'
        }
      ];

      const mockSummary = {
        date: '2025-06-30',
        categoryTotals: [
          {
            category: '仕事',
            totalMinutes: 90,
            recordCount: 2,
            averageProductivity: 3.5,
            subCategories: [
              {
                subCategory: 'プログラミング',
                totalMinutes: 60,
                recordCount: 1,
                averageProductivity: 4
              },
              {
                subCategory: '会議',
                totalMinutes: 30,
                recordCount: 1,
                averageProductivity: 3
              }
            ]
          }
        ],
        totalMinutes: 90,
        insights: '今日は集中してプログラミングに取り組みました。',
        motivation: '明日も頑張りましょう！',
        generatedAt: '2025-06-30T10:00:00.000Z'
      };

      const mockResponse = {
        response: {
          text: () => JSON.stringify(mockSummary),
          usageMetadata: {
            promptTokenCount: 200,
            candidatesTokenCount: 300
          }
        }
      };

      mockModel.generateContent.mockResolvedValue(mockResponse);

      // Act
      const result = await geminiService.generateDailySummary(activities, '2025-06-30');

      // Assert
      expect(result).toEqual(mockSummary);
      expect(mockCostRepository.recordApiCall).toHaveBeenCalledWith(
        'generateDailySummary',
        200,
        300
      );
    });

    test('空の活動記録でも正常に処理する', async () => {
      // Arrange
      const activities: ActivityRecord[] = [];

      const mockSummary = {
        date: '2025-06-30',
        categoryTotals: [],
        totalMinutes: 0,
        insights: '今日は記録された活動がありません。',
        motivation: '明日は何か記録してみましょう！',
        generatedAt: '2025-06-30T10:00:00.000Z'
      };

      const mockResponse = {
        response: {
          text: () => JSON.stringify(mockSummary),
          usageMetadata: {
            promptTokenCount: 50,
            candidatesTokenCount: 100
          }
        }
      };

      mockModel.generateContent.mockResolvedValue(mockResponse);

      // Act
      const result = await geminiService.generateDailySummary(activities, '2025-06-30');

      // Assert
      expect(result.totalMinutes).toBe(0);
      expect(result.categoryTotals).toEqual([]);
      expect(mockCostRepository.recordApiCall).toHaveBeenCalledWith(
        'generateDailySummary',
        50,
        100
      );
    });
  });

  describe('getDailyCostReport', () => {
    test('コストレポートを生成する', async () => {
      // Arrange
      const timezone = 'Asia/Tokyo';
      const mockStats = {
        totalCalls: 10,
        totalInputTokens: 1000,
        totalOutputTokens: 500,
        estimatedCost: 0.15,
        operationBreakdown: {
          analyzeActivity: { calls: 8, inputTokens: 800, outputTokens: 400, cost: 0.12 },
          generateDailySummary: { calls: 2, inputTokens: 200, outputTokens: 100, cost: 0.03 }
        }
      };

      mockCostRepository.getTodayStats.mockResolvedValue(mockStats);

      // Act
      const result = await geminiService.getDailyCostReport('test-user', timezone);

      // Assert
      expect(result).toContain('📊 **今日のAPI使用量レポート**');
      expect(result).toContain('合計: **10回**');
      expect(result).toContain('推定コスト: **$0.15**');
      expect(result).toContain('analyzeActivity: 8回');
      expect(result).toContain('generateDailySummary: 2回');
    });

    test('使用量がない場合も正常に処理する', async () => {
      // Arrange
      const timezone = 'Asia/Tokyo';
      const mockStats = {
        totalCalls: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        estimatedCost: 0,
        operationBreakdown: {}
      };

      mockCostRepository.getTodayStats.mockResolvedValue(mockStats);

      // Act
      const result = await geminiService.getDailyCostReport('test-user', timezone);

      // Assert
      expect(result).toContain('📊 **今日のAPI使用量レポート**');
      expect(result).toContain('合計: **0回**');
      expect(result).toContain('推定コスト: **$0.00**');
      expect(result).toContain('今日はまだAPI使用量がありません。');
    });
  });

  describe('checkCostAlerts', () => {
    test('コスト警告をチェックする', async () => {
      // Arrange
      const timezone = 'Asia/Tokyo';
      const mockAlert = {
        level: 'warning' as const,
        message: 'API使用料が$1.00を超えました。',
        currentCost: 1.25,
        threshold: 1.00
      };

      mockCostRepository.checkCostAlerts.mockResolvedValue(mockAlert);

      // Act
      const result = await geminiService.checkCostAlerts('test-user', timezone);

      // Assert
      expect(result).toEqual(mockAlert);
    });

    test('警告がない場合はnullを返す', async () => {
      // Arrange
      const timezone = 'Asia/Tokyo';

      mockCostRepository.checkCostAlerts.mockResolvedValue(null);

      // Act
      const result = await geminiService.checkCostAlerts('test-user', timezone);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('初期化と設定', () => {
    test('API キーが設定されていない場合はエラー', () => {
      // Arrange
      const originalKey = process.env.GOOGLE_API_KEY;
      delete process.env.GOOGLE_API_KEY;

      // Act & Assert
      expect(() => {
        new GeminiService(mockCostRepository);
      }).toThrow();

      // Cleanup
      process.env.GOOGLE_API_KEY = originalKey;
    });

    test('正常に初期化される', () => {
      // Arrange
      process.env.GOOGLE_API_KEY = 'test-api-key';

      // Act & Assert
      expect(() => {
        new GeminiService(mockCostRepository);
      }).not.toThrow();
    });
  });
});