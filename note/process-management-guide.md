# TimeLogger Bot プロセス管理ガイド

## 問題の背景
開発中に複数のBotプロセスが同時実行され、Discordメッセージの重複送信が発生する問題が頻発していました。

## 解決策

### 1. bot-manager.sh スクリプト
専用のプロセス管理スクリプトを作成し、確実な単一プロセス管理を実現。

**場所**: `scripts/bot-manager.sh`

**機能**:
- PIDファイルによるプロセス追跡
- 起動前の既存プロセス確認・停止
- 関連プロセスの完全クリーンアップ
- 状態確認とログ表示

### 2. npm scripts の追加
package.jsonに管理コマンドを追加し、簡単にアクセス可能に。

```json
{
  "bot:start": "./scripts/bot-manager.sh start",
  "bot:stop": "./scripts/bot-manager.sh stop", 
  "bot:restart": "./scripts/bot-manager.sh restart",
  "bot:status": "./scripts/bot-manager.sh status",
  "bot:logs": "./scripts/bot-manager.sh logs"
}
```

## 使用方法

### 基本コマンド
```bash
# Bot管理スクリプト直接実行
./scripts/bot-manager.sh start
./scripts/bot-manager.sh stop
./scripts/bot-manager.sh status

# npm経由での実行
npm run bot:start
npm run bot:stop
npm run bot:status
npm run bot:logs
```

### 開発時の推奨ワークフロー

1. **開発開始時**:
   ```bash
   npm run bot:stop    # 既存プロセス停止
   npm run build       # ビルド
   npm run bot:start   # 新プロセス起動
   ```

2. **修正後の再起動**:
   ```bash
   npm run build       # ビルド
   npm run bot:restart # 再起動
   ```

3. **状況確認**:
   ```bash
   npm run bot:status  # プロセス状況確認
   npm run bot:logs    # ログ確認
   ```

## プロセス重複防止の仕組み

### 1. PIDファイル管理
- `.bot.pid`ファイルで実行中プロセスを追跡
- 起動時に既存PIDをチェック・停止
- 停止時にPIDファイルを削除

### 2. 完全クリーンアップ
起動・停止時に以下のパターンでプロセスを検索・停止:
- `TimeLogger`を含むプロセス
- `node.*dist/index\.js`パターン
- `ts-node.*src/index`パターン

### 3. 強制終了機能
- 通常のkillで停止しない場合は`kill -9`で強制終了
- 複数の停止方法を組み合わせて確実性向上

## Claude Code開発時の注意点

### 必須の手順
1. **プロセス起動前**: 必ず既存プロセスの停止確認
2. **プロセス起動後**: 単一プロセス実行の確認
3. **修正後**: 古いプロセスの停止 → ビルド → 新プロセス起動

### 推奨コマンド
```bash
# Claude Codeで安全にBotを起動する手順
npm run bot:stop && npm run build && npm run bot:start
```

### 状況確認
```bash
# プロセス状況の確認
npm run bot:status

# ログの確認  
npm run bot:logs
```

## トラブルシューティング

### 複数プロセスが検出された場合
```bash
# 全プロセス強制停止
npm run bot:stop
# または直接
pkill -f "TimeLogger"
pkill -f "node.*dist/index\.js"
pkill -f "ts-node.*src/index"

# その後新規起動
npm run bot:start
```

### PIDファイルの不整合
```bash
# PIDファイルを手動削除
rm -f .bot.pid
# 再起動
npm run bot:start
```

## 品質保証

✅ **単一プロセス保証**: PIDファイル + プロセス検索で重複防止  
✅ **確実な停止**: 複数停止方法の組み合わせ  
✅ **状況の可視化**: status/logsコマンドで現状把握  
✅ **開発効率**: 簡単なnpmコマンドでアクセス  

作成日: 2025-06-26