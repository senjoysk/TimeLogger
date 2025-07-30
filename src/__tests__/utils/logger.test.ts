import { ConsoleLogger, LogLevel, logger } from '../../utils/logger';

describe('Logger Service', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let mockLogger: ConsoleLogger;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    mockLogger = new ConsoleLogger();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('ConsoleLogger', () => {
    test('debug メソッドが適切なフォーマットでログを出力する', () => {
      // デバッグレベルを有効にする
      process.env.LOG_LEVEL = 'DEBUG';
      const debugLogger = new ConsoleLogger();
      
      debugLogger.debug('TEST_OPERATION', 'デバッグメッセージ', { key: 'value' });

      expect(consoleLogSpy).toHaveBeenCalled();
      const callArgs = consoleLogSpy.mock.calls[0];
      expect(callArgs[0]).toContain('🔧 [DEBUG] TEST_OPERATION: デバッグメッセージ');
      expect(callArgs[1]).toEqual({ key: 'value' });
      
      // 環境変数をリセット
      delete process.env.LOG_LEVEL;
    });

    test('info メソッドが適切なフォーマットでログを出力する', () => {
      mockLogger.info('TEST_OPERATION', '情報メッセージ');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('ℹ️ [INFO] TEST_OPERATION: 情報メッセージ'),
        ''
      );
    });

    test('warn メソッドが適切なフォーマットでログを出力する', () => {
      mockLogger.warn('TEST_OPERATION', '警告メッセージ', { warning: true });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('⚠️ [WARN] TEST_OPERATION: 警告メッセージ'),
        { warning: true }
      );
    });

    test('error メソッドがconsole.logを使用してエラーを出力する', () => {
      const error = new Error('テストエラー');
      mockLogger.error('TEST_OPERATION', 'エラーメッセージ', error, { context: 'test' });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('❌ [ERROR] TEST_OPERATION: エラーメッセージ'),
        expect.objectContaining({
          context: 'test',
          error: expect.objectContaining({
            name: 'Error',
            message: 'テストエラー',
            stack: expect.any(String)
          })
        })
      );
    });

    test('success メソッドが適切なフォーマットでログを出力する', () => {
      mockLogger.success('TEST_OPERATION', '成功メッセージ', { result: 'ok' });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✅ [SUCCESS] TEST_OPERATION: 成功メッセージ'),
        { result: 'ok' }
      );
    });

    test('operationが省略された場合、適切にフォーマットする', () => {
      mockLogger.info('', 'メッセージのみ');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('ℹ️ [INFO] メッセージのみ'),
        ''
      );
    });

    test('Error以外のオブジェクトをエラーとして処理できる', () => {
      mockLogger.error('TEST_OPERATION', 'エラーメッセージ', 'string error');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('❌ [ERROR] TEST_OPERATION: エラーメッセージ'),
        expect.objectContaining({
          error: expect.objectContaining({
            name: 'Unknown',
            message: 'string error'
          })
        })
      );
    });
  });

  describe('logger instance', () => {
    test('loggerがシングルトンインスタンスとして機能する', () => {
      expect(logger).toBeDefined();
      expect(logger).toBeInstanceOf(ConsoleLogger);
    });
  });

  describe('環境変数によるログレベル制御', () => {
    test('NODE_ENVがtestの場合、ログを抑制できる', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';
      
      // テスト環境でのログ抑制の実装が必要
      
      process.env.NODE_ENV = originalEnv;
    });
  });
});