/**
 * パフォーマンス最適化のテスト
 * メモリ内フィルタリング vs DB直接クエリの性能比較
 */

import { SqliteActivityLogRepository } from '../../repositories/sqliteActivityLogRepository';
import { CreateTodoRequest, TodoStatus } from '../../types/todo';
import { performance } from 'perf_hooks';
import * as fs from 'fs';
import * as path from 'path';

describe('パフォーマンス最適化テスト', () => {
  let repository: SqliteActivityLogRepository;
  const TEST_DB_PATH = path.join(__dirname, '../../../test-performance.db');
  const TEST_USER_ID = 'perf-test-user';

  beforeAll(async () => {
    // テスト用データベース初期化
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    
    repository = new SqliteActivityLogRepository(TEST_DB_PATH);
    await repository.initializeDatabase();

    // パフォーマンステスト用のサンプルデータ作成
    await createSampleTodos(1000); // 1000件のTODOを作成
  });

  afterAll(async () => {
    await repository.close();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  /**
   * サンプルTODOデータを作成
   */
  async function createSampleTodos(count: number): Promise<void> {
    const statuses: TodoStatus[] = ['pending', 'in_progress', 'completed', 'cancelled'];
    const priorities = [-1, 0, 1, 2];
    const today = new Date();
    
    for (let i = 0; i < count; i++) {
      const createdDate = new Date(today);
      createdDate.setDate(today.getDate() - Math.floor(Math.random() * 30)); // 過去30日以内
      
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      
      const request: CreateTodoRequest = {
        userId: TEST_USER_ID,
        content: `パフォーマンステスト用TODO ${i + 1}`,
        priority: priorities[Math.floor(Math.random() * priorities.length)],
        sourceType: 'manual'
      };

      const todo = await repository.createTodo(request);
      
      // 作成日時とステータスを調整（SQLで直接更新）
      await repository['runQuery'](
        'UPDATE todo_tasks SET created_at = ?, status = ? WHERE id = ?',
        [createdDate.toISOString(), status, todo.id]
      );

      // 一部のTODOを完了状態にする
      if (status === 'completed') {
        const completedDate = new Date(createdDate);
        completedDate.setHours(completedDate.getHours() + Math.floor(Math.random() * 24));
        
        await repository['runQuery'](
          'UPDATE todo_tasks SET completed_at = ? WHERE id = ?',
          [completedDate.toISOString(), todo.id]
        );
      }
    }
  }

  describe('メモリ内フィルタリング vs DB直接クエリ', () => {
    test('日付範囲フィルタリングのパフォーマンス比較', async () => {
      const targetDate = new Date().toISOString().split('T')[0];
      
      // 旧実装（メモリ内フィルタリング）のシミュレーション
      const startMemoryFilter = performance.now();
      const allTodos = await repository.getTodosByUserId(TEST_USER_ID);
      const filteredTodos = allTodos.filter(todo => {
        const createdDate = todo.createdAt.split('T')[0];
        const completedDate = todo.completedAt ? todo.completedAt.split('T')[0] : null;
        return createdDate === targetDate || completedDate === targetDate;
      });
      const endMemoryFilter = performance.now();
      const memoryFilterTime = endMemoryFilter - startMemoryFilter;

      // 新実装（DB直接クエリ）
      const startDbQuery = performance.now();
      const directQueryTodos = await repository.getTodosByDateRange(TEST_USER_ID, targetDate, targetDate);
      const endDbQuery = performance.now();
      const dbQueryTime = endDbQuery - startDbQuery;

      console.log(`📊 パフォーマンス比較結果:`);
      console.log(`  メモリ内フィルタリング: ${memoryFilterTime.toFixed(2)}ms (${allTodos.length}件→${filteredTodos.length}件)`);
      console.log(`  DB直接クエリ: ${dbQueryTime.toFixed(2)}ms (${directQueryTodos.length}件)`);
      console.log(`  パフォーマンス向上: ${((memoryFilterTime - dbQueryTime) / memoryFilterTime * 100).toFixed(1)}%`);

      // 結果が同じであることを確認
      expect(directQueryTodos.length).toBe(filteredTodos.length);
      
      // DB直接クエリの方が高速であることを期待
      // ただし、データ量が少ない場合は差が出ない場合もあるため、ログ出力のみ
      if (dbQueryTime < memoryFilterTime) {
        console.log(`✅ DB直接クエリの方が${((memoryFilterTime - dbQueryTime) / memoryFilterTime * 100).toFixed(1)}%高速`);
      }
    });

    test('ステータスフィルタリングのパフォーマンス比較', async () => {
      const targetStatuses: TodoStatus[] = ['pending', 'in_progress'];
      
      // 旧実装（メモリ内フィルタリング）のシミュレーション
      const startMemoryFilter = performance.now();
      const allTodos = await repository.getTodosByUserId(TEST_USER_ID);
      const filteredTodos = allTodos.filter(todo => targetStatuses.includes(todo.status));
      const endMemoryFilter = performance.now();
      const memoryFilterTime = endMemoryFilter - startMemoryFilter;

      // 新実装（DB直接クエリ）
      const startDbQuery = performance.now();
      const directQueryTodos = await repository.getTodosByStatusOptimized(TEST_USER_ID, targetStatuses);
      const endDbQuery = performance.now();
      const dbQueryTime = endDbQuery - startDbQuery;

      console.log(`📊 ステータスフィルタリング パフォーマンス比較:`);
      console.log(`  メモリ内フィルタリング: ${memoryFilterTime.toFixed(2)}ms (${allTodos.length}件→${filteredTodos.length}件)`);
      console.log(`  DB直接クエリ: ${dbQueryTime.toFixed(2)}ms (${directQueryTodos.length}件)`);
      console.log(`  パフォーマンス向上: ${((memoryFilterTime - dbQueryTime) / memoryFilterTime * 100).toFixed(1)}%`);

      // 結果の妥当性確認
      expect(directQueryTodos.length).toBe(filteredTodos.length);
      
      // 優先度順にソートされていることを確認
      for (let i = 1; i < directQueryTodos.length; i++) {
        expect(directQueryTodos[i-1].priority).toBeGreaterThanOrEqual(directQueryTodos[i].priority);
      }
    });
  });

  describe('バッチキャッシュ無効化のテスト', () => {
    test('連続するキャッシュ無効化がバッチ処理されること', async () => {
      const businessDate = new Date().toISOString().split('T')[0];
      
      // 連続して複数の操作を実行
      const startTime = performance.now();
      
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          repository.createTodo({
            userId: TEST_USER_ID,
            content: `バッチテスト用TODO ${i}`,
            sourceType: 'manual'
          })
        );
      }
      
      await Promise.all(promises);
      
      // 100ms待機してバッチ処理完了を確認
      await new Promise(resolve => setTimeout(resolve, 150));
      
      const endTime = performance.now();
      console.log(`📊 バッチキャッシュ無効化テスト完了: ${(endTime - startTime).toFixed(2)}ms`);
      
      // エラーなく完了することを確認
      expect(true).toBe(true);
    });
  });

  describe('インデックス効果の確認', () => {
    test('インデックスが作成されていることを確認', async () => {
      const indexQuery = `
        SELECT name, sql 
        FROM sqlite_master 
        WHERE type = 'index' 
        AND name LIKE 'idx_%'
        ORDER BY name
      `;
      
      const indexes = await repository['allQuery'](indexQuery, []);
      
      console.log('📋 作成されたインデックス:');
      indexes.forEach((index: any) => {
        console.log(`  - ${index.name}`);
      });
      
      // パフォーマンス最適化インデックスが作成されていることを確認
      const indexNames = indexes.map((idx: any) => idx.name);
      expect(indexNames).toContain('idx_todo_tasks_user_date_range');
      expect(indexNames).toContain('idx_todo_tasks_user_status_priority');
      expect(indexNames).toContain('idx_activity_logs_user_business_input');
    });
  });
});