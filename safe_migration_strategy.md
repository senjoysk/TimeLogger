# 安全なマイグレーション戦略

## Phase 1: 事前検証（ローカル環境）

### 1.1 Staging環境データの複製
```bash
# staging環境からデータベースをダウンロード
fly ssh sftp get /data/app.db staging_current.db --app timelogger-staging

# ローカルで検証用コピー作成
cp staging_current.db test_migration.db
```

### 1.2 ローカルでマイグレーション検証
```bash
# テスト用データベースでマイグレーション実行
sqlite3 test_migration.db < staging_migration.sql

# 結果確認
sqlite3 test_migration.db ".schema"
sqlite3 test_migration.db "SELECT COUNT(*) FROM activity_logs;"
sqlite3 test_migration.db "SELECT COUNT(*) FROM user_settings;"
```

## Phase 2: 段階的デプロイ

### 2.1 準備段階
```bash
# 1. バックアップ作成
fly ssh console --app timelogger-staging
cp /data/app.db /data/app.db.pre-suspend-removal-$(date +%Y%m%d_%H%M%S)
ls -la /data/app.db*
exit

# 2. アプリケーション一時停止（オプション）
fly scale count 0 --app timelogger-staging
```

### 2.2 マイグレーション実行
```bash
# 段階的マイグレーション実行
fly ssh console --app timelogger-staging

# Step 1: テーブル存在確認
sqlite3 /data/app.db "SELECT name FROM sqlite_master WHERE type='table';"

# Step 2: 安全なマイグレーション実行
sqlite3 /data/app.db < /app/staging_migration.sql

# Step 3: 結果検証
sqlite3 /data/app.db "SELECT COUNT(*) FROM activity_logs;"
sqlite3 /data/app.db "SELECT COUNT(*) FROM user_settings;"

exit
```

### 2.3 アプリケーション再起動・検証
```bash
# アプリケーション再開
fly scale count 1 --app timelogger-staging

# ログ監視
fly logs --app timelogger-staging

# 動作確認
curl -f https://timelogger-staging.fly.dev/health || echo "Health check failed"
```

## Phase 3: ロールバック準備

### 3.1 即座ロールバック手順
```bash
# データベースロールバック
fly ssh console --app timelogger-staging
BACKUP_FILE=$(ls -t /data/app.db.pre-suspend-removal-* | head -n1)
cp $BACKUP_FILE /data/app.db
exit

# アプリケーション再起動
fly apps restart timelogger-staging
```

### 3.2 コードロールバック手順
```bash
# コードレベルでのロールバック
git log --oneline -5  # 直前のコミットを確認
git revert HEAD       # 最新コミットを取り消し
git push origin develop
```

## Phase 4: 安全性チェックリスト

### 4.1 事前チェック
- [ ] ローカル環境でマイグレーション成功確認
- [ ] Staging環境データベースバックアップ作成
- [ ] 現在のテーブル構造・データ量確認
- [ ] ロールバック手順の準備完了

### 4.2 実行中チェック
- [ ] マイグレーション各ステップの成功確認
- [ ] データ損失がないことの確認
- [ ] エラーログの監視

### 4.3 完了後チェック
- [ ] アプリケーション正常起動
- [ ] Discord Bot正常動作
- [ ] 主要機能の動作確認
- [ ] suspend機能完全削除確認

## 緊急時対応

### 1. マイグレーション失敗時
1. アプリケーション即座停止
2. データベースバックアップから復元
3. 問題分析・修正
4. 再実行またはロールバック

### 2. アプリケーション起動失敗時
1. ログ分析
2. データベース整合性確認
3. 必要に応じてスキーマ修正
4. 段階的復旧

### 3. 機能不全時
1. 基本機能の個別確認
2. 設定・環境変数の確認
3. 段階的修正適用