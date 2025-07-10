#!/bin/bash

echo "🚀 本番環境のデータベースを修正中..."

# SQLコマンドをSSH経由で実行
fly ssh console -a timelogger-bitter-resonance-9585 <<'EOF'
sqlite3 /app/data/tasks.db <<'SQL'
-- discord_message_idカラムを追加（エラーは無視）
ALTER TABLE activity_logs ADD COLUMN discord_message_id TEXT;
ALTER TABLE activity_logs ADD COLUMN recovery_processed BOOLEAN DEFAULT FALSE;
ALTER TABLE activity_logs ADD COLUMN recovery_timestamp TEXT;

-- suspend_statesテーブルを作成
CREATE TABLE IF NOT EXISTS suspend_states (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  suspend_time TEXT NOT NULL,
  wake_time TEXT,
  expected_wake_time TEXT,
  status TEXT NOT NULL CHECK (status IN ('suspended', 'active', 'scheduled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

-- インデックスを作成
CREATE INDEX IF NOT EXISTS idx_discord_message_id ON activity_logs(discord_message_id);
CREATE INDEX IF NOT EXISTS idx_recovery_processed ON activity_logs(recovery_processed);
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_discord_message_id ON activity_logs(discord_message_id) WHERE discord_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_suspend_states_user_id ON suspend_states(user_id);
CREATE INDEX IF NOT EXISTS idx_suspend_states_suspend_time ON suspend_states(suspend_time);

-- 確認
.schema activity_logs | head -5
SQL
EOF

echo "✅ データベース修正完了"
echo "🔄 アプリケーションを再起動中..."

# アプリケーションを再起動
fly apps restart timelogger-bitter-resonance-9585

echo "✅ 完了！"