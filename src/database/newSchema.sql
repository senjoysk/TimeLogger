-- 新活動記録システム用データベーススキーマ
-- 自然言語ログ方式対応

-- 新活動ログテーブル（メイン）
CREATE TABLE IF NOT EXISTS activity_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,           -- ユーザーの生入力
    input_timestamp TEXT NOT NULL,  -- 入力時刻（UTC、ISO 8601形式）
    business_date TEXT NOT NULL,    -- 業務日（YYYY-MM-DD、5am基準）
    is_deleted BOOLEAN DEFAULT FALSE, -- 論理削除フラグ
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

-- 分析結果キャッシュテーブル
CREATE TABLE IF NOT EXISTS daily_analysis_cache (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    business_date TEXT NOT NULL,    -- YYYY-MM-DD形式
    analysis_result TEXT NOT NULL, -- JSON形式の分析結果
    log_count INTEGER NOT NULL,    -- 対象ログ数（キャッシュ有効性確認用）
    generated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    UNIQUE(user_id, business_date)
);

-- ユーザー設定テーブル
CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY,
    timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo', -- IANA タイムゾーン名
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

-- インデックスの作成（パフォーマンス最適化）
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_date 
ON activity_logs(user_id, business_date, is_deleted);

CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp 
ON activity_logs(input_timestamp);

CREATE INDEX IF NOT EXISTS idx_activity_logs_created 
ON activity_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_cache_user_date 
ON daily_analysis_cache(user_id, business_date);

CREATE INDEX IF NOT EXISTS idx_cache_generated 
ON daily_analysis_cache(generated_at);

CREATE INDEX IF NOT EXISTS idx_user_settings_timezone 
ON user_settings(timezone);

-- トリガー: updated_at の自動更新
CREATE TRIGGER IF NOT EXISTS update_activity_logs_updated_at
    AFTER UPDATE ON activity_logs
    FOR EACH ROW
BEGIN
    UPDATE activity_logs 
    SET updated_at = datetime('now', 'utc')
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_user_settings_updated_at
    AFTER UPDATE ON user_settings
    FOR EACH ROW
BEGIN
    UPDATE user_settings 
    SET updated_at = datetime('now', 'utc')
    WHERE user_id = NEW.user_id;
END;

-- ビュー: 今日のアクティブなログ（デバッグ用）
CREATE VIEW IF NOT EXISTS v_today_active_logs AS
SELECT 
    id,
    user_id,
    content,
    input_timestamp,
    business_date,
    created_at,
    updated_at
FROM activity_logs 
WHERE is_deleted = FALSE
  AND business_date = date('now', 'localtime', '-5 hours') -- 5:00am基準での今日
ORDER BY input_timestamp ASC;

-- ビュー: キャッシュ状態確認（デバッグ用）
CREATE VIEW IF NOT EXISTS v_cache_status AS
SELECT 
    user_id,
    business_date,
    log_count,
    generated_at,
    CASE 
        WHEN generated_at > datetime('now', '-1 hour') THEN 'Fresh'
        WHEN generated_at > datetime('now', '-6 hours') THEN 'Valid'
        ELSE 'Stale'
    END as cache_status
FROM daily_analysis_cache
ORDER BY business_date DESC, user_id;