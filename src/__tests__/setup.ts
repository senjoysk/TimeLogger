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
  
  // テスト完了後にSQLite WALファイルを削除
  await cleanupTestDatabaseFiles();
});

// SQLite WALファイルのクリーンアップ関数
async function cleanupTestDatabaseFiles(): Promise<void> {
  const fs = require('fs').promises;
  const path = require('path');
  
  // クリーンアップ対象ディレクトリ
  const cleanupDirs = [
    path.join(__dirname, '../../test-data'),
    path.join(__dirname, 'web-admin/integration')
  ];
  
  let totalDeletedFiles = 0;
  
  for (const targetDir of cleanupDirs) {
    try {
      const files = await fs.readdir(targetDir);
      
      // .db-shm と .db-wal ファイルを削除
      const filesToDelete = files.filter((file: string) => 
        file.endsWith('.db-shm') || file.endsWith('.db-wal')
      );
      
      for (const file of filesToDelete) {
        const filePath = path.join(targetDir, file);
        await fs.unlink(filePath);
        console.log(`✅ クリーンアップ: ${path.relative(__dirname, filePath)} を削除しました`);
        totalDeletedFiles++;
      }
    } catch (error) {
      // ディレクトリが存在しない場合は無視
      const fsError = error as { code?: string; message?: string };
      if (fsError.code !== 'ENOENT' && fsError.code !== 'ENOTDIR') {
        console.warn(`⚠️ WALファイルクリーンアップ中にエラーが発生 (${targetDir}):`, fsError.message || error);
      }
    }
  }
  
  if (totalDeletedFiles === 0) {
    console.log('✅ クリーンアップ: 削除対象のWALファイルはありませんでした');
  } else {
    console.log(`✅ クリーンアップ完了: ${totalDeletedFiles}個のWALファイルを削除しました`);
  }
}

// Jestがテストファイルとして認識するためのダミーテスト
describe('Test Setup', () => {
  it('環境設定が正しく行われている', () => {
    expect(process.env.NODE_ENV).toBe('test');
    expect(process.env.TZ).toBe('UTC');
  });
});