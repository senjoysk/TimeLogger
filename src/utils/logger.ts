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
  private isTestEnvironment = process.env.NODE_ENV === 'test';
  private suppressLogs = process.env.SUPPRESS_LOGS === 'true';
  private logLevel: LogLevel = this.getConfiguredLogLevel();

  private getConfiguredLogLevel(): LogLevel {
    const level = process.env.LOG_LEVEL?.toUpperCase();
    return Object.values(LogLevel).includes(level as LogLevel) 
      ? (level as LogLevel) 
      : LogLevel.INFO;
  }

  private shouldLog(level: LogLevel): boolean {
    if (this.suppressLogs) return false;
    
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    
    // SUCCESSは常に表示
    if (level === LogLevel.SUCCESS) return true;
    
    return messageLevelIndex >= currentLevelIndex;
  }
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
    if (!this.shouldLog(LogLevel.DEBUG)) return;
    
    const context = this.createContext(LogLevel.DEBUG, operation, message, data);
    console.log(this.formatLog(context), data || '');
  }

  info(operation: string, message: string, data?: Record<string, unknown>): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    
    const context = this.createContext(LogLevel.INFO, operation, message, data);
    console.log(this.formatLog(context), data || '');
  }

  warn(operation: string, message: string, data?: Record<string, unknown>): void {
    if (!this.shouldLog(LogLevel.WARN)) return;
    
    const context = this.createContext(LogLevel.WARN, operation, message, data);
    console.warn(this.formatLog(context), data || '');
  }

  error(operation: string, message: string, error?: unknown, data?: Record<string, unknown>): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;
    
    const context = this.createContext(LogLevel.ERROR, operation, message, data, error);
    // console.errorは使用せず、統一されたログ出力を使用
    console.log(this.formatLog(context), {
      ...context.data,
      error: context.error
    });
  }

  success(operation: string, message: string, data?: Record<string, unknown>): void {
    if (!this.shouldLog(LogLevel.SUCCESS)) return;
    
    const context = this.createContext(LogLevel.SUCCESS, operation, message, data);
    console.log(this.formatLog(context), data || '');
  }
}

// シングルトンインスタンス
export const logger: ILogger = new ConsoleLogger();

