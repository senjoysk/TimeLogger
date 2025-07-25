/** @type {import('jest').Config} */
module.exports = {
  // TypeScript を使用するための設定
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // テストファイルの場所
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/__tests__/**/*.+(ts|tsx|js)',
    '**/?(*.)+(spec|test).+(ts|tsx|js)'
  ],
  
  // Transform設定（新しい方法）
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
      }
    }]
  },
  
  // カバレッジ設定
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/index.ts', // エントリーポイントは除外
    '!src/__tests__/**/*', // テストファイルは除外
  ],
  
  // モジュールパスのエイリアス
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  
  // タイムアウト設定（CI環境対応：本番デプロイ時のsocket hang up対策）
  testTimeout: process.env.CI ? 60000 : 20000,
  
  // 詳細ログ表示
  verbose: true,
  
  // セットアップファイル
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  
  // プロセス強制終了の設定
  forceExit: true,
  
  // 非同期処理の検出（CI環境最適化）
  detectOpenHandles: process.env.CI ? false : true, // CI環境では無効化
  detectLeaks: false,
  
  // 最大ワーカー数制限（メモリ使用量削減）
  maxWorkers: 1,
};