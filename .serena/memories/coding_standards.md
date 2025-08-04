# Coding Standards and Conventions

## TDD開発原則（必須）
**すべての開発はテスト駆動開発（TDD）のRed-Green-Refactorサイクルで実施**
1. **🔴 Red**: 失敗するテストを書く
2. **🟢 Green**: テストを通す最小限の実装
3. **♻️ Refactor**: テストが通る状態を保ちながらリファクタリング

## TypeScript規約
- **型安全性**: any型の使用禁止（やむを得ない場合は`// ALLOW_ANY`コメント必須）
- **関数の型注釈**: すべての関数に戻り値の型を明示
- **インターフェース駆動設計**: 使い方から設計、Interface Firstアプローチ
- **依存性注入**: テスタブルな設計のためにインターフェースを注入

## コーディング規約
- **日本語コメント**: 全てのpublic関数・クラスにJSDocコメント（日本語）
- **エラー処理**: AppError派生クラスとwithErrorHandlingを必ず使用
- **ログ出力**: console.log/error禁止、必ずloggerサービスを使用
- **Error Handling**: catch節でエラーを握りつぶさない、必ずlogger.errorでログ出力

## ファイル・クラス設計
- **単一責任原則（SRP）**: 1ファイル500行以下、1関数50行以下
- **ファイルごとに1クラス**: max-classes-per-file = 1
- **複雑度制限**: complexity max 15
- **最大ネスト深度**: max-depth = 4

## レイヤ分離規約
- **ビジネスロジックとインフラロジックの完全分離**
- **サービス層でのDB/API直接操作禁止**: 必ずリポジトリ/クライアント経由
- **例外時**: `// ALLOW_LAYER_VIOLATION:`コメント追加

## TODO・FIXMEコメント管理
- **TODO・FIXMEコメントの即座対応または削除**
- **GitHub Issue管理**: 後回しの場合はIssue化
- **例外許可**: `// ALLOW_TODO:`コメントで理由記載

## データベース変更
- **マイグレーションファイル必須**: src/database/migrations/に作成
- **newSchema.sqlとマイグレーションの同期**: 両方を更新
- **既存DBでのテスト**: マイグレーション動作確認

## 命名規則
- **ファイル名**: camelCase（例: activityLoggingIntegration.ts）
- **クラス名**: PascalCase（例: ActivityLoggingIntegration）
- **インターフェース**: IPrefix（例: ICommandHandler）
- **定数**: UPPER_SNAKE_CASE（例: MAX_RETRIES）

## テスト規約
- **テストファースト**: 実装前に必ずテストを書く
- **テストファイル配置**: src/__tests__/ ディレクトリ
- **テストファイル命名**: [対象ファイル名].test.ts
- **describe/it使用**: describeでグループ化、itで個別テスト