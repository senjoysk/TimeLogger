import { SummaryService } from '../../services/summaryService';
import { ActivityRecord, DailySummary, CategoryTotal } from '../../types';
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

      mockRepository.getDailySummary.mockResolvedValue(existingSummary);

      const result = await summaryService.getDailySummary(userId, timezone, businessDate);

      expect(result).toEqual(existingSummary);
      expect(mockRepository.getDailySummary).toHaveBeenCalledWith(userId, timezone, businessDate);
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

      mockRepository.getDailySummary.mockResolvedValue(null);
      mockRepository.getActivityRecords.mockResolvedValue(mockActivities);
      mockAnalysisService.generateDailySummary.mockResolvedValue(generatedSummary);
      mockRepository.saveDailySummary.mockResolvedValue(undefined);

      const result = await summaryService.getDailySummary(userId, timezone, businessDate);

      expect(result).toEqual(generatedSummary);
      expect(mockRepository.getActivityRecords).toHaveBeenCalledWith(userId, timezone, businessDate);
      expect(mockAnalysisService.generateDailySummary).toHaveBeenCalledWith(mockActivities, businessDate);
      expect(mockRepository.saveDailySummary).toHaveBeenCalledWith(generatedSummary, timezone);
    });

    it('活動記録がない場合は空のサマリーを返す', async () => {
      const userId = 'test-user';
      const timezone = 'Asia/Tokyo';
      const businessDate = '2025-06-27';

      mockRepository.getDailySummary.mockResolvedValue(null);
      mockRepository.getActivityRecords.mockResolvedValue([]);

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