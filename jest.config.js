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
  
  // カバレッジ設定
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/index.ts', // エントリーポイントは除外
  ],
  
  // モジュールパスのエイリアス
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  
  // タイムアウト設定
  testTimeout: 10000,
  
  // グローバル設定
  globals: {
    'ts-jest': {
      tsconfig: {
        // テスト用のTypeScript設定
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
      }
    }
  },
  
  // セットアップファイル
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
};