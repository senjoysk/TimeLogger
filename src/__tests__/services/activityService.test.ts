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

      // 検証：返り値の確認
      expect(result).toMatchObject({
        id: 'test-uuid-12345',
        userId: mockUserId,
        originalText: mockUserInput,
        analysis: mockAnalysis,
      });

      // 検証：Gemini APIが呼ばれたか
      expect(mockGeminiService.analyzeActivity).toHaveBeenCalledWith(
        mockUserInput,
        expect.any(String), // timeSlot.label
        []
      );

      // 検証：データベースに保存されたか
      expect(mockDatabase.saveActivityRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-uuid-12345',
          userId: mockUserId,
          originalText: mockUserInput,
          analysis: mockAnalysis,
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

      // 検証：既存記録が文脈として渡されたか
      expect(mockGeminiService.analyzeActivity).toHaveBeenCalledWith(
        mockUserInput,
        expect.any(String),
        existingRecords
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