# Fly.io設定ファイル詳細設計

## 📋 概要

staging環境導入に伴うFly.io設定ファイルの詳細設計。本番環境との整合性を保ちながらコスト最適化を実現する。

## 🏗️ 設定ファイル構成

### 現在の構成
```
fly.toml                    # Production環境設定 (既存)
```

### 新規追加構成
```
fly-staging.toml           # Staging環境設定 (新規)
.env.staging.example       # Staging環境変数テンプレート (新規)
```

## 📝 設定ファイル詳細

### 1. fly-staging.toml
```toml
# Staging環境用 Fly.io設定
# アプリケーション: timelogger-staging

app = 'timelogger-staging'
primary_region = 'nrt'
kill_signal = 'SIGINT'
kill_timeout = '5s'

[build]
  # Dockerfileを使用（本番環境と同一）

[env]
  NODE_ENV = 'staging'
  TZ = 'Asia/Kolkata'
  PORT = '3000'
  
  # Staging環境固有の設定
  LOG_LEVEL = 'debug'                    # デバッグレベルログ
  ENABLE_DEBUG_ROUTES = 'true'           # デバッグ用API有効化
  API_RATE_LIMIT = 'false'               # レート制限無効化（テスト用）
  CACHE_TTL = '60'                       # キャッシュTTL短縮（テスト用）

# データベースボリューム（本番と分離）
[[mounts]]
  source = 'timelogger_staging_data'
  destination = '/app/data'

# HTTPサーバー設定（コスト最適化）
[http_service]
  internal_port = 3000
  force_https = true
  
  # 💰 コスト最適化設定
  auto_stop_machines = true              # 未使用時自動停止
  auto_start_machines = true             # リクエスト時自動起動
  min_machines_running = 0               # 最小稼働台数0（開発時間外は完全停止）
  
  processes = ["app"]

# ヘルスチェック設定
[[http_service.checks]]
  interval = "30s"
  timeout = "10s"
  grace_period = "5s"
  method = "GET"
  path = "/health"
  protocol = "http"
  tls_skip_verify = false

# 🖥️ VM設定（本番より小さなリソース）
[[vm]]
  cpu_kind = 'shared'                    # 共有CPU
  cpus = 1                               # 1CPU（本番と同じ）
  memory_mb = 256                        # 256MB（本番と同じ）
  count = 1                              # マシン1台

# 🌙 自動サスペンド設定（夜間コスト削減）
[experimental]
  auto_rollback = true                   # 自動ロールバック有効

# 📊 メトリクス・ログ設定
[metrics]
  port = 9091
  path = "/metrics"

# 🔍 デバッグ用設定（staging環境のみ）
[console_command]
  command = "/bin/bash"
```

### 2. fly.toml (Production環境改良版)
```toml
# Production環境用 Fly.io設定
# アプリケーション: timelogger-bitter-resonance-9585

app = 'timelogger-bitter-resonance-9585'
primary_region = 'nrt'
kill_signal = 'SIGINT'
kill_timeout = '5s'

[build]
  # Dockerfileを使用

[env]
  NODE_ENV = 'production'
  TZ = 'Asia/Tokyo'
  PORT = '3000'
  
  # Production環境設定
  LOG_LEVEL = 'info'                     # 本番ログレベル
  ENABLE_DEBUG_ROUTES = 'false'          # デバッグAPI無効化
  API_RATE_LIMIT = 'true'                # レート制限有効化
  CACHE_TTL = '3600'                     # キャッシュTTL（1時間）

# データベースボリューム
[[mounts]]
  source = 'timelogger_data'
  destination = '/app/data'

# HTTPサーバー設定
[http_service]
  internal_port = 3000
  force_https = true
  
  # 🚀 本番環境設定
  auto_stop_machines = false             # 手動サスペンドのみ
  auto_start_machines = true             # リクエスト時自動起動
  min_machines_running = 0               # 夜間サスペンド対応
  
  processes = ["app"]

# ヘルスチェック設定
[[http_service.checks]]
  interval = "30s"
  timeout = "10s"
  grace_period = "5s"
  method = "GET"
  path = "/health"
  protocol = "http"
  tls_skip_verify = false

# 🖥️ VM設定
[[vm]]
  cpu_kind = 'shared'
  cpus = 1
  memory_mb = 256
  count = 1

# 📊 メトリクス設定
[metrics]
  port = 9091
  path = "/metrics"
```

### 3. .env.staging.example
```bash
# Staging環境用環境変数テンプレート
# .env.staging.example → .env.staging にコピーして使用

# ===============================
# 基本設定
# ===============================
NODE_ENV=staging
TZ=Asia/Kolkata
PORT=3000

# ===============================
# Discord Bot設定
# ===============================
# Staging用Discord Bot Token（本番とは別Bot）
DISCORD_TOKEN=your_staging_discord_bot_token_here
DISCORD_CLIENT_ID=your_staging_discord_client_id_here

# Discord Guild ID（テスト用サーバー）
DISCORD_GUILD_ID=your_test_discord_guild_id_here

# ===============================
# Google Gemini API設定
# ===============================
# Staging用APIキー（本番と分離または同一）
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-1.5-flash

# ===============================
# データベース設定
# ===============================
# Staging環境データベースパス
DATABASE_PATH=/app/data/staging_activity_logs.db

# ===============================
# Staging環境固有設定
# ===============================
# ログレベル（debug, info, warn, error）
LOG_LEVEL=debug

# デバッグ機能有効化
ENABLE_DEBUG_ROUTES=true
ENABLE_VERBOSE_LOGGING=true

# レート制限無効化（テスト用）
API_RATE_LIMIT=false

# キャッシュTTL短縮（テスト用、秒単位）
CACHE_TTL=60

# ===============================
# 監視・デバッグ設定
# ===============================
# ヘルスチェック設定
HEALTH_CHECK_ENABLED=true
HEALTH_CHECK_PATH=/health

# メトリクス設定
METRICS_ENABLED=true
METRICS_PORT=9091

# ===============================
# テストデータ設定
# ===============================
# テストデータ生成有効化
ENABLE_TEST_DATA_GENERATION=true

# 自動テストデータクリーンアップ（日数）
TEST_DATA_CLEANUP_DAYS=7

# ===============================
# 外部サービス連携（staging用）
# ===============================
# GitHub Actions連携用トークン
GITHUB_ACTIONS_TOKEN=your_github_actions_token_here

# Slack通知（staging用チャンネル）
SLACK_WEBHOOK_URL=your_staging_slack_webhook_url_here
SLACK_CHANNEL=#staging-notifications

# ===============================
# セキュリティ設定
# ===============================
# CORS設定（staging用、開発環境からのアクセス許可）
CORS_ORIGIN=http://localhost:3000,https://timelogger-staging.fly.dev

# APIキー（内部API用）
INTERNAL_API_KEY=your_internal_api_key_here

# ===============================
# 夜間サスペンド設定
# ===============================
# サスペンド制御用トークン
SHUTDOWN_TOKEN=your_shutdown_token_here
WAKE_TOKEN=your_wake_token_here
RECOVERY_TOKEN=your_recovery_token_here

# サスペンド時間設定（Staging環境は本番と同じスケジュール）
SUSPEND_HOUR=1
WAKE_HOUR=8

# ===============================
# バックアップ・復旧設定
# ===============================
# バックアップ有効化（staging環境でもデータ保護）
BACKUP_ENABLED=true
BACKUP_INTERVAL_HOURS=24

# 本番データクローン設定
ENABLE_PRODUCTION_DATA_CLONE=false
PRODUCTION_BACKUP_URL=your_production_backup_url_here
```

## 🔧 環境別設定比較

### 設定項目比較表

| 項目 | Local | Staging | Production |
|------|--------|---------|------------|
| **アプリ名** | - | timelogger-staging | timelogger-bitter-resonance-9585 |
| **NODE_ENV** | development | staging | production |
| **タイムゾーン** | Asia/Tokyo | Asia/Kolkata | Asia/Tokyo |
| **データベース** | ローカルファイル | staging_data volume | production_data volume |
| **ログレベル** | debug | debug | info |
| **デバッグAPI** | 有効 | 有効 | 無効 |
| **レート制限** | 無効 | 無効 | 有効 |
| **自動停止** | - | 有効 | 手動のみ |
| **最小稼働台数** | - | 0 | 0 |
| **CPU/メモリ** | - | 1CPU/256MB | 1CPU/256MB |
| **ヘルスチェック** | - | 30秒間隔 | 30秒間隔 |
| **夜間サスペンド** | - | 有効 | 有効 |

## 💰 コスト最適化戦略

### Staging環境コスト削減

#### 1. 自動停止設定
```toml
[http_service]
  auto_stop_machines = true              # 5分間アクセスなしで自動停止
  auto_start_machines = true             # リクエスト時即座に起動
  min_machines_running = 0               # 開発時間外は完全停止
```

#### 2. 夜間サスペンド連携
```bash
# GitHub Actionsと連携した夜間サスペンド
# 本番環境と同じスケジュールで停止・起動
```

#### 3. リソース最適化
```toml
[[vm]]
  cpu_kind = 'shared'                    # 共有CPU使用
  memory_mb = 256                        # 最小限のメモリ
```

### 推定コスト
```
Staging環境月間コスト:
- マシン稼働時間: ~50時間/月 → ~$5
- ストレージ: ~1GB → ~$1
- 合計: ~$6-8/月
```

## 🔍 監視・デバッグ機能

### 1. ヘルスチェックエンドポイント
```javascript
// src/health.js (staging環境用拡張)
app.get('/health', (req, res) => {
  const health = {
    status: 'ok',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    
    // Staging環境固有情報
    ...(process.env.NODE_ENV === 'staging' && {
      database: checkDatabaseConnection(),
      discord: checkDiscordConnection(),
      gemini: checkGeminiConnection(),
      test_data: getTestDataStatus()
    })
  };
  
  res.json(health);
});
```

### 2. デバッグAPIエンドポイント
```javascript
// Staging環境のみ有効
if (process.env.NODE_ENV === 'staging') {
  app.get('/debug/logs', debugAuth, getRecentLogs);
  app.get('/debug/database', debugAuth, getDatabaseStatus);
  app.post('/debug/test-data', debugAuth, generateTestData);
  app.delete('/debug/test-data', debugAuth, cleanupTestData);
}
```

### 3. メトリクス収集
```toml
[metrics]
  port = 9091
  path = "/metrics"
```

## 🔄 データ管理戦略

### 1. テストデータ生成
```bash
# scripts/staging/generate-test-data.js
npm run staging:data
```

### 2. 本番データクローン
```bash
# 重要リリース前のみ実行
npm run staging:clone-production
```

### 3. データクリーンアップ
```bash
# 定期的なテストデータクリーンアップ
npm run staging:cleanup
```

## 🛡️ セキュリティ設定

### 1. 環境分離
- 完全に分離されたDiscord Bot
- 独立したデータベースボリューム
- 分離された環境変数

### 2. アクセス制御
```toml
# CORS設定
[env]
  CORS_ORIGIN = "https://timelogger-staging.fly.dev"
```

### 3. デバッグAPI保護
```javascript
// デバッグAPI認証
const debugAuth = (req, res, next) => {
  const token = req.headers['x-debug-token'];
  if (token !== process.env.DEBUG_API_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};
```

## 📋 デプロイメント設定

### 1. Staging環境デプロイ
```bash
# GitHub Actions経由
fly deploy --app timelogger-staging --config fly-staging.toml

# ローカルから手動デプロイ
npm run staging:deploy
```

### 2. 環境変数管理
```bash
# Staging環境シークレット設定
fly secrets set --app timelogger-staging DISCORD_TOKEN=xxx
fly secrets set --app timelogger-staging GEMINI_API_KEY=xxx

# 環境変数一括設定
fly secrets import --app timelogger-staging < .env.staging
```

### 3. ボリューム管理
```bash
# Staging用ボリューム作成
fly volumes create timelogger_staging_data --region nrt --size 1 --app timelogger-staging

# ボリューム状況確認
fly volumes list --app timelogger-staging
```

## 🔧 運用コマンド

### 日常運用
```bash
# Staging環境ステータス確認
npm run staging:status

# Staging環境ログ確認
npm run staging:logs

# Staging環境デプロイ
npm run staging:deploy

# Staging環境テスト実行
npm run staging:test
```

### トラブルシューティング
```bash
# Staging環境再起動
fly machine restart --app timelogger-staging

# Staging環境コンソール接続
fly console --app timelogger-staging

# Staging環境ボリューム確認
fly volumes list --app timelogger-staging
```

## 📈 継続的改善

### 監視項目
- 稼働時間・コスト
- デプロイ成功率
- テスト成功率
- リソース使用量

### 最適化計画
1. **Phase 1**: 基本設定・デプロイ自動化
2. **Phase 2**: 監視・ログ改善
3. **Phase 3**: コスト最適化・パフォーマンス向上

---

## 📝 実装チェックリスト

### 初期セットアップ
- [ ] fly-staging.toml作成
- [ ] .env.staging.example作成
- [ ] Staging用Discord Bot作成
- [ ] fly apps create timelogger-staging
- [ ] ボリューム作成
- [ ] シークレット設定

### 設定確認
- [ ] 本番環境との設定差分確認
- [ ] コスト最適化設定確認
- [ ] セキュリティ設定確認
- [ ] 監視設定確認

### 動作確認
- [ ] デプロイ成功確認
- [ ] ヘルスチェック確認
- [ ] 自動停止・起動確認
- [ ] デバッグAPI動作確認