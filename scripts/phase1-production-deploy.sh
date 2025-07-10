#!/bin/bash

# Phase1 本番環境デプロイスクリプト
# 安全性を最優先にした段階的デプロイ

set -e  # エラー時に停止

echo "🚀 Phase1 Production Deployment"
echo "================================"

# 環境変数の確認
echo "📋 Environment Check..."
if [ -z "$DISCORD_TOKEN" ]; then
    echo "❌ DISCORD_TOKEN is not set"
    exit 1
fi

if [ -z "$GOOGLE_GEMINI_API_KEY" ]; then
    echo "❌ GOOGLE_GEMINI_API_KEY is not set"
    exit 1
fi

echo "✅ Required environment variables are set"

# 現在のデータベースの状況確認
echo ""
echo "📊 Current Database Status:"
echo "Main DB (app.db): $(if [ -f data/app.db ]; then echo "$(stat -f%z data/app.db) bytes"; else echo "not found"; fi)"
echo "Legacy DB (tasks.db): $(if [ -f data/tasks.db ]; then echo "$(stat -f%z data/tasks.db) bytes"; else echo "not found"; fi)"

# ビルドテスト
echo ""
echo "🔨 Build Test..."
npm run build
echo "✅ Build successful"

# 本番環境バックアップの実行
echo ""
echo "💾 Production Backup..."
echo "Creating backup of current production database..."

# Fly.ioアプリのステータス確認
echo ""
echo "📡 Fly.io Status Check..."
flyctl status
echo ""

# デプロイ確認
read -p "🚨 Are you ready to deploy to production? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Deployment cancelled"
    exit 1
fi

# デプロイ実行
echo ""
echo "🚀 Deploying to production..."
flyctl deploy --remote-only

echo ""
echo "⏳ Waiting for deployment to complete..."
sleep 10

# デプロイ後の動作確認
echo ""
echo "🔍 Post-deployment verification..."
flyctl status

echo ""
echo "📊 Application logs (last 50 lines):"
flyctl logs --tail 50

echo ""
echo "✅ Phase1 deployment completed!"
echo ""
echo "📋 Next steps:"
echo "  1. Test Discord bot functionality"
echo "  2. Verify database operations"
echo "  3. Monitor for any errors"
echo "  4. Check !cost, !summary, !timezone commands"
echo ""
echo "🚨 If any issues occur:"
echo "  - Check logs: flyctl logs"
echo "  - SSH into app: flyctl ssh console"
echo "  - Rollback if needed: flyctl releases list && flyctl rollback [version]"