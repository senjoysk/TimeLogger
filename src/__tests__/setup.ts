// Jest グローバルセットアップファイル
// テスト実行前に必要な設定を行う

// グローバルなconsoleモック設定（Test Suite失敗表示を防ぐため）
// console.error/warnの実際の出力を防ぎ、代わりにjest.fnで記録
const originalConsole = { ...console };
global.console = {
  ...console,
  log: jest.fn((...args) => {
    // テスト中でもクリーンアップメッセージは表示
    if (args[0]?.includes('✅ クリーンアップ') || args[0]?.includes('⚠️')) {
      originalConsole.log(...args);
    }
  }),
  error: jest.fn(),
  warn: jest.fn(),
  info: console.info,
  debug: console.debug,
};

// タイムゾーンを固定（テストの一貫性確保）
process.env.TZ = 'UTC';

// 環境変数のモック
process.env.NODE_ENV = 'test';
process.env.DISCORD_TOKEN = 'test-discord-token';
process.env.GEMINI_API_KEY = 'test-gemini-key';
process.env.TARGET_USER_ID = 'test-user-123';

// beforeEach/afterEachでモックをクリア
beforeEach(() => {
  // 各テスト前にモックの呼び出し履歴をクリア
  jest.clearAllMocks();
});

afterEach(() => {
  // 各テスト後にもモックの呼び出し履歴をクリア
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
        originalConsole.log(`✅ クリーンアップ: ${path.relative(__dirname, filePath)} を削除しました`);
        totalDeletedFiles++;
      }
    } catch (error) {
      // ディレクトリが存在しない場合は無視
      const fsError = error as { code?: string; message?: string };
      if (fsError.code !== 'ENOENT' && fsError.code !== 'ENOTDIR') {
        originalConsole.warn(`⚠️ WALファイルクリーンアップ中にエラーが発生 (${targetDir}):`, fsError.message || error);
      }
    }
  }
  
  if (totalDeletedFiles === 0) {
    originalConsole.log('✅ クリーンアップ: 削除対象のWALファイルはありませんでした');
  } else {
    originalConsole.log(`✅ クリーンアップ完了: ${totalDeletedFiles}個のWALファイルを削除しました`);
  }
}

// Jestがテストファイルとして認識するためのダミーテスト
describe('Test Setup', () => {
  it('環境設定が正しく行われている', () => {
    expect(process.env.NODE_ENV).toBe('test');
    expect(process.env.TZ).toBe('UTC');
  });
});