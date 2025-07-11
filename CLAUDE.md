# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
- **テストカバレッジ**: 45.5%（__tests__/ ディレクトリ）

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
- **AI**: Google Gemini 1.5 Flash
- **データベース**: SQLite3
- **テストフレームワーク**: Jest
- **スケジューラー**: node-cron

## 開発環境セットアップ
1. `nvm use` でNode.js仮想環境を使用（.nvmrcファイルでNode.js 20を指定）
2. `npm install` で依存関係をインストール（仮想環境内）
3. `.env.example` を参考に `.env` ファイルを作成
4. Discord Bot Token と Google Gemini API Key を設定

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
│   └── activityLog.ts                # 📍 活動ログ型定義
├── utils/
│   ├── errorHandler.ts               # 📍 統一エラーハンドリング
│   ├── timeUtils.ts                  # 時間関連ユーティリティ
│   └── commandValidator.ts           # コマンドバリデーション
├── database/
│   ├── newSchema.sql                 # 📍 現在のDBスキーマ
│   └── database.ts                   # データベース操作
└── __tests__/                        # 📍 テストスイート（45.5%カバレッジ）
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
- `npm run dev`: 開発モードで実行
- `npm run build`: TypeScriptをビルド
- `npm start`: 本番モードで実行
- `npm run watch`: ファイル変更を監視して自動再起動
- `npm run test:integration`: 統合テストのみ実行

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
npm run test:coverage      # カバレッジ確認（45.5%以上維持）
```

## クリティカル機能の保護

### 重要機能の回帰テスト（必須）
どんな小さな変更でも以下のテストが通ることを確認：
- ActivityLoggingIntegrationの初期化テスト
- 重要コマンド（!cost, !summary, !timezone）の統合テスト
- SqliteActivityLogRepositoryのデータベース接続テスト
- エラーハンドリングのテスト

### 手動動作確認（リリース前）
実際のDiscord環境で以下のコマンドを確認：
- `!cost` - API費用レポート表示
- `!summary` - 今日のサマリー表示
- `!timezone` - タイムゾーン表示・設定
- `!edit [ID]` - ログ編集機能
- `!logs` - ログ一覧表示

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

### 🚨 絶対に守るべきTDDルール
1. **テストなしでコードを書かない**
2. **失敗するテストを確認してから実装**
3. **一度に一つのことだけ**
4. **明白な実装を心がける**
5. **TODOリストで進捗管理**

**🚨 CRITICAL: 実装前に必ずテストを書き、Red-Green-Refactorサイクルを守ること**