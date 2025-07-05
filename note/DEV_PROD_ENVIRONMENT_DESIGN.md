# 開発・本番環境分離設計

## 概要
TimeLogger Botを開発環境（ローカル）と本番環境（Fly.io）で分離して運用するための設計。

## 環境構成

### 開発環境（ローカル）
- **実行方法**: `npm run dev` または `NODE_ENV=development npm start`
- **データベース**: `./data/tasks.db`
- **設定ファイル**: `.env.development`
- **用途**: 機能開発、テスト実行、デバッグ

### 本番環境（Fly.io）
- **実行方法**: `fly deploy` で手動デプロイ
- **データベース**: `/app/data/activity_logs.db`（Fly.ioボリューム）
- **設定**: Fly.io secrets（環境変数）
- **用途**: 実際のDiscordサーバーでの運用

## 実装内容

### 1. 環境別設定ファイル
```
.env.development    # ローカル開発用（gitignore対象）
.env.production     # 本番設定の例（実際はFly.io secretsを使用）
.env.example        # 設定例（既存）
```

### 2. 環境判定ロジック（config.ts）
```typescript
// NODE_ENV による環境判定
const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';

// 環境別の設定読み込み
if (isDevelopment) {
  dotenv.config({ path: '.env.development' });
} else if (isProduction) {
  dotenv.config({ path: '.env.production' });
} else {
  dotenv.config(); // デフォルト（.env）
}

// データベースパスの環境別設定
const dbPath = isDevelopment 
  ? './data/tasks.db' 
  : process.env.DB_PATH || '/app/data/activity_logs.db';
```

### 3. 開発フロー

#### 日常の開発作業
1. **ブランチ作成**: `git checkout -b feature/xxx`
2. **TDD実践**: 
   - `npm run test:watch` でテスト駆動開発
   - Red → Green → Refactor サイクル
3. **ローカル動作確認**: `npm run dev`
4. **PR作成**: feature → develop → main

#### 本番デプロイ
1. **ローカルでの最終確認**
   ```bash
   npm test
   npm run build
   npm run dev  # 動作確認
   ```

2. **本番環境へのデプロイ**
   ```bash
   # mainブランチで実行
   fly deploy --app timelogger-bot
   
   # 状態確認
   fly status
   fly logs
   ```

3. **デプロイ後の確認**
   - Discordで各コマンドの動作確認
   - ログ監視

### 4. データベース管理

#### ローカル環境
- パス: `./data/tasks.db`
- gitignoreで除外
- 開発用の初期データを自由に作成可能

#### 本番環境
- パス: `/app/data/activity_logs.db`
- Fly.ioの永続ボリュームにマウント
- 定期的なバックアップ推奨

#### マイグレーション戦略
- 起動時に自動でスキーマを適用
- 既存のnewSchema.sqlを使用
- 環境別の初期データは分離

### 5. 環境変数管理

#### 必須の環境変数
- `DISCORD_BOT_TOKEN`: Discord Botトークン
- `GOOGLE_GEMINI_API_KEY`: Gemini APIキー
- `TARGET_USER_ID`: 対象ユーザーのDiscord ID
- `NODE_ENV`: 環境識別（development/production）

#### ローカル開発
`.env.development`で管理（gitignore対象）

#### 本番環境
```bash
fly secrets set KEY=value
```

### 6. Dockerによる開発環境統一（オプション）

開発環境の差異を吸収するため、ローカル開発用のDockerfileを用意：
- Node.js 20環境
- 必要な依存関係を含む
- ボリュームマウントで即時反映

### 7. 注意事項

- **秘密情報の管理**: 環境変数ファイルは絶対にコミットしない
- **データベースの扱い**: ローカルと本番でファイル名が異なることに注意
- **手動デプロイ**: 必ず動作確認後にデプロイ
- **ロールバック**: Fly.ioのリリース履歴から可能

## メリット

1. **安全な開発**: 本番環境に影響を与えずに開発可能
2. **柔軟なテスト**: ローカルで自由にデータを操作
3. **明確な分離**: 環境ごとの設定が明確
4. **手動制御**: デプロイタイミングを完全に制御

## 今後の拡張可能性

- ステージング環境の追加
- CI/CDパイプラインの構築（テスト自動化のみ）
- 環境別のログレベル設定
- パフォーマンスモニタリング