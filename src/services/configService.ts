/**
 * 設定管理サービス実装
 * 環境変数やアプリケーション設定を管理
 */

import { IConfigService } from '../interfaces/dependencies';

/**
 * デフォルト設定値
 */
const DEFAULT_CONFIG = {
  timezone: 'Asia/Tokyo',
  serverPort: 3000,
  debugMode: false,
  databasePath: './data/app.db'
} as const;

/**
 * 設定管理サービス実装クラス
 * 環境変数の読み込みと設定値の提供を担当
 */
export class ConfigService implements IConfigService {
  private config: Map<string, any> = new Map();

  constructor() {
    this.loadConfig();
  }

  /**
   * 環境変数から設定を読み込み
   */
  private loadConfig(): void {
    // Discord設定
    this.config.set('discordToken', process.env.DISCORD_BOT_TOKEN);
    
    // Gemini API設定
    this.config.set('geminiApiKey', process.env.GEMINI_API_KEY);
    
    // データベース設定
    this.config.set('databasePath', process.env.DATABASE_PATH || DEFAULT_CONFIG.databasePath);
    
    // デバッグモード
    this.config.set('debugMode', process.env.DEBUG_MODE === 'true' || DEFAULT_CONFIG.debugMode);
    
    // タイムゾーン設定
    this.config.set('defaultTimezone', process.env.DEFAULT_TIMEZONE || DEFAULT_CONFIG.timezone);
    
    // サーバーポート
    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : DEFAULT_CONFIG.serverPort;
    this.config.set('serverPort', port);
    
    // 追加設定
    this.config.set('environment', process.env.NODE_ENV || 'development');
    this.config.set('logLevel', process.env.LOG_LEVEL || 'info');
  }

  /**
   * Discord Bot トークンを取得
   */
  getDiscordToken(): string {
    const token = this.config.get('discordToken');
    if (!token) {
      throw new Error('DISCORD_BOT_TOKEN環境変数が設定されていません');
    }
    return token;
  }

  /**
   * Gemini APIキーを取得
   */
  getGeminiApiKey(): string {
    const apiKey = this.config.get('geminiApiKey');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY環境変数が設定されていません');
    }
    return apiKey;
  }

  /**
   * データベースパスを取得
   */
  getDatabasePath(): string {
    return this.config.get('databasePath');
  }

  /**
   * デバッグモードの設定を取得
   */
  isDebugMode(): boolean {
    return this.config.get('debugMode');
  }

  /**
   * デフォルトタイムゾーンを取得
   */
  getDefaultTimezone(): string {
    return this.config.get('defaultTimezone');
  }

  /**
   * HTTPサーバーポート番号を取得
   */
  getServerPort(): number {
    return this.config.get('serverPort');
  }

  /**
   * 環境名を取得
   */
  getEnvironment(): string {
    return this.config.get('environment');
  }

  /**
   * ログレベルを取得
   */
  getLogLevel(): string {
    return this.config.get('logLevel');
  }

  /**
   * 設定値を検証
   */
  validate(): boolean {
    try {
      // 必須設定の確認
      this.getDiscordToken();
      this.getGeminiApiKey();
      
      // ポート番号の妥当性確認
      const port = this.getServerPort();
      if (port < 1 || port > 65535) {
        console.error(`無効なポート番号: ${port}`);
        return false;
      }
      
      // データベースパスの確認
      const dbPath = this.getDatabasePath();
      if (!dbPath || dbPath.trim() === '') {
        console.error('データベースパスが設定されていません');
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('設定検証エラー:', error);
      return false;
    }
  }

  /**
   * 設定値を動的に取得
   * @param key 設定キー
   * @returns 設定値
   */
  get(key: string): string | number | boolean | undefined {
    return this.config.get(key);
  }

  /**
   * 設定値を動的に設定（テスト用）
   * @param key 設定キー
   * @param value 設定値
   */
  set(key: string, value: any): void {
    this.config.set(key, value);
  }

  /**
   * 設定をリロード
   */
  reload(): void {
    this.config.clear();
    this.loadConfig();
  }

  /**
   * 設定の詳細情報を取得（デバッグ用）
   */
  getDebugInfo(): object {
    if (!this.isDebugMode()) {
      return { message: 'デバッグモードが無効です' };
    }
    
    return {
      environment: this.getEnvironment(),
      debugMode: this.isDebugMode(),
      defaultTimezone: this.getDefaultTimezone(),
      serverPort: this.getServerPort(),
      logLevel: this.getLogLevel(),
      databasePath: this.getDatabasePath(),
      // セキュリティ上、トークンやAPIキーは表示しない
      hasDiscordToken: !!this.config.get('discordToken'),
      hasGeminiApiKey: !!this.config.get('geminiApiKey')
    };
  }
}