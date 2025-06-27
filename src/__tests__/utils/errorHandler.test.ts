import { ErrorHandler, ErrorType, AppError, withErrorHandling } from '../../utils/errorHandler';

describe('ErrorHandler', () => {
  // console出力をモック化
  let consoleErrorSpy: jest.SpyInstance;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
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
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[DATABASE] データベースエラー'),
        expect.any(Object)
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

      const message = ErrorHandler.handle(error);

      expect(message).toBe('システムエラーが発生しました。しばらく時間をおいて再度お試しください。');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('予期しないエラーが発生しました'),
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

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '🔧 [DEBUG] TestOperation: デバッグメッセージ',
        { key: 'value' }
      );
    });

    test('logInfoが正しく動作する', () => {
      ErrorHandler.logInfo('TestOperation', '情報メッセージ');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        'ℹ️ [INFO] TestOperation: 情報メッセージ',
        ''
      );
    });

    test('logSuccessが正しく動作する', () => {
      ErrorHandler.logSuccess('TestOperation', '成功メッセージ');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '✅ [SUCCESS] TestOperation: 成功メッセージ',
        ''
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