/**
 * 並行処理最適化のテスト
 * 注意: 週次サマリー機能は削除されました (issues/weekly-summary-cleanup.md参照)
 */

import { SqliteActivityLogRepository } from '../../repositories/sqliteActivityLogRepository';
import { CreateTodoRequest } from '../../types/todo';
import { CreateActivityLogRequest } from '../../types/activityLog';
import * as fs from 'fs';
import * as path from 'path';

describe('並行処理最適化テスト', () => {
  let repository: SqliteActivityLogRepository;
  const TEST_DB_PATH = path.join(__dirname, '../../../test-concurrent.db');
  const TEST_USER_ID = 'concurrent-test-user';

  beforeAll(async () => {
    // テスト用データベース初期化
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    
    repository = new SqliteActivityLogRepository(TEST_DB_PATH);
    await repository.initializeDatabase();

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

  // 週次サマリー機能は削除されました
  // 理由: 機能要件の見直しにより、週次サマリー機能が不要になったため
  // 詳細: issues/weekly-summary-cleanup.md を参照
});