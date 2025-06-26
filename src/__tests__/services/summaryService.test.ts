import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { SummaryService } from '../../services/summaryService';
import { Database } from '../../database/database';
import { GeminiService } from '../../services/geminiService';
import { DailySummary, ActivityRecord, CategoryTotal } from '../../types';

// モックの作成
jest.mock('../../database/database');
jest.mock('../../services/geminiService');
jest.mock('../../utils/timeUtils', () => ({
  getCurrentBusinessDate: () => '2024-01-15',
}));

describe('SummaryService', () => {
  let summaryService: SummaryService;
  let mockDatabase: jest.Mocked<Database>;
  let mockGeminiService: jest.Mocked<GeminiService>;

  const mockUserId = 'test-user-123';
  const mockBusinessDate = '2024-01-15';

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockDatabase = new Database() as jest.Mocked<Database>;
    mockGeminiService = new GeminiService() as jest.Mocked<GeminiService>;
    
    summaryService = new SummaryService(mockDatabase, mockGeminiService);
  });

  describe('generateDailySummary', () => {
    const mockActivities: ActivityRecord[] = [
      {
        id: 'test-1',
        userId: mockUserId,
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
        userId: mockUserId,
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
    ];

    const mockGeminiSummary: DailySummary = {
      date: mockBusinessDate,
      categoryTotals: [
        {
          category: '仕事',
          totalMinutes: 30,
          recordCount: 1,
          averageProductivity: 4,
        },
        {
          category: '会議',
          totalMinutes: 30,
          recordCount: 1,
          averageProductivity: 3,
        },
      ],
      totalMinutes: 60,
      insights: '今日は仕事と会議をバランスよくこなしました。',
      motivation: '明日も頑張りましょう！',
      generatedAt: '2024-01-15T18:00:00.000Z',
    };

    beforeEach(() => {
      mockDatabase.getActivityRecords.mockResolvedValue(mockActivities);
      mockGeminiService.generateDailySummary.mockResolvedValue(mockGeminiSummary);
      mockDatabase.saveDailySummary.mockResolvedValue(undefined);
    });

    it('活動記録から日次サマリーを生成する', async () => {
      const result = await summaryService.generateDailySummary(
        mockUserId,
        mockBusinessDate
      );

      // 検証：サマリーが正しく生成されたか
      expect(result).toEqual(mockGeminiSummary);

      // 検証：データベースから活動記録を取得したか
      expect(mockDatabase.getActivityRecords).toHaveBeenCalledWith(
        mockUserId,
        mockBusinessDate
      );

      // 検証：Gemini APIが呼ばれたか
      expect(mockGeminiService.generateDailySummary).toHaveBeenCalledWith(
        mockActivities,
        mockBusinessDate
      );

      // 検証：データベースに保存されたか
      expect(mockDatabase.saveDailySummary).toHaveBeenCalledWith(mockGeminiSummary);
    });

    it('活動記録がない場合は空のサマリーを生成する', async () => {
      mockDatabase.getActivityRecords.mockResolvedValue([]);

      const result = await summaryService.generateDailySummary(
        mockUserId,
        mockBusinessDate
      );

      // 検証：空のサマリーが返されたか
      expect(result.categoryTotals).toEqual([]);
      expect(result.totalMinutes).toBe(0);
      expect(result.insights).toContain('活動記録がありませんでした');
      expect(result.motivation).toContain('新しい一日');

      // 検証：Gemini APIは呼ばれないか
      expect(mockGeminiService.generateDailySummary).not.toHaveBeenCalled();
    });
  });

  describe('getDailySummary', () => {
    const existingSummary: DailySummary = {
      date: mockBusinessDate,
      categoryTotals: [
        {
          category: '仕事',
          totalMinutes: 180,
          recordCount: 6,
          averageProductivity: 4.2,
        },
      ],
      totalMinutes: 180,
      insights: '既存のサマリー',
      motivation: '素晴らしい！',
      generatedAt: '2024-01-15T18:00:00.000Z',
    };

    it('既存のサマリーがある場合はそれを返す', async () => {
      mockDatabase.getDailySummary.mockResolvedValue(existingSummary);

      const result = await summaryService.getDailySummary(
        mockUserId,
        mockBusinessDate
      );

      expect(result).toEqual(existingSummary);
      expect(mockDatabase.getDailySummary).toHaveBeenCalledWith(
        mockUserId,
        mockBusinessDate
      );
      // 新規生成されないことを確認
      expect(mockGeminiService.generateDailySummary).not.toHaveBeenCalled();
    });

    it('既存のサマリーがない場合は新規生成する', async () => {
      mockDatabase.getDailySummary.mockResolvedValue(null);
      // 生成処理のモック（上記のモックを再利用）
      const newSummary: DailySummary = {
        date: mockBusinessDate,
        categoryTotals: [],
        totalMinutes: 0,
        insights: '新規生成されたサマリー',
        motivation: '頑張りましょう！',
        generatedAt: new Date().toISOString(),
      };
      
      // generateDailySummaryのスパイを設定
      const generateSpy = jest.spyOn(summaryService, 'generateDailySummary')
        .mockResolvedValue(newSummary);

      const result = await summaryService.getDailySummary(
        mockUserId,
        mockBusinessDate
      );

      expect(result).toEqual(newSummary);
      expect(generateSpy).toHaveBeenCalledWith(mockUserId, mockBusinessDate);
    });
  });

  describe('formatDailySummary', () => {
    const summary: DailySummary = {
      date: '2024-01-15',
      categoryTotals: [
        {
          category: '仕事',
          totalMinutes: 150,
          recordCount: 5,
          averageProductivity: 4.2,
        },
        {
          category: '会議',
          totalMinutes: 60,
          recordCount: 2,
          averageProductivity: 3,
        },
        {
          category: '休憩',
          totalMinutes: 30,
          recordCount: 1,
          averageProductivity: 2,
        },
      ],
      totalMinutes: 240,
      insights: '今日は生産的な一日でした。',
      motivation: '明日も頑張りましょう！',
      generatedAt: '2024-01-15T18:00:00.000Z',
    };

    it('日次サマリーをDiscord形式でフォーマットする', () => {
      const result = summaryService.formatDailySummary(summary);

      // 検証：必要な情報が含まれているか
      expect(result).toContain('2024年1月15日');
      expect(result).toContain('活動サマリー');
      expect(result).toContain('総活動時間**: 4時間0分');
      expect(result).toContain('仕事**: 2時間30分 (5回) ★★★★');
      expect(result).toContain('会議**: 1時間0分 (2回) ★★★');
      expect(result).toContain('休憩**: 30分 (1回) ★★');
      expect(result).toContain('今日は生産的な一日でした。');
      expect(result).toContain('明日も頑張りましょう！');
    });
  });

  describe('formatBriefSummary', () => {
    const summary: DailySummary = {
      date: '2024-01-15',
      categoryTotals: [
        {
          category: '仕事',
          totalMinutes: 180,
          recordCount: 6,
          averageProductivity: 4,
        },
        {
          category: '会議',
          totalMinutes: 60,
          recordCount: 2,
          averageProductivity: 3,
        },
        {
          category: '休憩',
          totalMinutes: 30,
          recordCount: 1,
          averageProductivity: 2,
        },
        {
          category: '勉強',
          totalMinutes: 20,
          recordCount: 1,
          averageProductivity: 4,
        },
      ],
      totalMinutes: 290,
      insights: '充実した一日でした。',
      motivation: '素晴らしい進捗です！',
      generatedAt: '2024-01-15T18:00:00.000Z',
    };

    it('簡潔な日次サマリーを生成する（上位3カテゴリのみ）', () => {
      const result = summaryService.formatBriefSummary(summary);

      // 検証：必要な情報が含まれているか
      expect(result).toContain('今日一日お疲れさまでした！');
      expect(result).toContain('総活動時間: **4時間50分**');
      expect(result).toContain('仕事(3h0m)');
      expect(result).toContain('会議(1h0m)');
      expect(result).toContain('休憩(30m)');
      expect(result).not.toContain('勉強'); // 4番目なので含まれない
      expect(result).toContain('充実した一日でした。');
      expect(result).toContain('素晴らしい進捗です！');
    });
  });

  describe('getCategoryStats', () => {
    const mockActivities: ActivityRecord[] = [
      {
        id: 'test-1',
        userId: mockUserId,
        timeSlot: '2024-01-15 09:00:00',
        originalText: 'プログラミング',
        analysis: {
          category: '仕事',
          structuredContent: 'コーディング',
          estimatedMinutes: 30,
          productivityLevel: 5,
        },
        createdAt: '2024-01-15 09:05:00',
        updatedAt: '2024-01-15 09:05:00',
      },
      {
        id: 'test-2',
        userId: mockUserId,
        timeSlot: '2024-01-15 09:30:00',
        originalText: 'コードレビュー',
        analysis: {
          category: '仕事',
          structuredContent: 'レビュー',
          estimatedMinutes: 20,
          productivityLevel: 4,
        },
        createdAt: '2024-01-15 09:35:00',
        updatedAt: '2024-01-15 09:35:00',
      },
      {
        id: 'test-3',
        userId: mockUserId,
        timeSlot: '2024-01-15 10:00:00',
        originalText: '会議',
        analysis: {
          category: '会議',
          structuredContent: '定例会議',
          estimatedMinutes: 30,
          productivityLevel: 3,
        },
        createdAt: '2024-01-15 10:05:00',
        updatedAt: '2024-01-15 10:05:00',
      },
    ];

    it('カテゴリ別の詳細統計を計算する', async () => {
      mockDatabase.getActivityRecords.mockResolvedValue(mockActivities);

      const stats = await summaryService.getCategoryStats(mockUserId, mockBusinessDate);

      // 検証
      expect(stats.categories).toHaveLength(2);
      expect(stats.categories[0]).toEqual({
        category: '仕事',
        totalMinutes: 50,
        recordCount: 2,
        averageProductivity: 4.5,
      });
      expect(stats.categories[1]).toEqual({
        category: '会議',
        totalMinutes: 30,
        recordCount: 1,
        averageProductivity: 3,
      });
      expect(stats.mostProductiveCategory).toBe('仕事');
      expect(stats.totalActivities).toBe(3);
      expect(stats.averageActivityDuration).toBe(27); // (30+20+30)/3
    });
  });
});