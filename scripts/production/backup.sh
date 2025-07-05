#!/bin/bash

# 本番環境 データベースバックアップスクリプト
APP_NAME="timelogger-bitter-resonance-9585"
BACKUP_DIR="backups"
DATE=$(date +%Y%m%d_%H%M%S)

echo "💾 本番環境データベースバックアップを開始します"
echo "🌐 アプリ: $APP_NAME"
echo "📅 タイムスタンプ: $DATE"

# バックアップディレクトリ作成
mkdir -p "$BACKUP_DIR"

echo ""
echo "📡 データベースファイルをダウンロード中..."

# SSHでデータベースファイルを取得
echo "🔗 Fly.ioマシンに接続してデータベースをバックアップ中..."
fly ssh console --app "$APP_NAME" -C "cp /app/data/activity_logs.db /app/data/backup_${DATE}.db"

if [ $? -ne 0 ]; then
    echo "❌ データベースのバックアップ作成に失敗しました"
    exit 1
fi

# ローカルにダウンロード
echo "⬇️ バックアップファイルをローカルにダウンロード中..."
fly sftp get /app/data/backup_${DATE}.db "${BACKUP_DIR}/activity_logs_${DATE}.db" --app "$APP_NAME"

if [ $? -eq 0 ]; then
    echo "✅ バックアップが完了しました"
    echo "📁 保存場所: ${BACKUP_DIR}/activity_logs_${DATE}.db"
    
    # ファイルサイズ確認
    size=$(ls -lh "${BACKUP_DIR}/activity_logs_${DATE}.db" | awk '{print $5}')
    echo "📊 ファイルサイズ: $size"
    
    # リモートの一時バックアップファイルを削除
    echo "🧹 リモートの一時ファイルを削除中..."
    fly ssh console --app "$APP_NAME" -C "rm -f /app/data/backup_${DATE}.db"
    
    echo ""
    echo "💡 古いバックアップファイルを確認してください:"
    ls -la "$BACKUP_DIR"/
    
else
    echo "❌ バックアップファイルのダウンロードに失敗しました"
    exit 1
fi

echo ""
echo "🎉 バックアップ処理が完了しました"