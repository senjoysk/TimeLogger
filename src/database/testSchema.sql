-- テスト用シンプルスキーマ（E2Eテスト専用）

-- 活動ログテーブル
CREATE TABLE IF NOT EXISTS activity_logs (
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

-- ユーザー設定テーブル
CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY,
    timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

-- 分析キャッシュテーブル
CREATE TABLE IF NOT EXISTS daily_analysis_cache (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    business_date TEXT NOT NULL,
    analysis_result TEXT NOT NULL,
    log_count INTEGER NOT NULL,
    generated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    UNIQUE(user_id, business_date)
);

-- TODOタスクテーブル
CREATE TABLE IF NOT EXISTS todo_tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    priority INTEGER DEFAULT 0,
    due_date TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    completed_at TEXT,
    source_type TEXT DEFAULT 'manual' CHECK (source_type IN ('manual', 'ai_suggested', 'activity_derived', 'ai_classified')),
    related_activity_id TEXT,
    ai_confidence REAL,
    is_deleted BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (related_activity_id) REFERENCES activity_logs(id)
);

-- メッセージ分類履歴テーブル
CREATE TABLE IF NOT EXISTS message_classifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    message_content TEXT NOT NULL,
    ai_classification TEXT NOT NULL,
    ai_confidence REAL NOT NULL,
    user_classification TEXT,
    classified_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    feedback TEXT,
    is_correct BOOLEAN
);

-- 基本インデックス
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_date ON activity_logs(user_id, business_date, is_deleted);
CREATE INDEX IF NOT EXISTS idx_todo_tasks_user_id ON todo_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_todo_tasks_status ON todo_tasks(status);
CREATE INDEX IF NOT EXISTS idx_message_classifications_user_id ON message_classifications(user_id);