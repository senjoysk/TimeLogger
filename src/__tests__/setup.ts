/**
 * Jest テスト環境のセットアップ
 * 全てのテストの前に実行される
 */

// 環境変数のモック設定
process.env.NODE_ENV = 'test';
process.env.DISCORD_TOKEN = 'test-discord-token';
process.env.DISCORD_CLIENT_ID = 'test-client-id';
process.env.TARGET_USER_ID = 'test-user-id';
process.env.GOOGLE_API_KEY = 'test-google-api-key';
process.env.DATABASE_PATH = ':memory:'; // SQLiteのインメモリデータベースを使用

// タイムゾーンの設定（日本時間）
process.env.TZ = 'Asia/Tokyo';

// グローバルのタイムアウト設定
jest.setTimeout(10000);

// コンソール出力のモック（必要に応じて）
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};