-- 活動促し通知設定テーブル
-- ユーザーごとの自動通知ON/OFF、開始・終了時刻設定を管理

CREATE TABLE IF NOT EXISTS activity_prompt_settings (
    user_id TEXT PRIMARY KEY,                    -- Discord User ID
    is_enabled BOOLEAN NOT NULL DEFAULT FALSE,   -- 通知有効/無効
    start_hour INTEGER NOT NULL DEFAULT 8,       -- 開始時刻（時）0-23
    start_minute INTEGER NOT NULL DEFAULT 30,    -- 開始時刻（分）0,30のみ
    end_hour INTEGER NOT NULL DEFAULT 18,        -- 終了時刻（時）0-23
    end_minute INTEGER NOT NULL DEFAULT 0,       -- 終了時刻（分）0,30のみ
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    
    -- 制約：開始・終了分は0または30のみ
    CHECK (start_minute IN (0, 30)),
    CHECK (end_minute IN (0, 30)),
    -- 制約：時刻は0-23
    CHECK (start_hour >= 0 AND start_hour <= 23),
    CHECK (end_hour >= 0 AND end_hour <= 23),
    -- 制約：終了時刻は開始時刻より後
    CHECK (
        (end_hour > start_hour) OR 
        (end_hour = start_hour AND end_minute > start_minute)
    )
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_activity_prompt_settings_enabled 
ON activity_prompt_settings(is_enabled) WHERE is_enabled = TRUE;

CREATE INDEX IF NOT EXISTS idx_activity_prompt_settings_schedule 
ON activity_prompt_settings(start_hour, start_minute, end_hour, end_minute) 
WHERE is_enabled = TRUE;

-- updated_at自動更新トリガー
CREATE TRIGGER IF NOT EXISTS update_activity_prompt_settings_updated_at
    AFTER UPDATE ON activity_prompt_settings
    FOR EACH ROW
BEGIN
    UPDATE activity_prompt_settings 
    SET updated_at = datetime('now', 'utc')
    WHERE user_id = NEW.user_id;
END;

-- デフォルト設定ビュー（デバッグ用）
CREATE VIEW IF NOT EXISTS v_activity_prompt_status AS
SELECT 
    user_id,
    is_enabled,
    printf('%02d:%02d', start_hour, start_minute) as start_time,
    printf('%02d:%02d', end_hour, end_minute) as end_time,
    CASE 
        WHEN is_enabled = TRUE THEN '✅ 有効'
        ELSE '❌ 無効'
    END as status_display
FROM activity_prompt_settings
ORDER BY is_enabled DESC, user_id;