-- Staging環境用 TimezoneChangeMonitor テーブル追加マイグレーション
-- 実行日: 2025-07-14

-- タイムゾーン変更通知テーブル
CREATE TABLE IF NOT EXISTS timezone_change_notifications (
    id TEXT PRIMARY KEY,                    -- UUID
    user_id TEXT NOT NULL,                  -- Discord User ID
    old_timezone TEXT,                      -- 変更前のタイムゾーン
    new_timezone TEXT NOT NULL,             -- 変更後のタイムゾーン
    changed_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')), -- 変更日時
    processed BOOLEAN DEFAULT FALSE,        -- 処理済みフラグ
    processed_at TEXT,                      -- 処理日時
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

-- タイムゾーン変更通知用インデックス
CREATE INDEX IF NOT EXISTS idx_timezone_change_notifications_user_id 
ON timezone_change_notifications(user_id);

CREATE INDEX IF NOT EXISTS idx_timezone_change_notifications_processed 
ON timezone_change_notifications(processed, changed_at);

CREATE INDEX IF NOT EXISTS idx_timezone_change_notifications_changed_at 
ON timezone_change_notifications(changed_at DESC);

-- タイムゾーン変更時の自動通知記録トリガー
CREATE TRIGGER IF NOT EXISTS trigger_timezone_change_notification
    AFTER UPDATE OF timezone ON user_settings
    FOR EACH ROW
    WHEN OLD.timezone != NEW.timezone
BEGIN
    INSERT INTO timezone_change_notifications (
        id,
        user_id,
        old_timezone,
        new_timezone,
        changed_at
    ) VALUES (
        hex(randomblob(16)),
        NEW.user_id,
        OLD.timezone,
        NEW.timezone,
        datetime('now', 'utc')
    );
END;