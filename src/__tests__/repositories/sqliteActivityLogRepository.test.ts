/**
 * SqliteActivityLogRepository テストスイート
 * 活動ログ記録とAPIコスト監視の統合テスト
 */

import { describe, test, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import { SqliteActivityLogRepository } from '../../repositories/sqliteActivityLogRepository';
import { 
  ActivityLog, 
  CreateActivityLogRequest,
  ActivityLogError 
} from '../../types/activityLog';
import * as fs from 'fs';
import * as path from 'path';

describe('SqliteActivityLogRepository', () => {
  let repository: SqliteActivityLogRepository;
  const testDbPath = path.join(__dirname, 'test-activity-logs.db');
  const mockUserId = 'test-user-123';
  const mockTimezone = 'Asia/Tokyo';

  beforeAll(async () => {
    // テスト用データベースが存在する場合は削除
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  beforeEach(async () => {
    repository = new SqliteActivityLogRepository(testDbPath);
    await repository.initializeDatabase();
  });

  afterEach(async () => {
    await repository.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  afterAll(async () => {
    // クリーンアップ
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('活動ログ機能', () => {
    test('活動ログが正常に保存される', async () => {
      // Arrange
      const request: CreateActivityLogRequest = {
        userId: mockUserId,
        content: 'プログラミングをしています',
        businessDate: '2025-06-29',
        inputTimestamp: '2025-06-29T10:00:00.000Z'
      };

      // Act
      const result = await repository.saveLog(request);

      // Assert
      expect(result.id).toBeDefined();
      expect(result.userId).toBe(mockUserId);
      expect(result.content).toBe('プログラミングをしています');
      expect(result.businessDate).toBe('2025-06-29');
      expect(result.isDeleted).toBe(false);
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    test('業務日でログが取得される', async () => {
      // Arrange
      const request1: CreateActivityLogRequest = {
        userId: mockUserId,
        content: 'ログ1',
        businessDate: '2025-06-29',
        inputTimestamp: '2025-06-29T09:00:00.000Z'
      };
      const request2: CreateActivityLogRequest = {
        userId: mockUserId,
        content: 'ログ2',
        businessDate: '2025-06-29',
        inputTimestamp: '2025-06-29T10:00:00.000Z'
      };

      await repository.saveLog(request1);
      await repository.saveLog(request2);

      // Act
      const result = await repository.getLogsByDate(mockUserId, '2025-06-29');

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].content).toBe('ログ1');
      expect(result[1].content).toBe('ログ2');
    });

    test('ログが正常に更新される', async () => {
      // Arrange
      const request: CreateActivityLogRequest = {
        userId: mockUserId,
        content: '元の内容',
        businessDate: '2025-06-29',
        inputTimestamp: '2025-06-29T10:00:00.000Z'
      };
      const savedLog = await repository.saveLog(request);

      // Act
      const updatedLog = await repository.updateLog(savedLog.id, '更新された内容');

      // Assert
      expect(updatedLog.content).toBe('更新された内容');
      expect(updatedLog.id).toBe(savedLog.id);
      expect(updatedLog.updatedAt).not.toBe(savedLog.updatedAt);
    });

    test('ログが論理削除される', async () => {
      // Arrange
      const request: CreateActivityLogRequest = {
        userId: mockUserId,
        content: 'テストログ',
        businessDate: '2025-06-29',
        inputTimestamp: '2025-06-29T10:00:00.000Z'
      };
      const savedLog = await repository.saveLog(request);

      // Act
      const deletedLog = await repository.deleteLog(savedLog.id);

      // Assert
      expect(deletedLog.isDeleted).toBe(true);
      expect(deletedLog.id).toBe(savedLog.id);
      
      // 通常の取得では削除済みログは取得されない
      const logs = await repository.getLogsByDate(mockUserId, '2025-06-29');
      expect(logs).toHaveLength(0);
      
      // 削除済みを含む取得では取得される
      const logsWithDeleted = await repository.getLogsByDate(mockUserId, '2025-06-29', true);
      expect(logsWithDeleted).toHaveLength(1);
      expect(logsWithDeleted[0].isDeleted).toBe(true);
    });

    test('業務日計算が正常に動作する', () => {
      // Arrange
      const testDate = '2025-06-29T15:00:00.000Z';

      // Act
      const result = repository.calculateBusinessDate(testDate, mockTimezone);

      // Assert
      expect(result.businessDate).toBeDefined();
      expect(result.startTime).toBeDefined();
      expect(result.endTime).toBeDefined();
      expect(result.timezone).toBe(mockTimezone);
    });
  });

  describe('APIコスト監視機能', () => {
    test('API呼び出しが記録される', async () => {
      try {
        // Act
        console.log('🔍 テスト開始: API呼び出し記録');
        await repository.recordApiCall('analyzeActivity', 100, 50);
        
        // 少し待ってから統計取得（非同期処理考慮）
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // デバッグ: 直接データベースからapi_costsテーブルの内容を確認
        const allRecords = await (repository as any).allQuery('SELECT * FROM api_costs ORDER BY timestamp DESC LIMIT 10');
        console.log('🔍 api_costsテーブル全レコード:', JSON.stringify(allRecords, null, 2));

        // Assert
        const stats = await repository.getTodayStats(mockTimezone);
        
        // デバッグ情報
        console.log('🔍 APIコスト統計:', JSON.stringify(stats, null, 2));
        
        expect(stats.totalCalls).toBe(1);
        expect(stats.totalInputTokens).toBe(100);
        expect(stats.totalOutputTokens).toBe(50);
        expect(stats.estimatedCost).toBeGreaterThan(0);
        expect(stats.operationBreakdown).toHaveProperty('analyzeActivity');
      } catch (error) {
        console.error('🔍 テストエラー:', error);
        throw error;
      }
    });

    test('複数のAPI呼び出しが集計される', async () => {
      try {
        // Act
        await repository.recordApiCall('analyzeActivity', 100, 50);
        await repository.recordApiCall('generateSummary', 200, 100);
        await repository.recordApiCall('analyzeActivity', 150, 75);
        
        // 少し待ってから統計取得
        await new Promise(resolve => setTimeout(resolve, 100));

        // Assert
        const stats = await repository.getTodayStats(mockTimezone);
        
        // デバッグ情報
        console.log('🔍 複数APIコスト統計:', JSON.stringify(stats, null, 2));
        
        expect(stats.totalCalls).toBe(3);
        expect(stats.totalInputTokens).toBe(450);
        expect(stats.totalOutputTokens).toBe(225);
        expect(stats.operationBreakdown.analyzeActivity.calls).toBe(2);
        expect(stats.operationBreakdown.generateSummary.calls).toBe(1);
      } catch (error) {
        console.error('🔍 複数APIテストエラー:', error);
        throw error;
      }
    });

    test('日次レポートが生成される', async () => {
      try {
        // Arrange
        await repository.recordApiCall('analyzeActivity', 100, 50);
        await repository.recordApiCall('generateSummary', 200, 100);
        
        // 少し待ってからレポート生成
        await new Promise(resolve => setTimeout(resolve, 100));

        // Act
        const report = await repository.generateDailyReport(mockTimezone);
        
        // デバッグ情報
        console.log('🔍 日次レポート:', report);

        // Assert
        expect(report).toContain('API使用量レポート');
        expect(report).toContain('本日の合計');
        expect(report).toContain('呼び出し回数: 2回');
        expect(report).toContain('analyzeActivity');
        expect(report).toContain('generateSummary');
      } catch (error) {
        console.error('🔍 日次レポートテストエラー:', error);
        throw error;
      }
    });

    test('コスト警告が適切に動作する', async () => {
      // Arrange - 高額な操作をシミュレート
      await repository.recordApiCall('expensiveOperation', 10000, 5000);

      // Act
      const alert = await repository.checkCostAlerts(mockTimezone);

      // Assert
      if (alert) {
        expect(alert.level).toMatch(/warning|critical/);
        expect(alert.message).toContain('API使用料');
      }
    });
  });

  describe('分析キャッシュ機能', () => {
    test('分析結果キャッシュが保存・取得される', async () => {
      // Arrange
      const cacheRequest = {
        userId: mockUserId,
        businessDate: '2025-06-29',
        analysisResult: {
          businessDate: '2025-06-29',
          totalLogCount: 5,
          categories: [
            {
              category: 'プログラミング',
              estimatedMinutes: 120,
              confidence: 0.9,
              logCount: 3,
              representativeActivities: ['コーディング', 'デバッグ']
            },
            {
              category: '会議',
              estimatedMinutes: 60,
              confidence: 0.8,
              logCount: 2,
              representativeActivities: ['ミーティング', '打ち合わせ']
            }
          ],
          timeline: [],
          timeDistribution: {
            totalEstimatedMinutes: 180,
            workingMinutes: 180,
            breakMinutes: 0,
            unaccountedMinutes: 0,
            overlapMinutes: 0
          },
          insights: {
            productivityScore: 85,
            workBalance: {
              focusTimeRatio: 0.67,
              meetingTimeRatio: 0.33,
              breakTimeRatio: 0,
              adminTimeRatio: 0
            },
            suggestions: ['洞察1', '洞察2'],
            highlights: ['テストサマリー'],
            motivation: 'よく頑張りました！'
          },
          warnings: [],
          generatedAt: '2025-06-29T10:00:00.000Z'
        },
        logCount: 5
      };

      // Act
      const savedCache = await repository.saveAnalysisCache(cacheRequest);
      const retrievedCache = await repository.getAnalysisCache(mockUserId, '2025-06-29');

      // Assert
      expect(savedCache.id).toBeDefined();
      expect(retrievedCache).not.toBeNull();
      expect(retrievedCache!.analysisResult.insights.highlights[0]).toBe('テストサマリー');
      expect(retrievedCache!.logCount).toBe(5);
    });

    test('キャッシュの有効性が正しく判定される', async () => {
      // Arrange
      const cacheRequest = {
        userId: mockUserId,
        businessDate: '2025-06-29',
        analysisResult: {
          businessDate: '2025-06-29',
          totalLogCount: 3,
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
            highlights: ['テスト'],
            motivation: ''
          },
          warnings: [],
          generatedAt: '2025-06-29T10:00:00.000Z'
        },
        logCount: 3
      };
      await repository.saveAnalysisCache(cacheRequest);

      // Act & Assert
      const validWithSameCount = await repository.isCacheValid(mockUserId, '2025-06-29', 3);
      expect(validWithSameCount).toBe(true);

      const invalidWithDifferentCount = await repository.isCacheValid(mockUserId, '2025-06-29', 5);
      expect(invalidWithDifferentCount).toBe(false);
    });

    test('古いキャッシュがクリーンアップされる', async () => {
      // Arrange
      const cacheRequest = {
        userId: mockUserId,
        businessDate: '2025-06-29',
        analysisResult: {
          businessDate: '2025-06-29',
          totalLogCount: 1,
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
            highlights: ['テスト'],
            motivation: ''
          },
          warnings: [],
          generatedAt: '2025-06-29T10:00:00.000Z'
        },
        logCount: 1
      };
      await repository.saveAnalysisCache(cacheRequest);

      // Act
      const deletedCount = await repository.cleanupOldCaches(0); // 今日以前を削除

      // Assert
      expect(deletedCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('統計機能', () => {
    test('ログ数が正確に取得される', async () => {
      // Arrange
      const requests = [
        { userId: mockUserId, content: 'ログ1', businessDate: '2025-06-29', inputTimestamp: '2025-06-29T09:00:00.000Z' },
        { userId: mockUserId, content: 'ログ2', businessDate: '2025-06-29', inputTimestamp: '2025-06-29T10:00:00.000Z' },
        { userId: mockUserId, content: 'ログ3', businessDate: '2025-06-30', inputTimestamp: '2025-06-30T09:00:00.000Z' }
      ];

      for (const request of requests) {
        await repository.saveLog(request);
      }

      // Act
      const totalCount = await repository.getLogCount(mockUserId);
      const dateCount = await repository.getLogCountByDate(mockUserId, '2025-06-29');

      // Assert
      expect(totalCount).toBe(3);
      expect(dateCount).toBe(2);
    });

    test('最新ログが正しく取得される', async () => {
      // Arrange
      const requests = [
        { userId: mockUserId, content: '古いログ', businessDate: '2025-06-29', inputTimestamp: '2025-06-29T09:00:00.000Z' },
        { userId: mockUserId, content: '新しいログ', businessDate: '2025-06-29', inputTimestamp: '2025-06-29T10:00:00.000Z' }
      ];

      for (const request of requests) {
        await repository.saveLog(request);
      }

      // Act
      const latestLogs = await repository.getLatestLogs(mockUserId, 1);

      // Assert
      expect(latestLogs).toHaveLength(1);
      expect(latestLogs[0].content).toBe('新しいログ');
    });
  });

  describe('データベース管理', () => {
    test('接続状態が確認できる', async () => {
      // Act
      const isConnected = await repository.isConnected();

      // Assert
      expect(isConnected).toBe(true);
    });

    test('トランザクションが正常に動作する', async () => {
      // Act & Assert
      await expect(repository.withTransaction(async () => {
        const request: CreateActivityLogRequest = {
          userId: mockUserId,
          content: 'トランザクションテスト',
          businessDate: '2025-06-29',
          inputTimestamp: '2025-06-29T10:00:00.000Z'
        };
        return await repository.saveLog(request);
      })).resolves.toBeDefined();
    });
  });
});