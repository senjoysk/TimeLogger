# Suggested Commands for Development

## 開発コマンド（最重要）
```bash
# TDD開発フロー
npm run test:watch              # テストをウォッチモードで実行
npm test                        # 全テスト実行
npm run test:integration        # 統合テストのみ実行
npm run test:coverage           # カバレッジ確認

# ビルド・実行
npm run build                   # TypeScriptビルド
npm run dev                     # 開発モードで実行
npm run watch                   # ファイル変更監視で自動再起動

# 品質チェック
npm run lint                    # ESLintチェック
npm run lint:fix                # ESLint自動修正
./scripts/test-analysis.sh      # テスト実行と失敗分析（推奨）
```

## デプロイコマンド（必須手順）
```bash
# Staging環境（手動デプロイ）
npm run staging:deploy          # マシン自動復旧機能付きデプロイ
./scripts/staging/deploy-to-staging.sh  # 直接実行も可
npm run staging:logs            # ログ確認
npm run staging:status          # ステータス確認

# Production環境
npm run prod:deploy             # 本番デプロイスクリプト
./scripts/production/deploy.sh timelogger-bitter-resonance-9585
```

## コード品質チェックコマンド
```bash
# Pre-commit相当のチェック
./scripts/code-review/pre-commit-all-checks.sh  # 全品質チェック

# 個別チェック
./scripts/code-review/console-usage-check.sh     # console使用チェック
./scripts/code-review/srp-violation-check.sh     # SRP違反チェック
./scripts/code-review/type-safety-check.sh       # 型安全性チェック
./scripts/code-review/layer-separation-check.sh  # レイヤ分離チェック
./scripts/code-review/todo-comment-check.sh      # TODO/FIXMEチェック
npm run check:database-paths                     # DBパス妥当性チェック
```

## 管理Webアプリケーション
```bash
npm run admin:dev               # 管理Web開発モード起動（http://localhost:3001）
npm run admin:build             # 管理Webビルド
```

## Git操作
```bash
git status                      # 変更状況確認
git add .                       # 全変更をステージング
git commit -m "feat: 機能説明" # コミット（pre-commitフック自動実行）
git push origin develop         # developブランチにプッシュ
```

## データベース操作
```bash
sqlite3 data/app.db             # SQLiteデータベース接続
.schema                         # スキーマ確認
.tables                         # テーブル一覧
.exit                          # 終了
```

## macOS専用コマンド
```bash
# 通知音再生（タスク完了時）
afplay /System/Library/Sounds/Glass.aiff

# プロセス確認
ps aux | grep node              # Node.jsプロセス確認
lsof -i :3000                   # ポート使用確認
```

## トラブルシューティング
```bash
# テスト失敗時
npm run test:sequential         # 順次実行モード（並列問題回避）
npm run test:balanced           # ワーカー数制限モード

# プロセス管理
npm run dev:stop                # 開発サーバー停止
npm run dev:restart             # 開発サーバー再起動
npm run dev:status              # 状態確認

# クリーンアップ
npm run test:cleanup            # テスト用WALファイル削除
rm -rf dist                     # ビルド成果物削除
rm -rf node_modules             # 依存関係削除
npm install                     # 再インストール
```

## 環境セットアップ
```bash
# 初回セットアップ
nvm use                         # Node.jsバージョン切り替え
npm install                     # 依存関係インストール
cp .env.example .env           # 環境変数設定
```