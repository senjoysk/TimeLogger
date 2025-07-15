/**
 * AdminRepository実装
 * 既存のSqliteActivityLogRepositoryを拡張して管理機能を提供
 */

import { IAdminRepository } from '../interfaces/adminInterfaces';
import { SearchFilters, PaginationOptions } from '../types/admin';
import { SqliteActivityLogRepository } from '../../repositories/sqliteActivityLogRepository';

export class AdminRepository implements IAdminRepository {
  private sqliteRepo: SqliteActivityLogRepository;

  constructor(sqliteRepo: SqliteActivityLogRepository) {
    this.sqliteRepo = sqliteRepo;
  }

  /**
   * データベース内のテーブル名一覧を取得
   */
  async getTableNames(): Promise<string[]> {
    // 固定のテーブル名リストを返す（セキュリティ上の理由）
    return [
      'activity_logs',
      'api_costs',
      'user_settings',
      'daily_analysis_cache',
      'todo_tasks',
      'message_classifications',
      'timezone_change_notifications'
    ];
  }

  /**
   * テーブルのレコード数を取得
   */
  async getTableCount(tableName: string): Promise<number> {
    // 各テーブルごとに適切な既存メソッドを使用
    switch (tableName) {
      case 'activity_logs':
        // 全ユーザーの活動ログを取得するため、既存メソッドを使用
        const users = await this.sqliteRepo.getAllUsers();
        let totalLogs = 0;
        for (const user of users) {
          const logs = await this.sqliteRepo.getActivityRecords(user.userId, 'Asia/Tokyo');
          totalLogs += logs.length;
        }
        return totalLogs;
      case 'todo_tasks':
        // 全ユーザーのTODOを取得
        const allUsers = await this.sqliteRepo.getAllUsers();
        let totalTodos = 0;
        for (const user of allUsers) {
          const todos = await this.sqliteRepo.getTodosByUserId(user.userId);
          totalTodos += todos.length;
        }
        return totalTodos;
      case 'user_settings':
        const userList = await this.sqliteRepo.getAllUsers();
        return userList.length;
      default:
        // その他のテーブルは暫定的に0を返す
        return 0;
    }
  }

  /**
   * テーブルデータを取得（ページネーション対応）
   */
  async getTableData(tableName: string, options: PaginationOptions = {}): Promise<any[]> {
    const { page = 1, limit = 50 } = options;
    
    // 各テーブルごとに適切な既存メソッドを使用
    switch (tableName) {
      case 'activity_logs':
        const users = await this.sqliteRepo.getAllUsers();
        const allLogs = [];
        for (const user of users) {
          const logs = await this.sqliteRepo.getActivityRecords(user.userId, 'Asia/Tokyo');
          allLogs.push(...logs);
        }
        // 日付でソート
        allLogs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return this.paginate(allLogs, page, limit);
      case 'todo_tasks':
        const allUsers = await this.sqliteRepo.getAllUsers();
        const allTodos = [];
        for (const user of allUsers) {
          const todos = await this.sqliteRepo.getTodosByUserId(user.userId);
          allTodos.push(...todos);
        }
        // 日付でソート
        allTodos.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return this.paginate(allTodos, page, limit);
      case 'user_settings':
        const userList = await this.sqliteRepo.getAllUsers();
        return this.paginate(userList, page, limit);
      default:
        return [];
    }
  }

  /**
   * テーブルデータを検索
   */
  async searchTableData(
    tableName: string, 
    filters: SearchFilters, 
    options: PaginationOptions = {}
  ): Promise<any[]> {
    const { page = 1, limit = 50 } = options;
    
    // 各テーブルごとに適切なフィルタリングを実装
    switch (tableName) {
      case 'activity_logs':
        if (filters.userId && filters.userId !== 'all') {
          const logs = await this.sqliteRepo.getActivityRecords(filters.userId, 'Asia/Tokyo');
          return this.paginate(logs, page, limit);
        }
        return this.getTableData(tableName, options);
      case 'todo_tasks':
        if (filters.userId && filters.userId !== 'all') {
          const todos = await this.sqliteRepo.getTodosByUserId(filters.userId);
          return this.paginate(todos, page, limit);
        }
        return this.getTableData(tableName, options);
      default:
        return this.getTableData(tableName, options);
    }
  }

  /**
   * テーブルスキーマを取得
   */
  async getTableSchema(tableName: string): Promise<any> {
    // 暫定的なスキーマ情報を返す
    return [
      { name: 'id', type: 'TEXT', pk: 1 },
      { name: 'created_at', type: 'TEXT', pk: 0 },
      { name: 'updated_at', type: 'TEXT', pk: 0 }
    ];
  }

  /**
   * ページネーションヘルパー
   */
  private paginate<T>(items: T[], page: number, limit: number): T[] {
    const start = (page - 1) * limit;
    const end = start + limit;
    return items.slice(start, end);
  }
}