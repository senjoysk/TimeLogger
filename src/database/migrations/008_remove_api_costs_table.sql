-- Migration: 008_remove_api_costs_table
-- Description: APIコスト監視機能削除に伴うapi_costsテーブルの削除
-- Created: 2025-08-03

-- api_costsテーブルとその関連インデックスを削除
DROP TABLE IF EXISTS api_costs;