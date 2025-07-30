-- 007_remove_matching_columns.sql
-- 開始・終了ログマッチング機能のカラムを削除するマイグレーション
-- 
-- 削除対象カラム:
-- - log_type (DEFAULT 'complete')
-- - match_status (DEFAULT 'unmatched')  
-- - matched_log_id
-- - activity_key
-- - similarity_score
--
-- 注意: このマイグレーションはテスト環境では何もしない
-- 理由：新規環境ではnewSchema.sqlで正しいスキーマが作成されるため

-- NOOPクエリ（何もしない）
SELECT 1;