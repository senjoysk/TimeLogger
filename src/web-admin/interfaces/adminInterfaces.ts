/**
 * 管理Web用インターフェース定義
 */

import { TableInfo, TableDataResult, TableSummary, SearchFilters, PaginationOptions } from '../types/admin';
import { TodoTask, TodoStatus, TodoPriority } from '../../types/todo';
import { CreateTodoRequest, UpdateTodoRequest, TodoFilters } from '../services/todoManagementService';

export interface IAdminRepository {
  getTableNames(): Promise<string[]>;
  getTableCount(tableName: string): Promise<number>;
  getTableData(tableName: string, options?: PaginationOptions): Promise<Record<string, unknown>[]>;
  searchTableData(tableName: string, filters: SearchFilters, options?: PaginationOptions): Promise<Record<string, unknown>[]>;
  getTableSchema(tableName: string): Promise<Record<string, unknown>>;
  
  // TODO管理メソッド
  createTodoTask(data: CreateTodoRequest): Promise<TodoTask>;
  updateTodoTask(todoId: string, updates: UpdateTodoRequest): Promise<TodoTask>;
  deleteTodoTask(todoId: string): Promise<boolean>;
  getTodoTaskById(todoId: string): Promise<TodoTask | null>;
  bulkUpdateTodoStatus(todoIds: string[], newStatus: TodoStatus): Promise<number>;
  bulkDeleteTodos(todoIds: string[]): Promise<number>;
  getTodosByUserId(userId: string, filters?: TodoFilters, options?: PaginationOptions): Promise<TodoTask[]>;
  getOverdueTodos(): Promise<TodoTask[]>;
  bulkCreateTodos(todoRequests: CreateTodoRequest[]): Promise<TodoTask[]>;
}

export interface IAdminService {
  getTableList(): Promise<TableInfo[]>;
  getTableData(tableName: string, options?: PaginationOptions): Promise<TableDataResult>;
  getTableSummary(tableName: string): Promise<TableSummary>;
  searchTableData(tableName: string, filters: SearchFilters, options?: PaginationOptions): Promise<TableDataResult>;
  validateTableName(tableName: string): boolean;
}