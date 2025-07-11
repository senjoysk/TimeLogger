-- Migration: 003_user_settings_enhancement
-- Description: user_settingsテーブルの拡張 - 完全マルチユーザー対応
-- Created: 2025-07-11
-- Phase: 3 - データベース拡張

-- user_settingsテーブルの拡張
-- ユーザー名、初回・最終利用日時、アクティブ状態フラグを追加

-- Step 1: username カラムを追加
ALTER TABLE user_settings ADD COLUMN username TEXT;

-- Step 2: first_seen カラムを追加（初回利用日時）
ALTER TABLE user_settings ADD COLUMN first_seen TEXT;

-- Step 3: last_seen カラムを追加（最終利用日時）
ALTER TABLE user_settings ADD COLUMN last_seen TEXT;

-- Step 4: is_active フラグを追加（アクティブ状態）
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