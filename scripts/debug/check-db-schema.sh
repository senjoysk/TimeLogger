#!/bin/bash

echo "🔍 データベーススキーマ確認スクリプト"
echo "======================================="

DB_PATH="data/app.db"

echo "📊 1. user_settingsテーブルの構造確認"
sqlite3 "$DB_PATH" "PRAGMA table_info(user_settings);" | while IFS='|' read -r cid name type notnull dflt_value pk; do
    echo "  カラム $cid: $name ($type) - デフォルト: $dflt_value"
done

echo ""
echo "📊 2. prompt関連カラムの存在確認"
sqlite3 "$DB_PATH" "PRAGMA table_info(user_settings);" | grep prompt | while IFS='|' read -r cid name type notnull dflt_value pk; do
    echo "  ✅ $name カラムが存在"
done

echo ""
echo "📊 3. マイグレーション実行履歴"
sqlite3 "$DB_PATH" "SELECT version, description, success, executed_at FROM schema_migrations ORDER BY executed_at;"

echo ""
echo "📊 4. テストユーザーの設定確認"
sqlite3 "$DB_PATH" "SELECT user_id, prompt_enabled, prompt_start_hour, prompt_start_minute, prompt_end_hour, prompt_end_minute FROM user_settings WHERE user_id LIKE '%test%' OR user_id = '770478489203507241';"

echo ""
echo "🎯 5. 全ユーザーのprompt設定サマリー"
sqlite3 "$DB_PATH" "SELECT COUNT(*) as total_users, SUM(CASE WHEN prompt_enabled = 1 THEN 1 ELSE 0 END) as enabled_users FROM user_settings;"