# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🚨 重要: デプロイ手順

**Claude Codeは必ず以下のデプロイコマンドを使用してください**

### Staging環境デプロイ（必須手順）
```bash
# ✅ 必須使用: マシン自動復旧機能付きスクリプト（推奨タイムアウト: 5分）
npm run staging:deploy

# または直接実行
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
npm run prod:deploy

# または直接実行  
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
- **統合リポジトリ**: SqliteActivityLogRepository（活動ログ + APIコスト監視）
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
- **統合リポジトリ使用**: SqliteActivityLogRepository（IActivityLogRepository + IApiCostRepository）を活用
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
- **トリガー**: **手動デプロイ** (GitHub Actionsは品質チェックのみ)

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
2. **develop マージ**: プルリクエスト + GitHub Actions品質チェック
3. **staging デプロイ**: `./scripts/staging/deploy-to-staging.sh` で手動実行
4. **staging検証**: 重要機能動作確認 + 品質ゲート
5. **main マージ**: staging検証完了後のみ
6. **production デプロイ**: 自動デプロイ + ヘルスチェック

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

**📝 手動デプロイ手順:**
1. **開発完了**: developブランチでの開発とTDDサイクル完了
2. **品質確認**: GitHub ActionsでPush時の品質チェック通過
3. **デプロイ実行**: ローカルでstaging環境にデプロイ
4. **動作確認**: Staging環境でのDiscord Bot動作テスト
5. **本番マージ**: mainブランチマージでproduction自動デプロイ

**🔧 自動復旧機能:**
- **マシン停止検出**: jqを使った詳細状態分析
- **自動マシン起動**: 停止中マシンの自動起動
- **起動完了待機**: 確実な起動確認後にデプロイ実行
- **ヘルスチェック**: デプロイ前後の動作確認

**📊 実行フロー:**
1. **環境チェック**: Fly CLI、staging環境アプリの存在確認
2. **マシン状態確認**: 停止中マシンの自動検出
3. **自動復旧**: 停止中マシンの自動起動（15秒待機）
4. **品質チェック**: TypeScriptビルド + テスト実行（`--skip-tests`で省略可能）
5. **デプロイ実行**: fly-staging.toml設定でのデプロイ
6. **ヘルスチェック**: https://timelogger-staging.fly.dev/health 確認
7. **完了レポート**: 詳細なデプロイ結果レポート表示

**✅ 解決された問題:**
- ❌ 従来: マシン停止 → デプロイ失敗 → 手動起動 → 再デプロイ
- ✅ 現在: **完全自動化** → マシン停止を気にせずデプロイ可能

**⚠️ 注意事項:**
- GitHub Actions では `--skip-tests --force` で実行（CI側でテスト済みのため）
- ローカル実行では品質チェック込みの完全実行を推奨
- `jq` コマンドが必要（macOS: `brew install jq`）

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
│   ├── sqliteActivityLogRepository.ts # 📍 統合リポジトリ（活動ログ+APIコスト）
│   └── activityLogRepository.ts      # 活動ログリポジトリ（参考実装）
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

## 🚨 Claude Code: タスク完了前の必須確認

**Claude Codeは依頼されたタスクを完了したと判断する前に、以下を必ず実行してください:**

### タスク完了前の品質ゲート
```bash
# 1. ビルド確認
npm run build

# 2. 全テスト実行（統合テスト含む）
npm test

# 3. 統合テスト確認（追加確認）
npm run test:integration

# 4. 全テスト成功を確認してから完了報告
echo "✅ 全テスト成功: タスク完了"
```

### 実行タイミング
- **タスク実装完了後**: コードの実装やファイル変更が完了した時点
- **完了報告前**: ユーザーに「完了しました」と報告する前
- **コミット推奨前**: git commitを推奨する前

### 目的
- **staging環境での統合テスト失敗を防止**: 開発時点で統合テスト問題を検出
- **品質保証**: 単体テストだけでなく統合テストでの動作確認
- **開発速度向上**: 後戻り作業の削減

**📝 この手順により、staging環境で初めて統合テスト失敗が発覚することを防げます。**

### デプロイ前の必須確認

#### develop → staging デプロイ前
```bash
npm run quality:check      # 品質チェック統合実行
npm run test:integration   # 統合テスト実行
# ✅ 全テスト成功後にdevelopブランチpush
```

#### main → production デプロイ前
```bash
# Staging環境での検証完了確認
npm run staging:test       # staging環境動作確認
npm run staging:smoke      # 重要機能煙幕テスト
# ✅ staging検証完了後にmainブランチマージ
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

### 🏗️ システム構成
1. **ActivityLoggingIntegration**: メインシステム統合クラス
2. **SqliteActivityLogRepository**: 統合データベースリポジトリ（活動ログ + APIコスト監視）
3. **ICommandHandler**: コマンド処理の抽象化インターフェース
4. **GeminiService**: AI分析サービス（Google Gemini 1.5 Flash）
5. **Error Handling**: AppError と withErrorHandling による統一エラー処理

### 主要コンポーネント

#### 統合システム（最重要）
- **ActivityLoggingIntegration**: 全体の初期化とメッセージルーティング
- **SqliteActivityLogRepository**: データアクセス層の統合実装

#### コマンドシステム
- **ICommandHandler**: コマンド処理の統一インターフェース
- **各CommandHandler**: 個別コマンドの実装（cost, summary, timezone等）

#### AI分析システム
- **GeminiService**: Google Gemini APIとの統合
- **UnifiedAnalysisService**: 統合分析ロジック
- **AnalysisCacheService**: 分析結果キャッシュ

---

## 📋 必須: 開発チェックリスト参照

**すべての開発作業は DEVELOPMENT_CHECKLIST.md のTDDサイクルに従って実行してください**

**staging環境構成とリリースフローの詳細は note/staging-environment-design.md を参照してください**

### 🚨 絶対に守るべきTDDルール
1. **テストなしでコードを書かない**
2. **失敗するテストを確認してから実装**
3. **一度に一つのことだけ**
4. **明白な実装を心がける**
5. **TODOリストで進捗管理**

**🚨 CRITICAL: 実装前に必ずテストを書き、Red-Green-Refactorサイクルを守ること**

## 🚨 マイグレーション必須フロー（再発防止策）

### データベーススキーマ変更時の必須手順
**Claude Code: スキーマ変更時は以下を必ず実行してください**

#### 🔥 重大な問題: マイグレーション漏れによるスキーマエラー
**再発防止のため、以下の手順は厳格に遵守すること**

#### 1. スキーマ変更の影響範囲確認
- [ ] 新規テーブル作成 → マイグレーションファイル必須
- [ ] 既存テーブルへのカラム追加 → マイグレーションファイル必須  
- [ ] 制約変更・インデックス追加 → マイグレーションファイル必須
- [ ] **❌ 禁止: newSchema.sqlのみの変更**（既存DBが壊れる）

#### 2. マイグレーションファイル作成（必須）
```bash
# 連番を確認してファイル作成
ls src/database/migrations/
touch src/database/migrations/00X_feature_description.sql
```

#### 3. マイグレーション内容の記述
- **ALTER TABLE文による段階的変更**
- **カラム存在チェック**（重複実行対応）
- **ロールバック可能な安全な変更**
- **CHECK制約の適切な設定**

#### 4. ローカル検証（必須）
```bash
# マイグレーション実行テスト
npm run build
npm test
npm run test:integration
# ⚠️ この段階でスキーマエラーがあれば即座に修正
```

#### 5. 統合テスト確認（必須）
```bash
# 全テスト実行でスキーマ整合性を確認
npm test && npm run test:integration
# ⚠️ "table activity_logs has no column named XXX"エラーが出たら
# マイグレーションファイルが不足している証拠
```

### ❌ マイグレーション失敗の典型的パターン

#### 🚨 Issue #006事例: リマインダーReply機能
**発生した問題**:
- `newSchema.sql`にカラム定義を追加
- **006_reminder_reply_columns.sqlを作成し忘れ**
- 既存DBにカラムが存在せずSQLITE_ERRORが発生

#### やってはいけない例
1. **❌ newSchema.sqlのみ更新してマイグレーション忘れ**
2. **❌ テスト環境でのみ動作確認（既存DBでテストしない）**
3. **❌ マイグレーション番号の重複・欠番**
4. **❌ 破壊的変更（NOT NULL制約の後付けなど）**
5. **❌ 手動マイグレーション（データベース直接変更）**

#### ✅ 正しい手順
1. **マイグレーションファイル作成 → newSchema.sql更新**
2. **既存DBでのマイグレーションテスト → 新規DBでのスキーマテスト**
3. **連番確認 → マイグレーション履歴記録**
4. **段階的変更（DEFAULT値設定 → 後にNOT NULL制約）**

### 🆘 緊急時のスキーマ修復手順

#### マイグレーション漏れ発覚時
```bash
# 1. 影響範囲確認
sqlite3 data/app.db ".schema table_name"

# 2. 緊急マイグレーション作成
touch src/database/migrations/00X_emergency_fix.sql

# 3. マイグレーション内容作成（例）
cat > src/database/migrations/006_reminder_reply_columns.sql << 'EOF'
ALTER TABLE activity_logs ADD COLUMN is_reminder_reply BOOLEAN DEFAULT FALSE;
ALTER TABLE activity_logs ADD COLUMN time_range_start TEXT;
ALTER TABLE activity_logs ADD COLUMN time_range_end TEXT;
ALTER TABLE activity_logs ADD COLUMN context_type TEXT DEFAULT 'NORMAL' 
    CHECK (context_type IN ('REMINDER_REPLY', 'POST_REMINDER', 'NORMAL'));
EOF

# 4. アプリケーション再起動（マイグレーション自動実行）
npm run dev

# 5. 全テスト実行で検証
npm test && npm run test:integration
```

### 🔧 Claude Code実装時の強制チェックリスト

#### スキーマ変更を含む機能実装時
**以下を全てチェックしなければ実装完了とは認めない**

- [ ] **マイグレーションファイルを作成したか？**
- [ ] **既存DBでマイグレーションテストを実行したか？**
- [ ] **newSchema.sqlとマイグレーションファイルの整合性を確認したか？**
- [ ] **統合テストでスキーマエラーが出ていないか？**
- [ ] **staging環境でマイグレーション検証を行うか（予定）？**

#### 実装完了前の最終確認コマンド
```bash
# これらが全て成功しなければ実装未完了
npm run build              # TypeScriptコンパイル
npm test                   # 単体テスト
npm run test:integration   # 統合テスト（スキーマ確認）
```

**📝 これらのチェックを怠ると、本番環境でスキーマエラー（SQLITE_ERROR）が発生します**

### 🎯 マイグレーション成功の目安

#### 正常なマイグレーション実行ログ
```
🚀 マイグレーションを開始します...
📋 利用可能なマイグレーション: ['001_...', '003_...', '004_...', '005_...', '006_reminder_reply_columns.sql']
📋 実行済みマイグレーション: ['001', '003', '004', '005']
📋 保留中のマイグレーション: ['006_reminder_reply_columns.sql']
🔧 マイグレーション 006 を実行中...
✅ マイグレーション 006 が完了しました (XXXms)
✅ 全マイグレーションが完了しました
```

#### 失敗の兆候
```
❌ 活動ログ保存エラー: [Error: SQLITE_ERROR: table activity_logs has no column named XXX]
```
→ この場合、必要なマイグレーションファイルが不足している

---

## 🔄 TDDコメント管理のベストプラクティス

### TDDサイクルにおけるコメント管理の重要性

TDDでは、テストコメントが開発の進行状況を示す重要な指標となります。適切なコメント管理により、開発者は実装の経緯を理解し、将来のメンテナンスを容易にできます。

### フェーズ別コメント管理手順

#### 1. **🔴 Red Phase - 失敗するテストを書く**
```typescript
// 🔴 Red Phase: 新機能のテスト - 実装前なので失敗する
describe('🔴 Red Phase: 新機能のテスト', () => {
  test('機能Aが正常に動作する', async () => {
    // この時点では実装がないため、テストは失敗する
    const result = await newFeature.doSomething();
    expect(result).toBe('expected'); // ❌ 失敗する
  });
});
```

#### 2. **🟢 Green Phase - テストを通す最小限の実装**
```typescript
// 🟢 Green Phase: 新機能のテスト - 最小限の実装でテストが通る
describe('🟢 Green Phase: 新機能のテスト', () => {
  test('機能Aが正常に動作する', async () => {
    // 最小限の実装により、テストが通る
    const result = await newFeature.doSomething();
    expect(result).toBe('expected'); // ✅ 成功する
  });
});
```

#### 3. **♻️ Refactor Phase - リファクタリング**
```typescript
// ♻️ Refactor Phase: 新機能のテスト - リファクタリング完了
describe('♻️ Refactor Phase: 新機能のテスト', () => {
  test('機能Aが正常に動作する', async () => {
    // リファクタリング後もテストが通る
    const result = await newFeature.doSomething();
    expect(result).toBe('expected'); // ✅ 成功（より良い実装）
  });
});
```

### 実装完了後のコメント整理

#### **開発完了時の最終コメント形式**
```typescript
// 開発完了後は、フェーズ表記を削除し、機能説明に変更
describe('新機能のテスト', () => {
  test('機能Aが正常に動作する', async () => {
    // 機能の説明とビジネスロジック
    // 新機能により、ユーザーは○○を実行できる
    const result = await newFeature.doSomething();
    expect(result).toBe('expected'); // ✅ 期待通りの動作
  });
});
```

### コメント管理の注意点

#### **❌ 避けるべきコメント**
```typescript
// ❌ 悪い例: 実装済み機能に対してGreen Phaseコメント
describe('🟢 Green Phase: 既存機能のテスト', () => {
  // 実際には既に実装済みの機能
  test('機能が動作する', () => {
    // 既に実装済みなのにGreen Phaseコメントは不適切
  });
});
```

#### **✅ 正しいコメント**
```typescript
// ✅ 良い例: 実装済み機能の適切な記述
describe('既存機能のテスト（実装済み）', () => {
  test('機能が正常に動作する', () => {
    // 既存機能の動作を確認するテスト
    // 機能の仕様: ○○の場合に□□を返す
  });
});
```

### TDDコメント管理チェックリスト

#### **開発時の必須確認**
- [ ] **Red Phase**: テストが失敗することを確認し、🔴コメントを付ける
- [ ] **Green Phase**: テストが通ったら🟢コメントに更新
- [ ] **Refactor Phase**: リファクタリング完了後に♻️コメントに更新
- [ ] **実装完了**: フェーズ表記を削除し、機能説明コメントに変更

#### **コードレビュー時の確認**
- [ ] **コメントの一貫性**: 実装状況とコメントが一致しているか
- [ ] **フェーズ表記の適切性**: 開発中のみフェーズ表記を使用しているか
- [ ] **機能説明の明確性**: 実装完了後は機能説明が適切か

### 実際のケーススタディ

#### **Issue #31の事例から学ぶ**
```typescript
// ❌ 問題のあったコメント
describe('🟢 Green Phase: マルチユーザー対応のテスト', () => {
  // 実際にはマルチユーザー対応は既に実装済みだった
  // このコメントは実態と合わない
});

// ✅ 修正後のコメント
describe('マルチユーザー対応機能のテスト（実装済み）', () => {
  // 実装済み機能の動作を確認するテスト
  // マルチユーザー対応により、複数ユーザーが同時利用可能
});
```

### TDDサイクル完了後の作業

#### **実装完了時の必須作業**
1. **フェーズ表記削除**: 全ての🔴🟢♻️表記を削除
2. **機能説明追加**: ビジネスロジックの説明を追加
3. **コメント整理**: 不要なコメントを削除、重要なコメントを整理
4. **テストの意図明確化**: テストの目的と期待値を明確に記述

**📝 TDDコメント管理は、開発の進行状況を正確に反映し、将来のメンテナンスを容易にする重要な作業です。**

## 🌐 管理Webアプリケーション開発ガイド

### Web管理機能開発の原則

#### 1. **セキュリティファースト開発**
- **環境別アクセス制御**: 本番環境では読み取り専用モード必須
- **認証必須**: 全てのルートでBasic認証を実装
- **セキュリティヘッダー**: X-Content-Type-Options, X-Frame-Options等を設定
- **入力検証**: 全てのユーザー入力にバリデーション実装

#### 2. **レスポンシブUI設計**
- **Tailwind CSS**: 統一されたデザインシステム使用
- **モバイルファースト**: スマートフォン対応を優先
- **アクセシビリティ**: キーボードナビゲーション対応
- **環境識別**: 開発・本番環境の視覚的区別

#### 3. **Express.js ベストプラクティス**
- **Router分離**: 機能別にルーターを分割
- **ミドルウェア活用**: エラーハンドリング、認証の統一化
- **EJSテンプレート**: サーバーサイドレンダリング
- **静的ファイル**: 効率的な静的ファイル配信

### Web管理開発TDD手順

#### Phase 1: UI設計とルーティング
```bash
# 1. 🔴 Red Phase: UIテストケース作成
npm run test:watch -- src/__tests__/web-admin/routes/

# 2. 🟢 Green Phase: ルーティング実装
# - Express Router作成
# - 基本的なレスポンス実装

# 3. ♻️ Refactor Phase: UI改善
# - EJSテンプレート作成
# - Tailwind CSSスタイリング
```

#### Phase 2: ビジネスロジック実装
```bash
# 1. 🔴 Red Phase: サービステスト作成
npm run test:watch -- src/__tests__/web-admin/services/

# 2. 🟢 Green Phase: サービス実装
# - データアクセスロジック
# - バリデーション処理

# 3. ♻️ Refactor Phase: エラーハンドリング強化
```

#### Phase 3: セキュリティとパフォーマンス
```bash
# 1. セキュリティテスト
# - 認証テスト
# - アクセス制御テスト

# 2. パフォーマンステスト
# - レスポンス時間測定
# - ページネーション効率化
```

### Web管理コーディング規約

#### 1. **Express ルーター構造**
```typescript
// ✅ 良い例: 機能別ルーター分離
export function createTodoRouter(databasePath: string): Router {
  const router = Router();
  
  // サービス初期化
  initializeServices(databasePath);
  
  // ルート定義
  router.get('/', handleTodoList);
  router.post('/', handleTodoCreate);
  
  return router;
}
```

#### 2. **EJSテンプレート規約**
```html
<!-- ✅ 良い例: 共通レイアウトとパーシャル -->
<%- include('partials/header', { title: 'TODO管理' }) %>
<%- include('partials/navigation', { currentPage: 'todos' }) %>

<!-- メインコンテンツ -->
<main class="max-w-7xl mx-auto py-6">
  <!-- ... -->
</main>

<%- include('partials/footer') %>
```

#### 3. **セキュリティ実装**
```typescript
// ✅ 良い例: 環境別アクセス制御
if (environment.isReadOnly) {
  return res.status(403).render('error', {
    title: 'アクセス拒否',
    message: 'Production環境では編集操作は許可されていません'
  });
}
```

#### 4. **エラーハンドリング**
```typescript
// ✅ 良い例: 統一エラーハンドリング
try {
  const result = await todoService.createTodo(data);
  res.redirect('/todos');
} catch (error) {
  next(error); // エラーミドルウェアに委譲
}
```

### Web管理デバッグ手順

#### 1. **ログ確認**
```bash
# サーバーログの確認
npm run admin:dev

# 特定のルートのデバッグ
curl -u ${ADMIN_USERNAME}:${ADMIN_PASSWORD} http://localhost:3001/todos -v
```

#### 2. **テンプレートデバッグ**
```bash
# EJSテンプレートの構文チェック
npm run admin:copy-views

# ブラウザ開発者ツール
# - Network タブでリクエスト確認
# - Console タブでJavaScriptエラー確認
```

#### 3. **データベース確認**
```bash
# データベース内容確認
sqlite3 data/app.db "SELECT * FROM todo_tasks LIMIT 5;"

# テーブルスキーマ確認
sqlite3 data/app.db ".schema todo_tasks"
```

### Web管理ベストプラクティス

#### 1. **UX設計**
- **明確なナビゲーション**: 現在位置の明示
- **確認ダイアログ**: 危険な操作の事前確認
- **レスポンシブデザイン**: 全デバイス対応
- **アクセシビリティ**: キーボード操作対応

#### 2. **パフォーマンス**
- **ページネーション**: 大量データの効率表示
- **静的ファイルキャッシュ**: CSS/JSファイルの最適配信
- **データベースクエリ最適化**: N+1問題の回避

#### 3. **保守性**
- **コンポーネント化**: 再利用可能なEJSパーシャル
- **設定分離**: 環境変数による設定管理
- **ログ記録**: 運用時のトラブルシューティング支援

**🌐 管理Webアプリケーションは、セキュリティ・UX・保守性を重視した堅牢な管理インターフェースです**