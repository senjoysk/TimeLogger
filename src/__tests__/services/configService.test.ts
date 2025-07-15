/**
 * ConfigService テスト
 * 設定管理サービスの動作確認
 */

import { ConfigService } from '../../services/configService';

describe('ConfigService', () => {
  let configService: ConfigService;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // 環境変数をバックアップ
    originalEnv = { ...process.env };
    
    // テスト用環境変数を設定
    process.env.DISCORD_BOT_TOKEN = 'test-discord-token';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.DATABASE_PATH = './test-data/app.db';
    process.env.DEBUG_MODE = 'true';
    process.env.DEFAULT_TIMEZONE = 'Asia/Tokyo';
    process.env.PORT = '3001';
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'debug';
    
    configService = new ConfigService();
  });

  afterEach(() => {
    // 環境変数を復元
    process.env = originalEnv;
  });

  describe('基本設定取得', () => {
    test('Discord Botトークンが正しく取得される', () => {
      expect(configService.getDiscordToken()).toBe('test-discord-token');
    });

    test('Gemini APIキーが正しく取得される', () => {
      expect(configService.getGeminiApiKey()).toBe('test-gemini-key');
    });

    test('データベースパスが正しく取得される', () => {
      expect(configService.getDatabasePath()).toBe('./test-data/app.db');
    });

    test('デバッグモードが正しく取得される', () => {
      expect(configService.isDebugMode()).toBe(true);
    });

    test('デフォルトタイムゾーンが正しく取得される', () => {
      expect(configService.getDefaultTimezone()).toBe('Asia/Tokyo');
    });

    test('サーバーポートが正しく取得される', () => {
      expect(configService.getServerPort()).toBe(3001);
    });

    test('環境名が正しく取得される', () => {
      expect(configService.getEnvironment()).toBe('test');
    });

    test('ログレベルが正しく取得される', () => {
      expect(configService.getLogLevel()).toBe('debug');
    });
  });

  describe('デフォルト値の適用', () => {
    beforeEach(() => {
      // 一部の環境変数を削除してデフォルト値をテスト
      delete process.env.DATABASE_PATH;
      delete process.env.DEFAULT_TIMEZONE;
      delete process.env.PORT;
      delete process.env.DEBUG_MODE;
      
      configService = new ConfigService();
    });

    test('データベースパスのデフォルト値が適用される', () => {
      expect(configService.getDatabasePath()).toBe('./data/app.db');
    });

    test('デフォルトタイムゾーンが適用される', () => {
      expect(configService.getDefaultTimezone()).toBe('Asia/Tokyo');
    });

    test('デフォルトポートが適用される', () => {
      expect(configService.getServerPort()).toBe(3000);
    });

    test('デバッグモードがfalseになる', () => {
      expect(configService.isDebugMode()).toBe(false);
    });
  });

  describe('設定検証', () => {
    test('有効な設定で検証が成功する', () => {
      expect(configService.validate()).toBe(true);
    });

    test('Discord Botトークンがないと検証が失敗する', () => {
      delete process.env.DISCORD_BOT_TOKEN;
      const invalidConfigService = new ConfigService();
      
      expect(invalidConfigService.validate()).toBe(false);
    });

    test('Gemini APIキーがないと検証が失敗する', () => {
      delete process.env.GEMINI_API_KEY;
      const invalidConfigService = new ConfigService();
      
      expect(invalidConfigService.validate()).toBe(false);
    });

    test('無効なポート番号で検証が失敗する', () => {
      process.env.PORT = '70000'; // 範囲外
      const invalidConfigService = new ConfigService();
      
      expect(invalidConfigService.validate()).toBe(false);
    });
  });

  describe('動的設定操作', () => {
    test('設定値を動的に取得できる', () => {
      expect(configService.get('debugMode')).toBe(true);
      expect(configService.get('environment')).toBe('test');
    });

    test('設定値を動的に設定できる', () => {
      configService.set('customSetting', 'test-value');
      expect(configService.get('customSetting')).toBe('test-value');
    });

    test('設定をリロードできる', () => {
      configService.set('customSetting', 'test-value');
      expect(configService.get('customSetting')).toBe('test-value');
      
      configService.reload();
      expect(configService.get('customSetting')).toBeUndefined();
    });
  });

  describe('デバッグ情報取得', () => {
    test('デバッグモード有効時にデバッグ情報が取得される', () => {
      const debugInfo = configService.getDebugInfo();
      
      expect(debugInfo).toHaveProperty('environment', 'test');
      expect(debugInfo).toHaveProperty('debugMode', true);
      expect(debugInfo).toHaveProperty('defaultTimezone', 'Asia/Tokyo');
      expect(debugInfo).toHaveProperty('serverPort', 3001);
      expect(debugInfo).toHaveProperty('hasDiscordToken', true);
      expect(debugInfo).toHaveProperty('hasGeminiApiKey', true);
    });

    test('デバッグモード無効時にメッセージが返される', () => {
      process.env.DEBUG_MODE = 'false';
      const nonDebugConfigService = new ConfigService();
      
      const debugInfo = nonDebugConfigService.getDebugInfo();
      expect(debugInfo).toEqual({ message: 'デバッグモードが無効です' });
    });
  });

  describe('エラーハンドリング', () => {
    test('Discord Botトークンなしでエラーが発生する', () => {
      delete process.env.DISCORD_BOT_TOKEN;
      const configServiceWithoutToken = new ConfigService();
      
      expect(() => configServiceWithoutToken.getDiscordToken())
        .toThrow('DISCORD_BOT_TOKEN環境変数が設定されていません');
    });

    test('Gemini APIキーなしでエラーが発生する', () => {
      delete process.env.GEMINI_API_KEY;
      const configServiceWithoutApiKey = new ConfigService();
      
      expect(() => configServiceWithoutApiKey.getGeminiApiKey())
        .toThrow('GEMINI_API_KEY環境変数が設定されていません');
    });
  });
});