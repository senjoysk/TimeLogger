-- Migration: 001_add_business_date_to_api_costs
-- Description: api_costs テーブルに business_date カラムを追加
-- Created: 2025-07-09

-- 既存のapi_costsテーブルにbusiness_dateカラムが存在しない場合のみ追加
-- SQLiteのALTER TABLE ADD COLUMNは存在しないカラムのみ追加可能

-- Step 1: api_costsテーブルが存在するかチェック
-- Step 2: business_dateカラムが存在するかチェック
-- Step 3: 存在しない場合のみ追加

ALTER TABLE api_costs ADD COLUMN business_date TEXT;