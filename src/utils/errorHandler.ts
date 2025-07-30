/**
 * エラーハンドリングユーティリティ
 * 統一されたエラー処理とログ出力を提供
 */
import { logger, ILogger } from './logger';

export enum ErrorType {
  DATABASE = 'DATABASE',
  API = 'API',
  VALIDATION = 'VALIDATION',
  DISCORD = 'DISCORD',
  SYSTEM = 'SYSTEM',
  TIMEOUT = 'TIMEOUT',
  AUTHENTICATION = 'AUTHENTICATION',
  CONFIGURATION = 'CONFIGURATION',
  NOT_FOUND = 'NOT_FOUND',
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED'
}

// ログデータの型定義
export interface LogData {
  /** メッセージ */
  message?: string;
  /** メッセージの長さ */
  messageLength?: number;
  /** 文字列データ */
  stringData?: Record<string, string>;
  /** 数値データ */
  numericData?: Record<string, number>;
  /** 真偽値データ */
  booleanData?: Record<string, boolean>;
  /** 配列データ */
  arrayData?: Record<string, (string | number | boolean)[]>;
  /** オブジェクトデータ（簡単な型のみ） */
  objectData?: Record<string, Record<string, string | number | boolean>>;
  /** 日時データ */
  dateData?: Record<string, string>;
  /** エラー情報 */
  errorInfo?: {
    name?: string;
    message?: string;
    stack?: string;
  };
  /** その他の情報 */
  [key: string]: unknown;
}

export interface ErrorContext {
  userId?: string;
  operation?: string;
  details?: LogData;
  /** エラーオブジェクト */
  error?: unknown;
  /** 追加のコンテキスト情報 */
  additionalContext?: Record<string, string | number | boolean>;
  /** その他の情報 */
  [key: string]: unknown;
}

/**
 * アプリケーション共通エラークラス
 */
export class AppError extends Error {
  public readonly type: ErrorType;
  public readonly context: ErrorContext;
  public readonly timestamp: Date;

  constructor(
    message: string,
    type: ErrorType,
    context: ErrorContext = {},
    originalError?: Error
  ) {
    super(message);
    this.name = 'AppError';
    this.type = type;
    this.context = context;
    this.timestamp = new Date();

    // 元のエラーのスタックトレースを保持
    if (originalError && originalError.stack) {
      this.stack = originalError.stack;
    }
  }
}

/**
 * エラーハンドラークラス
 * エラーのログ出力とユーザー向けメッセージの生成を担当
 */
export class ErrorHandler {
  private static logger: ILogger = logger;

  /**
   * エラーをログ出力し、ユーザー向けメッセージを生成
   * @param error エラーオブジェクト
   * @returns ユーザー向けメッセージ
   */
  public static handle(error: unknown): string {
    if (error instanceof AppError) {
      return this.handleAppError(error);
    }

    // 予期しないエラーの場合
    this.logger.error('SYSTEM', '予期しないエラーが発生しました', error);
    
    // 予期しないエラーは必ず再スローして上位に伝播
    throw error;
  }

  /**
   * エラーログ記録専用メソッド
   * catch節でのログ記録を統一
   */
  public static logError(
    operation: string,
    message: string,
    error: unknown,
    context?: Record<string, unknown>
  ): void {
    this.logger.error(operation, message, error, context);
  }

  /**
   * エラーを適切に変換してスロー
   * catch節での共通パターン
   */
  public static convertAndThrow(
    error: unknown,
    errorType: ErrorType,
    userMessage: string,
    context: ErrorContext = {}
  ): never {
    if (error instanceof AppError) {
      throw error;
    }
    
    throw new AppError(userMessage, errorType, context, error instanceof Error ? error : undefined);
  }

  /**
   * AppErrorの処理
   */
  private static handleAppError(error: AppError): string {
    // 詳細ログの出力
    this.logger.error(error.type, error.message, error, {
      timestamp: error.timestamp.toISOString(),
      context: error.context
    });

    // エラータイプに応じたユーザー向けメッセージを生成
    switch (error.type) {
      case ErrorType.DATABASE:
        return 'データベースの処理中にエラーが発生しました。しばらく時間をおいて再度お試しください。';
      
      case ErrorType.API:
        return 'AI分析サービスの処理中にエラーが発生しました。しばらく時間をおいて再度お試しください。';
      
      case ErrorType.VALIDATION:
        return error.message; // バリデーションエラーは直接ユーザーに表示
      
      case ErrorType.DISCORD:
        return 'Discord APIの処理中にエラーが発生しました。しばらく時間をおいて再度お試しください。';
      
      case ErrorType.SYSTEM:
        return 'システムエラーが発生しました。管理者にお問い合わせください。';
      
      default:
        return '申し訳ありません。処理中にエラーが発生しました。';
    }
  }

  /**
   * デバッグ用のログ出力
   * @param operation 操作名
   * @param message メッセージ
   * @param data 追加データ
   */
  public static logDebug(operation: string, message: string, data?: LogData): void {
    this.logger.debug(operation, message, data as Record<string, unknown>);
  }

  /**
   * 情報ログの出力
   * @param operation 操作名
   * @param message メッセージ
   * @param data 追加データ
   */
  public static logInfo(operation: string, message: string, data?: LogData): void {
    this.logger.info(operation, message, data as Record<string, unknown>);
  }

  /**
   * 成功ログの出力
   * @param operation 操作名
   * @param message メッセージ
   * @param data 追加データ
   */
  public static logSuccess(operation: string, message: string, data?: LogData): void {
    this.logger.success(operation, message, data as Record<string, unknown>);
  }
}

/**
 * 非同期関数のエラーハンドリングラッパー
 * @param fn 実行する非同期関数
 * @param errorType エラータイプ
 * @param context エラーコンテキスト
 * @returns 実行結果またはAppError
 */
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  errorType: ErrorType,
  context: ErrorContext = {}
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AppError) {
      throw error; // AppErrorはそのまま再スロー
    }
    
    // 予期しないエラーをAppErrorに変換
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new AppError(message, errorType, context, error instanceof Error ? error : undefined);
  }
}

/**
 * 同期関数のエラーハンドリングラッパー
 * @param fn 実行する同期関数
 * @param errorType エラータイプ
 * @param context エラーコンテキスト
 * @returns 実行結果またはAppError
 */
export function withSyncErrorHandling<T>(
  fn: () => T,
  errorType: ErrorType,
  context: ErrorContext = {}
): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof AppError) {
      throw error; // AppErrorはそのまま再スロー
    }
    
    // 予期しないエラーをAppErrorに変換
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new AppError(message, errorType, context, error instanceof Error ? error : undefined);
  }
}

/**
 * データベース操作専用エラーハンドラ
 * よく使われるデータベース操作のエラーハンドリングを統一
 */
export async function withDatabaseErrorHandling<T>(
  fn: () => Promise<T>,
  operation: string,
  context: ErrorContext = {}
): Promise<T> {
  return withErrorHandling(
    fn,
    ErrorType.DATABASE,
    { operation, ...context }
  );
}

/**
 * API操作専用エラーハンドラ
 * Gemini APIなどの外部API呼び出し用
 */
export async function withApiErrorHandling<T>(
  fn: () => Promise<T>,
  apiName: string,
  context: ErrorContext = {}
): Promise<T> {
  return withErrorHandling(
    fn,
    ErrorType.API,
    { operation: apiName, ...context }
  );
}

/**
 * Discord操作専用エラーハンドラ
 * Discord API呼び出し用
 */
export async function withDiscordErrorHandling<T>(
  fn: () => Promise<T>,
  operation: string,
  context: ErrorContext = {}
): Promise<T> {
  return withErrorHandling(
    fn,
    ErrorType.DISCORD,
    { operation, ...context }
  );
}

/**
 * 共通のcatch節処理
 * logger.error + AppError変換 + throw のパターンを統一
 */
export function handleCatchBlock(
  error: unknown,
  errorType: ErrorType,
  loggerOperation: string,
  userMessage: string,
  context: ErrorContext = {}
): never {
  // ログ出力
  logger.error(loggerOperation, userMessage, error);
  
  // AppErrorの場合はそのまま再スロー
  if (error instanceof AppError) {
    throw error;
  }
  
  // 予期しないエラーをAppErrorに変換してスロー
  const message = error instanceof Error ? error.message : 'Unknown error';
  throw new AppError(userMessage, errorType, context, error instanceof Error ? error : undefined);
}

/**
 * Promise<T>を返すコールバック関数でよく使われるtry-catchパターンの統一
 * Promise constructorのreject呼び出しパターン用
 */
export function createPromiseErrorHandler(
  errorType: ErrorType,
  operation: string
) {
  return (reject: (reason?: AppError) => void) => {
    return (error: unknown) => {
      logger.error(operation.toUpperCase(), `${operation}エラー`, error);
      
      if (error instanceof AppError) {
        reject(error);
        return;
      }
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      reject(new AppError(`${operation}に失敗しました: ${errorMessage}`, errorType, { error }));
    };
  };
}