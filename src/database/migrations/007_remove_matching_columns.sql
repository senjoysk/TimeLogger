-- 007_remove_matching_columns.sql
-- 開始・終了ログマッチング機能のカラムを削除するマイグレーション
-- 
-- 削除対象カラム:
-- - log_type (DEFAULT 'complete')
-- - match_status (DEFAULT 'unmatched')
-- - matched_log_id
-- - activity_key
-- - similarity_score
--
-- 注意: このマイグレーションは条件付きで実行される
-- 新規DBやマッチング機能を持たないDBでは何もしない

-- このマイグレーションはスキップする
-- 理由：
-- 1. 新規環境ではnewSchema.sqlで正しいスキーマが作成される
-- 2. 既存環境でマッチング機能を使っていた場合のみ手動で実行する必要がある
-- 3. テスト環境での複雑性を避ける

-- 本番環境でマッチング機能を削除する場合は、以下のコマンドを手動で実行：
-- 1. データベースのバックアップを取る
-- 2. 以下のSQLを実行：
/*
PRAGMA foreign_keys = OFF;

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
    is_reminder_reply BOOLEAN DEFAULT FALSE,
    time_range_start TEXT,
    time_range_end TEXT,
    context_type TEXT DEFAULT 'NORMAL' CHECK (context_type IN ('REMINDER_REPLY', 'POST_REMINDER', 'NORMAL'))
);

INSERT INTO activity_logs_new 
SELECT 
    id, user_id, content, input_timestamp, business_date, is_deleted,
    created_at, updated_at, start_time, end_time, total_minutes,
    confidence, analysis_method, categories, analysis_warnings,
    is_reminder_reply, time_range_start, time_range_end, context_type
FROM activity_logs;

DROP TABLE activity_logs;
ALTER TABLE activity_logs_new RENAME TO activity_logs;

-- インデックスとトリガーを再作成
CREATE INDEX idx_activity_logs_user_date ON activity_logs(user_id, business_date, is_deleted);
CREATE INDEX idx_activity_logs_timestamp ON activity_logs(input_timestamp);
CREATE INDEX idx_activity_logs_created ON activity_logs(created_at);
CREATE INDEX idx_activity_logs_analysis ON activity_logs(start_time, end_time, confidence);
CREATE INDEX idx_activity_logs_categories ON activity_logs(categories);

CREATE TRIGGER update_activity_logs_updated_at
    AFTER UPDATE ON activity_logs
    FOR EACH ROW
BEGIN
    UPDATE activity_logs SET updated_at = datetime('now', 'utc') WHERE id = NEW.id;
END;

PRAGMA foreign_keys = ON;
*/