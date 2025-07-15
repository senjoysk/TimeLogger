/**
 * 管理Web用インターフェース定義
 */

import { TableInfo, TableDataResult, TableSummary, SearchFilters, PaginationOptions } from '../types/admin';

export interface IAdminRepository {
  getTableNames(): Promise<string[]>;
  getTableCount(tableName: string): Promise<number>;
  getTableData(tableName: string, options?: PaginationOptions): Promise<any[]>;
  searchTableData(tableName: string, filters: SearchFilters, options?: PaginationOptions): Promise<any[]>;
  getTableSchema(tableName: string): Promise<any>;
}

export interface IAdminService {
  getTableList(): Promise<TableInfo[]>;
  getTableData(tableName: string, options?: PaginationOptions): Promise<TableDataResult>;
  getTableSummary(tableName: string): Promise<TableSummary>;
  searchTableData(tableName: string, filters: SearchFilters, options?: PaginationOptions): Promise<TableDataResult>;
  validateTableName(tableName: string): boolean;
}