/**
 * AnalysisCacheService テスト
 * キャッシュ無効化ロジックの動作確認
 */

import { AnalysisCacheService } from '../../services/analysisCacheService';
import { DailyAnalysisResult, ActivityLog } from '../../types/activityLog';

// モックリポジトリ
class MockRepository {
  private caches: Map<string, any> = new Map();
  private logs: ActivityLog[] = [];

  async getAnalysisCache(userId: string, businessDate: string) {
    const key = `${userId}-${businessDate}`;
    return this.caches.get(key) || null;
  }

  async saveAnalysisCache(request: any) {
    const key = `${request.userId}-${request.businessDate}`;
    const cache = {
      id: 'test-cache-id',
      userId: request.userId,
      businessDate: request.businessDate,
      analysisResult: request.analysisResult,
      logCount: request.logCount,
      generatedAt: new Date().toISOString()
    };
    this.caches.set(key, cache);
    return cache;
  }

  async deleteAnalysisCache(userId: string, businessDate: string) {
    const key = `${userId}-${businessDate}`;
    const existed = this.caches.has(key);
    this.caches.delete(key);
    return existed;
  }
  
  async cleanupOldCaches(olderThanDays: number): Promise<number> {
    const oldCacheCount = this.caches.size;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    
    for (const [key, cache] of this.caches.entries()) {
      const cacheDate = new Date(cache.generatedAt);
      if (cacheDate < cutoffDate) {
        this.caches.delete(key);
      }
    }
    
    return oldCacheCount - this.caches.size;
  }

  async getLogCountByDate(userId: string, businessDate: string) {
    return this.logs.filter(log => 
      log.userId === userId && log.businessDate === businessDate
    ).length;
  }

  async getLogsByDate(userId: string, businessDate: string) {
    return this.logs.filter(log => 
      log.userId === userId && log.businessDate === businessDate
    );
  }

  // テスト用のログ追加メソッド
  addTestLog(log: ActivityLog) {
    this.logs.push(log);
  }

  // テスト用のログ更新メソッド
  updateTestLog(id: string, updatedAt: string) {
    const log = this.logs.find(l => l.id === id);
    if (log) {
      log.updatedAt = updatedAt;
    }
  }

  // テスト用のキャッシュ取得メソッド
  getTestCache(userId: string, businessDate: string) {
    const key = `${userId}-${businessDate}`;
    return this.caches.get(key);
  }

  // テスト用のキャッシュクリアメソッド
  clearTestCaches() {
    this.caches.clear();
    this.logs = [];
  }
}

describe('AnalysisCacheService', () => {
  let cacheService: AnalysisCacheService;
  let mockRepository: MockRepository;

  beforeEach(() => {
    mockRepository = new MockRepository();
    cacheService = new AnalysisCacheService(mockRepository as any, {
      maxAgeMinutes: 60,
      invalidateOnLogCountChange: true,
      forceRefreshHours: 6,
      autoCleanupDays: 7
    });
  });

  describe('ログ数変更によるキャッシュ無効化', () => {
    test('ログ数が変更された場合、キャッシュが無効化される', async () => {
      const userId = 'test-user';
      const businessDate = '2025-06-30';

      // 初期ログを追加
      mockRepository.addTestLog({
        id: 'log1',
        userId,
        businessDate,
        content: 'テストログ1',
        inputTimestamp: new Date().toISOString(),
        isDeleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // キャッシュを保存（ログ数1）
      const analysisResult: DailyAnalysisResult = {
        businessDate,
        totalLogCount: 1,
        generatedAt: new Date().toISOString(),
        categories: [],
        timeline: [],
        timeDistribution: { 
          totalEstimatedMinutes: 0,
          workingMinutes: 0,
          breakMinutes: 0,
          unaccountedMinutes: 0,
          overlapMinutes: 0
        },
        insights: {
          productivityScore: 0,
          workBalance: {
            focusTimeRatio: 0,
            meetingTimeRatio: 0,
            breakTimeRatio: 0,
            adminTimeRatio: 0
          },
          suggestions: [],
          highlights: [],
          motivation: ''
        },
        warnings: []
      };

      await cacheService.setCache(userId, businessDate, analysisResult, 1);

      // キャッシュが取得できることを確認
      let cachedResult = await cacheService.getCache(userId, businessDate);
      expect(cachedResult).not.toBeNull();

      // 新しいログを追加（ログ数を2に変更）
      mockRepository.addTestLog({
        id: 'log2',
        userId,
        businessDate,
        content: 'テストログ2',
        inputTimestamp: new Date().toISOString(),
        isDeleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // ログ数変更によりキャッシュが無効化されることを確認
      cachedResult = await cacheService.getCache(userId, businessDate);
      expect(cachedResult).toBeNull();
    });
  });

  describe('ログ内容変更によるキャッシュ無効化', () => {
    test('ログが更新された場合、キャッシュが無効化される', async () => {
      // 一時的にテストタイムアウトを設定
      jest.setTimeout(1000);
      const userId = 'test-user';
      const businessDate = '2025-06-30';
      const baseTime = new Date();
      const oldTime = new Date(baseTime.getTime() - 60000).toISOString(); // 1分前
      const newTime = new Date(baseTime.getTime() + 60000).toISOString(); // 1分後

      // ログを追加
      mockRepository.addTestLog({
        id: 'log1',
        userId,
        businessDate,
        content: 'テストログ',
        inputTimestamp: oldTime,
        isDeleted: false,
        createdAt: oldTime,
        updatedAt: oldTime
      });

      // キャッシュを保存（古い時刻）
      const analysisResult: DailyAnalysisResult = {
        businessDate,
        totalLogCount: 1,
        generatedAt: new Date().toISOString(),
        categories: [],
        timeline: [],
        timeDistribution: { 
          totalEstimatedMinutes: 0,
          workingMinutes: 0,
          breakMinutes: 0,
          unaccountedMinutes: 0,
          overlapMinutes: 0
        },
        insights: {
          productivityScore: 0,
          workBalance: {
            focusTimeRatio: 0,
            meetingTimeRatio: 0,
            breakTimeRatio: 0,
            adminTimeRatio: 0
          },
          suggestions: [],
          highlights: [],
          motivation: ''
        },
        warnings: []
      };

      // キャッシュを保存
      await cacheService.setCache(userId, businessDate, analysisResult, 1);
      
      // キャッシュが取得できることを確認
      let cachedResult = await cacheService.getCache(userId, businessDate);
      expect(cachedResult).not.toBeNull();

      // 少し待機してから、ログの更新時刻を新しくする（内容変更をシミュレート）
      await new Promise(resolve => setTimeout(resolve, 10));
      mockRepository.updateTestLog('log1', newTime);

      // ログ内容変更によりキャッシュが無効化されることを確認
      cachedResult = await cacheService.getCache(userId, businessDate);
      expect(cachedResult).toBeNull();
    });
  });

  describe('キャッシュ無効化メソッド', () => {
    test('invalidateCache が正しく動作する', async () => {
      const userId = 'test-user';
      const businessDate = '2025-06-30';

      // キャッシュを保存
      const analysisResult: DailyAnalysisResult = {
        businessDate,
        totalLogCount: 1,
        generatedAt: new Date().toISOString(),
        categories: [],
        timeline: [],
        timeDistribution: { 
          totalEstimatedMinutes: 0,
          workingMinutes: 0,
          breakMinutes: 0,
          unaccountedMinutes: 0,
          overlapMinutes: 0
        },
        insights: {
          productivityScore: 0,
          workBalance: {
            focusTimeRatio: 0,
            meetingTimeRatio: 0,
            breakTimeRatio: 0,
            adminTimeRatio: 0
          },
          suggestions: [],
          highlights: [],
          motivation: ''
        },
        warnings: []
      };

      await cacheService.setCache(userId, businessDate, analysisResult, 1);

      // キャッシュが存在することを確認、ただしgetCacheはログ数をチェックするので、
      // ログを1を追加しておく
      mockRepository.addTestLog({
        id: 'log-invalidate',
        userId,
        businessDate,
        content: 'テストログ',
        inputTimestamp: new Date().toISOString(),
        isDeleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      
      let cachedResult = await cacheService.getCache(userId, businessDate);
      expect(cachedResult).not.toBeNull();

      // キャッシュを無効化
      const invalidated = await cacheService.invalidateCache(userId, businessDate);
      expect(invalidated).toBe(true);

      // キャッシュが無効化されていることを確認
      cachedResult = await cacheService.getCache(userId, businessDate);
      expect(cachedResult).toBeNull();
    });
  });

  describe('キャッシュ有効性チェック', () => {
    test('isCacheValid が正しくログ数変更を検知する', async () => {
      const userId = 'test-user';
      const businessDate = '2025-06-30';

      // まずキャッシュを作成
      const analysisResult: DailyAnalysisResult = {
        businessDate,
        totalLogCount: 3,
        generatedAt: new Date().toISOString(),
        categories: [],
        timeline: [],
        timeDistribution: { 
          totalEstimatedMinutes: 0,
          workingMinutes: 0,
          breakMinutes: 0,
          unaccountedMinutes: 0,
          overlapMinutes: 0
        },
        insights: {
          productivityScore: 0,
          workBalance: {
            focusTimeRatio: 0,
            meetingTimeRatio: 0,
            breakTimeRatio: 0,
            adminTimeRatio: 0
          },
          suggestions: [],
          highlights: [],
          motivation: ''
        },
        warnings: []
      };
      
      // ログ数3でキャッシュを保存
      await cacheService.setCache(userId, businessDate, analysisResult, 3);

      // 同じログ数3でキャッシュが有効
      let isValid = await cacheService.isCacheValid(userId, businessDate, 3);
      expect(isValid).toBe(true);

      // ログ数が変更された場合は無効
      isValid = await cacheService.isCacheValid(userId, businessDate, 5);
      expect(isValid).toBe(false);
    });
  });
});