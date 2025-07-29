/**
 * ロガーインターフェース
 * console.errorの使用を禁止し、統一されたログ出力を提供
 */

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  SUCCESS = 'SUCCESS'
}

export interface LogContext {
  operation?: string;
  userId?: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
    type?: string;
  };
}

/**
 * ロガーインターフェース
 */
export interface ILogger {
  debug(operation: string, message: string, data?: Record<string, unknown>): void;
  info(operation: string, message: string, data?: Record<string, unknown>): void;
  warn(operation: string, message: string, data?: Record<string, unknown>): void;
  error(operation: string, message: string, error?: unknown, data?: Record<string, unknown>): void;
  success(operation: string, message: string, data?: Record<string, unknown>): void;
}

/**
 * コンソールロガー実装
 * 本番環境では外部ログサービスに置き換え可能
 */
export class ConsoleLogger implements ILogger {
  private formatLog(context: LogContext): string {
    const icon = this.getIcon(context.level);
    const levelStr = `[${context.level}]`;
    const operationStr = context.operation ? ` ${context.operation}:` : '';
    return `${icon} ${levelStr}${operationStr} ${context.message}`;
  }

  private getIcon(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG:
        return '🔧';
      case LogLevel.INFO:
        return 'ℹ️';
      case LogLevel.WARN:
        return '⚠️';
      case LogLevel.ERROR:
        return '❌';
      case LogLevel.SUCCESS:
        return '✅';
    }
  }

  private createContext(
    level: LogLevel,
    operation: string,
    message: string,
    data?: Record<string, unknown>,
    error?: unknown
  ): LogContext {
    const context: LogContext = {
      operation,
      timestamp: new Date().toISOString(),
      level,
      message,
      data
    };

    if (error) {
      if (error instanceof Error) {
        context.error = {
          name: error.name,
          message: error.message,
          stack: error.stack
        };
      } else {
        context.error = {
          name: 'Unknown',
          message: String(error)
        };
      }
    }

    return context;
  }

  debug(operation: string, message: string, data?: Record<string, unknown>): void {
    const context = this.createContext(LogLevel.DEBUG, operation, message, data);
    console.log(this.formatLog(context), data || '');
  }

  info(operation: string, message: string, data?: Record<string, unknown>): void {
    const context = this.createContext(LogLevel.INFO, operation, message, data);
    console.log(this.formatLog(context), data || '');
  }

  warn(operation: string, message: string, data?: Record<string, unknown>): void {
    const context = this.createContext(LogLevel.WARN, operation, message, data);
    console.warn(this.formatLog(context), data || '');
  }

  error(operation: string, message: string, error?: unknown, data?: Record<string, unknown>): void {
    const context = this.createContext(LogLevel.ERROR, operation, message, data, error);
    // console.errorは使用せず、統一されたログ出力を使用
    console.log(this.formatLog(context), {
      ...context.data,
      error: context.error
    });
  }

  success(operation: string, message: string, data?: Record<string, unknown>): void {
    const context = this.createContext(LogLevel.SUCCESS, operation, message, data);
    console.log(this.formatLog(context), data || '');
  }
}

// シングルトンインスタンス
export const logger: ILogger = new ConsoleLogger();