import { ErrorHandler, ErrorType, AppError, withErrorHandling } from '../../utils/errorHandler';
import { logger } from '../../utils/logger';

// loggerをモック化
jest.mock('../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    success: jest.fn()
  }
}));

describe('ErrorHandler', () => {
  // console出力をモック化
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    // 各テストの前にモックをリセット
    jest.clearAllMocks();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('AppError', () => {
    test('AppErrorが正しく作成される', () => {
      const error = new AppError(
        'テストエラー',
        ErrorType.DATABASE,
        { userId: 'test-user', operation: 'test' }
      );

      expect(error.message).toBe('テストエラー');
      expect(error.type).toBe(ErrorType.DATABASE);
      expect(error.context.userId).toBe('test-user');
      expect(error.context.operation).toBe('test');
      expect(error.timestamp).toBeInstanceOf(Date);
    });

    test('元のエラーのスタックトレースが保持される', () => {
      const originalError = new Error('元のエラー');
      const appError = new AppError(
        'AppError',
        ErrorType.SYSTEM,
        {},
        originalError
      );

      expect(appError.stack).toBe(originalError.stack);
    });
  });

  describe('ErrorHandler.handle', () => {
    test('AppErrorが適切に処理される', () => {
      const error = new AppError(
        'データベースエラー',
        ErrorType.DATABASE,
        { userId: 'test-user' }
      );

      const message = ErrorHandler.handle(error);

      expect(message).toBe('データベースの処理中にエラーが発生しました。しばらく時間をおいて再度お試しください。');
      // logger.errorが呼ばれたことを確認
      expect(logger.error).toHaveBeenCalledWith(
        'DATABASE',
        'データベースエラー',
        error,
        expect.objectContaining({
          timestamp: expect.any(String),
          context: expect.objectContaining({ userId: 'test-user' })
        })
      );
    });

    test('バリデーションエラーはメッセージがそのまま返される', () => {
      const error = new AppError(
        '日付形式が正しくありません',
        ErrorType.VALIDATION
      );

      const message = ErrorHandler.handle(error);

      expect(message).toBe('日付形式が正しくありません');
    });

    test('予期しないエラーが適切に処理される', () => {
      const error = new Error('予期しないエラー');

      // 予期しないエラーは再スローされる
      expect(() => ErrorHandler.handle(error)).toThrow(error);
      
      // logger.errorが呼ばれたことを確認
      expect(logger.error).toHaveBeenCalledWith(
        'SYSTEM',
        '予期しないエラーが発生しました',
        error
      );
    });

    test('各エラータイプが適切なメッセージを返す', () => {
      const testCases = [
        { type: ErrorType.API, expected: 'AI分析サービスの処理中にエラーが発生しました。しばらく時間をおいて再度お試しください。' },
        { type: ErrorType.DISCORD, expected: 'Discord APIの処理中にエラーが発生しました。しばらく時間をおいて再度お試しください。' },
        { type: ErrorType.SYSTEM, expected: 'システムエラーが発生しました。管理者にお問い合わせください。' }
      ];

      testCases.forEach(({ type, expected }) => {
        const error = new AppError('テスト', type);
        const message = ErrorHandler.handle(error);
        expect(message).toBe(expected);
      });
    });
  });

  describe('ログ出力メソッド', () => {
    test('logDebugが正しく動作する', () => {
      ErrorHandler.logDebug('TestOperation', 'デバッグメッセージ', { key: 'value' });

      expect(logger.debug).toHaveBeenCalledWith(
        'TestOperation',
        'デバッグメッセージ',
        { key: 'value' }
      );
    });

    test('logInfoが正しく動作する', () => {
      ErrorHandler.logInfo('TestOperation', '情報メッセージ');

      expect(logger.info).toHaveBeenCalledWith(
        'TestOperation',
        '情報メッセージ',
        undefined
      );
    });

    test('logSuccessが正しく動作する', () => {
      ErrorHandler.logSuccess('TestOperation', '成功メッセージ');

      expect(logger.success).toHaveBeenCalledWith(
        'TestOperation',
        '成功メッセージ',
        undefined
      );
    });
  });

  describe('withErrorHandling', () => {
    test('成功時は結果が返される', async () => {
      const fn = jest.fn().mockResolvedValue('成功');

      const result = await withErrorHandling(
        fn,
        ErrorType.SYSTEM,
        { operation: 'test' }
      );

      expect(result).toBe('成功');
      expect(fn).toHaveBeenCalled();
    });

    test('AppErrorはそのまま再スローされる', async () => {
      const appError = new AppError('AppError', ErrorType.DATABASE);
      const fn = jest.fn().mockRejectedValue(appError);

      await expect(
        withErrorHandling(fn, ErrorType.SYSTEM)
      ).rejects.toThrow(appError);
    });

    test('予期しないエラーがAppErrorに変換される', async () => {
      const originalError = new Error('予期しないエラー');
      const fn = jest.fn().mockRejectedValue(originalError);

      await expect(
        withErrorHandling(
          fn,
          ErrorType.API,
          { userId: 'test' }
        )
      ).rejects.toThrow(AppError);

      // エラー詳細をチェック
      try {
        await withErrorHandling(fn, ErrorType.API, { userId: 'test' });
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).type).toBe(ErrorType.API);
        expect((error as AppError).context.userId).toBe('test');
        expect((error as AppError).message).toBe('予期しないエラー');
      }
    });

    test('非Errorオブジェクトも適切に処理される', async () => {
      const fn = jest.fn().mockRejectedValue('文字列エラー');

      await expect(
        withErrorHandling(fn, ErrorType.SYSTEM)
      ).rejects.toThrow(AppError);

      try {
        await withErrorHandling(fn, ErrorType.SYSTEM);
      } catch (error) {
        expect((error as AppError).message).toBe('Unknown error');
      }
    });
  });
});