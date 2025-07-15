-- Staging環境用 Suspend機能削除マイグレーション
-- staging環境の既存データベースを新しいスキーマに適合させる

-- バックアップ作成（念のため）
-- staging環境でこのスクリプトを実行する前に必要に応じてバックアップを作成

-- 1. suspend_statesテーブルを削除（存在する場合）
DROP TABLE IF EXISTS suspend_states;

-- 2. suspend関連インデックスを削除（存在する場合）
DROP INDEX IF EXISTS idx_suspend_states_user_id;
DROP INDEX IF EXISTS idx_suspend_states_suspend_time;
DROP INDEX IF EXISTS idx_user_settings_suspend_schedule;
DROP INDEX IF EXISTS idx_discord_message_id;
DROP INDEX IF EXISTS idx_recovery_processed;
DROP INDEX IF EXISTS idx_unique_discord_message_id;

-- 3. activity_logsテーブルからsuspend関連カラムを削除（存在する場合）
-- SQLiteではALTER TABLE DROP COLUMNが限定的なので、新テーブル作成方式を使用

-- 既存のactivity_logsテーブルをバックアップ
DROP TABLE IF EXISTS activity_logs_backup;
CREATE TABLE activity_logs_backup AS SELECT * FROM activity_logs;

-- 新しいactivity_logsテーブルを作成（suspend関連カラムなし）
DROP TABLE IF EXISTS activity_logs_new;
CREATE TABLE activity_logs_new (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    input_timestamp TEXT NOT NULL,
    business_date TEXT NOT NULL,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    start_time TEXT,
    end_time TEXT,
    total_minutes INTEGER,
    confidence REAL,
    analysis_method TEXT,
    categories TEXT,
    analysis_warnings TEXT,
    log_type TEXT DEFAULT 'complete' CHECK (log_type IN ('complete', 'start_only', 'end_only')),
    match_status TEXT DEFAULT 'unmatched' CHECK (match_status IN ('unmatched', 'matched', 'ignored')),
    matched_log_id TEXT,
    activity_key TEXT,
    similarity_score REAL
);

-- データを移行（suspend関連カラムを除外）
INSERT INTO activity_logs_new (
    id, user_id, content, input_timestamp, business_date, is_deleted,
    created_at, updated_at, start_time, end_time, total_minutes,
    confidence, analysis_method, categories, analysis_warnings,
    log_type, match_status, matched_log_id, activity_key, similarity_score
)
SELECT 
    id, user_id, content, input_timestamp, business_date, 
    COALESCE(is_deleted, FALSE),
    created_at, updated_at, start_time, end_time, total_minutes,
    confidence, analysis_method, categories, analysis_warnings,
    COALESCE(log_type, 'complete'),
    COALESCE(match_status, 'unmatched'),
    matched_log_id, activity_key, similarity_score
FROM activity_logs;

-- テーブル入れ替え
DROP TABLE activity_logs;
ALTER TABLE activity_logs_new RENAME TO activity_logs;

-- 4. user_settingsテーブルからsuspend関連カラムを削除
-- 既存のuser_settingsテーブルをバックアップ
DROP TABLE IF EXISTS user_settings_backup;
CREATE TABLE user_settings_backup AS SELECT * FROM user_settings;

-- 新しいuser_settingsテーブルを作成
DROP TABLE IF EXISTS user_settings_new;
CREATE TABLE user_settings_new (
    user_id TEXT PRIMARY KEY,
    timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
    username TEXT,
    first_seen TEXT,
    last_seen TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

-- データを移行（suspend関連カラムを除外、新カラムを適切に設定）
INSERT INTO user_settings_new (
    user_id, timezone, username, first_seen, last_seen, is_active, created_at, updated_at
)
SELECT 
    user_id, 
    COALESCE(timezone, 'Asia/Tokyo'),
    COALESCE(username, 'Unknown User'),
    COALESCE(first_seen, created_at),
    COALESCE(last_seen, updated_at),
    COALESCE(is_active, TRUE),
    created_at, 
    updated_at
FROM user_settings;

-- テーブル入れ替え
DROP TABLE user_settings;
ALTER TABLE user_settings_new RENAME TO user_settings;

-- 5. 必要なインデックスを再作成
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_date ON activity_logs(user_id, business_date, is_deleted);
CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp ON activity_logs(input_timestamp);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_user_settings_timezone ON user_settings(timezone);
CREATE INDEX IF NOT EXISTS idx_user_settings_username ON user_settings(username);
CREATE INDEX IF NOT EXISTS idx_user_settings_first_seen ON user_settings(first_seen);
CREATE INDEX IF NOT EXISTS idx_user_settings_last_seen ON user_settings(last_seen);
CREATE INDEX IF NOT EXISTS idx_user_settings_is_active ON user_settings(is_active);
CREATE INDEX IF NOT EXISTS idx_user_settings_active_last_seen ON user_settings(is_active, last_seen);

-- 6. トリガーを再作成
DROP TRIGGER IF EXISTS update_activity_logs_updated_at;
CREATE TRIGGER update_activity_logs_updated_at
    AFTER UPDATE ON activity_logs
    FOR EACH ROW
BEGIN
    UPDATE activity_logs 
    SET updated_at = datetime('now', 'utc')
    WHERE id = NEW.id;
END;

DROP TRIGGER IF EXISTS update_user_settings_updated_at;
CREATE TRIGGER update_user_settings_updated_at
    AFTER UPDATE ON user_settings
    FOR EACH ROW
BEGIN
    UPDATE user_settings 
    SET updated_at = datetime('now', 'utc')
    WHERE user_id = NEW.user_id;
END;

-- 7. マイグレーション履歴を更新（存在する場合）
-- staging環境でマイグレーション002が削除されたことを記録
DELETE FROM schema_migrations WHERE version = '002' AND description LIKE '%night%suspend%';

-- 完了確認
SELECT 'Staging migration completed successfully' as status;
SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;