# TimeLogger Project Overview

## プロジェクト概要
Discord TimeLoggerは、Discord上で動作する自然言語による活動記録とTODO管理を行うBotシステムです。Google Gemini AIを使用して統合的な解析・サマリー生成を行います。

## 主要機能
1. **活動記録システム**
   - 自然言語での活動記録
   - 定期的なリマインダー（平日9:00-18:00）
   - 柔軟な時間表現対応
   - 編集・削除機能（!editコマンド）

2. **TODO管理システム**
   - AI自動分類・提案
   - 対話式確認（ボタンUI）
   - 優先度管理（高・普通・低）
   - 統合サマリーによる生産性可視化

3. **統合分析・サマリー**
   - 1日の全活動ログの統合分析
   - TODO相関分析
   - リアルタイム分析（!summaryコマンド）
   - 毎日5:00の自動サマリー生成

4. **管理Webアプリケーション**
   - Webベースの統合管理画面
   - データベース管理機能
   - TODO管理UI
   - レスポンシブデザイン

## システムアーキテクチャ
- **メインシステム**: ActivityLoggingIntegration（src/integration/activityLoggingIntegration.ts）
- **リポジトリ層**: SqliteActivityLogRepository（活動ログ + APIコスト監視）
- **サービス層**: GeminiService, ActivityLogService, UnifiedAnalysisService等
- **ハンドラー層**: ICommandHandler実装による個別コマンド処理
- **エラー処理**: AppErrorとwithErrorHandlingによる統一エラー処理

## パフォーマンス最適化
- 並行処理最適化（30-40%性能向上）
- データベース最適化（N+1クエリ問題修正）
- キャッシュシステム
- テストカバレッジ: 65.6%（100件以上のテストケース）

## 環境戦略
- **Local環境**: TDD開発、単体テスト
- **Staging環境**: fly.io環境での統合テスト（timelogger-staging）
- **Production環境**: 本番運用（timelogger-bitter-resonance-9585）

## デプロイフロー
1. Local開発（TDDサイクル）
2. develop マージ（プルリクエスト + GitHub Actions品質チェック）
3. staging デプロイ（手動実行）
4. staging検証
5. main マージ
6. production 自動デプロイ