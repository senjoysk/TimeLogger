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
    similarity_score REAL,          -- マッチング時の類似度スコア
    -- 夜間サスペンド・リカバリ機能カラム（Phase 3）
    discord_message_id TEXT,        -- DiscordメッセージID（重複防止）
    recovery_processed BOOLEAN DEFAULT FALSE, -- リカバリ処理済みフラグ
    recovery_timestamp TEXT         -- リカバリ実行時刻（UTC、ISO 8601形式）
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
    suspend_hour INTEGER DEFAULT 0,              -- 夜間サスペンド時刻（ローカル時間の時）
    wake_hour INTEGER DEFAULT 7,                 -- 朝の起動時刻（ローカル時間の時）
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

CREATE INDEX IF NOT EXISTS idx_user_settings_suspend_schedule 
ON user_settings(suspend_hour, wake_hour);

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

-- API Cost monitoring テーブル
CREATE TABLE IF NOT EXISTS api_costs (
    id TEXT PRIMARY KEY,
    operation TEXT NOT NULL,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    estimated_cost REAL DEFAULT 0.0,
    timestamp TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    user_id TEXT,
    business_date TEXT
);

CREATE INDEX IF NOT EXISTS idx_api_costs_timestamp ON api_costs(timestamp);
CREATE INDEX IF NOT EXISTS idx_api_costs_business_date ON api_costs(business_date);
CREATE INDEX IF NOT EXISTS idx_api_costs_operation ON api_costs(operation);

-- ================================================================
-- TODO管理機能用テーブル（TimeLoggerBot機能拡張）
-- ================================================================

-- TODOタスクテーブル
CREATE TABLE IF NOT EXISTS todo_tasks (
    id TEXT PRIMARY KEY,                    -- UUID
    user_id TEXT NOT NULL,                  -- Discord User ID
    content TEXT NOT NULL,                  -- TODO内容
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    priority INTEGER DEFAULT 0,             -- 優先度 (0: 通常, 1: 高, -1: 低)
    due_date TEXT,                          -- 期日 (ISO 8601)
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    completed_at TEXT,                      -- 完了日時
    source_type TEXT DEFAULT 'manual' CHECK (source_type IN ('manual', 'ai_suggested', 'activity_derived', 'ai_classified')),
    related_activity_id TEXT,               -- 関連する活動ログID
    ai_confidence REAL,                     -- AI判定の信頼度 (0.0-1.0)
    is_deleted BOOLEAN DEFAULT FALSE,       -- 論理削除フラグ
    FOREIGN KEY (related_activity_id) REFERENCES activity_logs(id)
);

-- メッセージ分類履歴テーブル（学習用）
CREATE TABLE IF NOT EXISTS message_classifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    message_content TEXT NOT NULL,
    ai_classification TEXT NOT NULL,        -- AIの判定結果
    ai_confidence REAL NOT NULL,            -- AIの信頼度
    user_classification TEXT,               -- ユーザーの最終選択
    classified_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    feedback TEXT,                          -- ユーザーフィードバック
    is_correct BOOLEAN                      -- AI判定が正しかったか
);

-- TODOタスク用インデックス
CREATE INDEX IF NOT EXISTS idx_todo_tasks_user_id ON todo_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_todo_tasks_status ON todo_tasks(status);
CREATE INDEX IF NOT EXISTS idx_todo_tasks_due_date ON todo_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_todo_tasks_created_at ON todo_tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_todo_tasks_priority ON todo_tasks(priority, status);
CREATE INDEX IF NOT EXISTS idx_todo_tasks_related_activity ON todo_tasks(related_activity_id);

-- メッセージ分類用インデックス
CREATE INDEX IF NOT EXISTS idx_message_classifications_user_id ON message_classifications(user_id);
CREATE INDEX IF NOT EXISTS idx_message_classifications_ai_classification ON message_classifications(ai_classification);
CREATE INDEX IF NOT EXISTS idx_message_classifications_classified_at ON message_classifications(classified_at);

-- トリガー: todo_tasks の updated_at 自動更新
CREATE TRIGGER IF NOT EXISTS update_todo_tasks_updated_at
    AFTER UPDATE ON todo_tasks
    FOR EACH ROW
BEGIN
    UPDATE todo_tasks 
    SET updated_at = datetime('now', 'utc')
    WHERE id = NEW.id;
END;


-- ビュー: アクティブなTODO（デバッグ用）
CREATE VIEW IF NOT EXISTS v_active_todos AS
SELECT 
    t.id,
    t.user_id,
    t.content,
    t.status,
    t.priority,
    t.due_date,
    t.created_at,
    t.updated_at,
    a.content as related_activity_content
FROM todo_tasks t
LEFT JOIN activity_logs a ON t.related_activity_id = a.id
WHERE t.status IN ('pending', 'in_progress')
ORDER BY t.priority DESC, t.created_at ASC;

-- ビュー: 今日完了したTODO（サマリー用）
CREATE VIEW IF NOT EXISTS v_today_completed_todos AS
SELECT 
    t.id,
    t.user_id,
    t.content,
    t.completed_at,
    (julianday(t.completed_at) - julianday(t.created_at)) * 24 as completion_hours
FROM todo_tasks t
WHERE t.status = 'completed'
  AND date(t.completed_at) = date('now', 'localtime')
ORDER BY t.completed_at DESC;

-- ビュー: 分類精度統計（AI改善用）
CREATE VIEW IF NOT EXISTS v_classification_accuracy AS
SELECT 
    ai_classification,
    COUNT(*) as total_count,
    SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct_count,
    CAST(SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS REAL) / COUNT(*) as accuracy,
    AVG(ai_confidence) as avg_confidence
FROM message_classifications
WHERE user_classification IS NOT NULL
GROUP BY ai_classification;

-- ================================================================
-- パフォーマンス最適化インデックス
-- ================================================================

-- 日付範囲クエリ最適化（TODO分析用）
CREATE INDEX IF NOT EXISTS idx_todo_tasks_user_date_range 
ON todo_tasks(user_id, created_at, completed_at) 
WHERE is_deleted = 0;

-- 複合条件最適化（ステータス＆優先度）
CREATE INDEX IF NOT EXISTS idx_todo_tasks_user_status_priority 
ON todo_tasks(user_id, status, priority DESC) 
WHERE is_deleted = 0;

-- 活動ログ分析最適化（統合分析用）
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_business_input 
ON activity_logs(user_id, business_date, input_timestamp) 
WHERE is_deleted = 0;

-- TODO期日検索最適化
CREATE INDEX IF NOT EXISTS idx_todo_tasks_due_date 
ON todo_tasks(user_id, due_date, status) 
WHERE is_deleted = 0 AND due_date IS NOT NULL;

-- メッセージ分類履歴最適化
CREATE INDEX IF NOT EXISTS idx_message_classifications_user_date 
ON message_classifications(user_id, classified_at DESC);

-- APIコスト監視最適化
CREATE INDEX IF NOT EXISTS idx_api_costs_timestamp_operation 
ON api_costs(timestamp DESC, operation);

-- 分析キャッシュ最適化
CREATE INDEX IF NOT EXISTS idx_daily_analysis_cache_user_date 
ON daily_analysis_cache(user_id, business_date, log_count DESC);

-- ================================================================
-- 夜間サスペンド・リカバリ機能テーブル
-- ================================================================

-- サスペンド状態管理テーブル
CREATE TABLE IF NOT EXISTS suspend_states (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    suspend_time TEXT NOT NULL,           -- サスペンド実行時刻（UTC、ISO 8601形式）
    expected_recovery_time TEXT NOT NULL, -- 予定復旧時刻（UTC、ISO 8601形式）
    actual_recovery_time TEXT,            -- 実際の復旧時刻（UTC、ISO 8601形式）
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

-- 夜間サスペンド機能用インデックス
CREATE INDEX IF NOT EXISTS idx_suspend_states_user_id ON suspend_states(user_id);
CREATE INDEX IF NOT EXISTS idx_suspend_states_suspend_time ON suspend_states(suspend_time);

-- 夜間サスペンド・リカバリ機能用インデックス
CREATE INDEX IF NOT EXISTS idx_discord_message_id ON activity_logs(discord_message_id);
CREATE INDEX IF NOT EXISTS idx_recovery_processed ON activity_logs(recovery_processed);
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_discord_message_id ON activity_logs(discord_message_id) WHERE discord_message_id IS NOT NULL;