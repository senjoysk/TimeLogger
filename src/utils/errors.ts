/**
 * 具体的なエラークラス定義
 * ErrorType別に使いやすいエラークラスを提供
 */

import { AppError, ErrorType, ErrorContext } from './errorHandler';

/**
 * データベースエラー
 */
export class DatabaseError extends AppError {
  constructor(message: string, context: ErrorContext = {}, originalError?: Error) {
    super(message, ErrorType.DATABASE, context, originalError);
    this.name = 'DatabaseError';
  }
}

/**
 * API関連エラー
 */
export class ApiError extends AppError {
  constructor(message: string, context: ErrorContext = {}, originalError?: Error) {
    super(message, ErrorType.API, context, originalError);
    this.name = 'ApiError';
  }
}

/**
 * バリデーションエラー
 */
export class ValidationError extends AppError {
  constructor(message: string, context: ErrorContext = {}, originalError?: Error) {
    super(message, ErrorType.VALIDATION, context, originalError);
    this.name = 'ValidationError';
  }
}

/**
 * Discord API関連エラー
 */
export class DiscordError extends AppError {
  constructor(message: string, context: ErrorContext = {}, originalError?: Error) {
    super(message, ErrorType.DISCORD, context, originalError);
    this.name = 'DiscordError';
  }
}

/**
 * システムエラー
 */
export class SystemError extends AppError {
  constructor(message: string, context: ErrorContext = {}, originalError?: Error) {
    super(message, ErrorType.SYSTEM, context, originalError);
    this.name = 'SystemError';
  }
}

/**
 * リソースが見つからないエラー
 */
export class NotFoundError extends AppError {
  constructor(message: string, context: ErrorContext = {}, originalError?: Error) {
    super(message, ErrorType.NOT_FOUND, context, originalError);
    this.name = 'NotFoundError';
  }
}

/**
 * タイムアウトエラー
 */
export class TimeoutError extends AppError {
  constructor(message: string, context: ErrorContext = {}, originalError?: Error) {
    super(message, ErrorType.TIMEOUT, context, originalError);
    this.name = 'TimeoutError';
  }
}

/**
 * 認証エラー
 */
export class AuthenticationError extends AppError {
  constructor(message: string, context: ErrorContext = {}, originalError?: Error) {
    super(message, ErrorType.AUTHENTICATION, context, originalError);
    this.name = 'AuthenticationError';
  }
}

/**
 * 設定エラー
 */
export class ConfigurationError extends AppError {
  constructor(message: string, context: ErrorContext = {}, originalError?: Error) {
    super(message, ErrorType.CONFIGURATION, context, originalError);
    this.name = 'ConfigurationError';
  }
}

/**
 * 未実装エラー
 */
export class NotImplementedError extends AppError {
  constructor(message: string, context: ErrorContext = {}, originalError?: Error) {
    super(message, ErrorType.NOT_IMPLEMENTED, context, originalError);
    this.name = 'NotImplementedError';
  }
}