import { SummaryService } from '../../services/summaryService';
import { Database } from '../../database/database';
import { GeminiService } from '../../services/geminiService';
import { ActivityRecord, DailySummary, CategoryTotal } from '../../types';

// モッククラスの作成
jest.mock('../../database/database');
jest.mock('../../services/geminiService');

describe('SummaryService', () => {
  let summaryService: SummaryService;
  let mockDatabase: jest.Mocked<Database>;
  let mockGeminiService: jest.Mocked<GeminiService>;

  beforeEach(() => {
    mockDatabase = new Database() as jest.Mocked<Database>;
    mockGeminiService = new GeminiService(mockDatabase) as jest.Mocked<GeminiService>;
    summaryService = new SummaryService(mockDatabase, mockGeminiService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getDailySummary', () => {
    it('既存のサマリーがある場合はそれを返す', async () => {
      const userId = 'test-user';
      const timezone = 'Asia/Tokyo';
      const businessDate = '2025-06-27';

      const existingSummary: DailySummary = {
        date: businessDate,
        categoryTotals: [],
        totalMinutes: 480,
        insights: 'テスト感想',
        motivation: 'テスト励まし',
        generatedAt: '2025-06-27T10:00:00.000Z'
      };

      mockDatabase.getDailySummary.mockResolvedValue(existingSummary);

      const result = await summaryService.getDailySummary(userId, timezone, businessDate);

      expect(result).toEqual(existingSummary);
      expect(mockDatabase.getDailySummary).toHaveBeenCalledWith(userId, timezone, businessDate);
    });

    it('既存のサマリーがない場合は新規生成する', async () => {
      const userId = 'test-user';
      const timezone = 'Asia/Tokyo';
      const businessDate = '2025-06-27';

      const mockActivities: ActivityRecord[] = [
        {
          id: '1',
          userId,
          timeSlot: '2025-06-27 09:00:00',
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
          createdAt: '2025-06-27 09:30:00',
          updatedAt: '2025-06-27 09:30:00'
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
        generatedAt: '2025-06-27T10:00:00.000Z'
      };

      mockDatabase.getDailySummary.mockResolvedValue(null);
      mockDatabase.getActivityRecords.mockResolvedValue(mockActivities);
      mockGeminiService.generateDailySummary.mockResolvedValue(generatedSummary);
      mockDatabase.saveDailySummary.mockResolvedValue(undefined);

      const result = await summaryService.getDailySummary(userId, timezone, businessDate);

      expect(result).toEqual(generatedSummary);
      expect(mockDatabase.getActivityRecords).toHaveBeenCalledWith(userId, timezone, businessDate);
      expect(mockGeminiService.generateDailySummary).toHaveBeenCalledWith(mockActivities, businessDate);
      expect(mockDatabase.saveDailySummary).toHaveBeenCalledWith(generatedSummary, timezone);
    });

    it('活動記録がない場合は空のサマリーを返す', async () => {
      const userId = 'test-user';
      const timezone = 'Asia/Tokyo';
      const businessDate = '2025-06-27';

      mockDatabase.getDailySummary.mockResolvedValue(null);
      mockDatabase.getActivityRecords.mockResolvedValue([]);

      const result = await summaryService.getDailySummary(userId, timezone, businessDate);

      expect(result.totalMinutes).toBe(0);
      expect(result.categoryTotals).toEqual([]);
      expect(result.date).toBe(businessDate);
    });
  });

  describe('formatBriefSummary', () => {
    it('サマリーを正しくフォーマットする', () => {
      const summary: DailySummary = {
        date: '2025-06-27',
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
        generatedAt: '2025-06-27T10:00:00.000Z'
      };

      const result = summaryService.formatBriefSummary(summary);

      expect(result).toContain('📊 **今日の活動サマリー**');
      expect(result).toContain('⏱️ 総活動時間: **3時間0分**');
      expect(result).toContain('• **仕事**: 2h30m');
      expect(result).toContain('  - プログラミング: 1h30m');
      expect(result).toContain('  - ミーティング: 1h0m');
      expect(result).toContain('• **休憩**: 30m');
      expect(result).toContain('  - コーヒーブレイク: 30m');
    });

    it('分のみの場合は正しくフォーマットする', () => {
      const summary: DailySummary = {
        date: '2025-06-27',
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
        generatedAt: '2025-06-27T10:00:00.000Z'
      };

      const result = summaryService.formatBriefSummary(summary);

      expect(result).toContain('⏱️ 総活動時間: **45分**');
      expect(result).toContain('• **休憩**: 45m');
    });
  });

  describe('buildDetailedCategoryBreakdown', () => {
    it('カテゴリとサブカテゴリを正しいインデントで表示する', () => {
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

      const result = summaryService['buildDetailedCategoryBreakdown'](categoryTotals);

      expect(result).toContain('• **仕事**: 2h0m');
      expect(result).toContain('  - プログラミング: 1h30m');
      expect(result).toContain('  - ミーティング: 30m');
    });
  });
});