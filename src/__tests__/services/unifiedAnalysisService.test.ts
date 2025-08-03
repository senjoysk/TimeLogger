/**
 * UnifiedAnalysisService のテスト
 * 実装に即したシンプルなテストスイート
 */

import { UnifiedAnalysisService } from '../../services/unifiedAnalysisService';
import { ActivityLog } from '../../types/activityLog';

// 最小限のモック実装
class MockRepository {
  private logs: ActivityLog[] = [];

  setLogs(logs: ActivityLog[]): void {
    this.logs = logs;
  }

  async getLogsByDate(userId: string, businessDate: string): Promise<ActivityLog[]> {
    return this.logs.filter(log => 
      log.userId === userId && log.businessDate === businessDate
    );
  }

  async getLogCountByDate(userId: string, businessDate: string): Promise<number> {
    return this.logs.filter(log => 
      log.userId === userId && log.businessDate === businessDate
    ).length;
  }

  async isCacheValid(): Promise<boolean> {
    return false; // テストでは常に新しい分析を実行
  }

  async saveAnalysisCache(): Promise<void> {
    // テスト用のダミー実装
  }
}


// Gemini API のシンプルなモック
const mockGenerateContent = jest.fn().mockImplementation(async () => ({
  response: {
    text: () => JSON.stringify({
      categories: [
        {
          category: 'Work',
          estimatedMinutes: 60,
          confidence: 0.8,
          logCount: 1,
          representativeActivities: ['作業']
        }
      ],
      timeline: [
        {
          startTime: '2024-01-15T09:00:00Z',
          endTime: '2024-01-15T10:00:00Z',
          category: 'Work',
          content: '作業',
          confidence: 0.8,
          sourceLogIds: ['log-1']
        }
      ],
      timeDistribution: {
        totalEstimatedMinutes: 60,
        workingMinutes: 60,
        breakMinutes: 0,
        unaccountedMinutes: 0,
        overlapMinutes: 0
      },
      insights: {
        productivityScore: 80,
        workBalance: {
          focusTimeRatio: 1.0,
          meetingTimeRatio: 0.0,
          breakTimeRatio: 0.0,
          adminTimeRatio: 0.0
        },
        suggestions: ['良い調子です'],
        highlights: ['効率的でした'],
        motivation: '頑張りました！'
      },
      warnings: [],
      confidence: 0.8
    })
  }
}));

// Google Generative AI のモック
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: mockGenerateContent
    })
  }))
}));

describe('UnifiedAnalysisService', () => {
  let service: UnifiedAnalysisService;
  let mockRepository: MockRepository;

  beforeEach(() => {
    mockRepository = new MockRepository();
    service = new UnifiedAnalysisService(mockRepository as any);
    
    mockGenerateContent.mockClear();
  });

  describe('Test Setup', () => {
    test('環境設定が正しく行われている', () => {
      expect(service).toBeDefined();
      expect(mockRepository).toBeDefined();
    });
  });

  describe('estimateTokenCount', () => {
    test('空のログ配列で0以上のトークン数が返される', () => {
      const tokenCount = service.estimateTokenCount([]);
      expect(tokenCount).toBeGreaterThanOrEqual(0);
      expect(typeof tokenCount).toBe('number');
    });

    test('ログがあるとき適切なトークン数が推定される', () => {
      const logs: ActivityLog[] = [
        {
          id: 'log-1',
          userId: 'test-user',
          content: 'これは短いログです',
          inputTimestamp: '2024-01-15T09:00:00Z',
          businessDate: '2024-01-15',
          isDeleted: false,
          createdAt: '2024-01-15T09:00:00Z',
          updatedAt: '2024-01-15T09:00:00Z'
        }
      ];

      const tokenCount = service.estimateTokenCount(logs);
      expect(tokenCount).toBeGreaterThan(0);
      expect(typeof tokenCount).toBe('number');
    });

    test('長いログでより多くのトークン数が推定される', () => {
      const shortLogs: ActivityLog[] = [
        {
          id: 'log-1',
          userId: 'test-user',
          content: '短い',
          inputTimestamp: '2024-01-15T09:00:00Z',
          businessDate: '2024-01-15',
          isDeleted: false,
          createdAt: '2024-01-15T09:00:00Z',
          updatedAt: '2024-01-15T09:00:00Z'
        }
      ];

      const longLogs: ActivityLog[] = [
        {
          id: 'log-1',
          userId: 'test-user',
          content: 'これは非常に長いログエントリーで、多くの詳細情報を含んでいます。プロジェクトの進行状況、会議の内容、作業の詳細、課題や問題点、解決策、今後の計画など、様々な情報が記録されています。',
          inputTimestamp: '2024-01-15T09:00:00Z',
          businessDate: '2024-01-15',
          isDeleted: false,
          createdAt: '2024-01-15T09:00:00Z',
          updatedAt: '2024-01-15T09:00:00Z'
        }
      ];

      const shortTokens = service.estimateTokenCount(shortLogs);
      const longTokens = service.estimateTokenCount(longLogs);
      
      expect(longTokens).toBeGreaterThan(shortTokens);
    });
  });

  describe('analyzeDaily', () => {
    test('空のログでも適切に処理される', async () => {
      mockRepository.setLogs([]);
      
      const result = await service.analyzeDaily({
        userId: 'test-user',
        businessDate: '2024-01-15',
        timezone: 'Asia/Tokyo'
      });

      expect(result).toBeDefined();
      expect(result.businessDate).toBe('2024-01-15');
      expect(result.totalLogCount).toBe(0);
      expect(result.categories).toHaveLength(0);
      expect(result.timeline).toHaveLength(0);
      expect(result.timeDistribution.totalEstimatedMinutes).toBe(0);
      
      // 空のログの場合はGemini APIが呼ばれないことを確認
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    test('少数のログで一括分析が実行される', async () => {
      const testLogs: ActivityLog[] = [
        {
          id: 'log-1',
          userId: 'test-user',
          content: 'プロジェクト作業を実施',
          inputTimestamp: '2024-01-15T09:00:00Z',
          businessDate: '2024-01-15',
          isDeleted: false,
          createdAt: '2024-01-15T09:00:00Z',
          updatedAt: '2024-01-15T09:00:00Z'
        }
      ];

      mockRepository.setLogs(testLogs);
      
      const result = await service.analyzeDaily({
        userId: 'test-user',
        businessDate: '2024-01-15',
        timezone: 'Asia/Tokyo'
      });

      expect(result).toBeDefined();
      expect(result.businessDate).toBe('2024-01-15');
      expect(result.totalLogCount).toBe(1);
      expect(result.categories.length).toBeGreaterThan(0);
      expect(result.timeline.length).toBeGreaterThan(0);
      
      // Gemini APIが呼ばれたことを確認
      expect(mockGenerateContent).toHaveBeenCalled();
    });

    test('強制リフレッシュフラグが動作する', async () => {
      const testLogs: ActivityLog[] = [
        {
          id: 'log-1',
          userId: 'test-user',
          content: 'テスト作業',
          inputTimestamp: '2024-01-15T09:00:00Z',
          businessDate: '2024-01-15',
          isDeleted: false,
          createdAt: '2024-01-15T09:00:00Z',
          updatedAt: '2024-01-15T09:00:00Z'
        }
      ];

      mockRepository.setLogs(testLogs);
      
      // forceRefresh: true で実行
      const result = await service.analyzeDaily({
        userId: 'test-user',
        businessDate: '2024-01-15',
        timezone: 'Asia/Tokyo',
        forceRefresh: true
      });

      expect(result).toBeDefined();
      expect(result.businessDate).toBe('2024-01-15');
      expect(mockGenerateContent).toHaveBeenCalled();
    });
  });

  describe('getCachedAnalysis', () => {
    test('キャッシュが存在しない場合はnullが返される', async () => {
      const result = await service.getCachedAnalysis('nonexistent-user', '2024-01-15');
      expect(result).toBeNull();
    });
  });

  describe('エラーハンドリング', () => {
    test('Gemini API エラー時に適切なエラーが投げられる', async () => {
      // API エラーを発生させる
      mockGenerateContent.mockRejectedValueOnce(new Error('API接続エラー'));
      
      const testLogs: ActivityLog[] = [
        {
          id: 'log-1',
          userId: 'test-user',
          content: 'テストログ',
          inputTimestamp: '2024-01-15T09:00:00Z',
          businessDate: '2024-01-15',
          isDeleted: false,
          createdAt: '2024-01-15T09:00:00Z',
          updatedAt: '2024-01-15T09:00:00Z'
        }
      ];

      mockRepository.setLogs(testLogs);
      
      await expect(service.analyzeDaily({
        userId: 'test-user',
        businessDate: '2024-01-15',
        timezone: 'Asia/Tokyo'
      })).rejects.toThrow();
    });

    test('リポジトリエラー時に適切なエラーが投げられる', async () => {
      // リポジトリエラーを発生させる
      jest.spyOn(mockRepository, 'getLogsByDate').mockRejectedValueOnce(new Error('データベースエラー'));
      
      await expect(service.analyzeDaily({
        userId: 'test-user',
        businessDate: '2024-01-15',
        timezone: 'Asia/Tokyo'
      })).rejects.toThrow();
    });

    test('無効なJSONレスポンスでもエラーハンドリングされる', async () => {
      // 無効なJSONレスポンスを設定
      mockGenerateContent.mockImplementationOnce(async () => ({
        response: {
          text: () => '{ invalid json }'
        }
      }));

      const testLogs: ActivityLog[] = [
        {
          id: 'log-1',
          userId: 'test-user',
          content: 'テストログ',
          inputTimestamp: '2024-01-15T09:00:00Z',
          businessDate: '2024-01-15',
          isDeleted: false,
          createdAt: '2024-01-15T09:00:00Z',
          updatedAt: '2024-01-15T09:00:00Z'
        }
      ];

      mockRepository.setLogs(testLogs);
      
      await expect(service.analyzeDaily({
        userId: 'test-user',
        businessDate: '2024-01-15',
        timezone: 'Asia/Tokyo'
      })).rejects.toThrow();
    });
  });

  describe('パフォーマンス', () => {
    test('トークン数推定のパフォーマンス', () => {
      const largeLogs: ActivityLog[] = Array.from({ length: 100 }, (_, i) => ({
        id: `log-${i}`,
        userId: 'test-user',
        content: `活動${i}: プロジェクト関連の作業を実施しました。`,
        inputTimestamp: '2024-01-15T09:00:00Z',
        businessDate: '2024-01-15',
        isDeleted: false,
        createdAt: '2024-01-15T09:00:00Z',
        updatedAt: '2024-01-15T09:00:00Z'
      }));

      const startTime = Date.now();
      const tokenCount = service.estimateTokenCount(largeLogs);
      const endTime = Date.now();

      expect(tokenCount).toBeGreaterThan(0);
      expect(endTime - startTime).toBeLessThan(1000); // 1秒以内
    });
  });
});