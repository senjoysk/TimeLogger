#!/bin/bash

# 開発環境用 Bot プロセス管理スクリプト
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PID_FILE="$PROJECT_DIR/.bot-dev.pid"
LOG_FILE="$PROJECT_DIR/bot-dev.log"

case "$1" in
  "start")
    echo "🚀 TimeLogger Bot (開発環境) を起動しています..."
    
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
    pkill -f "ts-node.*src/index" 2>/dev/null || true
    pkill -f "NODE_ENV=development.*ts-node" 2>/dev/null || true
    sleep 1
    
    # 新しいプロセスを起動（開発環境）
    cd "$PROJECT_DIR"
    npm run dev > "$LOG_FILE" 2>&1 &
    NEW_PID=$!
    echo "$NEW_PID" > "$PID_FILE"
    
    echo "✅ Bot起動完了 (PID: $NEW_PID)"
    echo "📝 ログファイル: $LOG_FILE"
    echo "🔧 開発環境で実行中 (NODE_ENV=development)"
    ;;
    
  "stop")
    echo "🛑 TimeLogger Bot (開発環境) を停止しています..."
    
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
    pkill -f "ts-node.*src/index" 2>/dev/null || true
    pkill -f "NODE_ENV=development.*ts-node" 2>/dev/null || true
    
    echo "✅ Bot停止完了"
    ;;
    
  "restart")
    echo "🔄 TimeLogger Bot (開発環境) を再起動しています..."
    "$0" stop
    sleep 2
    "$0" start
    ;;
    
  "status")
    echo "📊 TimeLogger Bot (開発環境) ステータス:"
    
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
    ps aux | grep -E "(ts-node.*src/index|NODE_ENV=development.*ts-node)" | grep -v grep || echo "関連プロセスなし"
    ;;
    
  "logs")
    echo "📜 Bot ログ (最新20行):"
    if [ -f "$LOG_FILE" ]; then
      tail -20 "$LOG_FILE"
    else
      echo "ログファイルが見つかりません: $LOG_FILE"
    fi
    ;;
    
  "watch")
    echo "👀 Bot ログを監視中 (Ctrl+C で終了):"
    if [ -f "$LOG_FILE" ]; then
      tail -f "$LOG_FILE"
    else
      echo "ログファイルが見つかりません: $LOG_FILE"
    fi
    ;;
    
  *)
    echo "Usage: $0 {start|stop|restart|status|logs|watch}"
    echo ""
    echo "開発環境用 Bot 管理スクリプト"
    echo ""
    echo "Commands:"
    echo "  start   - Botを開発モードで起動"
    echo "  stop    - Botを停止"
    echo "  restart - Botを再起動"
    echo "  status  - 実行状況を確認"
    echo "  logs    - ログを表示"
    echo "  watch   - ログをリアルタイム監視"
    exit 1
    ;;
esac