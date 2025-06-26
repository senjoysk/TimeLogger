#!/bin/bash

# Bot プロセス管理スクリプト
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$PROJECT_DIR/.bot.pid"

case "$1" in
  "start")
    echo "🚀 TimeLogger Bot を起動しています..."
    
    # 既存プロセスをチェック・停止
    if [ -f "$PID_FILE" ]; then
      OLD_PID=$(cat "$PID_FILE")
      if ps -p "$OLD_PID" > /dev/null 2>&1; then
        echo "⚠️  既存のBotプロセス (PID: $OLD_PID) を停止中..."
        kill "$OLD_PID"
        sleep 2
      fi
      rm -f "$PID_FILE"
    fi
    
    # 全関連プロセスを強制停止（念のため）
    echo "🧹 関連プロセスをクリーンアップ中..."
    pkill -f "TimeLogger" 2>/dev/null || true
    pkill -f "node.*dist/index\.js" 2>/dev/null || true
    pkill -f "ts-node.*src/index" 2>/dev/null || true
    sleep 1
    
    # 新しいプロセスを起動
    cd "$PROJECT_DIR"
    npm start > bot.log 2>&1 &
    NEW_PID=$!
    echo "$NEW_PID" > "$PID_FILE"
    
    echo "✅ Bot起動完了 (PID: $NEW_PID)"
    echo "📝 ログファイル: $PROJECT_DIR/bot.log"
    ;;
    
  "stop")
    echo "🛑 TimeLogger Bot を停止しています..."
    
    if [ -f "$PID_FILE" ]; then
      PID=$(cat "$PID_FILE")
      if ps -p "$PID" > /dev/null 2>&1; then
        echo "⏸️  Botプロセス (PID: $PID) を停止中..."
        kill "$PID"
        sleep 2
        
        # まだ動いている場合は強制終了
        if ps -p "$PID" > /dev/null 2>&1; then
          echo "💥 強制終了中..."
          kill -9 "$PID"
        fi
      else
        echo "⚠️  PIDファイルのプロセスは既に停止済み"
      fi
      rm -f "$PID_FILE"
    fi
    
    # 全関連プロセスを強制停止（念のため）
    echo "🧹 関連プロセスをクリーンアップ中..."
    pkill -f "TimeLogger" 2>/dev/null || true
    pkill -f "node.*dist/index\.js" 2>/dev/null || true
    pkill -f "ts-node.*src/index" 2>/dev/null || true
    
    echo "✅ Bot停止完了"
    ;;
    
  "restart")
    echo "🔄 TimeLogger Bot を再起動しています..."
    "$0" stop
    sleep 2
    "$0" start
    ;;
    
  "status")
    echo "📊 TimeLogger Bot ステータス:"
    
    if [ -f "$PID_FILE" ]; then
      PID=$(cat "$PID_FILE")
      if ps -p "$PID" > /dev/null 2>&1; then
        echo "✅ Bot実行中 (PID: $PID)"
        echo "📊 プロセス詳細:"
        ps -f -p "$PID"
      else
        echo "❌ PIDファイルのプロセスは停止済み (古いPIDファイル削除)"
        rm -f "$PID_FILE"
      fi
    else
      echo "❌ Bot停止中 (PIDファイルなし)"
    fi
    
    echo "📋 関連プロセス一覧:"
    ps aux | grep -E "(node.*TimeLogger|node.*dist/index\.js|ts-node.*src/index\.ts)" | grep -v grep || echo "関連プロセスなし"
    ;;
    
  "logs")
    echo "📜 Bot ログ (最新20行):"
    if [ -f "$PROJECT_DIR/bot.log" ]; then
      tail -20 "$PROJECT_DIR/bot.log"
    else
      echo "ログファイルが見つかりません"
    fi
    ;;
    
  *)
    echo "Usage: $0 {start|stop|restart|status|logs}"
    echo ""
    echo "Commands:"
    echo "  start   - Botを起動"
    echo "  stop    - Botを停止"
    echo "  restart - Botを再起動"
    echo "  status  - 実行状況を確認"
    echo "  logs    - ログを表示"
    exit 1
    ;;
esac