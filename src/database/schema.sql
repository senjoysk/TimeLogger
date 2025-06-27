-- Discord Task Logger データベーススキーマ
-- SQLite を使用して活動記録を管理

-- ユーザー設定テーブル
CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    timezone TEXT DEFAULT 'Asia/Tokyo' -- デフォルトはJST
);

-- 活動記録テーブル
CREATE TABLE IF NOT EXISTS activity_records (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    time_slot TEXT NOT NULL, -- 'YYYY-MM-DD HH:MM:SS' 形式の30分枠開始時刻
    business_date TEXT NOT NULL, -- 'YYYY-MM-DD' 形式の業務日（5:00am基準）
    original_text TEXT NOT NULL, -- ユーザーからの投稿内容
    
    -- Gemini解析結果
    category TEXT,
    sub_category TEXT,
    structured_content TEXT,
    estimated_minutes INTEGER DEFAULT 30,
    productivity_level INTEGER DEFAULT 3,
    
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

-- 日次サマリーテーブル
CREATE TABLE IF NOT EXISTS daily_summaries (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    business_date TEXT NOT NULL,
    category_totals TEXT NOT NULL,
    total_minutes INTEGER NOT NULL,
    insights TEXT NOT NULL,
    motivation TEXT NOT NULL,
    generated_at TEXT NOT NULL,
    UNIQUE(user_id, business_date)
);

CREATE TABLE IF NOT EXISTS api_usage_logs (
    id TEXT PRIMARY KEY,
    operation TEXT NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    cost REAL NOT NULL,
    created_at TEXT NOT NULL
);

-- インデックスの作成
-- 活動記録の検索用インデックス
CREATE INDEX IF NOT EXISTS idx_activity_user_date 
ON activity_records(user_id, business_date);

CREATE INDEX IF NOT EXISTS idx_activity_time_slot 
ON activity_records(time_slot);

CREATE INDEX IF NOT EXISTS idx_activity_category 
ON activity_records(category);

-- 日次サマリーの検索用インデックス
CREATE INDEX IF NOT EXISTS idx_summary_user_date 
ON daily_summaries(user_id, business_date);

-- トリガー: updated_at の自動更新
CREATE TRIGGER IF NOT EXISTS update_activity_updated_at
    AFTER UPDATE ON activity_records
    FOR EACH ROW
BEGIN
    UPDATE activity_records 
    SET updated_at = datetime('now', 'localtime')
    WHERE id = NEW.id;
END;

-- 初期データの確認用ビュー
CREATE VIEW IF NOT EXISTS v_today_activities AS
SELECT 
    id,
    user_id,
    time_slot,
    category,
    sub_category,
    original_text,
    estimated_minutes,
    productivity_level,
    created_at
FROM activity_records 
WHERE business_date = date('now', 'localtime', '-5 hours') -- 5:00am基準での今日
ORDER BY time_slot;