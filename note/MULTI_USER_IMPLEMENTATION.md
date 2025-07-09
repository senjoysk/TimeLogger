# マルチユーザー対応実装仕様書

## 1. 概要

TimeLoggerを単一ユーザーからマルチユーザーシステムに拡張する実装仕様書です。
データベーススキーマは既にマルチユーザー対応済みのため、主にアプリケーションレベルの変更で実現します。

## 2. 現状分析

### 2.1 現在のシングルユーザー実装
- **制限箇所**: `src/integration/activityLoggingIntegration.ts:242-246`
- **制限方法**: 環境変数`TARGET_USER_ID`との比較
- **デフォルト値**: `'770478489203507241'`（ハードコーディング）

### 2.2 データベース状況
- **対応状況**: 全テーブルに`user_id`カラムが存在
- **主要テーブル**: `activity_logs`, `user_settings`, `api_costs`, `todo_tasks`
- **インデックス**: ユーザー別クエリ最適化済み

## 3. 実装計画

### 3.1 Phase 1: 基本的なマルチユーザー対応

#### 3.1.1 ユーザー制限の削除
```typescript
// 修正対象: src/integration/activityLoggingIntegration.ts:242-246
// 削除するコード:
if (userId !== this.config.targetUserId) {
  console.log(`  ↳ [活動記録] 対象外ユーザー (受信: ${userId}, 期待: ${this.config.targetUserId})`);
  return false;
}
```

#### 3.1.2 自動ユーザー登録機能
```typescript
// 追加機能: handleMessage内での自動登録
async handleMessage(message: Message): Promise<boolean> {
  const userId = message.author.id;
  
  // 新規ユーザーの自動登録
  const userExists = await this.repository.userExists(userId);
  if (!userExists) {
    await this.registerNewUser(userId, message.author.username);
    await message.reply(this.getWelcomeMessage());
  }
  
  // 既存処理を継続
}
```

#### 3.1.3 必要なメソッド追加
```typescript
// SqliteActivityLogRepository に追加
async userExists(userId: string): Promise<boolean>
async registerUser(userId: string, username: string): Promise<void>
async getUserInfo(userId: string): Promise<UserInfo | null>
```

### 3.2 Phase 2: プロファイル管理

#### 3.2.1 新規コマンド
- `!profile`: ユーザー情報表示
- `!register`: 明示的登録（既存ユーザーの場合は情報表示）

#### 3.2.2 実装ファイル
- `src/handlers/profileCommandHandler.ts`（新規作成）
- `src/types/userProfile.ts`（新規作成）

### 3.3 Phase 3: 権限管理（オプション）

#### 3.3.1 管理者機能
- 環境変数`ADMIN_USER_IDS`で管理者指定
- `!admin users`: ユーザー一覧
- `!admin stats`: システム統計

#### 3.3.2 利用制限オプション
- `ALLOW_NEW_USERS=false`: 新規登録無効化
- `WHITELIST_USERS`: ホワイトリスト指定

## 4. データベース変更

### 4.1 既存スキーマ確認
```sql
-- 既存のuser_settingsテーブル（変更不要）
CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY,
    timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);
```

### 4.2 追加するカラム（必要に応じて）
```sql
-- user_settingsテーブル拡張案
ALTER TABLE user_settings ADD COLUMN username TEXT;
ALTER TABLE user_settings ADD COLUMN first_seen TEXT;
ALTER TABLE user_settings ADD COLUMN last_seen TEXT;
ALTER TABLE user_settings ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
```

## 5. ユーザー体験設計

### 5.1 初回利用フロー
```
ユーザー: こんにちは、TimeLoggerを使いたいです
Bot: 初めまして！TimeLoggerへようこそ🎉
     アカウントを自動作成しました。
     
     📊 アカウント情報
     ユーザーID: 770478489203507241
     タイムゾーン: Asia/Tokyo
     登録日: 2025-07-09
     
     📝 使い方
     - 活動記録: そのままメッセージを送信
     - 今日のサマリー: !summary
     - コマンド一覧: !help
     
     さっそく今日の活動を記録してみましょう！
```

### 5.2 プロファイル表示
```
ユーザー: !profile
Bot: 📊 プロファイル情報
     
     👤 基本情報
     ユーザーID: 770478489203507241
     ユーザー名: user_example
     登録日: 2025-01-15
     最終利用: 2025-07-09 14:30
     
     ⚙️ 設定
     タイムゾーン: Asia/Tokyo
     
     📈 統計
     総ログ数: 1,234件
     今月のログ数: 156件
     今週のログ数: 42件
```

### 5.3 エラーハンドリング
```
Bot: ⚠️ ユーザー登録に失敗しました
     システムエラー: Database connection failed
     
     一時的な問題の可能性があります。
     数分後に再度お試しください。
     
     問題が続く場合は管理者にお問い合わせください。
```

## 6. 実装優先順位

### 6.1 必須実装（Phase 1）
1. **ユーザー制限削除**
   - `ActivityLoggingIntegration.handleMessage`修正
   - テスト作成・実行

2. **自動ユーザー登録**
   - `SqliteActivityLogRepository.userExists`実装
   - `ActivityLoggingIntegration.registerNewUser`実装
   - 統合テスト作成

3. **プロファイル機能**
   - `ProfileCommandHandler`実装
   - `!profile`コマンド対応

### 6.2 推奨実装（Phase 2）
1. **ユーザー管理機能**
   - ユーザー統計表示
   - 利用状況モニタリング

2. **エラーハンドリング強化**
   - 登録失敗時の処理
   - データベースエラー対応

### 6.3 オプション実装（Phase 3）
1. **管理者機能**
   - 管理者権限チェック
   - システム管理コマンド

2. **利用制限機能**
   - ホワイトリスト対応
   - 新規登録制限

## 7. テスト戦略

### 7.1 TDD実装順序
1. **Red**: マルチユーザー対応の失敗テスト
2. **Green**: 最小限の実装
3. **Refactor**: コードの改善

### 7.2 テストケース
```typescript
// 基本的なマルチユーザーテスト
describe('Multi-user Support', () => {
  test('複数ユーザーが同時に利用可能', async () => {
    const user1 = await createTestUser('user1');
    const user2 = await createTestUser('user2');
    
    // 両ユーザーが独立してログを記録
    await user1.sendMessage('プロジェクトA開始');
    await user2.sendMessage('会議参加');
    
    // データが分離されていることを確認
    const user1Logs = await repository.getActivityLogs(user1.id);
    const user2Logs = await repository.getActivityLogs(user2.id);
    
    expect(user1Logs).toHaveLength(1);
    expect(user2Logs).toHaveLength(1);
    expect(user1Logs[0].content).toBe('プロジェクトA開始');
    expect(user2Logs[0].content).toBe('会議参加');
  });
});
```

### 7.3 統合テストシナリオ
1. **新規ユーザー登録フロー**
2. **既存ユーザーの継続利用**
3. **複数ユーザーの同時利用**
4. **データ分離の確認**
5. **権限管理の動作確認**

## 8. 移行計画

### 8.1 既存データの保護
- 現在の`TARGET_USER_ID`ユーザーのデータは保持
- 新規ユーザーは別のuser_idで管理
- データベースの論理的な分離

### 8.2 段階的展開
1. **開発環境での実装・テスト**
2. **プライベートベータ（限定ユーザー）**
3. **フルリリース**

### 8.3 ロールバック計画
- 環境変数`TARGET_USER_ID`の復活で単一ユーザーモードに戻る
- データベースの状態は変更しない
- 設定変更のみで対応可能

## 9. セキュリティ考慮事項

### 9.1 データプライバシー
- ユーザー間でのデータ完全分離
- 他ユーザーのログへのアクセス禁止
- 管理者機能の適切な権限管理

### 9.2 レート制限
```typescript
// 実装例
const RATE_LIMITS = {
  MESSAGES_PER_MINUTE: 60,
  COMMANDS_PER_MINUTE: 10,
  DAILY_MESSAGES: 1000
};
```

### 9.3 データ検証
- ユーザーIDの形式チェック
- SQLインジェクション対策
- 入力データのサニタイズ

## 10. 実装チェックリスト

### 10.1 必須項目
- [ ] ユーザー制限の削除
- [ ] 自動ユーザー登録機能
- [ ] プロファイル表示機能
- [ ] マルチユーザー統合テスト
- [ ] データ分離の確認テスト

### 10.2 推奨項目
- [ ] エラーハンドリング強化
- [ ] ユーザー統計機能
- [ ] 管理者機能（基本）
- [ ] パフォーマンステスト

### 10.3 オプション項目
- [ ] ホワイトリスト機能
- [ ] 高度な管理者機能
- [ ] 利用制限機能
- [ ] モニタリング機能

## 11. 参考ファイル

### 11.1 修正対象ファイル
- `src/integration/activityLoggingIntegration.ts`
- `src/repositories/sqliteActivityLogRepository.ts`
- `src/config.ts`

### 11.2 新規作成ファイル
- `src/handlers/profileCommandHandler.ts`
- `src/types/userProfile.ts`
- `src/__tests__/integration/multiUser.test.ts`

### 11.3 関連ドキュメント
- `CLAUDE.md`: TDD開発方針
- `DEVELOPMENT_CHECKLIST.md`: 開発チェックリスト
- `src/database/newSchema.sql`: データベーススキーマ

---

## 更新履歴
- 2025-07-09: 初版作成
- 次回更新: 実装進捗に応じて更新予定