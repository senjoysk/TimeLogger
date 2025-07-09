# 夜間サスペンドシステム デプロイメント手順

## 概要

このドキュメントでは、夜間サスペンドシステムをFly.ioにデプロイし、GitHub Actionsで自動化する手順を説明します。

## 前提条件

- Fly.ioアカウント
- GitHub Repository
- Discord Bot Token
- Google Gemini API Key

## 1. Fly.io設定

### アプリケーションの作成・設定

```bash
# Fly.ioにログイン
flyctl auth login

# アプリケーションの作成（既存の場合はスキップ）
flyctl launch --name timelogger-bitter-resonance-9585

# 環境変数の設定
flyctl secrets set DISCORD_BOT_TOKEN="your-discord-bot-token"
flyctl secrets set GOOGLE_API_KEY="your-google-gemini-api-key"
flyctl secrets set SHUTDOWN_TOKEN="$(openssl rand -base64 32)"
flyctl secrets set WAKE_TOKEN="$(openssl rand -base64 32)"
flyctl secrets set RECOVERY_TOKEN="$(openssl rand -base64 32)"

# 設定確認
flyctl secrets list
```

### fly.toml設定

```toml
# fly.toml
app = "timelogger-bitter-resonance-9585"
primary_region = "nrt"

[build]

[env]
  NODE_ENV = "production"
  PORT = "3000"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = false
  auto_start_machines = true
  min_machines_running = 0
  processes = ["app"]

[[http_service.checks]]
  interval = "30s"
  timeout = "10s"
  grace_period = "5s"
  method = "GET"
  path = "/health"
  protocol = "http"
  tls_skip_verify = false

[services]
  protocol = "tcp"
  internal_port = 3000

  [[services.ports]]
    port = 80
    handlers = ["http"]
    force_https = true

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]

  [services.concurrency]
    type = "connections"
    hard_limit = 25
    soft_limit = 20

  [[services.tcp_checks]]
    interval = "15s"
    timeout = "2s"
    grace_period = "1s"
    restart_limit = 0

  [[services.http_checks]]
    interval = "30s"
    timeout = "10s"
    grace_period = "5s"
    restart_limit = 0
    method = "GET"
    path = "/health"
    protocol = "http"
    tls_skip_verify = false
```

## 2. GitHub Secrets設定

GitHubリポジトリの Settings → Secrets and variables → Actions で以下を設定：

### 必須Secrets

```bash
# Fly.io API Token
FLY_API_TOKEN=your-fly-api-token

# 夜間サスペンド用認証トークン
SHUTDOWN_TOKEN=your-shutdown-token

# 起動用認証トークン  
WAKE_TOKEN=your-wake-token

# リカバリ用認証トークン
RECOVERY_TOKEN=your-recovery-token
```

### Fly.io API Tokenの取得

```bash
# Fly.io API Token生成
flyctl auth token

# 生成されたトークンをGitHub Secretsに設定
```

### 認証トークンの生成

```bash
# 安全なランダムトークン生成
openssl rand -base64 32  # SHUTDOWN_TOKEN用
openssl rand -base64 32  # WAKE_TOKEN用  
openssl rand -base64 32  # RECOVERY_TOKEN用
```

## 3. アプリケーションの統合

### メインアプリケーションの修正

```typescript
// src/index.ts
import { NightSuspendServer } from './api/nightSuspendServer';
import { MorningMessageRecovery } from './services/morningMessageRecovery';
import { SqliteNightSuspendRepository } from './repositories/sqliteNightSuspendRepository';

// ... existing Discord bot setup

// 夜間サスペンドサーバーの統合
const nightSuspendRepo = new SqliteNightSuspendRepository(database);
const morningRecovery = new MorningMessageRecovery(client, nightSuspendRepo, {
  targetUserId: 'YOUR_DISCORD_USER_ID',
  timezone: 'Asia/Tokyo'
});

const nightSuspendServer = new NightSuspendServer(morningRecovery);
await nightSuspendServer.start();

console.log('🌙 夜間サスペンドシステムが統合されました');
```

## 4. 動作確認

### 手動テスト

```bash
# ヘルスチェック
curl https://timelogger-bitter-resonance-9585.fly.dev/health

# サスペンド状態確認
curl https://timelogger-bitter-resonance-9585.fly.dev/api/suspend-status

# 夜間サスペンド（要認証）
curl -X POST \
  -H "Authorization: Bearer YOUR_SHUTDOWN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"prepare_suspend"}' \
  https://timelogger-bitter-resonance-9585.fly.dev/api/night-suspend

# 朝の起動（要認証）
curl -X POST \
  -H "Authorization: Bearer YOUR_WAKE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"trigger":"manual_test"}' \
  https://timelogger-bitter-resonance-9585.fly.dev/api/wake-up

# メッセージリカバリ（要認証）
curl -X POST \
  -H "Authorization: Bearer YOUR_RECOVERY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"trigger":"manual_test"}' \
  https://timelogger-bitter-resonance-9585.fly.dev/api/morning-recovery
```

### GitHub Actions手動実行

1. GitHubリポジトリのActionsタブに移動
2. "夜間サスペンド自動化"ワークフローを選択
3. "Run workflow"をクリック
4. アクションを選択して実行

## 5. 自動化スケジュール

### 運用スケジュール

- **夜間サスペンド**: 毎日 0:00 JST (15:00 UTC)
- **朝の起動**: 毎日 7:00 JST (22:00 UTC前日)

### タイムゾーン注意事項

- GitHub ActionsはUTCで動作
- 日本時間(JST)はUTC+9時間
- サマータイムは考慮不要（日本にはサマータイムがない）

## 6. 監視とログ

### アプリケーションログ

```bash
# リアルタイムログ
flyctl logs --app timelogger-bitter-resonance-9585

# 特定時間のログ
flyctl logs --app timelogger-bitter-resonance-9585 --since 1h
```

### GitHub Actionsログ

- リポジトリの Actions タブで実行履歴を確認
- 失敗時は詳細ログを確認して対応

## 7. トラブルシューティング

### よくある問題

1. **認証エラー**: トークンが正しく設定されているか確認
2. **タイムアウト**: Fly.ioアプリの起動に時間がかかる場合
3. **Discord API制限**: レート制限に達した場合

### 緊急時の手動操作

```bash
# 手動でアプリを起動
flyctl resume --app timelogger-bitter-resonance-9585

# 手動でアプリをサスペンド
flyctl suspend --app timelogger-bitter-resonance-9585

# アプリの状態確認
flyctl status --app timelogger-bitter-resonance-9585
```

## 8. コスト最適化

### 期待される効果

- **夜間サスペンド**: 7時間/日 × 70% = 約70%のコスト削減
- **自動化**: 運用コスト削減
- **リカバリ**: 機能の継続性保証

### 監視項目

- Fly.ioの請求状況
- GitHub Actionsの実行時間
- Discord Bot APIの使用量

## 9. セキュリティ

### 認証トークン管理

- トークンは定期的に更新
- GitHub Secretsに安全に保管
- 本番環境とテスト環境で分離

### API エンドポイント

- 認証必須
- HTTPS通信のみ
- レート制限実装

## 10. 今後の拡張

### マルチユーザー対応

- ユーザー別の設定管理
- 個別のサスペンドスケジュール
- 通知設定のカスタマイズ

### 監視の強化

- アラート機能
- メトリクス収集
- ダッシュボード作成