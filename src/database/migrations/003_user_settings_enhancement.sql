-- Migration: 003_user_settings_enhancement
-- Description: user_settingsテーブルの拡張 - 完全マルチユーザー対応
-- Created: 2025-07-11
-- Phase: 3 - データベース拡張

-- user_settingsテーブルの拡張
-- ユーザー名、初回・最終利用日時、アクティブ状態フラグを追加

-- 冪等性のため、user_settingsテーブルが存在しない場合は作成
CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY,
    timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

-- Step 1: username カラムを追加（既に存在する場合はエラーを無視）
-- SQLiteはALTER TABLE ADD COLUMN IF NOT EXISTSをサポートしていないため、
-- エラーが発生する可能性があるが、新マイグレーションシステムで適切に処理される

-- 以下のカラムが存在しない場合のみ追加を試行
-- （SQLiteの制限により、カラム存在チェックはアプリケーション層で行う）

ALTER TABLE user_settings ADD COLUMN username TEXT;
ALTER TABLE user_settings ADD COLUMN first_seen TEXT;
ALTER TABLE user_settings ADD COLUMN last_seen TEXT;
ALTER TABLE user_settings ADD COLUMN is_active BOOLEAN DEFAULT TRUE;

-- Step 5: パフォーマンス最適化のためのインデックス作成
CREATE INDEX IF NOT EXISTS idx_user_settings_username ON user_settings(username);
CREATE INDEX IF NOT EXISTS idx_user_settings_first_seen ON user_settings(first_seen);
CREATE INDEX IF NOT EXISTS idx_user_settings_last_seen ON user_settings(last_seen);
CREATE INDEX IF NOT EXISTS idx_user_settings_is_active ON user_settings(is_active);

-- Step 6: 複合インデックス（頻繁に使用される検索条件）
CREATE INDEX IF NOT EXISTS idx_user_settings_active_last_seen ON user_settings(is_active, last_seen);

-- Step 7: 既存データの初期化（マイグレーション実行時）
-- 既存のuser_settingsレコードに対して、初期値を設定
UPDATE user_settings 
SET 
  username = 'Unknown User',
  first_seen = created_at,
  last_seen = updated_at,
  is_active = TRUE
WHERE username IS NULL;