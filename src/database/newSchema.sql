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
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    -- リアルタイム分析結果カラム（新機能）
    start_time TEXT,                -- 活動開始時刻（UTC、ISO 8601形式）
    end_time TEXT,                  -- 活動終了時刻（UTC、ISO 8601形式）
    total_minutes INTEGER,          -- 総活動時間（分）
    confidence REAL,                -- 分析の信頼度 (0-1)
    analysis_method TEXT,           -- 時刻抽出手法
    categories TEXT,                -- カテゴリ（カンマ区切り）
    analysis_warnings TEXT,         -- 警告メッセージ（セミコロン区切り）
    -- 開始・終了ログマッチング機能カラム（Phase 2）
    log_type TEXT DEFAULT 'complete' CHECK (log_type IN ('complete', 'start_only', 'end_only')),
    match_status TEXT DEFAULT 'unmatched' CHECK (match_status IN ('unmatched', 'matched', 'ignored')),
    matched_log_id TEXT,            -- マッチング相手のログID
    activity_key TEXT,              -- 活動内容の分類キー
    similarity_score REAL           -- マッチング時の類似度スコア
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

-- 開始・終了ログマッチング機能用インデックス（Phase 2）
CREATE INDEX IF NOT EXISTS idx_activity_logs_log_type 
ON activity_logs(log_type);

CREATE INDEX IF NOT EXISTS idx_activity_logs_match_status 
ON activity_logs(match_status);

CREATE INDEX IF NOT EXISTS idx_activity_logs_matched_log_id 
ON activity_logs(matched_log_id);

CREATE INDEX IF NOT EXISTS idx_activity_logs_activity_key 
ON activity_logs(activity_key);

-- 分析結果用インデックス
CREATE INDEX IF NOT EXISTS idx_activity_logs_analysis 
ON activity_logs(start_time, end_time, confidence);

CREATE INDEX IF NOT EXISTS idx_activity_logs_categories 
ON activity_logs(categories);

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