#!/bin/bash

# 管理Webアプリケーション プロセス管理スクリプト
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PID_FILE="$PROJECT_DIR/.admin-web.pid"
NODE_PID_FILE="$PROJECT_DIR/.admin-node.pid"
LOG_FILE="$PROJECT_DIR/admin-web.log"
PORT=3001

# プロセス検出関数
find_admin_processes() {
  # npm wrapperプロセスとNode.jsプロセスの両方を検出
  echo "🔍 Admin関連プロセスを検索中..."
  
  # npm run admin:dev プロセス
  NPM_PIDS=$(pgrep -f "npm run admin:dev\|admin:dev" 2>/dev/null || true)
  
  # Node.js プロセス（ts-node src/web-admin/start.ts）
  NODE_PIDS=$(pgrep -f "ts-node.*src/web-admin/start" 2>/dev/null || true)
  
  # ポート3001を使用しているプロセス
  PORT_PIDS=$(lsof -ti :$PORT 2>/dev/null || true)
  
  echo "NPM processes: $NPM_PIDS"
  echo "Node processes: $NODE_PIDS"
  echo "Port $PORT processes: $PORT_PIDS"
}

# プロセスツリー終了関数
terminate_process_tree() {
  local pid=$1
  local signal=${2:-TERM}
  
  if [ -z "$pid" ]; then
    return
  fi
  
  echo "🔄 プロセス $pid とその子プロセスを終了中 (SIG$signal)..."
  
  # 子プロセスを取得
  local children=$(pgrep -P "$pid" 2>/dev/null || true)
  
  # 子プロセスを再帰的に終了
  for child in $children; do
    terminate_process_tree "$child" "$signal"
  done
  
  # メインプロセスを終了
  if ps -p "$pid" > /dev/null 2>&1; then
    kill -"$signal" "$pid" 2>/dev/null || true
  fi
}

# 段階的プロセス終了関数
graceful_shutdown() {
  local pids="$1"
  
  if [ -z "$pids" ]; then
    return
  fi
  
  echo "🛑 段階的プロセス終了を開始..."
  
  # Phase 1: SIGTERM で優雅な終了を試行
  for pid in $pids; do
    if ps -p "$pid" > /dev/null 2>&1; then
      echo "📤 SIGTERM送信: PID $pid"
      terminate_process_tree "$pid" "TERM"
    fi
  done
  
  sleep 3
  
  # Phase 2: まだ残っているプロセスをSIGKILLで強制終了
  for pid in $pids; do
    if ps -p "$pid" > /dev/null 2>&1; then
      echo "💥 SIGKILL送信: PID $pid"
      terminate_process_tree "$pid" "KILL"
    fi
  done
  
  sleep 1
}

case "$1" in
  "start")
    echo "🚀 管理Webアプリケーション を起動しています..."
    
    # 既存プロセスの完全クリーンアップ
    find_admin_processes
    ALL_PIDS="$NPM_PIDS $NODE_PIDS $PORT_PIDS"
    
    if [ -n "$ALL_PIDS" ]; then
      echo "⚠️  既存のAdmin関連プロセスを停止中..."
      graceful_shutdown "$ALL_PIDS"
    fi
    
    # PIDファイルのクリーンアップ
    rm -f "$PID_FILE" "$NODE_PID_FILE"
    
    # ポートの最終確認
    echo "🧹 ポート$PORTを使用しているプロセスを最終クリーンアップ中..."
    lsof -ti :$PORT | xargs -r kill -9 2>/dev/null || true
    sleep 1
    
    # 新しいプロセスを起動
    cd "$PROJECT_DIR"
    npm run admin:dev > "$LOG_FILE" 2>&1 &
    NEW_NPM_PID=$!
    echo "$NEW_NPM_PID" > "$PID_FILE"
    
    # Node.jsプロセスの検出を待つ
    echo "⏳ Node.jsプロセスの起動を待機中..."
    for i in {1..10}; do
      sleep 1
      NEW_NODE_PID=$(pgrep -f "ts-node.*src/web-admin/start" | head -1)
      if [ -n "$NEW_NODE_PID" ]; then
        echo "$NEW_NODE_PID" > "$NODE_PID_FILE"
        break
      fi
    done
    
    echo "✅ 管理Webアプリ起動完了"
    echo "📊 NPM Wrapper PID: $NEW_NPM_PID"
    if [ -n "$NEW_NODE_PID" ]; then
      echo "📊 Node.js Process PID: $NEW_NODE_PID"
    fi
    echo "📝 ログファイル: $LOG_FILE"
    echo "🌐 アクセス URL: http://localhost:$PORT"
    echo "🔧 開発環境で実行中"
    ;;
    
  "stop")
    echo "🛑 管理Webアプリケーション を停止しています..."
    
    # 現在実行中のすべてのAdmin関連プロセスを検出
    find_admin_processes
    ALL_PIDS="$NPM_PIDS $NODE_PIDS $PORT_PIDS"
    
    # PIDファイルからの取得も試行
    FILE_PIDS=""
    if [ -f "$PID_FILE" ]; then
      FILE_PIDS="$FILE_PIDS $(cat "$PID_FILE")"
    fi
    if [ -f "$NODE_PID_FILE" ]; then
      FILE_PIDS="$FILE_PIDS $(cat "$NODE_PID_FILE")"
    fi
    
    # すべてのPIDをマージ
    ALL_SHUTDOWN_PIDS="$ALL_PIDS $FILE_PIDS"
    
    if [ -n "$ALL_SHUTDOWN_PIDS" ]; then
      echo "🔍 停止対象プロセス: $ALL_SHUTDOWN_PIDS"
      graceful_shutdown "$ALL_SHUTDOWN_PIDS"
    else
      echo "ℹ️ 停止対象のプロセスが見つかりません"
    fi
    
    # ポートの最終クリーンアップ
    echo "🧹 ポート$PORTを使用しているプロセスを最終クリーンアップ中..."
    lsof -ti :$PORT | xargs -r kill -9 2>/dev/null || true
    sleep 1
    
    # PIDファイルのクリーンアップ
    rm -f "$PID_FILE" "$NODE_PID_FILE"
    
    # 停止確認
    find_admin_processes
    if [ -n "$NPM_PIDS$NODE_PIDS$PORT_PIDS" ]; then
      echo "⚠️ まだ動作中のプロセスがあります:"
      echo "NPM: $NPM_PIDS | Node: $NODE_PIDS | Port: $PORT_PIDS"
    else
      echo "✅ すべてのAdmin関連プロセスが停止しました"
    fi
    
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
    
    # プロセス検出の実行
    find_admin_processes
    
    # PIDファイルの確認
    echo ""
    echo "📁 PIDファイル状況:"
    if [ -f "$PID_FILE" ]; then
      NPM_FILE_PID=$(cat "$PID_FILE")
      if ps -p "$NPM_FILE_PID" > /dev/null 2>&1; then
        echo "✅ NPM Wrapper実行中 (PID: $NPM_FILE_PID)"
        echo "📊 NPM Wrapper詳細:"
        ps -f -p "$NPM_FILE_PID"
      else
        echo "❌ NPM Wrapper停止済み (古いPIDファイル削除)"
        rm -f "$PID_FILE"
      fi
    else
      echo "❌ NPM PIDファイルなし"
    fi
    
    if [ -f "$NODE_PID_FILE" ]; then
      NODE_FILE_PID=$(cat "$NODE_PID_FILE")
      if ps -p "$NODE_FILE_PID" > /dev/null 2>&1; then
        echo "✅ Node.js Process実行中 (PID: $NODE_FILE_PID)"
        echo "📊 Node.js Process詳細:"
        ps -f -p "$NODE_FILE_PID"
      else
        echo "❌ Node.js Process停止済み (古いPIDファイル削除)"
        rm -f "$NODE_PID_FILE"
      fi
    else
      echo "❌ Node.js PIDファイルなし"
    fi
    
    # プロセス検索結果
    echo ""
    echo "🔍 実際のプロセス検索結果:"
    if [ -n "$NPM_PIDS" ]; then
      echo "✅ NPM processes: $NPM_PIDS"
      for pid in $NPM_PIDS; do
        ps -f -p "$pid"
      done
    else
      echo "❌ NPM processなし"
    fi
    
    if [ -n "$NODE_PIDS" ]; then
      echo "✅ Node.js processes: $NODE_PIDS"
      for pid in $NODE_PIDS; do
        ps -f -p "$pid"
      done
    else
      echo "❌ Node.js processなし"
    fi
    
    if [ -n "$PORT_PIDS" ]; then
      echo "✅ Port $PORT processes: $PORT_PIDS"
      for pid in $PORT_PIDS; do
        ps -f -p "$pid" 2>/dev/null || true
      done
    else
      echo "❌ Port $PORT processなし"
    fi
    
    # ポート使用状況
    echo ""
    echo "🔌 ポート使用状況:"
    lsof -i :$PORT || echo "ポート$PORTは使用されていません"
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