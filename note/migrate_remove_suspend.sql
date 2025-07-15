-- Suspend機能削除マイグレーションSQL

-- トランザクション開始
BEGIN TRANSACTION;

-- 1. suspend_statesテーブルを削除
DROP TABLE IF EXISTS suspend_states;

-- 2. suspend関連インデックスを削除
DROP INDEX IF EXISTS idx_suspend_states_user_id;
DROP INDEX IF EXISTS idx_suspend_states_suspend_time;
DROP INDEX IF EXISTS idx_user_settings_suspend_schedule;
DROP INDEX IF EXISTS idx_discord_message_id;
DROP INDEX IF EXISTS idx_recovery_processed;
DROP INDEX IF EXISTS idx_unique_discord_message_id;

-- 3. 新しいuser_settingsテーブルを作成（suspend関連カラムなし）
CREATE TABLE IF NOT EXISTS user_settings_new (
    user_id TEXT PRIMARY KEY,
    timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

-- 4. 既存データの移行（suspend関連カラムを除外）
INSERT OR IGNORE INTO user_settings_new (user_id, timezone, created_at, updated_at)
SELECT user_id, timezone, created_at, updated_at 
FROM user_settings;

-- 5. 古いテーブルを削除して入れ替え
DROP TABLE IF EXISTS user_settings;
ALTER TABLE user_settings_new RENAME TO user_settings;

-- 6. activity_logsテーブルからsuspend関連カラムを削除（ALTER COLUMN不可のため新テーブル作成）
CREATE TABLE IF NOT EXISTS activity_logs_new (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,           
    input_timestamp TEXT NOT NULL,  
    business_date TEXT NOT NULL,    
    is_deleted BOOLEAN DEFAULT FALSE, 
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    -- リアルタイム分析結果カラム
    start_time TEXT,                
    end_time TEXT,                  
    total_minutes INTEGER,          
    confidence REAL,                
    analysis_method TEXT,           
    categories TEXT,                
    analysis_warnings TEXT,         
    -- 開始・終了ログマッチング機能カラム
    log_type TEXT DEFAULT 'complete' CHECK (log_type IN ('complete', 'start_only', 'end_only')),
    match_status TEXT DEFAULT 'unmatched' CHECK (match_status IN ('unmatched', 'matched', 'ignored')),
    matched_log_id TEXT,            
    activity_key TEXT,              
    similarity_score REAL
);

-- 7. activity_logsの既存データを移行（suspend関連カラムを除外）
INSERT OR IGNORE INTO activity_logs_new (
    id, user_id, content, input_timestamp, business_date, is_deleted, 
    created_at, updated_at, start_time, end_time, total_minutes, 
    confidence, analysis_method, categories, analysis_warnings,
    log_type, match_status, matched_log_id, activity_key, similarity_score
)
SELECT 
    id, user_id, content, input_timestamp, business_date, is_deleted, 
    created_at, updated_at, start_time, end_time, total_minutes, 
    confidence, analysis_method, categories, analysis_warnings,
    COALESCE(log_type, 'complete'), COALESCE(match_status, 'unmatched'), 
    matched_log_id, activity_key, similarity_score
FROM activity_logs;

-- 8. 古いactivity_logsテーブルを削除して入れ替え
DROP TABLE IF EXISTS activity_logs;
ALTER TABLE activity_logs_new RENAME TO activity_logs;

-- 9. インデックスの再作成
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_date 
ON activity_logs(user_id, business_date, is_deleted);

CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp 
ON activity_logs(input_timestamp);

CREATE INDEX IF NOT EXISTS idx_activity_logs_created 
ON activity_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_user_settings_timezone 
ON user_settings(timezone);

CREATE INDEX IF NOT EXISTS idx_activity_logs_log_type 
ON activity_logs(log_type);

CREATE INDEX IF NOT EXISTS idx_activity_logs_match_status 
ON activity_logs(match_status);

CREATE INDEX IF NOT EXISTS idx_activity_logs_matched_log_id 
ON activity_logs(matched_log_id);

CREATE INDEX IF NOT EXISTS idx_activity_logs_activity_key 
ON activity_logs(activity_key);

CREATE INDEX IF NOT EXISTS idx_activity_logs_analysis 
ON activity_logs(start_time, end_time, confidence);

CREATE INDEX IF NOT EXISTS idx_activity_logs_categories 
ON activity_logs(categories);

-- 10. トリガーの再作成
DROP TRIGGER IF EXISTS update_user_settings_updated_at;
CREATE TRIGGER update_user_settings_updated_at
AFTER UPDATE ON user_settings
FOR EACH ROW
BEGIN
    UPDATE user_settings SET updated_at = datetime('now', 'utc')
    WHERE user_id = NEW.user_id;
END;

DROP TRIGGER IF EXISTS update_activity_logs_updated_at;
CREATE TRIGGER update_activity_logs_updated_at
    AFTER UPDATE ON activity_logs
    FOR EACH ROW
BEGIN
    UPDATE activity_logs 
    SET updated_at = datetime('now', 'utc')
    WHERE id = NEW.id;
END;

-- トランザクション完了
COMMIT;

-- 検証
SELECT 'Migration completed. Current schema:' as message;
SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;
SELECT 'User count:' as message, COUNT(*) as count FROM user_settings;