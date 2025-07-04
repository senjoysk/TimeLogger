# Fly.io デプロイメント手順

このドキュメントでは、TimeLogger BotをFly.ioにデプロイする手順を説明します。

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
# Discord Bot Token
fly secrets set DISCORD_BOT_TOKEN="your-discord-bot-token"

# Google Gemini API Key
fly secrets set GOOGLE_GEMINI_API_KEY="your-gemini-api-key"

# Target User ID（Discord User ID）
fly secrets set TARGET_USER_ID="your-discord-user-id"

# Discord Client ID（オプション）
fly secrets set DISCORD_CLIENT_ID="your-discord-client-id"
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

## 注意事項

- 無料枠では、リソースに制限があります
- データベースは定期的にバックアップすることを推奨します
- 環境変数の変更後は、アプリケーションの再起動が必要です

## コスト管理

Fly.ioの無料枠：
- 3つの共有CPU VM
- 3GBの永続ストレージ
- 160GB/月の転送量

使用状況の確認：
```bash
fly dashboard
```