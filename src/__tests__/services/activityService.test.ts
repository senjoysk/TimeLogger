import { ActivityService } from '../../services/activityService';
import { Database } from '../../database/database';
import { GeminiService } from '../../services/geminiService';
import { ActivityRecord, ActivityAnalysis } from '../../types';

// モッククラスの作成
jest.mock('../../database/database');
jest.mock('../../services/geminiService');

describe('ActivityService', () => {
  let activityService: ActivityService;
  let mockDatabase: jest.Mocked<Database>;
  let mockGeminiService: jest.Mocked<GeminiService>;

  beforeEach(() => {
    mockDatabase = new Database() as jest.Mocked<Database>;
    mockGeminiService = new GeminiService(mockDatabase) as jest.Mocked<GeminiService>;
    activityService = new ActivityService(mockDatabase, mockGeminiService);

    // デフォルトのモック設定
    mockGeminiService.analyzeActivity.mockResolvedValue({
      category: 'テスト',
      subCategory: 'ユニットテスト',
      structuredContent: 'テスト活動の記録',
      estimatedMinutes: 30,
      productivityLevel: 4,
      startTime: '2025-06-27T03:00:00.000Z',
      endTime: '2025-06-27T03:30:00.000Z'
    });

    mockDatabase.saveActivityRecord.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('processActivityRecord', () => {
    it('ユーザー入力を正しく処理して活動記録を作成する', async () => {
      const userId = 'test-user-123';
      const userInput = 'テストコードを書いていた';
      const timezone = 'Asia/Tokyo';

      mockGeminiService.analyzeActivity.mockResolvedValue({
        category: '仕事',
        subCategory: 'プログラミング',
        structuredContent: 'テストコードの作成',
        estimatedMinutes: 60,
        productivityLevel: 5,
        startTime: '2025-06-27T03:00:00.000Z',
        endTime: '2025-06-27T04:00:00.000Z'
      });

      const result = await activityService.processActivityRecord(userId, userInput, timezone);

      expect(result).toHaveLength(2); // 60分なので2つの30分スロット
      expect(result[0]).toMatchObject({
        userId,
        originalText: userInput,
        category: '仕事',
        subCategory: 'プログラミング'
      });
      expect(result[0].analysis).toMatchObject({
        category: '仕事',
        subCategory: 'プログラミング',
        structuredContent: 'テストコードの作成',
        productivityLevel: 5
      });
      expect(mockDatabase.saveActivityRecord).toHaveBeenCalledTimes(2);
    });

    it('30分以内の活動は1つのスロットに記録される', async () => {
      const userId = 'test-user-123';
      const userInput = '短時間のミーティング';
      const timezone = 'Asia/Tokyo';

      mockGeminiService.analyzeActivity.mockResolvedValue({
        category: '仕事',
        subCategory: '会議',
        structuredContent: '短時間のミーティング参加',
        estimatedMinutes: 15,
        productivityLevel: 3,
        startTime: '2025-06-27T03:00:00.000Z',
        endTime: '2025-06-27T03:15:00.000Z'
      });

      const result = await activityService.processActivityRecord(userId, userInput, timezone);

      expect(result).toHaveLength(1);
      expect(result[0].analysis.estimatedMinutes).toBe(15);
      expect(mockDatabase.saveActivityRecord).toHaveBeenCalledTimes(1);
    });

    it('エラーが発生した場合は適切にハンドリングする', async () => {
      const userId = 'test-user-123';
      const userInput = 'テスト入力';
      const timezone = 'Asia/Tokyo';

      mockGeminiService.analyzeActivity.mockRejectedValue(new Error('API エラー'));

      await expect(
        activityService.processActivityRecord(userId, userInput, timezone)
      ).rejects.toThrow('API エラー');
    });

    it('時間情報が含まれない場合はデフォルト時間を使用する', async () => {
      const userId = 'test-user-123';
      const userInput = '作業していた';
      const timezone = 'Asia/Tokyo';
      const inputTime = new Date('2025-06-27T03:30:00.000Z');

      mockGeminiService.analyzeActivity.mockResolvedValue({
        category: '仕事',
        subCategory: undefined,
        structuredContent: '作業',
        estimatedMinutes: 30,
        productivityLevel: 3,
        startTime: undefined,
        endTime: undefined
      });

      const result = await activityService.processActivityRecord(userId, userInput, timezone, inputTime);

      expect(result).toHaveLength(1);
      expect(result[0].analysis.estimatedMinutes).toBe(30);
    });
  });

  describe('getRecentActivities', () => {
    it('最近の活動記録を取得する', async () => {
      const userId = 'test-user-123';
      const timezone = 'Asia/Tokyo';
      const limit = 3;

      const mockActivities: ActivityRecord[] = [
        {
          id: '1',
          userId,
          timeSlot: '2025-06-27 12:00:00',
          originalText: '最新の活動',
          analysis: {
            category: '仕事',
            subCategory: 'プログラミング',
            structuredContent: '最新の活動記録',
            estimatedMinutes: 30,
            productivityLevel: 4
          },
          category: '仕事',
          subCategory: 'プログラミング',
          createdAt: '2025-06-27 12:30:00',
          updatedAt: '2025-06-27 12:30:00'
        }
      ];

      mockDatabase.getActivityRecords.mockResolvedValue(mockActivities);

      const result = await activityService.getRecentActivities(userId, timezone, limit);

      expect(result).toEqual(mockActivities);
      expect(mockDatabase.getActivityRecords).toHaveBeenCalledWith(userId, timezone);
    });
  });

  // calculateTimeSlotsはprivateメソッドなので、外部からのテストは行わない
  // 代わりにprocessActivityRecordの統合テストで動作を確認する
});