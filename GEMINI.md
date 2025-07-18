# GEMINI.md

This document provides guidelines for the Gemini AI assistant to effectively understand and contribute to this project.

## 1. 開発方針: t_wada式TDD

**全ての開発はテスト駆動開発（TDD）のRed-Green-Refactorサイクルで実施してください。**

- **テストファースト**: 実装前に必ずテストを書きます。
- **小さなステップ**: 一度に一つのことを実装します。
- **Red-Green-Refactor**: 失敗するテスト（Red）、通す実装（Green）、改善（Refactor）のサイクルを回します。
- **開発チェックリスト参照**: 全ての開発作業は `DEVELOPMENT_CHECKLIST.md` のTDDサイクルに従って実行してください。

### TDDコメント管理
開発の進行状況を明確にするため、テストコードにフェーズコメントを付けます。
- **🔴 Red Phase**: 失敗するテストを書いた段階。
- **🟢 Green Phase**: テストを通過する最小限の実装をした段階。
- **♻️ Refactor Phase**: リファクタリングを完了した段階。
- **実装完了後**: フェーズ表記を削除し、機能説明コメントに置き換えます。

詳細は `DEVELOPMENT_CHECKLIST.md` の「TDDコメント管理チェックリスト」を参照してください。

## 2. コーディング規約

- **言語**: コード、コメント、ドキュメントは全て **日本語** で記述します。
- **インターフェース駆動設計**: `src/repositories/interfaces.ts` や `src/handlers/interfaces.ts` のインターフェースを先に定義し、それを利用する形でテストと実装を進めます。
- **エラーハンドリング**: `withErrorHandling` と `AppError` を使用して、エラー処理を統一します。
- **コメント**: JSDoc形式で、クラスや公開メソッドの目的、意図、設計理由を明確に記述します。
- **リポジトリ**: データアクセスは原則として統合リポジトリ `SqliteActivityLogRepository` を使用します。

## 3. 技術スタック

| Category | Technology / Library | Version/Specification |
|---|---|---|
| **言語** | Node.js / TypeScript | Node.js 20 (.nvmrc) |
| **Discord Bot** | discord.js | v14 |
| **AI Integration**| Google Gemini | gemini-2.0-flash |
| **データベース** | SQLite3 | |
| **テスト** | Jest | |
| **スケジューラー** | node-cron | |

## 4. 環境戦略とリリースフロー

Local → Staging → Production の3層環境で開発を進めます。

1.  **Local**: TDDによる機能開発と単体テスト。
2.  **Staging**: Fly.io上での統合テストと本番前検証。
3.  **Production**: 本番運用。

**リリースフロー**: `feature/*` → `develop` → (手動) `staging` → `main` → (自動) `production`

## 5. 🚨【最重要】デプロイ手順

**Fly.ioのマシン自動復旧機能が組み込まれた以下のスクリプトを必ず使用してください。** `fly deploy`コマンドの直接実行は禁止です。

### Staging環境
```bash
# Staging環境へのデプロイ（推奨タイムアウト: 5分）
npm run staging:deploy
```

### Production環境
```bash
# Production環境へのデプロイ（推奨タイムアウト: 5分）
npm run prod:deploy
```

## 6. セットアップ手順

1.  **Node.jsバージョン切り替え**:
    ```shell
    nvm use
    ```
2.  **依存関係インストール**:
    ```shell
    npm install
    ```
3.  **環境変数設定**:
    - `.env.example` をコピーして `.env` を作成します。
    - `DISCORD_BOT_TOKEN`, `GOOGLE_GEMINI_API_KEY` を設定します。
    - 管理Webアプリを使用する場合は `ADMIN_USERNAME`, `ADMIN_PASSWORD` も設定します。

## 7. アーキテクチャ概要

システムの中心は `ActivityLoggingIntegration` クラスであり、Discordからのイベントを受け取り、各機能へ処理を委譲します。

- **エントリーポイント**: `src/index.ts`
- **システム中核**: `src/integration/activityLoggingIntegration.ts`
- **データ永続化**: `src/repositories/sqliteActivityLogRepository.ts` (活動ログとAPIコストの統合リポジトリ)
- **コマンド処理**: `src/handlers/` 以下の `ICommandHandler` 実装クラス群
- **AI連携**: `src/services/geminiService.ts`
- **管理Webアプリ**: `src/web-admin/`

## 8. プロジェクト構造

```
src/
├── index.ts                          # アプリケーションエントリーポイント
├── integration/
│   └── activityLoggingIntegration.ts # 📍 メインシステム統合クラス
├── repositories/
│   ├── interfaces.ts                 # 📍 リポジトリインターフェース
│   └── sqliteActivityLogRepository.ts # 📍 統合リポジトリ
├── handlers/
│   └── interfaces.ts                 # 📍 ハンドラーインターフェース
├── services/
│   └── geminiService.ts              # 📍 Gemini AI分析サービス
├── types/
│   └── activityLog.ts                # 📍 活動ログ型定義
├── web-admin/                        # 📍 管理Webアプリケーション
│   └── start.ts                      # 管理アプリエントリーポイント
└── __tests__/                        # 📍 テストスイート
```
(📍: 特に重要なファイル・ディレクトリ)

## 9. 主要コマンド

| コマンド | 説明 |
|---|---|
| `npm run dev` | Discord Botを開発モードで実行 |
| `npm run admin:dev` | 管理Webアプリを開発モードで実行 |
| `npm run build` | TypeScriptをビルド |
| `npm test` | 全てのテストを実行 |
| `npm run test:watch` | テストをウォッチモードで実行 |
| `npm run test:integration`| 統合テストのみ実行 |
| `npm run staging:deploy` | **Staging環境へデプロイ** |
| `npm run prod:deploy` | **Production環境へデプロイ** |

## 10. 🤖 AIアシスタントへの指示

- **TDD厳守**: 機能追加・修正は必ず `__tests__/` にテストファイルを作成・修正することから始めてください。`DEVELOPMENT_CHECKLIST.md` に従ってください。
- **TDDコメント管理**: 開発中は 🔴🟢♻️ のフェーズコメントを適切に管理し、完了後は必ず削除してください。
- **既存コード分析**: 実装前には `services`, `repositories`, `integration` の関連コードを十分に分析し、既存の設計パターンに従ってください。
- **デプロイ手順遵守**: デプロイは必ず指定された `npm run` スクリプトを使用してください。
- **✅ タスク完了前の必須確認**:
    - 依頼されたタスクを完了したと判断する前に、**必ず統合テストを実行**してください。
    - これにより、Staging環境でのテスト失敗を未然に防ぎます。
    ```bash
    # 1. ビルド確認
    npm run build

    # 2. 全テスト実行（単体 + 統合）
    npm test
    ```

## 11. APIコスト監視

このプロジェクトにはGoogle Gemini APIの利用状況と推定コストを監視する機能が組み込まれています。

- **データ永続化**: API利用ログはSQLiteデータベースの `api_usage_logs` テーブルに保存されます。
- **日次レポート**: 毎日 **18:05 JST (09:05 UTC)** に設定されたユーザーへ日次レポートがDMで送信されます。
- **オンデマンドレポート**: `!cost` コマンドでいつでもレポートを取得できます。
- **コストアラート**: 月間推定コストや日次APIコール数が設定された閾値を超えると、アラートが送信されます。
