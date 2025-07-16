#!/bin/bash

# 管理Webアプリケーション プロセス管理スクリプト
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PID_FILE="$PROJECT_DIR/.admin-web.pid"
LOG_FILE="$PROJECT_DIR/admin-web.log"
PORT=3001

case "$1" in
  "start")
    echo "🚀 管理Webアプリケーション を起動しています..."
    
    # ポート3001を使用している既存プロセスを停止
    echo "🧹 ポート$PORTを使用しているプロセスをクリーンアップ中..."
    lsof -ti :$PORT | xargs -r kill -9 2>/dev/null || true
    sleep 1
    
    # 既存のPIDファイルプロセスをチェック・停止
    if [ -f "$PID_FILE" ]; then
      OLD_PID=$(cat "$PID_FILE")
      if ps -p "$OLD_PID" > /dev/null 2>&1; then
        echo "⚠️  既存の管理Webアプリプロセス (PID: $OLD_PID) を停止中..."
        kill "$OLD_PID"
        sleep 2
      fi
      rm -f "$PID_FILE"
    fi
    
    # 関連プロセスを強制停止（念のため）
    pkill -f "ts-node.*src/web-admin/start" 2>/dev/null || true
    pkill -f "admin:dev" 2>/dev/null || true
    sleep 1
    
    # 新しいプロセスを起動
    cd "$PROJECT_DIR"
    npm run admin:dev > "$LOG_FILE" 2>&1 &
    NEW_PID=$!
    echo "$NEW_PID" > "$PID_FILE"
    
    echo "✅ 管理Webアプリ起動完了 (PID: $NEW_PID)"
    echo "📝 ログファイル: $LOG_FILE"
    echo "🌐 アクセス URL: http://localhost:$PORT"
    echo "🔧 開発環境で実行中"
    ;;
    
  "stop")
    echo "🛑 管理Webアプリケーション を停止しています..."
    
    # ポート3001を使用している全プロセスを停止
    echo "🧹 ポート$PORTを使用しているプロセスを停止中..."
    lsof -ti :$PORT | xargs -r kill 2>/dev/null || true
    sleep 2
    
    # まだ残っている場合は強制終了
    lsof -ti :$PORT | xargs -r kill -9 2>/dev/null || true
    
    if [ -f "$PID_FILE" ]; then
      PID=$(cat "$PID_FILE")
      if ps -p "$PID" > /dev/null 2>&1; then
        echo "⏸️  管理Webアプリプロセス (PID: $PID) を停止中..."
        kill "$PID"
        sleep 2
        
        # まだ動いている場合は強制終了
        if ps -p "$PID" > /dev/null 2>&1; then
          echo "💥 強制終了中..."
          kill -9 "$PID"
        fi
      fi
      rm -f "$PID_FILE"
    fi
    
    # 関連プロセスを強制停止（念のため）
    pkill -f "ts-node.*src/web-admin/start" 2>/dev/null || true
    pkill -f "admin:dev" 2>/dev/null || true
    
    echo "✅ 管理Webアプリ停止完了"
    ;;
    
  "restart")
    echo "🔄 管理Webアプリケーション を再起動しています..."
    "$0" stop
    sleep 2
    "$0" start
    ;;
    
  "status")
    echo "📊 管理Webアプリケーション ステータス:"
    
    echo "🔌 ポート$PORT使用プロセス:"
    lsof -i :$PORT || echo "ポート$PORTを使用しているプロセスはありません"
    
    if [ -f "$PID_FILE" ]; then
      PID=$(cat "$PID_FILE")
      if ps -p "$PID" > /dev/null 2>&1; then
        echo "✅ 管理Webアプリ実行中 (PID: $PID)"
        echo "📊 プロセス詳細:"
        ps -f -p "$PID"
      else
        echo "❌ PIDファイルのプロセスは停止済み (古いPIDファイル削除)"
        rm -f "$PID_FILE"
      fi
    else
      echo "❌ 管理Webアプリ停止中 (PIDファイルなし)"
    fi
    
    echo "📋 関連プロセス一覧:"
    ps aux | grep -E "(ts-node.*src/web-admin|admin:dev)" | grep -v grep || echo "関連プロセスなし"
    ;;
    
  "logs")
    echo "📜 管理Webアプリ ログ (最新20行):"
    if [ -f "$LOG_FILE" ]; then
      tail -20 "$LOG_FILE"
    else
      echo "ログファイルが見つかりません: $LOG_FILE"
    fi
    ;;
    
  "watch")
    echo "👀 管理Webアプリ ログを監視中 (Ctrl+C で終了):"
    if [ -f "$LOG_FILE" ]; then
      tail -f "$LOG_FILE"
    else
      echo "ログファイルが見つかりません: $LOG_FILE"
    fi
    ;;
    
  "clean")
    echo "🧹 ポート$PORTの完全クリーンアップを実行中..."
    lsof -ti :$PORT | xargs -r kill -9 2>/dev/null || true
    pkill -f "ts-node.*src/web-admin" 2>/dev/null || true
    pkill -f "admin:dev" 2>/dev/null || true
    rm -f "$PID_FILE"
    echo "✅ クリーンアップ完了"
    ;;
    
  *)
    echo "Usage: $0 {start|stop|restart|status|logs|watch|clean}"
    echo ""
    echo "管理Webアプリケーション プロセス管理スクリプト"
    echo ""
    echo "Commands:"
    echo "  start   - 管理Webアプリを起動"
    echo "  stop    - 管理Webアプリを停止"
    echo "  restart - 管理Webアプリを再起動"
    echo "  status  - 実行状況を確認"
    echo "  logs    - ログを表示"
    echo "  watch   - ログをリアルタイム監視"
    echo "  clean   - ポート$PORTの完全クリーンアップ"
    exit 1
    ;;
esac