/**
 * エラーハンドリングユーティリティ
 * 統一されたエラー処理とログ出力を提供
 */
export enum ErrorType {
  DATABASE = 'DATABASE',
  API = 'API',
  VALIDATION = 'VALIDATION',
  DISCORD = 'DISCORD',
  SYSTEM = 'SYSTEM'
}

export interface ErrorContext {
  userId?: string;
  operation?: string;
  details?: Record<string, any>;
  [key: string]: any; // 追加の任意プロパティを許可
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
    console.error('❌ [SYSTEM] 予期しないエラーが発生しました:', error);
    return 'システムエラーが発生しました。しばらく時間をおいて再度お試しください。';
  }

  /**
   * AppErrorの処理
   */
  private static handleAppError(error: AppError): string {
    // 詳細ログの出力
    console.error(`❌ [${error.type}] ${error.message}`, {
      timestamp: error.timestamp.toISOString(),
      context: error.context,
      stack: error.stack
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
  public static logDebug(operation: string, message: string, data?: any): void {
    console.log(`🔧 [DEBUG] ${operation}: ${message}`, data ? data : '');
  }

  /**
   * 情報ログの出力
   * @param operation 操作名
   * @param message メッセージ
   * @param data 追加データ
   */
  public static logInfo(operation: string, message: string, data?: any): void {
    console.log(`ℹ️ [INFO] ${operation}: ${message}`, data ? data : '');
  }

  /**
   * 成功ログの出力
   * @param operation 操作名
   * @param message メッセージ
   * @param data 追加データ
   */
  public static logSuccess(operation: string, message: string, data?: any): void {
    console.log(`✅ [SUCCESS] ${operation}: ${message}`, data ? data : '');
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