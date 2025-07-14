# Staging環境デプロイ チェックリスト

## 🚨 重要: suspend機能削除によるstaging環境への影響

### デプロイ前の準備

#### 1. ローカル環境での最終確認
- [x] ローカルでビルド成功 (`npm run build`)
- [x] ローカルでテスト成功 (`npm test`)
- [x] ローカルでDev環境正常動作確認

#### 2. 環境変数クリーンアップ
- [x] `.env.staging`からsuspend関連変数削除済み
- [x] `.env.production`からsuspend関連変数削除済み
- [ ] **Fly.io secrets削除** (デプロイ前に実行)

```bash
# Fly.io secretsを確認・削除
fly secrets list --app timelogger-staging
fly secrets unset SHUTDOWN_TOKEN WAKE_TOKEN RECOVERY_TOKEN --app timelogger-staging
```

#### 3. GitHub Actions確認
- [x] `night-suspend-automation.yml` 削除済み
- [ ] GitHub Secretsを削除 (手動)
  - `SHUTDOWN_TOKEN`
  - `WAKE_TOKEN` 
  - `RECOVERY_TOKEN`

### デプロイ手順

#### Phase 1: Staging環境データベース移行
```bash
# 1. staging環境に接続
fly ssh console --app timelogger-staging

# 2. データベースバックアップ作成
cp /data/app.db /data/app.db.backup-$(date +%Y%m%d_%H%M%S)

# 3. マイグレーションスクリプト実行
sqlite3 /data/app.db < staging_migration.sql

# 4. 接続終了
exit
```

#### Phase 2: コードデプロイ
```bash
# 1. developブランチにpush (自動デプロイ)
git push origin develop

# 2. デプロイログ監視
fly logs --app timelogger-staging

# 3. ヘルスチェック
fly status --app timelogger-staging
```

### デプロイ後の検証

#### 1. システム起動確認
- [ ] アプリケーション正常起動
- [ ] データベース接続成功
- [ ] エラーログなし

#### 2. Discord Bot動作確認
- [ ] Discord Botがオンライン状態
- [ ] DMでメッセージ送信可能
- [ ] 基本コマンド動作確認:
  - [ ] 通常メッセージ記録
  - [ ] `!help` コマンド
  - [ ] `!summary` コマンド
  - [ ] `!logs` コマンド
  - [ ] `!cost` コマンド

#### 3. 削除機能の確認
- [ ] `!suspend-schedule` コマンドが存在しない
- [ ] suspend関連エラーが発生しない
- [ ] GitHub Actions workflow未実行

### 問題発生時のロールバック手順

#### 緊急時ロールバック
```bash
# 1. データベースロールバック
fly ssh console --app timelogger-staging
cp /data/app.db.backup-[最新日時] /data/app.db
exit

# 2. コードロールバック
git revert HEAD
git push origin develop

# 3. 環境変数復元 (必要な場合)
fly secrets set SHUTDOWN_TOKEN="..." --app timelogger-staging
```

### 予想される問題と対策

#### 問題1: マイグレーションエラー
**症状**: `SQLITE_ERROR: no such table: suspend_states`
**対策**: staging_migration.sqlを再実行

#### 問題2: 環境変数参照エラー
**症状**: `process.env.SHUTDOWN_TOKEN is undefined`
**対策**: 削除したsuspend関連コードへの参照が残っていないか確認

#### 問題3: Discord Bot起動失敗
**症状**: 活動記録システム初期化エラー
**対策**: データベーススキーマの整合性確認

### 成功基準

- ✅ Staging環境でDiscord Bot正常動作
- ✅ 主要コマンドすべて正常動作
- ✅ suspend機能完全削除確認
- ✅ エラーログなし
- ✅ パフォーマンス劣化なし

### 注意事項

1. **データ消失の可能性**: suspend関連データ（未使用のため影響なし）
2. **ダウンタイム**: マイグレーション中の短時間停止
3. **ユーザー影響**: 既存ユーザーには影響なし（suspend機能未使用のため）

### 連絡先

問題が発生した場合は以下で対応：
- コードロールバック: Git操作
- データベースロールバック: バックアップファイルから復元
- 環境変数復元: Fly.io secrets設定