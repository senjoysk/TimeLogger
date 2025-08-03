/**
 * AdminService実装
 * TDD Green Phase: テストを通す最小実装
 */

import { IAdminService, IAdminRepository } from '../interfaces/adminInterfaces';
import { TableInfo, TableDataResult, TableSummary, SearchFilters, PaginationOptions, AdminValidationError, AdminDatabaseError } from '../types/admin';

export class AdminService implements IAdminService {
  private repository: IAdminRepository;

  // 許可されたテーブル一覧
  private readonly ALLOWED_TABLES: TableInfo[] = [
    { name: 'activity_logs', description: '活動ログテーブル' },
    { name: 'user_settings', description: 'ユーザー設定テーブル' },
    { name: 'daily_analysis_cache', description: '分析結果キャッシュテーブル' },
    { name: 'todo_tasks', description: 'TODOタスクテーブル' },
    { name: 'message_classifications', description: 'メッセージ分類履歴テーブル' },
    { name: 'timezone_change_notifications', description: 'タイムゾーン変更通知テーブル' }
  ];

  constructor(repository: IAdminRepository) {
    this.repository = repository;
  }

  /**
   * リポジトリへのアクセス（TODO管理機能用）
   */
  getRepository(): IAdminRepository {
    return this.repository;
  }

  /**
   * 全テーブル一覧を取得
   */
  async getTableList(): Promise<TableInfo[]> {
    return this.ALLOWED_TABLES;
  }

  /**
   * テーブルデータを取得
   */
  async getTableData(tableName: string, options: PaginationOptions = {}): Promise<TableDataResult> {
    if (!this.validateTableName(tableName)) {
      throw new AdminValidationError('許可されていないテーブル名です');
    }

    const { page = 1, limit = 50 } = options;
    
    try {
      const data = await this.repository.getTableData(tableName, options);
      const totalCount = await this.repository.getTableCount(tableName);
      
      const totalPages = Math.ceil(totalCount / limit);
      
      return {
        data,
        count: data.length,
        pagination: {
          page,
          limit,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      };
    } catch (error) {
      if (error instanceof AdminValidationError) {
        throw error;
      }
      throw new AdminDatabaseError(`テーブルデータの取得に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * テーブル概要統計を取得
   */
  async getTableSummary(tableName: string): Promise<TableSummary> {
    if (!this.validateTableName(tableName)) {
      throw new AdminValidationError('許可されていないテーブル名です');
    }

    try {
      const totalCount = await this.repository.getTableCount(tableName);
      
      return {
        tableName,
        totalCount
      };
    } catch (error) {
      throw new AdminDatabaseError(`テーブル概要統計の取得に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * テーブルデータを検索
   */
  async searchTableData(
    tableName: string, 
    filters: SearchFilters, 
    options: PaginationOptions = {}
  ): Promise<TableDataResult> {
    if (!this.validateTableName(tableName)) {
      throw new AdminValidationError('許可されていないテーブル名です');
    }

    const { page = 1, limit = 50 } = options;
    
    try {
      const data = await this.repository.searchTableData(tableName, filters, options);
      const totalCount = data.length; // 簡単な実装：検索結果の総数
      
      const totalPages = Math.ceil(totalCount / limit);
      
      return {
        data,
        count: data.length,
        pagination: {
          page,
          limit,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      };
    } catch (error) {
      if (error instanceof AdminValidationError) {
        throw error;
      }
      throw new AdminDatabaseError(`テーブルデータの検索に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * テーブル名の妥当性チェック
   */
  validateTableName(tableName: string): boolean {
    return this.ALLOWED_TABLES.some(table => table.name === tableName);
  }
}