-- Migration 006: リマインダーReply機能用カラム追加
-- 作成日: 2025-07-24
-- 概要: activity_logsテーブルにリマインダー返信検出機能用のカラムを追加

-- リマインダーへのreplyかどうかを示すフラグ
ALTER TABLE activity_logs ADD COLUMN is_reminder_reply BOOLEAN DEFAULT FALSE;

-- 明示的な時間範囲開始（UTC、ISO 8601形式）
ALTER TABLE activity_logs ADD COLUMN time_range_start TEXT;

-- 明示的な時間範囲終了（UTC、ISO 8601形式）
ALTER TABLE activity_logs ADD COLUMN time_range_end TEXT;

-- コンテキストタイプ（リマインダー関連のコンテキスト情報）
ALTER TABLE activity_logs ADD COLUMN context_type TEXT DEFAULT 'NORMAL' 
    CHECK (context_type IN ('REMINDER_REPLY', 'POST_REMINDER', 'NORMAL'));