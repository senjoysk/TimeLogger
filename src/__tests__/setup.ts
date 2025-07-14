// Jest グローバルセットアップファイル
// テスト実行前に必要な設定を行う

// タイムゾーンを固定（テストの一貫性確保）
process.env.TZ = 'UTC';

// 環境変数のモック
process.env.NODE_ENV = 'test';
process.env.DISCORD_TOKEN = 'test-discord-token';
process.env.GEMINI_API_KEY = 'test-gemini-key';
process.env.TARGET_USER_ID = 'test-user-123';

// コンソールログを制御（テスト中の出力を抑制）
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeEach(() => {
  // テスト中はコンソールログを抑制
  console.log = jest.fn();
  console.error = jest.fn();
  console.warn = jest.fn();
});

afterEach(() => {
  // テスト後はコンソールログを復元
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
  
  // すべてのモックをクリア
  jest.clearAllMocks();
});

afterAll(async () => {
  // 非同期処理のクリーンアップ
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // プロセス内のタイマーをクリア
  jest.clearAllTimers();
});

// Jestがテストファイルとして認識するためのダミーテスト
describe('Test Setup', () => {
  it('環境設定が正しく行われている', () => {
    expect(process.env.NODE_ENV).toBe('test');
    expect(process.env.TZ).toBe('UTC');
  });
});