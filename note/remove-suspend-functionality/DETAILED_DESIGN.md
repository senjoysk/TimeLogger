# Suspend機能削除 詳細設計書

## 概要
TimeLoggerのsuspend機能（夜間自動停止・朝自動起動）を完全削除する詳細設計書です。
実際の使用実績がなく、システムを複雑化させているため削除します。

## 削除対象コンポーネント一覧

### 1. GitHub Actions ワークフロー
- **ファイル**: `.github/workflows/night-suspend-automation.yml`
- **内容**: 285行の自動化ワークフロー
- **削除方法**: ファイル全体を削除

### 2. HTTPサーバー関連
#### メインサーバー
- **ファイル**: `src/api/nightSuspendServer.ts`
- **内容**: 336行のExpressサーバー実装
- **削除方法**: ファイル全体を削除

#### 認証ミドルウェア
- **ファイル**: `src/middleware/nightSuspendAuth.ts`
- **内容**: suspend API用の認証ミドルウェア
- **削除方法**: ファイル全体を削除

### 3. サービス層
#### DynamicSchedulerService
- **ファイル**: `src/services/dynamicSchedulerService.ts`
- **内容**: 271行の動的スケジューリングサービス
- **削除方法**: ファイル全体を削除

#### MorningMessageRecovery
- **ファイル**: `src/services/morningMessageRecovery.ts`
- **内容**: 夜間メッセージリカバリサービス
- **削除方法**: ファイル全体を削除

### 4. リポジトリ層
#### SqliteNightSuspendRepository
- **ファイル**: `src/repositories/sqliteNightSuspendRepository.ts`
- **内容**: suspend状態管理リポジトリ
- **削除方法**: ファイル全体を削除

### 5. ハンドラー
#### SuspendScheduleCommandHandler
- **ファイル**: `src/handlers/suspendScheduleCommandHandler.ts`
- **内容**: !suspend-scheduleコマンドハンドラー（185行）
- **削除方法**: ファイル全体を削除

### 6. テストファイル
以下のテストファイルをすべて削除：
- `src/__tests__/api/nightSuspendServer.test.ts`
- `src/__tests__/api/nightSuspendApi.test.ts`
- `src/__tests__/middleware/nightSuspendAuth.test.ts`
- `src/__tests__/services/morningMessageRecovery.test.ts`
- `src/__tests__/integration/nightSuspendIntegration.test.ts`
- `src/__tests__/integration/dynamicSchedulerIntegration.test.ts`
- `src/__tests__/database/nightSuspendSchema.test.ts`

## 修正対象ファイル

### 1. src/index.ts
#### 削除箇所
- NightSuspendServerのimport
- MorningMessageRecoveryのimport
- SqliteNightSuspendRepositoryのimport
- nightSuspendServerの初期化・起動処理（130-156行付近）
- suspend関連のログ出力

### 2. src/integration/activityLoggingIntegration.ts
#### 削除箇所
- DynamicSchedulerServiceのimport
- dynamicSchedulerServiceプロパティ
- checkSuspendScheduleメソッド
- SuspendScheduleCommandHandlerの登録

#### 修正内容
```typescript
// 削除: import { DynamicSchedulerService } from '../services/dynamicSchedulerService';
// 削除: private dynamicSchedulerService: DynamicSchedulerService;
// 削除: this.dynamicSchedulerService = new DynamicSchedulerService(this.repository);
```

### 3. src/enhancedScheduler.ts
#### 削除箇所
- DynamicSchedulerService関連のimportと使用
- suspend関連の通知処理

### 4. src/repositories/interfaces.ts
#### 削除インターフェース
- `IUserSuspendScheduleRepository`インターフェース全体
- `ISuspendStateRepository`インターフェース全体

### 5. src/repositories/sqliteActivityLogRepository.ts
#### 削除メソッド
- `saveUserSuspendSchedule`
- `getUserSuspendSchedule`
- `getAllUserSuspendSchedules`
- suspend関連のSQL処理

## データベース変更

### 1. 削除対象テーブル
```sql
-- 削除するテーブル
DROP TABLE IF EXISTS suspend_states;
```

### 2. user_settingsテーブルの修正
```sql
-- 削除するカラム
ALTER TABLE user_settings DROP COLUMN suspend_hour;
ALTER TABLE user_settings DROP COLUMN wake_hour;

-- または新しいテーブル作成
CREATE TABLE IF NOT EXISTS user_settings_new (
    user_id TEXT PRIMARY KEY,
    timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

-- データ移行
INSERT INTO user_settings_new (user_id, timezone, created_at, updated_at)
SELECT user_id, timezone, created_at, updated_at FROM user_settings;

-- テーブル入れ替え
DROP TABLE user_settings;
ALTER TABLE user_settings_new RENAME TO user_settings;
```

## 環境変数の削除

### .env.example
以下の環境変数を削除：
- `SHUTDOWN_TOKEN`
- `WAKE_TOKEN`
- `RECOVERY_TOKEN`

### GitHub Secrets
以下のSecretsを削除（GitHub UI経由）：
- `SHUTDOWN_TOKEN`
- `WAKE_TOKEN`
- `RECOVERY_TOKEN`

## 削除実行順序

### Phase 1: 機能無効化（即座に実施）
1. GitHub Actions workflowの無効化
   - GitHubのUIで`night-suspend-automation.yml`を無効化
2. !suspend-scheduleコマンドの無効化
   - ActivityLoggingIntegrationからハンドラー登録を削除

### Phase 2: コード削除（1週間後）
1. テストファイルの削除（7ファイル）
2. サービス・リポジトリ層の削除
   - DynamicSchedulerService
   - MorningMessageRecovery
   - SqliteNightSuspendRepository
3. HTTPサーバー関連の削除
   - NightSuspendServer
   - nightSuspendAuth
4. ハンドラーの削除
   - SuspendScheduleCommandHandler
5. 統合層の修正
   - ActivityLoggingIntegration
   - index.ts
   - enhancedScheduler.ts

### Phase 3: データベース・設定クリーンアップ（2週間後）
1. データベーススキーマ更新
   - suspend_statesテーブル削除
   - user_settingsカラム削除
2. 環境変数クリーンアップ
   - .env.example更新
   - GitHub Secrets削除
3. GitHub Actions workflow削除
   - night-suspend-automation.yml削除

## 削除後の影響

### 正の影響
- コードベース約1,500行削減（約10%）
- テストカバレッジの向上（不要なテスト削除）
- システム複雑性の大幅削減
- GitHub Actions実行時間の削減（月720回→0回）
- セキュリティリスクの軽減（HTTPエンドポイント削除）

### 考慮事項
- 既存ユーザーへの影響なし（機能未使用のため）
- データ移行は最小限（suspend時刻設定のみ削除）
- ロールバック可能（git revert）

## 検証項目

### 削除前
1. 現在のテストがすべてパスすることを確認
2. 本番環境でsuspend機能が使用されていないことを確認

### 削除後
1. 全テストがパスすることを確認
2. !help, !cost, !summary等の主要機能が正常動作
3. データベース接続・操作が正常
4. ログ出力にエラーがないこと

## ロールバック計画
問題が発生した場合：
1. `git revert`で変更を戻す
2. データベーススキーマを復元（バックアップから）
3. GitHub Actions workflowを再有効化
4. 環境変数を復元

## まとめ
- **削除ファイル数**: 14ファイル
- **修正ファイル数**: 6ファイル
- **削除コード行数**: 約1,500行
- **リスク**: 低（未使用機能のため）
- **メリット**: システム簡素化、保守性向上