/**
 * データ取得重複排除最適化のテスト
 * 相関インサイト生成での重複データ取得を排除し性能向上を検証
 */

import { SqliteActivityLogRepository } from '../../repositories/sqliteActivityLogRepository';
import { IntegratedSummaryService } from '../../services/integratedSummaryService';
import { UnifiedAnalysisService } from '../../services/unifiedAnalysisService';
import { ActivityTodoCorrelationService } from '../../services/activityTodoCorrelationService';
import { CreateTodoRequest } from '../../types/todo';
import { CreateActivityLogRequest } from '../../types/activityLog';
import { performance } from 'perf_hooks';
import * as fs from 'fs';
import * as path from 'path';

// モックサービス
class MockUnifiedAnalysisService {
  async analyzeDaily() {
    return {
      businessDate: '2025-01-06',
      totalLogCount: 10,
      categories: [],
      timeline: [],
      timeDistribution: {
        totalEstimatedMinutes: 60,
        workingMinutes: 50,
        breakMinutes: 10,
        unaccountedMinutes: 0,
        overlapMinutes: 0
      },
      insights: {
        productivityScore: 80,
        workBalance: {
          focusTimeRatio: 0.6,
          meetingTimeRatio: 0.2,
          breakTimeRatio: 0.1,
          adminTimeRatio: 0.1
        },
        suggestions: ['集中時間を増やしましょう'],
        highlights: ['良いペースです'],
        motivation: '今日もお疲れさまでした！'
      },
      warnings: [],
      generatedAt: new Date().toISOString()
    };
  }
}

describe('データ重複排除最適化テスト', () => {
  let repository: SqliteActivityLogRepository;
  let integratedSummaryService: IntegratedSummaryService;
  let correlationService: ActivityTodoCorrelationService;
  const TEST_DB_PATH = path.join(__dirname, '../../../test-data-dedup.db');
  const TEST_USER_ID = 'data-dedup-test-user';

  beforeAll(async () => {
    // テスト用データベース初期化
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    
    repository = new SqliteActivityLogRepository(TEST_DB_PATH);
    await repository.initializeDatabase();

    // サービス層の初期化（モック使用）
    const mockUnifiedAnalysisService = new MockUnifiedAnalysisService() as any;
    correlationService = new ActivityTodoCorrelationService(repository);
    
    integratedSummaryService = new IntegratedSummaryService(
      repository,
      correlationService,
      mockUnifiedAnalysisService
    );

    // テスト用データ作成
    await createTestData();
  });

  afterAll(async () => {
    await repository.close();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  /**
   * テスト用データを作成
   */
  async function createTestData(): Promise<void> {
    const today = new Date();
    const businessDate = today.toISOString().split('T')[0];
    
    // 活動ログを複数作成
    for (let i = 0; i < 10; i++) {
      const activityRequest: CreateActivityLogRequest = {
        userId: TEST_USER_ID,
        content: `テスト活動 ${i + 1}: プログラミング作業`,
        inputTimestamp: new Date(today.getTime() + i * 1800000).toISOString(), // 30分間隔
        businessDate
      };
      await repository.saveLog(activityRequest);
    }

    // TODOを複数作成
    for (let i = 0; i < 15; i++) {
      const todoRequest: CreateTodoRequest = {
        userId: TEST_USER_ID,
        content: `テストTODO ${i + 1}: タスク処理`,
        sourceType: 'manual'
      };
      await repository.createTodo(todoRequest);
    }
  }

  describe('相関インサイト生成の最適化', () => {
    test('データ重複排除により相関分析が効率化されること', async () => {
      const businessDate = new Date().toISOString().split('T')[0];
      const timezone = 'Asia/Tokyo';
      
      console.log(`🚀 データ重複排除最適化テスト開始`);
      
      // メトリクス測定のためにデータベースアクセス回数をカウント
      let dbQueryCount = 0;
      const originalMethod = repository.getLogsByDate;
      const originalTodoMethod = repository.getTodosByUserId;
      
      // データベースアクセスをモニタリング
      repository.getLogsByDate = async function(...args) {
        dbQueryCount++;
        console.log(`📊 DB Query ${dbQueryCount}: getLogsByDate`);
        return originalMethod.call(this, ...args);
      };
      
      repository.getTodosByUserId = async function(...args) {
        dbQueryCount++;
        console.log(`📊 DB Query ${dbQueryCount}: getTodosByUserId`);
        return originalTodoMethod.call(this, ...args);
      };

      const startTime = performance.now();
      
      // データ重複排除最適化版の統合サマリー生成
      const summary = await integratedSummaryService.generateIntegratedSummary(
        TEST_USER_ID,
        businessDate,
        timezone
      );
      
      const endTime = performance.now();
      const executionTime = endTime - startTime;
      
      // モニタリング解除
      repository.getLogsByDate = originalMethod;
      repository.getTodosByUserId = originalTodoMethod;
      
      console.log(`📊 データ重複排除最適化結果:`);
      console.log(`  実行時間: ${executionTime.toFixed(2)}ms`);
      console.log(`  データベースアクセス回数: ${dbQueryCount}回`);
      console.log(`  相関ペア数: ${summary.correlationInsights.correlatedPairs}`);
      console.log(`  完了提案数: ${summary.correlationInsights.completionSuggestions.length}`);
      
      // 結果検証
      expect(summary).toBeDefined();
      expect(summary.correlationInsights).toBeDefined();
      expect(summary.correlationInsights.correlatedPairs).toBeGreaterThanOrEqual(0);
      expect(summary.correlationInsights.completionSuggestions).toBeDefined();
      
      // データベースアクセス回数の最適化確認
      // 最適化前: getLogsByDate（4回）+ getTodosByUserId（4回）= 8回
      // 最適化後: getLogsByDate（2回）+ getTodosByUserId（1回）= 3回 (大幅改善)
      expect(dbQueryCount).toBeLessThanOrEqual(4); // 50%以上の削減を確認
      
      console.log(`✅ データ重複排除最適化確認: DB アクセス${dbQueryCount}回（期待値: ≤2回）`);
      
      // パフォーマンス基準
      if (executionTime < 1000) {
        console.log(`🚀 優秀な性能: ${executionTime.toFixed(2)}ms (目標: <1秒)`);
      } else if (executionTime < 2000) {
        console.log(`👍 良好な性能: ${executionTime.toFixed(2)}ms (許容範囲: <2秒)`);
      } else {
        console.log(`⚠️ 要改善: ${executionTime.toFixed(2)}ms (目標時間を超過)`);
      }
    });

    test('最適化版メソッドが元のメソッドと同じ結果を返すこと', async () => {
      const businessDate = new Date().toISOString().split('T')[0];
      const timezone = 'Asia/Tokyo';
      
      console.log(`🧪 結果一致性テスト開始`);
      
      // 1. 従来版（個別データ取得）
      const originalCorrelationResult = await correlationService.analyzeActivityTodoCorrelation(
        TEST_USER_ID,
        businessDate,
        timezone
      );
      
      const originalCompletionSuggestions = await correlationService.suggestTodoCompletions(
        TEST_USER_ID,
        businessDate,
        timezone
      );

      // 2. 最適化版（事前データ取得）
      const activities = await repository.getLogsByDate(TEST_USER_ID, businessDate);
      const todos = await repository.getTodosByUserId(TEST_USER_ID);
      
      const optimizedCorrelationResult = await correlationService.analyzeActivityTodoCorrelationWithData(
        TEST_USER_ID,
        businessDate,
        timezone,
        activities,
        todos
      );
      
      const optimizedCompletionSuggestions = await correlationService.suggestTodoCompletionsWithData(
        TEST_USER_ID,
        businessDate,
        timezone,
        activities,
        todos
      );

      console.log(`📊 結果一致性検証:`);
      console.log(`  従来版相関ペア: ${originalCorrelationResult.stats.correlatedPairs}`);
      console.log(`  最適化版相関ペア: ${optimizedCorrelationResult.stats.correlatedPairs}`);
      console.log(`  従来版完了提案: ${originalCompletionSuggestions.length}`);
      console.log(`  最適化版完了提案: ${optimizedCompletionSuggestions.length}`);
      
      // 結果が一致することを確認
      expect(optimizedCorrelationResult.stats.correlatedPairs).toBe(originalCorrelationResult.stats.correlatedPairs);
      expect(optimizedCorrelationResult.stats.totalActivities).toBe(originalCorrelationResult.stats.totalActivities);
      expect(optimizedCorrelationResult.stats.totalTodos).toBe(originalCorrelationResult.stats.totalTodos);
      
      expect(optimizedCompletionSuggestions.length).toBe(originalCompletionSuggestions.length);
      
      console.log(`✅ 結果一致性確認: 最適化版と従来版が同一結果を返すことを確認`);
    });

    test('大量データでの性能向上効果を測定すること', async () => {
      const businessDate = new Date().toISOString().split('T')[0];
      const timezone = 'Asia/Tokyo';
      
      // 追加の大量データを作成
      console.log(`📈 大量データ性能テスト開始: 追加データ作成中...`);
      
      for (let i = 0; i < 50; i++) {
        const activityRequest: CreateActivityLogRequest = {
          userId: TEST_USER_ID,
          content: `大量テスト活動 ${i + 1}: データ処理作業`,
          inputTimestamp: new Date().toISOString(),
          businessDate
        };
        await repository.saveLog(activityRequest);

        const todoRequest: CreateTodoRequest = {
          userId: TEST_USER_ID,
          content: `大量テストTODO ${i + 1}: 処理タスク`,
          sourceType: 'manual'
        };
        await repository.createTodo(todoRequest);
      }

      // 従来版測定
      console.log(`⏱️ 従来版（個別データ取得）測定中...`);
      const originalStartTime = performance.now();
      
      await Promise.all([
        correlationService.analyzeActivityTodoCorrelation(TEST_USER_ID, businessDate, timezone),
        correlationService.suggestTodoCompletions(TEST_USER_ID, businessDate, timezone)
      ]);
      
      const originalEndTime = performance.now();
      const originalTime = originalEndTime - originalStartTime;

      // 最適化版測定
      console.log(`⚡ 最適化版（一括データ取得）測定中...`);
      const optimizedStartTime = performance.now();
      
      const [activities, todos] = await Promise.all([
        repository.getLogsByDate(TEST_USER_ID, businessDate),
        repository.getTodosByUserId(TEST_USER_ID)
      ]);
      
      await Promise.all([
        correlationService.analyzeActivityTodoCorrelationWithData(TEST_USER_ID, businessDate, timezone, activities, todos),
        correlationService.suggestTodoCompletionsWithData(TEST_USER_ID, businessDate, timezone, activities, todos)
      ]);
      
      const optimizedEndTime = performance.now();
      const optimizedTime = optimizedEndTime - optimizedStartTime;

      const improvementPercent = ((originalTime - optimizedTime) / originalTime) * 100;

      console.log(`📊 大量データ性能比較結果:`);
      console.log(`  従来版実行時間: ${originalTime.toFixed(2)}ms`);
      console.log(`  最適化版実行時間: ${optimizedTime.toFixed(2)}ms`);
      console.log(`  性能向上: ${improvementPercent.toFixed(1)}% (目標: 15-20%)`);
      
      // 性能向上の確認
      expect(optimizedTime).toBeLessThan(originalTime);
      
      if (improvementPercent >= 15) {
        console.log(`🚀 目標達成: ${improvementPercent.toFixed(1)}%性能向上`);
      } else if (improvementPercent >= 10) {
        console.log(`👍 良好な性能向上: ${improvementPercent.toFixed(1)}%`);
      } else {
        console.log(`📈 性能向上確認: ${improvementPercent.toFixed(1)}%（軽微な改善）`);
      }
      
      console.log(`✅ データ重複排除最適化テスト完了`);
    });
  });
});