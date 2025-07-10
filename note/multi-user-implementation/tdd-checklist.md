# マルチユーザー対応 TDD チェックリスト

## 🔴🟢♻️ TDD サイクル管理

### 基本原則
- **Red**: 失敗するテストを先に書く
- **Green**: テストを通す最小限の実装
- **Refactor**: テストを通したままコードを改善

## 📋 Phase 1: 基本マルチユーザー対応

### 1.1 ユーザー制限削除

#### 🔴 Red Phase
- [ ] 複数ユーザーが利用できることを期待するテストを作成
- [ ] 現在のシングルユーザー制限により失敗することを確認
- [ ] テストの失敗理由が明確であることを確認

**テスト例**:
```typescript
test('複数ユーザーが同時にメッセージを送信できる', async () => {
  const user1Message = createMockMessage('user1', 'タスク開始');
  const user2Message = createMockMessage('user2', '会議参加');
  
  const result1 = await integration.handleMessage(user1Message);
  const result2 = await integration.handleMessage(user2Message);
  
  expect(result1).toBe(true); // 現在は失敗する
  expect(result2).toBe(true); // 現在は失敗する
});
```

#### 🟢 Green Phase
- [ ] `src/integration/activityLoggingIntegration.ts:242-246` の制限コードを削除
- [ ] テストが通ることを確認
- [ ] 他のテストが壊れていないことを確認

#### ♻️ Refactor Phase
- [ ] 削除により不要になったコメントの整理
- [ ] ログメッセージの調整
- [ ] コードフォーマットの統一

### 1.2 自動ユーザー登録機能

#### 🔴 Red Phase
- [ ] 新規ユーザーの自動登録を期待するテストを作成
- [ ] 登録機能が存在しないため失敗することを確認

**テスト例**:
```typescript
test('新規ユーザーが自動登録される', async () => {
  const newUserId = 'new-user-123';
  const message = createMockMessage(newUserId, '初回メッセージ');
  
  await integration.handleMessage(message);
  
  const userExists = await repository.userExists(newUserId);
  expect(userExists).toBe(true); // 現在は失敗する
});
```

#### 🟢 Green Phase
- [ ] `IUserRepository` インターフェースの定義
- [ ] `userExists()` メソッドの実装
- [ ] `registerUser()` メソッドの実装
- [ ] `ensureUserRegistered()` メソッドの実装
- [ ] テストが通ることを確認

#### ♻️ Refactor Phase
- [ ] エラーハンドリングの強化
- [ ] ログメッセージの改善
- [ ] パフォーマンスの最適化

### 1.3 ウェルカムメッセージ機能

#### 🔴 Red Phase
- [ ] 新規ユーザーにウェルカムメッセージが送信されるテストを作成
- [ ] 機能が存在しないため失敗することを確認

#### 🟢 Green Phase
- [ ] `getWelcomeMessage()` メソッドの実装
- [ ] 新規登録時のメッセージ送信機能
- [ ] テストが通ることを確認

#### ♻️ Refactor Phase
- [ ] メッセージ内容の調整
- [ ] 国際化対応の検討
- [ ] メッセージテンプレート化

## 📋 Phase 2: プロファイル管理機能

### 2.1 UserProfile型定義

#### 🔴 Red Phase
- [ ] UserProfile型を使用するテストを作成
- [ ] 型定義が存在しないため失敗することを確認

#### 🟢 Green Phase
- [ ] `src/types/userProfile.ts` の作成
- [ ] UserProfile, UserActivityStats 型の定義
- [ ] テストが通ることを確認

#### ♻️ Refactor Phase
- [ ] 型の完全性チェック
- [ ] オプショナルフィールドの見直し
- [ ] JSDocコメントの追加

### 2.2 ProfileCommandHandler実装

#### 🔴 Red Phase
- [ ] !profile コマンドの動作を期待するテストを作成
- [ ] ハンドラーが存在しないため失敗することを確認

**テスト例**:
```typescript
test('!profileコマンドでユーザー情報が表示される', async () => {
  const userId = 'test-user';
  await repository.registerUser(userId, 'TestUser');
  
  const message = createMockMessage(userId, '!profile');
  await integration.handleMessage(message);
  
  expect(message.reply).toHaveBeenCalledWith(
    expect.stringContaining('プロファイル情報')
  );
});
```

#### 🟢 Green Phase
- [ ] `ProfileCommandHandler` クラスの実装
- [ ] `handleProfileCommand()` メソッドの実装
- [ ] `formatProfile()` メソッドの実装
- [ ] ActivityLoggingIntegration への統合
- [ ] テストが通ることを確認

#### ♻️ Refactor Phase
- [ ] 表示フォーマットの改善
- [ ] オプション解析機能の強化
- [ ] エラーハンドリングの充実

### 2.3 ユーザー統計機能

#### 🔴 Red Phase
- [ ] ユーザー統計取得を期待するテストを作成
- [ ] 統計機能が存在しないため失敗することを確認

#### 🟢 Green Phase
- [ ] `getUserStats()` メソッドの実装
- [ ] 各種統計取得メソッドの実装
- [ ] テストが通ることを確認

#### ♻️ Refactor Phase
- [ ] 統計計算の最適化
- [ ] キャッシュ機能の検討
- [ ] 精度の向上

## 📋 Phase 3: データベース拡張

### 3.1 マイグレーション実装

#### 🔴 Red Phase
- [ ] 拡張カラムを使用するテストを作成
- [ ] カラムが存在しないため失敗することを確認

#### 🟢 Green Phase
- [ ] `002_user_settings_enhancement.sql` の作成
- [ ] マイグレーション実行機能の実装
- [ ] テストが通ることを確認

#### ♻️ Refactor Phase
- [ ] マイグレーション安全性の確認
- [ ] ロールバック対応
- [ ] インデックス最適化

### 3.2 統計クエリ最適化

#### 🔴 Red Phase
- [ ] 大量データでのパフォーマンステストを作成
- [ ] 現在の実装では性能が不十分で失敗することを確認

#### 🟢 Green Phase
- [ ] インデックスの追加
- [ ] クエリの最適化
- [ ] テストが通ることを確認

#### ♻️ Refactor Phase
- [ ] さらなる最適化
- [ ] メモリ使用量の削減
- [ ] 並列処理の検討

## 📋 統合テスト

### マルチユーザー動作確認

#### 🔴 Red Phase
- [ ] 包括的なマルチユーザーシナリオテストを作成
- [ ] 複雑なケースで失敗することを確認

**テストシナリオ**:
```typescript
test('複雑なマルチユーザーシナリオ', async () => {
  // 1. 複数ユーザーの同時登録
  // 2. 各ユーザーが独立してログ記録
  // 3. プロファイル表示
  // 4. 統計情報確認
  // 5. データ分離確認
});
```

#### 🟢 Green Phase
- [ ] 全機能の統合
- [ ] エッジケースの対応
- [ ] テストが通ることを確認

#### ♻️ Refactor Phase
- [ ] パフォーマンス最適化
- [ ] メモリリーク対策
- [ ] エラーハンドリング強化

## 🔍 各段階での確認事項

### コミット前チェック
- [ ] 全てのテストが通る
- [ ] TypeScriptビルドエラーなし
- [ ] ESLint警告なし
- [ ] 既存機能の回帰なし

### 各Phase完了時チェック
- [ ] 機能テストの実行
- [ ] パフォーマンステスト
- [ ] セキュリティチェック
- [ ] ドキュメント更新

### TDDサイクル品質チェック
- [ ] 各テストが単一の責務をテストしている
- [ ] テストが分かりやすい名前を持っている
- [ ] 実装が過度に複雑でない
- [ ] リファクタリング後もテストが通る

## 🚨 TDD実践での注意点

### Red Phase
- **しっかり失敗させる**: テストが期待通り失敗することを確認
- **理由を明確に**: なぜ失敗するかを理解する
- **シンプルに**: 一度に一つのことだけテストする

### Green Phase
- **最小限の実装**: テストを通すための最小限のコードのみ
- **仮実装でもOK**: ハードコードでも構わない
- **動くことを優先**: 設計は後で改善

### Refactor Phase
- **テストを維持**: リファクタリング中もテストが通ることを確認
- **少しずつ改善**: 大きな変更は避ける
- **設計を改善**: DRY原則、SOLID原則に従う

## 🎯 成功指標

### Phase 1完了時
- [ ] 複数ユーザーが問題なく利用できる
- [ ] 新規ユーザーが自動登録される
- [ ] 既存ユーザーに影響がない

### Phase 2完了時
- [ ] プロファイル表示が正常に動作する
- [ ] ユーザー統計が正確に表示される
- [ ] 表示フォーマットが適切

### Phase 3完了時
- [ ] データベース拡張が正常に動作する
- [ ] パフォーマンスが維持されている
- [ ] 大量データでも問題ない

### 最終確認
- [ ] 全ての機能が期待通り動作する
- [ ] セキュリティ要件を満たしている
- [ ] 本番環境での動作に問題がない
- [ ] ドキュメントが完整している