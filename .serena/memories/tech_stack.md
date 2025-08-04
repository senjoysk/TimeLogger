# Tech Stack

## 言語・フレームワーク
- **言語**: Node.js (v20.0.0以上) + TypeScript (v5.3.3)
- **Discord**: discord.js v14.14.1
- **AI**: Google Gemini API (@google/generative-ai v0.24.1)
- **データベース**: SQLite3 (v5.1.6)
- **スケジューラー**: node-cron (v3.0.3)
- **Webフレームワーク**: Express v5.1.0 + EJS v3.1.10

## 開発ツール
- **パッケージマネージャー**: npm (v9.0.0以上)
- **テストフレームワーク**: Jest (v29.7.0) + ts-jest
- **リンター**: ESLint + @typescript-eslint
- **Gitフック**: Husky (v9.1.7)
- **Node.jsバージョン管理**: nvm（.nvmrcファイル使用）

## TypeScript設定
- **ターゲット**: ES2022
- **モジュール**: CommonJS
- **Strict Mode**: 有効
- **ソースマップ**: 有効
- **宣言ファイル**: 有効

## テスト設定
- **テストEnvironment**: Node
- **テストパターン**: src/__tests__/**/*.ts
- **カバレッジ収集**: src配下（テストファイル除く）
- **タイムアウト**: CI環境60秒、ローカル20秒
- **最大ワーカー数**: 1（メモリ使用量削減）

## 環境変数
- DISCORD_BOT_TOKEN: Discord Bot認証トークン
- GOOGLE_GEMINI_API_KEY: Gemini API キー
- ADMIN_USERNAME: 管理画面ユーザー名
- ADMIN_PASSWORD: 管理画面パスワード
- NODE_ENV: development/staging/production

## CI/CD
- **Fly.io**: デプロイ・ホスティング
- **GitHub Actions**: 品質チェック
- **Pre-commitフック**: コード品質自動チェック