#!/bin/bash

# 本番環境ステータス確認スクリプト
APP_NAME="timelogger-bitter-resonance-9585"

echo "📊 TimeLogger Bot (本番環境) ステータス確認"
echo "🌐 アプリ: $APP_NAME"
echo ""

# Fly.ioアプリの全体ステータス
echo "📱 アプリ全体ステータス:"
fly status --app "$APP_NAME"

echo ""
echo "🏃 実行中のマシン:"
fly machine list --app "$APP_NAME"

echo ""
echo "📋 最近のログ (最新10行):"
fly logs --app "$APP_NAME" -n 10

echo ""
echo "💾 ボリューム情報:"
fly volumes list --app "$APP_NAME"

echo ""
echo "🔐 環境変数 (機密情報は非表示):"
fly secrets list --app "$APP_NAME"

echo ""
echo "🌍 本番URL: https://${APP_NAME}.fly.dev"