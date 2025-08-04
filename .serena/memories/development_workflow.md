# Development Workflow

## TDD開発フロー（必須遵守）

### 1. 開発開始前の準備
```bash
# Node.js環境確認
nvm use                         # .nvmrc記載のNode.js v20使用

# 最新コード取得
git pull origin develop

# 依存関係更新
npm install

# テストウォッチモード起動
npm run test:watch
```

### 2. TDDサイクルの実施

#### Step 1: 🔴 Red Phase（5-10分）
1. TODOリスト作成（実装する機能を小さなタスクに分解）
2. テストファイル作成: `src/__tests__/[機能]/[ファイル名].test.ts`
3. 最初の失敗するテストを1つ書く
4. テスト実行して赤い状態を確認
5. インターフェース定義（必要最小限）

#### Step 2: 🟢 Green Phase（10-15分）
1. テストを通す最小限の実装
2. 仮実装（ハードコード）でもOK
3. コピペでもOK（後でDRY）
4. テストが緑になることを確認

#### Step 3: ♻️ Refactor Phase（15-20分）
1. 重複コード除去（DRY原則）
2. 命名改善（より明確な名前）
3. 構造改善（デザインパターン適用）
4. 各変更後にテストが通ることを確認
5. 日本語JSDocコメント追加

### 3. 実装パターン別フロー

#### 新コマンド追加
1. `src/__tests__/handlers/[command]Handler.test.ts` 作成
2. ICommandHandlerインターフェース実装
3. ActivityLoggingIntegrationへの統合
4. ヘルプメッセージ更新

#### 新サービス追加
1. インターフェース定義（src/interfaces/）
2. テスト作成（モック使用）
3. サービス実装
4. 依存性注入設定

#### データベース変更
1. マイグレーションファイル作成: `src/database/migrations/00X_[説明].sql`
2. newSchema.sql更新
3. リポジトリテスト作成
4. リポジトリ実装

### 4. 品質チェック

#### ローカル確認（コミット前必須）
```bash
# ビルド確認
npm run build

# テスト実行（推奨：失敗分析付き）
./scripts/test-analysis.sh

# 品質チェック
./scripts/code-review/pre-commit-all-checks.sh
```

#### チェック項目
- [ ] TypeScriptビルド成功
- [ ] 全テスト成功
- [ ] console.log/error未使用
- [ ] any型未使用（または`// ALLOW_ANY`）
- [ ] TODO/FIXMEコメント削除
- [ ] SRP違反なし（500行以下）
- [ ] レイヤ分離遵守

### 5. コミット・プッシュ

```bash
# ステージング
git add .

# コミット（pre-commitフック自動実行）
git commit -m "feat: 機能説明"

# プッシュ
git push origin develop
```

### 6. Stagingデプロイ（手動）

```bash
# Stagingデプロイ（マシン自動復旧機能付き）
npm run staging:deploy

# 動作確認
npm run staging:logs
npm run staging:test
```

### 7. 本番デプロイ

1. Staging検証完了確認
2. developからmainへのPR作成
3. マージ後、自動デプロイ実行
4. 本番環境確認

## トラブルシューティング

### テスト失敗時
```bash
# 順次実行で並列問題回避
npm run test:sequential

# 特定テストのみ実行
npm test -- [テストファイルパス]

# 詳細ログ確認
cat test-reports/test-failures-summary.txt
```

### ビルドエラー時
```bash
# クリーンビルド
rm -rf dist
npm run build

# 型チェックのみ
npx tsc --noEmit
```

### Pre-commitフック失敗時
```bash
# 個別チェック実行で原因特定
./scripts/code-review/console-usage-check.sh
./scripts/code-review/type-safety-check.sh
./scripts/code-review/layer-separation-check.sh
```

## 重要な原則
1. **テストなしでコードを書かない**
2. **失敗するテストを確認してから実装**
3. **一度に一つのことだけ**
4. **明白な実装を心がける**
5. **TODOリストで進捗管理**