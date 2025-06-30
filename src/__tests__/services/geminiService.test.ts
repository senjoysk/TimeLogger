/**
 * GeminiService テストスイート
 * AI分析機能のテスト
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { GeminiService } from '../../services/geminiService';
import { ActivityRecord, DailySummary, ActivityAnalysis } from '../../types';
import { IApiCostRepository } from '../../repositories/interfaces';

// configモジュールのモック
jest.mock('../../config', () => ({
  config: {
    gemini: {
      apiKey: 'test-api-key'
    }
  }
}));

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
    // モックをリセット
    jest.clearAllMocks();

    // コストリポジトリのモック
    mockCostRepository = {
      recordApiCall: jest.fn(),
      getTodayStats: jest.fn(),
      generateDailyReport: jest.fn(),
      checkCostAlerts: jest.fn()
    };

    // GoogleGenerativeAIモックの取得と設定
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    mockModel = {
      generateContent: jest.fn()
    };
    
    GoogleGenerativeAI.mockImplementation(() => ({
      getGenerativeModel: jest.fn().mockReturnValue(mockModel)
    }));

    geminiService = new GeminiService(mockCostRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateDailySummary', () => {
    test('日次サマリーを生成する（エラー処理含む）', async () => {
      // Arrange
      const activities: ActivityRecord[] = [
        {
          id: '1',
          userId: 'test-user',
          timeSlot: '11:00-11:30',
          originalText: 'プログラミング中',
          category: '開発',
          subCategory: 'プログラミング',
          analysis: {
            category: '開発',
            subCategory: 'プログラミング',
            structuredContent: 'プログラミング中',
            estimatedMinutes: 30,
            productivityLevel: 5,
            startTime: '11:00',
            endTime: '11:30'
          },
          createdAt: '2025-06-30T02:00:00.000Z',
          updatedAt: '2025-06-30T02:00:00.000Z'
        }
      ];

      // Act
      const result = await geminiService.generateDailySummary(activities, '2025-06-30');

      // Assert - 基本的な構造と必須フィールドの検証
      expect(result.date).toBe('2025-06-30');
      expect(result.totalMinutes).toBe(30);
      expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(result.categoryTotals).toHaveLength(1);
      expect(result.categoryTotals[0].category).toBe('開発');
      expect(result.categoryTotals[0].totalMinutes).toBe(30);
      
      // insights と motivation は何かしらの文字列が返される（API エラー時でもデフォルト値）
      expect(typeof result.insights).toBe('string');
      expect(result.insights.length).toBeGreaterThan(0);
      expect(typeof result.motivation).toBe('string');
      expect(result.motivation.length).toBeGreaterThan(0);
    });

    test('空の活動記録でも正常に処理する', async () => {
      // Arrange
      const activities: ActivityRecord[] = [];

      // Act
      const result = await geminiService.generateDailySummary(activities, '2025-06-30');

      // Assert - 基本構造の検証
      expect(result.date).toBe('2025-06-30');
      expect(result.categoryTotals).toEqual([]);
      expect(result.totalMinutes).toBe(0);
      expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      
      // insights と motivation は何かしらの文字列が返される
      expect(typeof result.insights).toBe('string');
      expect(result.insights.length).toBeGreaterThan(0);
      expect(typeof result.motivation).toBe('string');
      expect(result.motivation.length).toBeGreaterThan(0);
    });

    test('APIエラー時はデフォルトサマリーを返す', async () => {
      // Arrange
      const activities: ActivityRecord[] = [];
      mockModel.generateContent.mockRejectedValueOnce(new Error('API Error'));

      // Act
      const result = await geminiService.generateDailySummary(activities, '2025-06-30');

      // Assert
      expect(result.date).toBe('2025-06-30');
      expect(result.insights).toContain('システムエラーにより詳細な分析を生成できませんでした');
      expect(result.motivation).toContain('明日も素晴らしい一日になりますように');
      expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe('getDailyCostReport', () => {
    test('コストレポートを生成する', async () => {
      // Arrange
      const userId = 'test-user';
      const timezone = 'Asia/Tokyo';
      const mockReport = '📊 **今日のAPI使用量レポート**\n\n合計: **10回**\n推定コスト: **$0.15**\n\nanalyzeActivity: 8回\ngenerateSummary: 2回';
      
      mockCostRepository.generateDailyReport.mockResolvedValue(mockReport);

      // Act
      const result = await geminiService.getDailyCostReport(userId, timezone);

      // Assert
      expect(result).toBe(mockReport);
      expect(mockCostRepository.generateDailyReport).toHaveBeenCalledWith(timezone);
    });

    test('使用量がない場合も正常に処理する', async () => {
      // Arrange
      const userId = 'test-user';
      const timezone = 'Asia/Tokyo';
      const mockReport = '📊 **今日のAPI使用量レポート**\n\n合計: **0回**\n推定コスト: **$0.00**\n\n今日はまだAPI使用量がありません。';
      
      mockCostRepository.generateDailyReport.mockResolvedValue(mockReport);

      // Act
      const result = await geminiService.getDailyCostReport(userId, timezone);

      // Assert
      expect(result).toBe(mockReport);
      expect(mockCostRepository.generateDailyReport).toHaveBeenCalledWith(timezone);
    });
  });

  describe('checkCostAlerts', () => {
    test('コスト警告をチェックする', async () => {
      // Arrange
      const userId = 'test-user';
      const timezone = 'Asia/Tokyo';
      const mockAlert = {
        level: 'warning' as const,
        message: 'API使用料が$1.00を超えました。'
      };
      
      mockCostRepository.checkCostAlerts.mockResolvedValue(mockAlert);

      // Act
      const result = await geminiService.checkCostAlerts(userId, timezone);

      // Assert
      expect(result).toEqual(mockAlert);
      expect(mockCostRepository.checkCostAlerts).toHaveBeenCalledWith(timezone);
    });

    test('警告がない場合はnullを返す', async () => {
      // Arrange
      const userId = 'test-user';
      const timezone = 'Asia/Tokyo';
      
      mockCostRepository.checkCostAlerts.mockResolvedValue(null);

      // Act
      const result = await geminiService.checkCostAlerts(userId, timezone);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('初期化と設定', () => {
    test('API キーが設定されていない場合も初期化される（実装上の制約）', () => {
      // configモジュールを空のAPIキーでモック
      jest.doMock('../../config', () => ({
        config: {
          gemini: {
            apiKey: ''
          }
        }
      }));

      // モジュールキャッシュをクリアして再読み込み
      jest.resetModules();
      
      // Act & Assert - 現在の実装では空のAPIキーでも初期化される
      expect(() => {
        const { GeminiService } = require('../../services/geminiService');
        new GeminiService(mockCostRepository);
      }).not.toThrow();

      // Cleanup - 元のモックに戻す
      jest.doMock('../../config', () => ({
        config: {
          gemini: {
            apiKey: 'test-api-key'
          }
        }
      }));
      jest.resetModules();
    });

    test('正常に初期化される', () => {
      // Act & Assert
      expect(() => {
        const service = new GeminiService(mockCostRepository);
        expect(service).toBeDefined();
      }).not.toThrow();
    });
  });
});