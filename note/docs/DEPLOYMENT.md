# TimeLogger デプロイメント手順

## 概要

このドキュメントでは、TimeLoggerのデプロイメント手順を説明します。
現在の構成では、**手動デプロイ**によるローカル実行が推奨されています。

## 前提条件

- Fly.ioアカウント
- GitHub Repository
- Discord Bot Token
- Google Gemini API Key
- Node.js 20.x (nvm推奨)

## 🌍 環境構成

### 3層環境構成
```
Local環境 → Staging環境 → Production環境
  ↓           ↓            ↓
TDD開発    fly.io検証    本番運用
```

#### Local環境 (開発者端末)
- **用途**: TDD開発、単体テスト、機能実装
- **データベース**: ローカルSQLite
- **実行**: `npm run dev`, `npm run test:watch`

#### Staging環境 (fly.io: timelogger-staging)
- **用途**: fly.io環境での統合テスト、本番前検証
- **データベース**: 分離DB + テストデータ
- **デプロイ**: `./scripts/staging/deploy-to-staging.sh`

#### Production環境 (fly.io: timelogger-bitter-resonance-9585)
- **用途**: 実際のDiscord Bot運用
- **データベース**: 本番データ
- **デプロイ**: `./scripts/production/deploy.sh`

## 🚀 リリースフロー

### 現在のリリースフロー
```
feature/* → develop → 品質チェック → 手動staging → main → 手動production
```

### 必須プロセス
1. **Local開発**: TDDサイクル完了 + 全テスト成功
2. **develop マージ**: プルリクエスト + GitHub Actions品質チェック
3. **staging デプロイ**: `./scripts/staging/deploy-to-staging.sh` で手動実行
4. **staging検証**: 重要機能動作確認 + 品質ゲート
5. **main マージ**: staging検証完了後のみ
6. **production デプロイ**: `./scripts/production/deploy.sh` で手動実行

## 🔧 環境セットアップ

### 開発環境セットアップ
```bash
# Node.js仮想環境を使用
nvm use

# 依存関係をインストール
npm install

# .envファイルを作成
cp .env.example .env
# Discord Bot Token と Google Gemini API Key を設定
```

### Staging環境セットアップ
```bash
# Staging環境用アプリ作成
fly apps create timelogger-staging

# staging用設定ファイルの確認
ls fly-staging.toml

# 環境変数設定
flyctl secrets set DISCORD_TOKEN="your-staging-discord-token" --app timelogger-staging
flyctl secrets set GOOGLE_API_KEY="your-google-gemini-api-key" --app timelogger-staging
```

### Production環境セットアップ
```bash
# Production環境用アプリ作成（既存の場合はスキップ）
fly apps create timelogger-bitter-resonance-9585

# 環境変数設定
flyctl secrets set DISCORD_TOKEN="your-production-discord-token" --app timelogger-bitter-resonance-9585
flyctl secrets set GOOGLE_API_KEY="your-google-gemini-api-key" --app timelogger-bitter-resonance-9585
flyctl secrets set ADMIN_USER_ID="your-discord-user-id" --app timelogger-bitter-resonance-9585
```

## 🏗️ デプロイ手順

### Staging環境デプロイ

```bash
# developブランチからのみデプロイ可能
git checkout develop
git pull origin develop

# Staging環境にデプロイ
./scripts/staging/deploy-to-staging.sh

# オプション
./scripts/staging/deploy-to-staging.sh --skip-tests    # テストスキップ
./scripts/staging/deploy-to-staging.sh --force        # ブランチチェック回避
```

#### デプロイに含まれる処理
1. **前提条件チェック**
   - flyctl コマンド確認
   - ログイン状態確認
   - Git状態確認
   - **ブランチ確認** (developブランチ必須)

2. **品質チェック**
   - 依存関係インストール
   - TypeScriptビルド
   - 単体テスト実行
   - 統合テスト実行

3. **アプリ・マシン状態確認**
   - アプリのsuspended状態確認・復旧
   - 停止マシンの自動起動

4. **デプロイ実行**
   - Fly.ioへのデプロイ
   - 起動確認
   - ヘルスチェック

### Production環境デプロイ

```bash
# mainブランチからのみデプロイ可能
git checkout main
git pull origin main

# Production環境にデプロイ
./scripts/production/deploy.sh

# オプション
./scripts/production/deploy.sh --skip-tests    # テストスキップ
./scripts/production/deploy.sh --force         # ブランチチェック回避
./scripts/production/deploy.sh --dry-run       # ドライランモード
```

#### デプロイに含まれる処理
1. **本番環境確認**
   - 本番デプロイの確認プロンプト
   - 実際のユーザーへの影響警告

2. **前提条件チェック**
   - flyctl コマンド確認
   - ログイン状態確認
   - Git状態確認
   - **ブランチ確認** (mainブランチ必須)

3. **品質チェック**
   - 依存関係インストール
   - TypeScriptビルド
   - テスト実行

4. **シークレット管理**
   - .env.productionファイルからの自動設定
   - Fly.ioシークレットへの一括反映

5. **デプロイ実行**
   - Fly.ioへのデプロイ
   - 起動確認

## 🔒 ブランチ保護

### 厳格なブランチ制限
- **Production環境**: `main`ブランチからのみデプロイ可能
- **Staging環境**: `develop`ブランチからのみデプロイ可能
- **違反時**: エラーで停止、明確な指示メッセージ

### 緊急時の回避方法
```bash
# 強制デプロイ（緊急時のみ）
./scripts/production/deploy.sh --force
./scripts/staging/deploy-to-staging.sh --force
```

## 📊 GitHub Actions (品質チェックのみ)

### GitHub Actions の役割
- **デプロイ無し**: 自動デプロイは実行されません
- **品質チェック**: テスト、ビルド、カバレッジ確認のみ
- **手動デプロイガイド**: 成功時に手動デプロイ手順を表示

### ワークフロー
- **Staging Quality Check**: developブランチpush時
- **Production Quality Check**: mainブランチpush時

## 🔍 動作確認

### Staging環境確認
```bash
# ヘルスチェック
curl https://timelogger-staging.fly.dev/health

# アプリ状態確認
flyctl status --app timelogger-staging

# ログ確認
flyctl logs --app timelogger-staging
```

### Production環境確認
```bash
# ヘルスチェック
curl https://timelogger-bitter-resonance-9585.fly.dev/health

# アプリ状態確認
flyctl status --app timelogger-bitter-resonance-9585

# ログ確認
flyctl logs --app timelogger-bitter-resonance-9585
```

### Discord Bot動作確認
重要なコマンドの動作確認:
- `!cost` - API使用量レポート
- `!summary` - 日次サマリー
- `!timezone` - タイムゾーン設定
- `!edit [ID]` - ログ編集機能
- `!logs` - ログ一覧表示

## 🛠️ トラブルシューティング

### よくある問題

#### 1. ブランチエラー
```bash
[ERROR] 現在のブランチ: feature/xxx (必須: main)
[ERROR] 本番環境はmainブランチからのみデプロイ可能です
```
**解決**: 正しいブランチに切り替え
```bash
git checkout main
git pull origin main
```

#### 2. 未コミット変更
```bash
[ERROR] 未コミットの変更があります
```
**解決**: 変更をコミットまたはスタッシュ
```bash
git add .
git commit -m "Deploy準備"
```

#### 3. テスト失敗
```bash
[ERROR] テストに失敗しました
```
**解決**: テストを修正するか、緊急時のみ `--skip-tests` オプション使用

#### 4. マシンsuspended
```bash
[WARNING] 停止中のマシンを検出しました
```
**解決**: 自動で起動処理が実行されます（手動実行不要）

### 緊急時の手動操作
```bash
# 手動でアプリを起動
flyctl scale count 1 --app timelogger-bitter-resonance-9585

# 手動でアプリをサスペンド
flyctl scale count 0 --app timelogger-bitter-resonance-9585

# マシンを手動起動
flyctl machines start --app timelogger-bitter-resonance-9585

# 詳細な状態確認
flyctl machines list --app timelogger-bitter-resonance-9585
```

## 📈 コスト最適化

### 現在の構成
- **Staging**: 開発時のみ起動（夜間自動停止）
- **Production**: 24時間稼働
- **マシン**: 最小スペック（1 CPU, 256MB RAM）

### 監視項目
- Fly.ioの請求状況
- GitHub Actionsの実行時間
- Discord Bot APIの使用量

## 🔐 セキュリティ

### 認証・シークレット管理
- **環境変数**: Fly.ioシークレットで管理
- **本番設定**: `.env.production` ファイル（gitignore済み）
- **GitHub Actions**: デプロイ権限を削除、品質チェックのみ

### 推奨事項
- トークンは定期的に更新
- 本番環境とテスト環境で分離
- ログイン状態の定期確認

## 🎯 ベストプラクティス

### デプロイ前チェックリスト
- [ ] 正しいブランチ（staging: develop, production: main）
- [ ] 全テストが成功
- [ ] 未コミット変更なし
- [ ] 前回のデプロイから問題なし
- [ ] Discord Bot動作確認済み

### 本番デプロイ時の注意点
- 営業時間外での実行を推奨
- ロールバック手順を事前に確認
- デプロイ後の動作監視を実施
- 重要機能の疎通確認

## 📋 今後の拡張

### 予定している改善
- モニタリング強化
- アラート機能
- デプロイ自動化の再検討
- パフォーマンス監視