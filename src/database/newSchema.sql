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
    -- リマインダーReply機能カラム（新機能）
    is_reminder_reply BOOLEAN DEFAULT FALSE, -- リマインダーへのreplyかどうか
    time_range_start TEXT,          -- 明示的な時間範囲開始（UTC、ISO 8601形式）
    time_range_end TEXT,            -- 明示的な時間範囲終了（UTC、ISO 8601形式）
    context_type TEXT DEFAULT 'NORMAL' CHECK (context_type IN ('REMINDER_REPLY', 'POST_REMINDER', 'NORMAL')) -- コンテキストタイプ
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
    username TEXT,                               -- ユーザー名
    first_seen TEXT,                             -- 初回利用日時
    last_seen TEXT,                              -- 最終利用日時
    is_active BOOLEAN DEFAULT TRUE,              -- アクティブ状態
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    -- 活動促し通知設定
    prompt_enabled BOOLEAN DEFAULT FALSE,        -- 通知有効/無効
    prompt_start_hour INTEGER DEFAULT 8,         -- 開始時刻（時）0-23
    prompt_start_minute INTEGER DEFAULT 30,      -- 開始時刻（分）0,30のみ
    prompt_end_hour INTEGER DEFAULT 18,          -- 終了時刻（時）0-23
    prompt_end_minute INTEGER DEFAULT 0,         -- 終了時刻（分）0,30のみ
    -- 制約
    CHECK (prompt_start_minute IN (0, 30)),
    CHECK (prompt_end_minute IN (0, 30)),
    CHECK (prompt_start_hour >= 0 AND prompt_start_hour <= 23),
    CHECK (prompt_end_hour >= 0 AND prompt_end_hour <= 23)
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

CREATE INDEX IF NOT EXISTS idx_user_settings_username 
ON user_settings(username);

CREATE INDEX IF NOT EXISTS idx_user_settings_first_seen 
ON user_settings(first_seen);

CREATE INDEX IF NOT EXISTS idx_user_settings_last_seen 
ON user_settings(last_seen);

CREATE INDEX IF NOT EXISTS idx_user_settings_is_active 
ON user_settings(is_active);

CREATE INDEX IF NOT EXISTS idx_user_settings_active_last_seen 
ON user_settings(is_active, last_seen);

-- 活動促し通知用インデックス
CREATE INDEX IF NOT EXISTS idx_user_settings_prompt_enabled 
ON user_settings(prompt_enabled) WHERE prompt_enabled = TRUE;

CREATE INDEX IF NOT EXISTS idx_user_settings_prompt_schedule 
ON user_settings(prompt_start_hour, prompt_start_minute, prompt_end_hour, prompt_end_minute) 
WHERE prompt_enabled = TRUE;



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

-- メモテーブル
CREATE TABLE IF NOT EXISTS memo_entries (
    id TEXT PRIMARY KEY,                    -- UUID
    user_id TEXT NOT NULL,                  -- Discord User ID
    content TEXT NOT NULL,                  -- メモ内容
    title TEXT,                             -- メモタイトル（オプション）
    tags TEXT,                              -- タグ（カンマ区切り）
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    is_deleted BOOLEAN DEFAULT FALSE        -- 論理削除フラグ
);

-- メモ用インデックス
CREATE INDEX IF NOT EXISTS idx_memo_entries_user_id ON memo_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_memo_entries_created_at ON memo_entries(created_at);
CREATE INDEX IF NOT EXISTS idx_memo_entries_tags ON memo_entries(tags);
CREATE INDEX IF NOT EXISTS idx_memo_entries_user_created ON memo_entries(user_id, created_at DESC) WHERE is_deleted = 0;

-- メモのupdated_at自動更新トリガー
CREATE TRIGGER IF NOT EXISTS update_memo_entries_updated_at
    AFTER UPDATE ON memo_entries
    FOR EACH ROW
BEGIN
    UPDATE memo_entries 
    SET updated_at = datetime('now', 'utc')
    WHERE id = NEW.id;
END;

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

-- 分析キャッシュ最適化
CREATE INDEX IF NOT EXISTS idx_daily_analysis_cache_user_date 
ON daily_analysis_cache(user_id, business_date, log_count DESC);

-- ================================================================
-- TimezoneChangeMonitor機能用テーブル（日次レポート送信機能）
-- ================================================================

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

