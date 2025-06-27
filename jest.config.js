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
  
  // タイムアウト設定
  testTimeout: 10000,
  
  // セットアップファイル
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
};