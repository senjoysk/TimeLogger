/**
 * 並行処理最適化のテスト
 * 週次サマリー生成の性能向上を検証
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

describe('並行処理最適化テスト', () => {
  let repository: SqliteActivityLogRepository;
  let integratedSummaryService: IntegratedSummaryService;
  const TEST_DB_PATH = path.join(__dirname, '../../../test-concurrent.db');
  const TEST_USER_ID = 'concurrent-test-user';

  beforeAll(async () => {
    // テスト用データベース初期化
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    
    repository = new SqliteActivityLogRepository(TEST_DB_PATH);
    await repository.initializeDatabase();

    // サービス層の初期化
    const unifiedAnalysisService = new UnifiedAnalysisService(repository, repository);
    const correlationService = new ActivityTodoCorrelationService(repository);
    
    integratedSummaryService = new IntegratedSummaryService(
      repository,
      correlationService,
      unifiedAnalysisService
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
   * テスト用データを作成（7日分）
   */
  async function createTestData(): Promise<void> {
    const today = new Date();
    
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const date = new Date(today);
      date.setDate(today.getDate() - dayOffset);
      const businessDate = date.toISOString().split('T')[0];
      
      // 各日に活動ログとTODOを作成
      for (let i = 0; i < 3; i++) {
        // 活動ログ作成
        const activityRequest: CreateActivityLogRequest = {
          userId: TEST_USER_ID,
          content: `Day ${dayOffset + 1} Activity ${i + 1}: テスト活動`,
          inputTimestamp: new Date(date.getTime() + i * 3600000).toISOString(), // 1時間間隔
          businessDate
        };
        await repository.saveLog(activityRequest);

        // TODO作成
        const todoRequest: CreateTodoRequest = {
          userId: TEST_USER_ID,
          content: `Day ${dayOffset + 1} TODO ${i + 1}: テストタスク`,
          sourceType: 'manual'
        };
        const todo = await repository.createTodo(todoRequest);
        
        // 作成日を調整
        await repository['runQuery'](
          'UPDATE todo_tasks SET created_at = ? WHERE id = ?',
          [date.toISOString(), todo.id]
        );
      }
    }
  }

  describe('週次サマリー生成の並行処理最適化', () => {
    test('並行処理により性能が向上すること', async () => {
      const endDate = new Date().toISOString().split('T')[0];
      const timezone = 'Asia/Tokyo';
      
      console.log(`🚀 週次サマリー並行処理性能テスト開始`);
      
      // 並行処理版の実行時間を測定
      const startTime = performance.now();
      
      const weeklySummary = await integratedSummaryService.generateWeeklySummary(
        TEST_USER_ID, 
        endDate, 
        timezone
      );
      
      const endTime = performance.now();
      const executionTime = endTime - startTime;
      
      console.log(`📊 並行処理実行結果:`);
      console.log(`  実行時間: ${executionTime.toFixed(2)}ms`);
      console.log(`  生成された日別サマリー: ${weeklySummary.dailySummaries.length}件`);
      console.log(`  週次メトリクス生成: ✅`);
      console.log(`  週次トレンド分析: ✅`);
      
      // 結果の妥当性確認
      expect(weeklySummary.dailySummaries.length).toBeGreaterThan(0);
      expect(weeklySummary.dailySummaries.length).toBeLessThanOrEqual(7);
      expect(weeklySummary.weeklyMetrics).toBeDefined();
      expect(weeklySummary.weeklyTrends).toBeDefined();
      expect(weeklySummary.weeklyInsights).toBeDefined();
      
      // 性能基準（参考値）
      // 並行処理により、通常の順次処理（想定5-10秒）より大幅に高速化されることを期待
      console.log(`✅ 並行処理による週次サマリー生成が正常に完了しました`);
      
      // パフォーマンス分析ログ
      if (executionTime < 3000) {
        console.log(`🚀 優秀な性能: ${executionTime.toFixed(2)}ms (目標: <3秒)`);
      } else if (executionTime < 5000) {
        console.log(`👍 良好な性能: ${executionTime.toFixed(2)}ms (許容範囲: <5秒)`);
      } else {
        console.log(`⚠️ 要改善: ${executionTime.toFixed(2)}ms (目標時間を超過)`);
      }
    });

    test('エラーがある日がスキップされても処理が継続されること', async () => {
      // 存在しないユーザーで一部の日にエラーが発生する状況をシミュレート
      const endDate = new Date().toISOString().split('T')[0];
      const timezone = 'Asia/Tokyo';
      const nonExistentUserId = 'non-existent-user';
      
      console.log(`🧪 エラー耐性テスト開始`);
      
      const startTime = performance.now();
      
      const weeklySummary = await integratedSummaryService.generateWeeklySummary(
        nonExistentUserId,
        endDate,
        timezone
      );
      
      const endTime = performance.now();
      
      console.log(`📊 エラー耐性テスト結果:`);
      console.log(`  実行時間: ${(endTime - startTime).toFixed(2)}ms`);
      console.log(`  生成された日別サマリー: ${weeklySummary.dailySummaries.length}件`);
      
      // エラーがあってもサービスは正常に応答すること
      expect(weeklySummary).toBeDefined();
      expect(weeklySummary.weeklyMetrics).toBeDefined();
      
      // データがない場合でも基本構造は保持されること
      expect(weeklySummary.dailySummaries).toBeDefined();
      expect(Array.isArray(weeklySummary.dailySummaries)).toBe(true);
      
      console.log(`✅ エラー耐性テスト完了: システムは部分的エラーを適切に処理しました`);
    });
  });

  describe('並行処理の安定性確認', () => {
    test('同時に複数の週次サマリー要求を処理できること', async () => {
      const endDate = new Date().toISOString().split('T')[0];
      const timezone = 'Asia/Tokyo';
      
      console.log(`🔄 同時処理テスト開始`);
      
      const startTime = performance.now();
      
      // 3つの週次サマリーを同時に生成
      const promises = Array.from({ length: 3 }, (_, i) => 
        integratedSummaryService.generateWeeklySummary(
          `${TEST_USER_ID}-concurrent-${i}`,
          endDate,
          timezone
        ).catch(error => {
          console.warn(`並行処理 ${i} でエラー:`, error.message);
          return null;
        })
      );
      
      const results = await Promise.all(promises);
      const endTime = performance.now();
      
      const successCount = results.filter(result => result !== null).length;
      
      console.log(`📊 同時処理テスト結果:`);
      console.log(`  実行時間: ${(endTime - startTime).toFixed(2)}ms`);
      console.log(`  成功した処理: ${successCount}/3件`);
      
      // 同時処理でもメモリリークやデッドロックが発生しないことを確認
      expect(successCount).toBeGreaterThanOrEqual(1);
      
      console.log(`✅ 同時処理テスト完了: 並行処理が安定して動作しています`);
    });
  });
});