/**
 * 管理Web用型定義
 */

export interface TableInfo {
  name: string;
  description: string;
}

export interface TableDataResult {
  data: Record<string, unknown>[];
  count: number;
  pagination: {
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface TableSummary {
  tableName: string;
  totalCount: number;
  lastUpdated?: string;
}

export interface SearchFilters {
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
}

export interface AdminEnvironment {
  env: 'development' | 'staging' | 'production';
  isReadOnly: boolean;
  allowedOperations: string[];
}

export interface AdminError extends Error {
  code: string;
  statusCode: number;
}

export class AdminSecurityError extends Error implements AdminError {
  code = 'SECURITY_ERROR';
  statusCode = 403;
  
  constructor(message: string) {
    super(message);
    this.name = 'AdminSecurityError';
  }
}

export class AdminValidationError extends Error implements AdminError {
  code = 'VALIDATION_ERROR';
  statusCode = 400;
  
  constructor(message: string) {
    super(message);
    this.name = 'AdminValidationError';
  }
}

export class AdminDatabaseError extends Error implements AdminError {
  code = 'DATABASE_ERROR';
  statusCode = 500;
  
  constructor(message: string) {
    super(message);
    this.name = 'AdminDatabaseError';
  }
}