# Darwin (macOS) System Commands

## ファイル・ディレクトリ操作
```bash
ls -la                          # 詳細リスト表示（隠しファイル含む）
ls -lah                         # 人間が読みやすいサイズ表示
find . -name "*.ts"             # ファイル検索
find . -type f -size +1M        # 1MB以上のファイル検索
grep -r "pattern" .             # 再帰的にパターン検索
grep -rn "pattern" .            # 行番号付きで検索
open .                          # Finderで現在のディレクトリを開く
open -a "Visual Studio Code" . # VSCodeで開く
pbcopy < file.txt              # ファイル内容をクリップボードにコピー
pbpaste > file.txt             # クリップボードから貼り付け
```

## プロセス管理
```bash
ps aux | grep node              # Node.jsプロセス確認
kill -9 [PID]                   # プロセス強制終了
killall node                    # 全Node.jsプロセス終了
lsof -i :3000                   # ポート3000使用プロセス確認
lsof -i tcp                    # TCP接続一覧
top                            # プロセスモニタ
htop                           # 改良版プロセスモニタ（要インストール）
```

## ネットワーク
```bash
netstat -an | grep LISTEN       # リスニングポート確認
curl -I https://example.com     # HTTPヘッダー確認
curl -X POST -d '{}' url        # POSTリクエスト
ping -c 4 google.com           # ping実行（4回）
traceroute google.com          # 経路追跡
ifconfig                       # ネットワーク設定確認
```

## Git操作
```bash
git status                      # 状態確認
git diff                        # 変更差分確認
git log --oneline -10           # 最近10件のコミット
git branch -a                   # 全ブランチ表示
git stash                       # 変更を一時保存
git stash pop                   # 一時保存を復元
git worktree add ../feature feature-branch  # worktree作成
```

## SQLite操作
```bash
sqlite3 data/app.db             # データベース接続
.tables                         # テーブル一覧
.schema [table_name]            # スキーマ確認
.mode column                    # カラム表示モード
.headers on                     # ヘッダー表示
SELECT * FROM table LIMIT 10;   # データ確認
.exit                          # 終了
```

## macOS固有コマンド
```bash
# 通知音
afplay /System/Library/Sounds/Glass.aiff
say "Task completed"            # 音声読み上げ

# システム情報
sw_vers                        # macOSバージョン
system_profiler SPSoftwareDataType  # 詳細システム情報
sysctl -n machdep.cpu.brand_string  # CPU情報

# ファイル属性
xattr -l file.txt              # 拡張属性表示
xattr -c file.txt              # 拡張属性削除（ダウンロード警告除去）

# スクリーンショット
screencapture -i screenshot.png  # 選択範囲スクリーンショット
screencapture -T 3 screenshot.png  # 3秒後に全画面スクリーンショット

# プロセス優先度
nice -n 10 command             # 低優先度で実行
renice -n -5 -p [PID]          # プロセス優先度変更

# ディスク使用量
df -h                          # ディスク使用量（人間が読みやすい形式）
du -sh *                       # 各ディレクトリのサイズ
du -sh * | sort -h             # サイズでソート
```

## 環境変数
```bash
echo $PATH                     # PATH確認
export VAR=value               # 環境変数設定
env | grep NODE                # NODE関連の環境変数確認
source ~/.zshrc                # 設定ファイル再読み込み（zsh）
source ~/.bash_profile         # 設定ファイル再読み込み（bash）
```

## パーミッション
```bash
chmod +x script.sh             # 実行権限付与
chmod 755 file                 # rwxr-xr-x
chmod -R 644 directory         # 再帰的に権限変更
chown user:group file          # 所有者変更
```

## アーカイブ・圧縮
```bash
tar -czf archive.tar.gz dir/   # tar.gz作成
tar -xzf archive.tar.gz        # tar.gz展開
zip -r archive.zip dir/        # zip作成
unzip archive.zip              # zip展開
```

## トラブルシューティング
```bash
# DNSキャッシュクリア
sudo dscacheutil -flushcache

# 強制再起動が必要な場合
sudo shutdown -r now

# システムログ確認
log show --last 1h | grep error

# アプリケーションの強制終了
osascript -e 'quit app "アプリ名"'
```