# Fly.io デプロイメント手順

このドキュメントでは、TimeLogger BotをFly.ioにデプロイする手順を説明します。

## 開発・本番環境の分離

### 開発環境（ローカル）
- **データベース**: `app.db`（統一パス）
- **実行コマンド**: `npm run dev`
- **設定ファイル**: `.env.development`
- **NODE_ENV**: `development`

### 本番環境（Fly.io）
- **データベース**: `/app/data/app.db`（統一パス）
- **実行コマンド**: `fly deploy`
- **設定**: Fly.io secrets
- **NODE_ENV**: `production`

## 前提条件

- Fly.ioアカウント（https://fly.io/）
- flyctlコマンドラインツール
- Discord Bot Token
- Google Gemini API Key

## セットアップ手順

### 1. flyctlのインストール

```bash
# macOS/Linux
curl -L https://fly.io/install.sh | sh

# Windows
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
```

### 2. Fly.ioにログイン

```bash
fly auth login
```

### 3. アプリケーションの作成

```bash
# アプリケーションを初期化（既存のfly.tomlを使用）
fly launch --no-deploy

# または既存のアプリにデプロイする場合
fly deploy --app timelogger-bot
```

### 4. 環境変数の設定

```bash
# 環境設定
fly secrets set NODE_ENV="production"

# Discord Bot Token
fly secrets set DISCORD_BOT_TOKEN="your-discord-bot-token"

# Google Gemini API Key
fly secrets set GOOGLE_GEMINI_API_KEY="your-gemini-api-key"

# Discord Client ID（オプション）
fly secrets set DISCORD_CLIENT_ID="your-discord-client-id"

# 注意: TARGET_USER_IDは削除済み（マルチユーザー対応）
# 注意: DATABASE_PATHは統一パス(/app/data/app.db)を使用、設定不要
```

### 5. 永続ストレージの作成

```bash
# ボリュームの作成（データベース用）
fly volumes create timelogger_data --size 1 --region nrt
```

### 6. デプロイ

```bash
# 初回デプロイ
fly deploy

# 状態確認
fly status

# ログ確認
fly logs
```

## メンテナンス

### アプリケーションの再起動

```bash
fly apps restart timelogger-bot
```

### スケールの調整

```bash
# インスタンス数を確認
fly scale show

# メモリを増やす（必要な場合）
fly scale memory 512
```

### ログの確認

```bash
# リアルタイムログ
fly logs

# 過去のログ
fly logs --since 1h
```

### データベースのバックアップ

```bash
# SSHでインスタンスに接続
fly ssh console

# データベースファイルのコピー
cp /app/data/activity_logs.db /app/data/backup_$(date +%Y%m%d).db

# ローカルにダウンロード
fly sftp get /app/data/activity_logs.db ./backup.db
```

## トラブルシューティング

### デプロイが失敗する場合

1. ビルドログを確認
```bash
fly deploy --verbose
```

2. Dockerfileのビルドをローカルでテスト
```bash
docker build -t timelogger-test .
```

### Botが起動しない場合

1. 環境変数が正しく設定されているか確認
```bash
fly secrets list
```

2. ログを確認してエラーメッセージを探す
```bash
fly logs --since 10m
```

### メモリ不足の場合

```bash
# 現在のリソース使用状況を確認
fly status

# メモリを増やす
fly scale memory 512
```

## 開発フロー

### 日常の開発作業
1. **ローカル開発**
   ```bash
   # 開発環境で実行
   npm run dev
   
   # または環境を明示的に指定
   NODE_ENV=development npm run dev
   ```

2. **テスト実行**
   ```bash
   npm test
   npm run test:coverage
   ```

3. **本番環境での動作確認**
   ```bash
   # 本番環境設定でローカル実行
   npm run dev:prod
   ```

### デプロイ手順
1. **コードの準備**
   ```bash
   # テスト実行
   npm test
   
   # ビルド確認
   npm run build
   
   # mainブランチにマージ
   git checkout main
   git merge feature/your-feature
   ```

2. **本番デプロイ**
   ```bash
   # デプロイ実行
   fly deploy --app timelogger-bot
   
   # 状態確認
   fly status --app timelogger-bot
   
   # ログ確認
   fly logs --app timelogger-bot
   ```

3. **デプロイ後の確認**
   - Discordで各コマンドの動作確認
   - `!cost`, `!summary`, `!timezone` コマンドのテスト
   - エラーログの監視

## 注意事項

- 無料枠では、リソースに制限があります
- データベースは定期的にバックアップすることを推奨します
- 環境変数の変更後は、アプリケーションの再起動が必要です
- **自動デプロイは設定していません** - 手動でのデプロイが必要です

## コスト管理

Fly.ioの無料枠：
- 3つの共有CPU VM
- 3GBの永続ストレージ
- 160GB/月の転送量

使用状況の確認：
```bash
fly dashboard
```