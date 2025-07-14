# Suspend機能削除 マイグレーションスクリプト

## データベースマイグレーション

### 1. バックアップスクリプト
```bash
#!/bin/bash
# backup_before_migration.sh

# バックアップディレクトリ作成
mkdir -p backups/suspend-removal-$(date +%Y%m%d_%H%M%S)

# データベースバックアップ
cp data/activity_logs.db backups/suspend-removal-$(date +%Y%m%d_%H%M%S)/

# 現在のスキーマをエクスポート
sqlite3 data/activity_logs.db ".schema" > backups/suspend-removal-$(date +%Y%m%d_%H%M%S)/schema_before.sql

# suspend関連データをエクスポート
sqlite3 data/activity_logs.db "SELECT * FROM user_settings;" > backups/suspend-removal-$(date +%Y%m%d_%H%M%S)/user_settings.csv
sqlite3 data/activity_logs.db "SELECT * FROM suspend_states;" > backups/suspend-removal-$(date +%Y%m%d_%H%M%S)/suspend_states.csv

echo "✅ バックアップ完了: backups/suspend-removal-$(date +%Y%m%d_%H%M%S)/"
```

### 2. マイグレーションSQL
```sql
-- migration_remove_suspend.sql

-- トランザクション開始
BEGIN TRANSACTION;

-- 1. 新しいuser_settingsテーブル作成（suspend関連カラムなし）
CREATE TABLE IF NOT EXISTS user_settings_new (
    user_id TEXT PRIMARY KEY,
    timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

-- 2. 既存データの移行
INSERT INTO user_settings_new (user_id, timezone, created_at, updated_at)
SELECT user_id, timezone, created_at, updated_at 
FROM user_settings;

-- 3. インデックスの再作成
CREATE INDEX IF NOT EXISTS idx_user_settings_new_timezone ON user_settings_new(timezone);
CREATE INDEX IF NOT EXISTS idx_user_settings_new_updated ON user_settings_new(updated_at);

-- 4. 古いテーブルを削除して入れ替え
DROP TABLE user_settings;
ALTER TABLE user_settings_new RENAME TO user_settings;

-- 5. suspend_statesテーブルを削除
DROP TABLE IF EXISTS suspend_states;

-- 6. 不要なインデックスを削除
DROP INDEX IF EXISTS idx_user_suspend_schedule;
DROP INDEX IF EXISTS idx_suspend_states_user;
DROP INDEX IF EXISTS idx_suspend_states_time;

-- 7. トリガーの再作成（updated_at自動更新）
DROP TRIGGER IF EXISTS update_user_settings_updated_at;
CREATE TRIGGER update_user_settings_updated_at
AFTER UPDATE ON user_settings
FOR EACH ROW
BEGIN
    UPDATE user_settings SET updated_at = datetime('now', 'utc')
    WHERE user_id = NEW.user_id;
END;

-- トランザクション完了
COMMIT;

-- 検証
SELECT 'Migration completed. Current schema:' as message;
.schema user_settings
SELECT 'User count:' as message, COUNT(*) as count FROM user_settings;
```

### 3. マイグレーション実行スクリプト
```bash
#!/bin/bash
# execute_migration.sh

echo "🔄 Suspend機能削除マイグレーション開始..."

# 1. バックアップ実行
./backup_before_migration.sh

# 2. マイグレーション実行
echo "📊 マイグレーション実行中..."
sqlite3 data/activity_logs.db < migration_remove_suspend.sql

# 3. 検証
echo "✅ マイグレーション完了. 検証中..."
sqlite3 data/activity_logs.db "SELECT COUNT(*) as 'ユーザー数' FROM user_settings;"
sqlite3 data/activity_logs.db ".tables"

echo "✨ 完了!"
```

### 4. ロールバックスクリプト
```bash
#!/bin/bash
# rollback_migration.sh

echo "⚠️  ロールバック開始..."

# 最新のバックアップを探す
LATEST_BACKUP=$(ls -t backups/suspend-removal-* | head -n 1)

if [ -z "$LATEST_BACKUP" ]; then
    echo "❌ バックアップが見つかりません"
    exit 1
fi

echo "📂 バックアップ使用: $LATEST_BACKUP"

# データベースを復元
cp $LATEST_BACKUP/activity_logs.db data/activity_logs.db

echo "✅ ロールバック完了"
```

## コード削除スクリプト

### Phase 1: テストファイル削除
```bash
#!/bin/bash
# phase1_remove_tests.sh

echo "🧹 Phase 1: テストファイル削除"

# テストファイル削除
rm -f src/__tests__/api/nightSuspendServer.test.ts
rm -f src/__tests__/api/nightSuspendApi.test.ts
rm -f src/__tests__/middleware/nightSuspendAuth.test.ts
rm -f src/__tests__/services/morningMessageRecovery.test.ts
rm -f src/__tests__/integration/nightSuspendIntegration.test.ts
rm -f src/__tests__/integration/dynamicSchedulerIntegration.test.ts
rm -f src/__tests__/database/nightSuspendSchema.test.ts

echo "✅ テストファイル削除完了"
```

### Phase 2: 本体コード削除
```bash
#!/bin/bash
# phase2_remove_core.sh

echo "🧹 Phase 2: 本体コード削除"

# サービス層削除
rm -f src/services/dynamicSchedulerService.ts
rm -f src/services/morningMessageRecovery.ts

# リポジトリ層削除
rm -f src/repositories/sqliteNightSuspendRepository.ts

# API層削除
rm -f src/api/nightSuspendServer.ts
rm -f src/middleware/nightSuspendAuth.ts

# ハンドラー削除
rm -f src/handlers/suspendScheduleCommandHandler.ts

echo "✅ 本体コード削除完了"
```

### Phase 3: GitHub Actions削除
```bash
#!/bin/bash
# phase3_remove_github_actions.sh

echo "🧹 Phase 3: GitHub Actions削除"

# ワークフロー削除
rm -f .github/workflows/night-suspend-automation.yml

echo "✅ GitHub Actions削除完了"
```

## 環境変数クリーンアップ

### .env.example更新スクリプト
```bash
#!/bin/bash
# cleanup_env_example.sh

# .env.exampleから不要な環境変数を削除
sed -i.bak '/SHUTDOWN_TOKEN/d' .env.example
sed -i.bak '/WAKE_TOKEN/d' .env.example
sed -i.bak '/RECOVERY_TOKEN/d' .env.example

# バックアップファイルを削除
rm -f .env.example.bak

echo "✅ .env.example更新完了"
```

## 検証スクリプト

### 削除後の検証
```bash
#!/bin/bash
# verify_removal.sh

echo "🔍 削除後の検証開始..."

# 1. ビルド確認
echo "📦 TypeScriptビルド確認..."
npm run build

# 2. テスト実行
echo "🧪 テスト実行..."
npm test

# 3. 主要機能の確認
echo "🔧 主要機能確認..."
npm run dev &
DEV_PID=$!
sleep 5

# APIヘルスチェック
curl -s http://localhost:3000/health || echo "⚠️  HTTPサーバーなし（正常）"

# プロセス停止
kill $DEV_PID

echo "✅ 検証完了"
```

## 完全削除実行スクリプト
```bash
#!/bin/bash
# execute_complete_removal.sh

echo "🚀 Suspend機能完全削除開始"

# 確認
read -p "本当に実行しますか？ (y/N): " confirm
if [ "$confirm" != "y" ]; then
    echo "キャンセルしました"
    exit 0
fi

# Phase 1: バックアップとマイグレーション
./backup_before_migration.sh
./execute_migration.sh

# Phase 2: コード削除
./phase1_remove_tests.sh
./phase2_remove_core.sh
./phase3_remove_github_actions.sh

# Phase 3: 環境変数クリーンアップ
./cleanup_env_example.sh

# Phase 4: 検証
./verify_removal.sh

echo "✨ Suspend機能削除完了!"
echo "問題がある場合は ./rollback_migration.sh でロールバック可能です"
```