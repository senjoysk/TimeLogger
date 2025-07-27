/**
 * ESLint設定: TypeScriptプロジェクト用ルール強化
 * SRP（単一責任原則）違反の自動検出を含む
 */

module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    project: './tsconfig.json',
  },
  plugins: [
    '@typescript-eslint',
  ],
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended',
  ],
  rules: {
    // 🆕 SRP違反検出ルール強化
    'max-lines': ['error', {
      max: 500,
      skipBlankLines: true,
      skipComments: true
    }],
    'max-lines-per-function': ['error', {
      max: 50,
      skipBlankLines: true,
      skipComments: true
    }],
    'max-classes-per-file': ['error', 1],
    'complexity': ['warn', { max: 15 }],
    
    // 🆕 ファイル構造・保守性ルール
    'max-depth': ['error', 4],
    'max-nested-callbacks': ['error', 3],
    'max-params': ['error', 5],
    'max-statements': ['warn', 30],
    'max-statements-per-line': ['error', { max: 1 }],
    
    // 🆕 TypeScript品質ルール
    '@typescript-eslint/no-any': 'warn',
    '@typescript-eslint/explicit-function-return-type': 'warn',
    '@typescript-eslint/no-unused-vars': 'error',
    '@typescript-eslint/prefer-readonly': 'warn',
    '@typescript-eslint/no-magic-numbers': ['warn', {
      ignore: [0, 1, -1],
      ignoreArrayIndexes: true,
      ignoreDefaultValues: true
    }],
    
    // 🆕 インターフェース・クラス設計ルール
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/no-empty-interface': 'warn',
    '@typescript-eslint/prefer-interface': 'off',
    
    // 🆕 import/export構造ルール
    'import/max-dependencies': ['warn', { max: 25 }],
    
    // 🆕 コメント・ドキュメント要求
    'require-jsdoc': ['warn', {
      require: {
        FunctionDeclaration: true,
        ClassDeclaration: true,
        MethodDefinition: true
      }
    }],
    
    // 従来のルール継続
    'no-console': 'warn',
    'no-debugger': 'error',
    'no-unused-vars': 'off', // TypeScript版を使用
  },
  
  // 🆕 環境別設定
  env: {
    node: true,
    es2020: true,
    jest: true,
  },
  
  // 🆕 ファイル別除外設定
  overrides: [
    {
      // テストファイルは一部ルールを緩和
      files: ['**/__tests__/**/*.ts', '**/*.test.ts'],
      rules: {
        'max-lines': 'off',
        'max-lines-per-function': 'off',
        '@typescript-eslint/no-any': 'off',
        'require-jsdoc': 'off',
      }
    },
    {
      // 型定義ファイルは別ルール
      files: ['**/*.d.ts', 'src/types/**/*.ts'],
      rules: {
        'max-lines': ['error', { max: 1000 }], // 型定義は長くなりがち
        '@typescript-eslint/no-empty-interface': 'off',
        'require-jsdoc': 'off',
      }
    },
    {
      // 統合・移行ファイルは例外的に許可
      files: [
        'src/integration/**/*.ts',
        'src/**/migration*.ts',
        'src/**/migrator.ts'
      ],
      rules: {
        'max-lines': ['error', { max: 800 }],
        'max-lines-per-function': ['error', { max: 80 }],
        'complexity': ['warn', { max: 20 }],
      }
    }
  ],
  
  // 🆕 無視パターン
  ignorePatterns: [
    'dist/',
    'node_modules/',
    '*.js', // TypeScriptのみチェック
    '**/*.backup.*',
  ]
};