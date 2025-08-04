# Project Structure

## ディレクトリ構成
```
TimeLogger/
├── src/                           # ソースコード
│   ├── index.ts                  # エントリーポイント
│   ├── config.ts                 # 環境変数管理
│   ├── bot.ts                    # Discord Bot メインクラス
│   ├── scheduler.ts              # スケジュール管理
│   ├── integration/              # 統合システム
│   │   ├── activityLoggingIntegration.ts  # メインシステム統合
│   │   └── systemMigrator.ts    # システム移行ツール
│   ├── repositories/             # データアクセス層
│   │   ├── interfaces.ts        # リポジトリインターフェース
│   │   └── sqliteActivityLogRepository.ts  # 統合リポジトリ
│   ├── handlers/                 # コマンドハンドラー
│   │   ├── interfaces.ts        # ハンドラーインターフェース
│   │   ├── costCommandHandler.ts         # !cost
│   │   ├── summaryCommandHandler.ts      # !summary
│   │   ├── timezoneCommandHandler.ts     # !timezone
│   │   ├── newEditCommandHandler.ts      # !edit
│   │   ├── logsCommandHandler.ts         # !logs
│   │   └── todoCrudHandler.ts           # TODO CRUD操作
│   ├── services/                 # ビジネスロジック層
│   │   ├── geminiService.ts     # Gemini AI分析
│   │   ├── activityLogService.ts # 活動ログサービス
│   │   ├── summaryService.ts    # サマリー生成
│   │   └── unifiedAnalysisService.ts  # 統合分析
│   ├── types/                    # 型定義
│   │   ├── activityLog.ts       # 活動ログ型
│   │   └── todo.ts              # TODO型定義
│   ├── utils/                    # ユーティリティ
│   │   ├── errorHandler.ts      # 統一エラーハンドリング
│   │   ├── logger.ts            # ログサービス
│   │   └── timeUtils.ts         # 時間関連ユーティリティ
│   ├── errors/                   # エラークラス定義
│   ├── database/                 # データベース関連
│   │   ├── newSchema.sql        # 現在のDBスキーマ
│   │   ├── migrations/          # マイグレーションファイル
│   │   └── database.ts          # データベース操作
│   ├── web-admin/               # 管理Webアプリケーション
│   │   ├── server.ts            # Express サーバー
│   │   ├── routes/              # ルーティング
│   │   ├── views/               # EJSテンプレート
│   │   └── public/              # 静的ファイル
│   └── __tests__/               # テストスイート
│       ├── integration/         # 統合テスト
│       ├── repositories/        # リポジトリテスト
│       ├── services/           # サービステスト
│       ├── handlers/           # ハンドラーテスト
│       └── utils/              # ユーティリティテスト
├── scripts/                      # 各種スクリプト
│   ├── test-analysis.sh         # テスト実行と失敗分析
│   ├── staging/                 # Stagingデプロイ関連
│   ├── production/              # 本番デプロイ関連
│   ├── code-review/             # コード品質チェック
│   └── development/             # 開発用スクリプト
├── docs/                        # ドキュメント
├── .husky/                      # Gitフック設定
│   └── pre-commit              # Pre-commitフック
├── package.json                 # npm設定
├── tsconfig.json               # TypeScript設定
├── jest.config.js              # Jest設定
├── .eslintrc.js                # ESLint設定
├── CLAUDE.md                   # Claude Code用ガイド
├── DEVELOPMENT_CHECKLIST.md    # TDD開発チェックリスト
└── README.md                   # プロジェクト説明
```

## 重要ファイル
- **src/integration/activityLoggingIntegration.ts**: メインシステム統合クラス
- **src/repositories/sqliteActivityLogRepository.ts**: データアクセス統合実装
- **src/handlers/interfaces.ts**: コマンドハンドラーインターフェース
- **src/services/geminiService.ts**: AI分析サービス
- **src/types/activityLog.ts**: 主要な型定義
- **src/utils/errorHandler.ts**: エラーハンドリングユーティリティ
- **src/utils/logger.ts**: ログサービス（console使用禁止のため必須）
- **src/database/newSchema.sql**: 現在のデータベーススキーマ
- **src/database/migrations/**: マイグレーションファイル群

## テスト構成
- **カバレッジ**: 65.6%
- **テストファイル数**: 100件以上
- **統合テスト**: src/__tests__/integration/
- **単体テスト**: src/__tests__/[各層]/