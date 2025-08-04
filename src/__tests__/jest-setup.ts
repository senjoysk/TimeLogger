// Jest グローバルセットアップファイル
// テスト実行前に必要な設定を行う

import * as path from 'path';
import * as fs from 'fs';

// グローバルなconsoleモック設定（Test Suite失敗表示を防ぐため）
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

// テストファイルごとの独立したデータベースパスを生成
export function getTestDatabasePath(testName: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  const safeName = testName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
  return path.join(__dirname, '../../test-data', `test-${safeName}-${timestamp}-${random}.db`);
}

// beforeEach/afterEachでモックをクリア
beforeEach(() => {
  // 各テスト前にモックの呼び出し履歴をクリア
  jest.clearAllMocks();
});

afterEach(async () => {
  // 各テスト後にもモックの呼び出し履歴をクリア
  jest.clearAllMocks();
  
  // テストデータディレクトリのクリーンアップ
  const testDataDir = path.join(__dirname, '../../test-data');
  if (fs.existsSync(testDataDir)) {
    try {
      const files = fs.readdirSync(testDataDir);
      for (const file of files) {
        if (file.startsWith('test-') && file.includes(process.pid.toString())) {
          const filePath = path.join(testDataDir, file);
          try {
            fs.unlinkSync(filePath);
          } catch (error) {
            // ファイル削除エラーは無視
          }
        }
      }
    } catch (error) {
      // ディレクトリ読み取りエラーは無視
    }
  }
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
  const cleanupDirs = [
    path.join(__dirname, '../../test-data'),
    path.join(__dirname, 'web-admin/integration')
  ];
  
  let totalDeletedFiles = 0;
  
  for (const targetDir of cleanupDirs) {
    try {
      const files = await fs.promises.readdir(targetDir);
      
      // .db, .db-shm, .db-wal ファイルを削除
      const filesToDelete = files.filter((file: string) => 
        file.startsWith('test-') && (
          file.endsWith('.db') ||
          file.endsWith('.db-shm') || 
          file.endsWith('.db-wal')
        )
      );
      
      for (const file of filesToDelete) {
        const filePath = path.join(targetDir, file);
        try {
          await fs.promises.unlink(filePath);
          originalConsole.log(`✅ クリーンアップ: ${path.relative(__dirname, filePath)} を削除しました`);
          totalDeletedFiles++;
        } catch (error) {
          // ファイル削除エラーは無視
        }
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
    originalConsole.log(`✅ クリーンアップ完了: ${totalDeletedFiles}個のファイルを削除しました`);
  }
}

// クリーンアップ関数をエクスポート
export { cleanupTestDatabaseFiles };

// Jestがテストファイルとして認識するためのダミーテスト
describe('Test Setup', () => {
  it('環境設定が正しく行われている', () => {
    expect(process.env.NODE_ENV).toBe('test');
    expect(process.env.TZ).toBe('UTC');
  });
});