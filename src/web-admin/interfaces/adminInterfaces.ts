/**
 * 管理Web用インターフェース定義
 */

import { TableInfo, TableDataResult, TableSummary, SearchFilters, PaginationOptions } from '../types/admin';

export interface IAdminRepository {
  getTableNames(): Promise<string[]>;
  getTableCount(tableName: string): Promise<number>;
  getTableData(tableName: string, options?: PaginationOptions): Promise<Record<string, unknown>[]>;
  searchTableData(tableName: string, filters: SearchFilters, options?: PaginationOptions): Promise<Record<string, unknown>[]>;
  getTableSchema(tableName: string): Promise<Record<string, unknown>>;
}

export interface IAdminService {
  getTableList(): Promise<TableInfo[]>;
  getTableData(tableName: string, options?: PaginationOptions): Promise<TableDataResult>;
  getTableSummary(tableName: string): Promise<TableSummary>;
  searchTableData(tableName: string, filters: SearchFilters, options?: PaginationOptions): Promise<TableDataResult>;
  validateTableName(tableName: string): boolean;
}