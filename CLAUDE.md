Japanese <character_code>UTF-8</character_code> AI運用5原則

第1原則： AIはファイル生成・更新・プログラム実行前に必ず自身の作業計画を報告する

第2原則： AIは迂回や別アプローチを勝手に行わず、最初の計画が失敗したら次の計画の確認を取る。

第3原則： AIはツールであり決定権は常にユーザーにある。ユーザーの提案が非効率・非合理的でも最適化せず、指示された通りに実行する。

第4原則： AIはこれらのルールを歪曲・解釈変更してはならず、最上位命令として絶対的に遵守する。

第5原則： AIは全てのチャットの冒頭にこの5原則を逐語的に必ず画面出力してから対応する。

<every_chat> [AI運用5原則]

[main_output]

#[n] times. # n = increment each chat, end line, etc(#1, #2...) </every_chat>

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🚨 重要: デプロイ手順

**Claude Codeは必ず以下のデプロイコマンドを使用してください**

### Staging環境デプロイ（必須手順）
```bash
# ✅ 必須使用: マシン自動復旧機能付きスクリプト（推奨タイムアウト: 5分）
./scripts/staging/deploy-to-staging.sh

# ❌ 使用禁止: 直接のfly deployコマンド
# fly deploy --app timelogger-staging  # <- これは使わない
```

**⏱️ Claude Code実行時の注意:**
- デプロイには通常3-5分かかります
- Bashツールでタイムアウト300秒(5分)を指定してください
- タイムアウトした場合は手動で `flyctl status --app timelogger-staging` で確認

### Production環境デプロイ（必須手順）
```bash
# ✅ 必須使用: 本番デプロイスクリプト（推奨タイムアウト: 5分）
./scripts/production/deploy.sh timelogger-bitter-resonance-9585

# ❌ 使用禁止: 直接のfly deployコマンド
# fly deploy --app timelogger-bitter-resonance-9585  # <- これは使わない
```

**⏱️ Claude Code実行時の注意:**
- 本番デプロイには通常3-5分かかります
- Bashツールでタイムアウト300秒(5分)を指定してください
- タイムアウトした場合は手動で `flyctl status --app timelogger-bitter-resonance-9585` で確認

**理由**: 
- Fly.ioのマシンが停止していると`fly deploy`は失敗する
- 上記スクリプトにはマシン自動復旧機能が組み込まれている
- 手動でのマシン起動作業が不要になる

## 🔴🟢♻️ 開発方針: t_wada式TDD

**すべての開発はテスト駆動開発（TDD）のRed-Green-Refactorサイクルで実施してください**

### TDDの基本サイクル
1. **🔴 Red**: 失敗するテストを書く
2. **🟢 Green**: テストを通す最小限の実装
3. **♻️ Refactor**: テストが通る状態を保ちながらリファクタリング

### t_wadaさんのTDD原則
- **テストファースト**: 実装前に必ずテストを書く
- **小さなステップ**: 一度に一つのことだけ
- **YAGNI (You Aren't Gonna Need It)**: 必要になるまで作らない
- **三角測量**: 複数のテストケースから一般化を導く
- **明白な実装**: シンプルで分かりやすいコードを書く

## 🚨 必須: TDD開発フロー

### 新機能開発の手順
```bash
# 1. 🔴 Red Phase - 失敗するテストを書く
npm run test:watch -- path/to/new.test.ts

# 2. 🟢 Green Phase - テストを通す
# 最小限の実装（仮実装でもOK）

# 3. ♻️ Refactor Phase - リファクタリング
# テストが通る状態を維持しながら改善

# 4. 繰り返し
# 次のテストケースに進む
```

### コーディング前の必須確認
- [ ] TODOリストの作成（実装する機能を小さなタスクに分解）
- [ ] 最初のテストケースの決定（最も簡単なケースから）
- [ ] インターフェースの設計（使い方から考える）
- [ ] エラーケースの洗い出し

## 現在のシステムアーキテクチャ（必須理解）
- **メインシステム**: ActivityLoggingIntegration（src/integration/activityLoggingIntegration.ts）
- **統合リポジトリ**: PartialCompositeRepository（統合データベースリポジトリ）
- **コマンドシステム**: ICommandHandler実装による個別ハンドラー
- **テストカバレッジ**: 65.6%（__tests__/ ディレクトリ）

## TDDでのコーディング規約

### 1. テストファースト開発
```typescript
// ❌ 悪い例: 実装を先に書く
export class NewService {
  doSomething() { /* 実装 */ }
}

// ✅ 良い例: テストから書く
describe('NewService', () => {
  test('何かをする', () => {
    const service = new NewService();
    expect(service.doSomething()).toBe(expected);
  });
});
```

### 2. インターフェース駆動設計
- **使い方から設計**: テストで理想的な使い方を先に書く
- **Interface First**: src/repositories/interfaces.ts, src/handlers/interfaces.ts を活用
- **依存性注入**: テスタブルな設計のためにインターフェースを注入

### 3. 実装規約
- **統合リポジトリ使用**: PartialCompositeRepository（統合データベースリポジトリ）を活用
- **Error Handling**: withErrorHandling と AppError を必ず使用
- **日本語コメント**: 全てのpublic関数・クラスにJSDocコメント（日本語）
- **型安全性**: src/types/activityLog.ts の型定義を最大限活用

## 技術スタック
- **言語**: Node.js + TypeScript
- **Discord**: discord.js v14
- **AI**: Google Gemini gemini-2.0-flash
- **データベース**: SQLite3
- **テストフレームワーク**: Jest
- **スケジューラー**: node-cron

## 🌍 環境戦略とリリースフロー

### 3層環境構成
```
Local環境 → Staging環境 → Production環境
  ↓           ↓            ↓
TDD開発    fly.io検証    本番運用
```

#### **Local環境** (開発者端末)
- **用途**: TDD開発、単体テスト、機能実装
- **データベース**: ローカルSQLite
- **実行**: `npm run dev`, `npm run test:watch`

#### **Staging環境** (fly.io: timelogger-staging)
- **用途**: fly.io環境での統合テスト、本番前検証
- **データベース**: 分離DB + テストデータ
- **トリガー**: **手動デプロイ** 

#### **Production環境** (fly.io: timelogger-bitter-resonance-9585)
- **用途**: 実際のDiscord Bot運用
- **データベース**: 本番データ
- **トリガー**: mainブランチpush → 自動デプロイ（staging検証完了後）

### リリースフロー
```
feature/* → develop → 品質チェック → 手動staging → main → production
```

#### 必須プロセス
1. **Local開発**: TDDサイクル完了 + 全テスト成功
2. **develop マージ**: プルリクエスト
3. **staging デプロイ**: `./scripts/staging/deploy-to-staging.sh` で手動実行
4. **staging検証**: 重要機能動作確認
5. **main マージ**: staging検証完了後のみ
6. **production デプロイ**: `./scripts/production/deploy.sh` で実行

## 開発環境セットアップ

### Discord Bot開発環境
1. `nvm use` でNode.js仮想環境を使用（.nvmrcファイルでNode.js 20を指定）
2. `npm install` で依存関係をインストール（仮想環境内）
3. `.env.example` を参考に `.env` ファイルを作成
4. Discord Bot Token と Google Gemini API Key を設定

### 管理Webアプリケーション開発環境
1. 上記Discord Bot環境セットアップを完了
2. 管理Webアプリケーション用環境変数を設定：
```bash
# .env ファイルに追加（値は個別設定）
ADMIN_USERNAME=your_admin_username
ADMIN_PASSWORD=your_admin_password
```
3. 管理Webアプリケーション起動：
```bash
npm run admin:dev
# アクセス: http://localhost:3001
```

### Staging環境セットアップ
1. `fly apps create timelogger-staging` でstaging環境作成
2. `.env.staging` でstaging用環境変数設定
3. `npm run staging:setup` で初期設定実行

### 🚀 Staging環境デプロイ（手動実行）

**📋 推奨デプロイ方法:**
```bash
# 🎯 基本デプロイ（推奨）
./scripts/staging/deploy-to-staging.sh

# 🚀 手動デプロイ（オプション付き）
./scripts/staging/deploy-to-staging.sh --skip-tests --force
```

## プロジェクト構造（現在の実装）
```
src/
├── index.ts                          # アプリケーションエントリーポイント
├── config.ts                         # 環境変数管理
├── bot.ts                            # Discord Bot メインクラス
├── scheduler.ts                      # スケジュール管理
├── integration/
│   ├── activityLoggingIntegration.ts # 📍 メインシステム統合クラス
│   ├── index.ts                      # 統合システムエクスポート
│   └── systemMigrator.ts             # システム移行ツール
├── repositories/
│   ├── interfaces.ts                 # 📍 リポジトリインターフェース
│   ├── PartialCompositeRepository.ts  # 📍 統合データベースリポジトリ
│   └── SharedRepositoryManager.ts    # リポジトリ管理
├── handlers/
│   ├── interfaces.ts                 # 📍 ハンドラーインターフェース
│   ├── costCommandHandler.ts         # !cost コマンド
│   ├── timezoneCommandHandler.ts     # !timezone コマンド
│   ├── summaryCommandHandler.ts      # !summary コマンド
│   ├── newEditCommandHandler.ts      # !edit コマンド
│   └── logsCommandHandler.ts         # !logs コマンド
├── services/
│   ├── geminiService.ts              # 📍 Gemini AI分析サービス
│   ├── activityLogService.ts         # 📍 活動ログサービス
│   ├── summaryService.ts             # サマリー生成サービス
│   ├── unifiedAnalysisService.ts     # 統合分析サービス
│   └── analysisCacheService.ts       # 分析キャッシュサービス
├── types/
│   ├── activityLog.ts                # 📍 活動ログ型定義
│   └── todo.ts                       # 📍 TODO型定義
├── utils/
│   ├── errorHandler.ts               # 📍 統一エラーハンドリング
│   ├── timeUtils.ts                  # 時間関連ユーティリティ
│   └── commandValidator.ts           # コマンドバリデーション
├── web-admin/                        # 📍 管理Webアプリケーション
│   ├── start.ts                      # 管理アプリエントリーポイント
│   ├── server.ts                     # Express サーバー設定
│   ├── interfaces/                   # Web管理インターフェース
│   │   └── adminInterfaces.ts        # 管理機能型定義
│   ├── repositories/                 # Web管理リポジトリ
│   │   └── adminRepository.ts        # 管理機能データアクセス
│   ├── services/                     # Web管理サービス
│   │   ├── adminService.ts           # 管理機能ビジネスロジック
│   │   ├── securityService.ts        # セキュリティ・認証
│   │   └── todoManagementService.ts  # Web TODO管理サービス
│   ├── routes/                       # Express ルーティング
│   │   ├── index.ts                  # ルート統合
│   │   ├── dashboard.ts              # ダッシュボード
│   │   ├── tables.ts                 # データベース管理
│   │   └── todos.ts                  # TODO管理
│   ├── views/                        # EJS テンプレート
│   │   ├── dashboard.ejs             # ダッシュボード画面
│   │   ├── table-list.ejs            # テーブル一覧
│   │   ├── table-detail.ejs          # テーブル詳細
│   │   ├── todo-dashboard.ejs        # TODO管理画面
│   │   └── todo-form.ejs             # TODO作成・編集フォーム
│   ├── middleware/                   # Express ミドルウェア
│   │   └── errorHandler.ts          # エラーハンドリング
│   ├── types/                        # Web管理型定義
│   │   └── admin.ts                  # 管理画面共通型
│   └── public/                       # 静的ファイル
│       ├── css/                      # スタイルシート
│       └── js/                       # JavaScript
├── database/
│   ├── newSchema.sql                 # 📍 現在のDBスキーマ
│   └── database.ts                   # データベース操作
└── __tests__/                        # 📍 テストスイート（65.35%カバレッジ）
    ├── integration/                  # 統合テスト
    ├── repositories/                 # リポジトリテスト
    ├── services/                     # サービステスト
    └── utils/                        # ユーティリティテスト
```

📍: 重要なファイル・ディレクトリ

## TDD開発コマンド

### 基本的なTDDワークフロー
```bash
# 1. テストをウォッチモードで開始
npm run test:watch

# 2. 新しいテストファイルを作成
touch src/__tests__/[feature].test.ts

# 3. Red → Green → Refactor サイクルを繰り返す

# 4. 全テストを実行して確認
npm test

# 5. カバレッジを確認
npm run test:coverage
```

### その他の開発コマンド

#### Discord Bot関連
- `npm run dev`: 開発モードで実行
- `npm run build`: TypeScriptをビルド
- `npm start`: 本番モードで実行
- `npm run watch`: ファイル変更を監視して自動再起動
- `npm run test:integration`: 統合テストのみ実行

#### 管理Webアプリケーション関連
- `npm run admin:dev`: 管理Webアプリケーション開発モード起動
- `npm run admin:copy-views`: EJSビューファイルをdistにコピー
- `npm run admin:copy-static`: 静的ファイルをdistにコピー

### Staging環境コマンド
- `npm run staging:deploy`: **staging環境へデプロイ（マシン自動復旧機能付き）**
- `npm run staging:logs`: staging環境ログ確認
- `npm run staging:status`: staging環境ステータス確認
- `npm run staging:test`: staging環境動作テスト
- `npm run staging:smoke`: 重要機能煙幕テスト

## 🔧 TDD実践時の必須確認

### Red Phase（テストを書く）
- [ ] 実装する機能のTODOリストを作成
- [ ] 最も簡単なテストケースから開始
- [ ] テストが失敗することを確認（Red）
- [ ] エラーメッセージが適切であることを確認

### Green Phase（実装する）
- [ ] テストを通す最小限の実装
- [ ] 仮実装（ハードコード）でもOK
- [ ] コピペでもOK（後でDRY）
- [ ] テストが通ることを確認（Green）

### Refactor Phase（改善する）
- [ ] すべてのテストが通ることを確認
- [ ] 重複コードを除去
- [ ] より良い設計に改善
- [ ] パフォーマンスの最適化（必要な場合）

### コミット前の最終確認
```bash
# TDDサイクル完了後の確認
npm run build              # TypeScriptコンパイルエラーチェック
npm test                   # 全テスト実行（必須）
npm run test:integration   # 統合テスト実行（必須追加）
npm run test:coverage      # カバレッジ確認（45.5%以上維持）
```

## 🚨 Claude Code: 作業完了前の必須チェックリスト

### Claude Codeは「完了しました」と報告する前に以下を必ず実行してください

**タスクが本当に完了したことを確認するため、以下の品質チェックを順番に実行:**

```bash
# 1. TypeScriptビルドチェック
npm run build

# 2. テスト実行（並列実行問題の対処含む）
npm run test:sequential  # 順次実行版（安定）
# または
npm test                 # 通常の並列実行版（高速）

# 3. 統合テストの個別実行（問題がある場合）
npm run test:integration

# 4. コード品質チェック（Pre-commitフックの事前実行）
./scripts/code-review/pre-commit-all-checks.sh

# 5. すべて成功したら完了報告
echo "✅ 全チェック成功: タスク完了"
```

### Claude Code専用チェックリスト

タスク完了を宣言する前に、以下の項目をすべてチェック済みの状態にしてください：

- [x] **ビルドチェック**: `npm run build` が成功
- [x] **テスト実行**: `npm test` または `npm run test:sequential` が成功
- [x] **統合テスト**: `npm run test:integration` が成功（必要な場合）
- [x] **コード品質**: `./scripts/code-review/pre-commit-all-checks.sh` が成功
- [x] **SRP違反**: 必要に応じて `@SRP-EXCEPTION` コメントを追加
- [x] **型安全性**: any型の使用を避け、必要な場合は `// ALLOW_ANY` を追加
- [x] **エラー処理**: AppError派生クラスを使用し、logger.errorでログ出力
- [x] **TDDフェーズ**: テストコメントから🔴🟢♻️を削除し、機能説明に変更

### ユーザーへのコミット推奨

すべてのチェックが完了した後、ユーザーに対して：
```bash
# コミット推奨メッセージ
git add .
git commit -m "feat: 機能説明"
```

### 並列テスト実行の問題と対処法

#### 問題の症状
- テストがランダムに失敗する
- データベース接続エラーが発生する
- ファイルシステムの競合が起きる
- タイミング依存のテストが不安定

#### 解決策1: 順次実行モード（安定性優先）
```bash
# package.jsonに追加
"test:sequential": "jest --runInBand",
"test:integration:sequential": "jest --runInBand src/__tests__/integration"
```

#### 解決策2: ワーカー数制限（バランス重視）
```bash
# package.jsonに追加
"test:balanced": "jest --maxWorkers=2",
```

#### 解決策3: テストファイルの分離実行
```bash
# 問題のあるテストを個別実行
npm test -- src/__tests__/handlers/todoCrudHandler.test.ts
npm test -- src/__tests__/integration/activityLoggingIntegration.test.ts
```

#### 解決策4: データベース分離（推奨）
```typescript
// テスト用のデータベース設定
beforeEach(async () => {
  // 各テストで独立したデータベースを使用
  const testDbPath = `test-${process.pid}-${Date.now()}.db`;
  // ...
});
```

### Pre-commitフック事前チェックスクリプト

新しいスクリプトを作成してすべてのチェックを事前実行:

## 🚨 Claude Code: タスク完了前の必須確認

**Claude Codeは依頼されたタスクを完了したと判断する前に、以下を必ず実行してください:**

### タスク完了前の品質ゲート
```bash
# 🚨 最重要: Claude Codeはタスク完了前に必ずこれを実行すること

# 1. ビルド確認
npm run build

# 2. 改良されたテスト実行と失敗分析（推奨）
./scripts/test-analysis.sh

# 3. または従来のテスト実行
npm test                   # 全テスト実行（統合テスト含む）
npm run test:integration   # 統合テスト確認（追加確認）

# 4. 全テスト成功を確認してから完了報告
echo "✅ 全テスト成功: タスク完了"
```

#### test-analysis.shの優位性
- **失敗分析自動化**: テスト失敗時に詳細な失敗情報を自動抽出
- **失敗サマリー**: 失敗したテストスイートと具体的なエラー内容を整理
- **レポート生成**: `test-reports/`ディレクトリに詳細ログを保存
- **Pre-commitフック統合**: Huskyによる自動品質チェックで使用中

### 実行タイミング
- **タスク実装完了後**: コードの実装やファイル変更が完了した時点
- **完了報告前**: ユーザーに「完了しました」と報告する前
- **コミット推奨前**: git commitを推奨する前

### 目的
- **staging環境での統合テスト失敗を防止**: 開発時点で統合テスト問題を検出
- **品質保証**: 単体テストだけでなく統合テストでの動作確認
- **開発速度向上**: 後戻り作業の削減

**📝 この手順により、staging環境で初めて統合テスト失敗が発覚することを防げます。**

### デプロイ前の品質チェック

```bash
# Pre-commitフックで自動実行される品質チェック
./scripts/code-review/pre-commit-all-checks.sh

# 個別実行も可能
npm run build                    # TypeScriptビルド
./scripts/test-analysis.sh       # テスト実行と失敗分析
```

## クリティカル機能の保護

### 重要機能の回帰テスト（必須）
どんな小さな変更でも以下のテストが通ることを確認：
- ActivityLoggingIntegrationの初期化テスト
- 重要コマンド（!cost, !summary, !timezone）の統合テスト
- SqliteActivityLogRepositoryのデータベース接続テスト
- エラーハンドリングのテスト

### 手動動作確認（リリース前）

#### Staging環境での検証（必須）
staging環境のDiscord Botで以下のコマンドを確認：
- `!cost` - API費用レポート表示
- `!summary` - 今日のサマリー表示
- `!timezone` - タイムゾーン表示・設定
- `!edit [ID]` - ログ編集機能
- `!logs` - ログ一覧表示

#### Production環境での最終確認（デプロイ後）
本番環境のDiscord Botで重要機能の疎通確認：
- 基本コマンド応答確認
- データベース接続確認
- エラーログ監視（30分間）

## アーキテクチャ概要

### 主要コンポーネント
- **ActivityLoggingIntegration**: メインシステム統合クラス
- **PartialCompositeRepository**: 統合データベースリポジトリ
- **ICommandHandler**: コマンド処理の抽象化インターフェース
- **GeminiService**: AI分析サービス（Google Gemini 2.0 Flash）
- **AppError & withErrorHandling**: 統一エラー処理

## 🚨 データベースマイグレーション

### スキーマ変更時の必須手順

1. **マイグレーションファイル作成**
```bash
# 必ず連番でファイル作成
touch src/database/migrations/00X_feature_description.sql
```

2. **ALTER TABLE文で段階的に変更**
```sql
-- カラム追加例
ALTER TABLE activity_logs ADD COLUMN new_column TEXT DEFAULT NULL;
```

3. **テスト実行で検証**
```bash
npm run build && npm test && npm run test:integration
```

### ⚠️ 重要な注意点
- **❌ 禁止**: newSchema.sqlのみ変更（既存DBが壊れる）
- **✅ 必須**: マイグレーションファイル作成 → newSchema.sql更新
- **✅ 必須**: 既存DBでのテスト実行

### エラー時の対処
```
SQLITE_ERROR: table activity_logs has no column named XXX
```
→ マイグレーションファイルが不足している証拠

## 🔄 TDDフェーズコメント管理

TDD開発中はRed-Green-Refactorのフェーズをコメントで明示し、実装完了後は機能説明コメントに変更してください。

```typescript
// 開発中: 🔴 Red Phase → 🟢 Green Phase → ♻️ Refactor Phase
// 完了後: フェーズ表記を削除し、機能説明のみを記載
```

## 🌐 管理Webアプリケーション

### 概要
Express.js + EJS + Tailwind CSSで構築された管理画面（`npm run admin:dev`でアクセス）

### 主要機能
- **認証**: Basic認証による保護
- **環境別制御**: 本番環境では読み取り専用
- **レスポンシブ**: モバイル対応UI
- **データ管理**: TODO管理、データベース閲覧

### 開発コマンド
```bash
npm run admin:dev     # 開発サーバー起動（http://localhost:3001）
npm run admin:build  # ビルド実行
```

## 🚨 エラー処理・ログ規約

### 基本ルール
1. **AppError派生クラスを使用**: `DatabaseError`, `ApiError`, `ValidationError`等
2. **console使用禁止**: `logger.info()`, `logger.error()`等を使用
3. **エラー握りつぶし禁止**: catch節では必ず再スローまたは適切な処理
4. **withErrorHandling活用**: 非同期処理の統一エラーハンドリング

### ログレベル
- `logger.debug()`: デバッグ情報
- `logger.info()`: 通常情報
- `logger.warn()`: 警告
- `logger.error()`: エラー（AppError必須）
- `logger.success()`: 成功

## 🚨 型安全性規約

### 基本ルール
1. **any型禁止**: やむを得ない場合は`// ALLOW_ANY: 理由`を記載
2. **戻り値型必須**: すべての関数に戻り値の型を明示
3. **strictモード維持**: tsconfig.jsonの`"strict": true`を変更しない

### 型チェック
```bash
npx tsc --noEmit  # 定期的な型チェック
```

