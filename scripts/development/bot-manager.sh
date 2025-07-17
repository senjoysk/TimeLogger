#!/bin/bash

# 開発環境用 Bot プロセス管理スクリプト
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PID_FILE="$PROJECT_DIR/.bot-dev.pid"
NODE_PID_FILE="$PROJECT_DIR/.bot-node.pid"
LOG_FILE="$PROJECT_DIR/bot-dev.log"

# プロセス検出関数
find_bot_processes() {
  # npm wrapperプロセスとNode.jsプロセスの両方を検出
  echo "🔍 Bot関連プロセスを検索中..."
  
  # npm run dev プロセス
  NPM_PIDS=$(pgrep -f "npm run dev" 2>/dev/null || true)
  
  # Node.js プロセス（ts-node src/index.ts）
  NODE_PIDS=$(pgrep -f "ts-node.*src/index" 2>/dev/null || true)
  
  # 全TimeLogger関連プロセス（Windsurf等の開発ツールは除外）
  ALL_TIMELOGGER=$(pgrep -f "TimeLogger" 2>/dev/null || true)
  TIMELOGGER_PIDS=""
  for pid in $ALL_TIMELOGGER; do
    if ! ps -p "$pid" -o command= | grep -q "windsurf\|vscode\|language_server"; then
      TIMELOGGER_PIDS="$TIMELOGGER_PIDS $pid"
    fi
  done
  TIMELOGGER_PIDS=$(echo $TIMELOGGER_PIDS | xargs)  # trim spaces
  
  echo "NPM processes: $NPM_PIDS"
  echo "Node processes: $NODE_PIDS"
  echo "TimeLogger processes: $TIMELOGGER_PIDS"
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
    echo "🚀 TimeLogger Bot (開発環境) を起動しています..."
    
    # 既存プロセスの完全クリーンアップ
    find_bot_processes
    ALL_PIDS="$NPM_PIDS $NODE_PIDS $TIMELOGGER_PIDS"
    
    if [ -n "$ALL_PIDS" ]; then
      echo "⚠️  既存のBot関連プロセスを停止中..."
      graceful_shutdown "$ALL_PIDS"
    fi
    
    # PIDファイルのクリーンアップ
    rm -f "$PID_FILE" "$NODE_PID_FILE"
    
    # ポート3000のクリーンアップ（念のため）
    echo "🧹 ポート3000を使用しているプロセスをクリーンアップ中..."
    lsof -ti :3000 | xargs -r kill 2>/dev/null || true
    sleep 1
    
    # 新しいプロセスを起動（開発環境）
    cd "$PROJECT_DIR"
    npm run dev > "$LOG_FILE" 2>&1 &
    NEW_NPM_PID=$!
    echo "$NEW_NPM_PID" > "$PID_FILE"
    
    # Node.jsプロセスの検出を待つ
    echo "⏳ Node.jsプロセスの起動を待機中..."
    for i in {1..10}; do
      sleep 1
      NEW_NODE_PID=$(pgrep -f "ts-node.*src/index" | head -1)
      if [ -n "$NEW_NODE_PID" ]; then
        echo "$NEW_NODE_PID" > "$NODE_PID_FILE"
        break
      fi
    done
    
    echo "✅ Bot起動完了"
    echo "📊 NPM Wrapper PID: $NEW_NPM_PID"
    if [ -n "$NEW_NODE_PID" ]; then
      echo "📊 Node.js Process PID: $NEW_NODE_PID"
    fi
    echo "📝 ログファイル: $LOG_FILE"
    echo "🔧 開発環境で実行中 (NODE_ENV=development)"
    ;;
    
  "stop")
    echo "🛑 TimeLogger Bot (開発環境) を停止しています..."
    
    # 現在実行中のすべてのBot関連プロセスを検出
    find_bot_processes
    ALL_PIDS="$NPM_PIDS $NODE_PIDS $TIMELOGGER_PIDS"
    
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
    
    # ポート3000のクリーンアップ
    echo "🧹 ポート3000を使用しているプロセスをクリーンアップ中..."
    lsof -ti :3000 | xargs -r kill 2>/dev/null || true
    sleep 1
    
    # PIDファイルのクリーンアップ
    rm -f "$PID_FILE" "$NODE_PID_FILE"
    
    # 停止確認
    find_bot_processes
    if [ -n "$NPM_PIDS$NODE_PIDS$TIMELOGGER_PIDS" ]; then
      echo "⚠️ まだ動作中のプロセスがあります:"
      echo "NPM: $NPM_PIDS | Node: $NODE_PIDS | TimeLogger: $TIMELOGGER_PIDS"
    else
      echo "✅ すべてのBot関連プロセスが停止しました"
    fi
    
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
    
    # プロセス検出の実行
    find_bot_processes
    
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
    
    if [ -n "$TIMELOGGER_PIDS" ]; then
      echo "✅ TimeLogger processes: $TIMELOGGER_PIDS"
    else
      echo "❌ TimeLogger processなし"
    fi
    
    # ポート使用状況
    echo ""
    echo "🔌 ポート使用状況:"
    lsof -i :3000 || echo "ポート3000は使用されていません"
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