-- 夜間サスペンド機能のデータベース拡張
-- TDD: Green Phase - テストを通すための最小限の実装

-- 1. activity_logsテーブルにdiscord_message_idフィールドを追加
ALTER TABLE activity_logs ADD COLUMN discord_message_id TEXT;

-- 2. activity_logsテーブルにリカバリ処理用フィールドを追加
ALTER TABLE activity_logs ADD COLUMN recovery_processed BOOLEAN DEFAULT FALSE;
ALTER TABLE activity_logs ADD COLUMN recovery_timestamp TEXT;

-- 3. suspend_statesテーブルを新規作成
CREATE TABLE IF NOT EXISTS suspend_states (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  suspend_time TEXT NOT NULL,
  expected_recovery_time TEXT NOT NULL,
  actual_recovery_time TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

-- 4. 必要なインデックスを作成
CREATE INDEX IF NOT EXISTS idx_discord_message_id ON activity_logs(discord_message_id);
CREATE INDEX IF NOT EXISTS idx_recovery_processed ON activity_logs(recovery_processed);
CREATE INDEX IF NOT EXISTS idx_suspend_states_user_id ON suspend_states(user_id);

-- 5. UNIQUE制約をdiscord_message_idに追加
-- discord_message_idは重複を防ぐため、UNIQUEインデックスを作成
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_discord_message_id ON activity_logs(discord_message_id) WHERE discord_message_id IS NOT NULL;