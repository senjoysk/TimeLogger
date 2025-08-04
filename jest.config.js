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
  
  // タイムアウト設定（データベーステストを考慮）
  testTimeout: process.env.CI ? 60000 : 20000,
  
  // 詳細ログ表示（通常は有効）
  verbose: true,
  
  // セットアップファイル
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  
  // プロセス強制終了の設定（ハンドルリークがあっても終了）
  forceExit: true,
  
  // 非同期処理の検出（デバッグ時のみ有効）
  detectOpenHandles: process.env.DEBUG === 'true',
  detectLeaks: false,
  
  // 最大ワーカー数制限
  // - デフォルト: 2ワーカー（適度な並列化）
  // - CI環境: 1ワーカー（安定性重視）
  // - 高速実行: TEST_PARALLEL=true で4ワーカー
  maxWorkers: process.env.CI ? 1 : (process.env.TEST_PARALLEL ? 4 : 2),
  
  // テスト実行順序のランダム化を無効化（再現性向上）
  randomize: false,
};