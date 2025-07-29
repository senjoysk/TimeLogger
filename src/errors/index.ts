/**
 * アプリケーション固有のエラークラス定義
 * すべてのエラーはAppErrorを継承し、適切なエラータイプを持つ
 */

import { AppError, ErrorType, ErrorContext } from '../utils/errorHandler';

/**
 * データベース関連エラー
 */
export class DatabaseError extends AppError {
  constructor(message: string, context?: ErrorContext, originalError?: Error) {
    super(message, ErrorType.DATABASE, context, originalError);
    this.name = 'DatabaseError';
  }
}

/**
 * API関連エラー（外部サービス呼び出しエラー）
 */
export class ApiError extends AppError {
  constructor(message: string, context?: ErrorContext, originalError?: Error) {
    super(message, ErrorType.API, context, originalError);
    this.name = 'ApiError';
  }
}

/**
 * バリデーションエラー
 */
export class ValidationError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, ErrorType.VALIDATION, context);
    this.name = 'ValidationError';
  }
}

/**
 * Discord API関連エラー
 */
export class DiscordError extends AppError {
  constructor(message: string, context?: ErrorContext, originalError?: Error) {
    super(message, ErrorType.DISCORD, context, originalError);
    this.name = 'DiscordError';
  }
}

/**
 * システムエラー（予期しないエラー）
 */
export class SystemError extends AppError {
  constructor(message: string, context?: ErrorContext, originalError?: Error) {
    super(message, ErrorType.SYSTEM, context, originalError);
    this.name = 'SystemError';
  }
}

/**
 * 未実装エラー
 */
export class NotImplementedError extends AppError {
  constructor(feature: string, context?: ErrorContext) {
    super(`機能「${feature}」は未実装です`, ErrorType.SYSTEM, context);
    this.name = 'NotImplementedError';
  }
}

/**
 * 設定エラー
 */
export class ConfigurationError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, ErrorType.SYSTEM, context);
    this.name = 'ConfigurationError';
  }
}

/**
 * 認証エラー
 */
export class AuthenticationError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, ErrorType.VALIDATION, context);
    this.name = 'AuthenticationError';
  }
}

/**
 * リソースが見つからないエラー
 */
export class NotFoundError extends AppError {
  constructor(resource: string, context?: ErrorContext) {
    super(`${resource}が見つかりません`, ErrorType.VALIDATION, context);
    this.name = 'NotFoundError';
  }
}

/**
 * タイムアウトエラー
 */
export class TimeoutError extends AppError {
  constructor(operation: string, timeoutMs: number, context?: ErrorContext) {
    super(`${operation}がタイムアウトしました (${timeoutMs}ms)`, ErrorType.SYSTEM, {
      ...context,
      operation,
      timeoutMs
    });
    this.name = 'TimeoutError';
  }
}