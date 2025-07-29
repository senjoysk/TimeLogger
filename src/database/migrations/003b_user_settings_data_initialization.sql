-- Migration: 003b_user_settings_data_initialization
-- Description: user_settingsテーブルの既存データ初期化
-- Created: 2025-07-29
-- Phase: 3b - 既存データの初期化（UPDATE文を分離）

-- 既存データの初期化（マイグレーション実行時）
-- 既存のuser_settingsレコードに対して、初期値を設定
-- 注: 新規DBの場合はレコードが存在しないため、このUPDATEは実行されない
-- 既存DBの場合のみ、usernameがNULLのレコードを更新

-- 重要: UPDATE文は同時実行時のロック競合を避けるため、
-- スキーマ変更から分離して実行する

-- まず、更新対象のレコードが存在するかチェック
SELECT COUNT(*) as target_count FROM user_settings 
WHERE username IS NULL OR first_seen IS NULL OR last_seen IS NULL OR is_active IS NULL;

-- 既存レコードの初期値設定
UPDATE user_settings 
SET 
  username = COALESCE(username, 'Unknown User'),
  first_seen = COALESCE(first_seen, created_at),
  last_seen = COALESCE(last_seen, updated_at),
  is_active = COALESCE(is_active, TRUE)
WHERE username IS NULL OR first_seen IS NULL OR last_seen IS NULL OR is_active IS NULL;