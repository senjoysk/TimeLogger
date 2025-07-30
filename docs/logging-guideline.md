# ログ使用ガイドライン

## 概要

このプロジェクトでは、`console.log`や`console.error`の直接使用を禁止し、統一されたLoggerサービスの使用を義務付けています。

## なぜLoggerサービスを使うのか

1. **統一されたログフォーマット**: すべてのログが一貫した形式で出力される
2. **ログレベル制御**: 環境変数でログ出力を制御できる
3. **セキュリティ**: 本番環境での情報漏洩リスクを低減
4. **デバッグ効率**: 構造化されたログで問題の追跡が容易
5. **テスト容易性**: テスト時にログをモック化できる

## 基本的な使い方

### 1. Loggerのインポート

```typescript
import { logger } from '../utils/logger';
```

### 2. ログレベル

- `logger.debug()`: デバッグ情報（開発時のみ）
- `logger.info()`: 一般的な情報
- `logger.warn()`: 警告
- `logger.error()`: エラー
- `logger.success()`: 成功メッセージ

### 3. 基本的な記法

```typescript
// operation（操作名）とmessage（メッセージ）を指定
logger.info('COMPONENT_NAME', 'メッセージ');

// 追加データがある場合
logger.info('USER_SERVICE', 'ユーザー登録完了', {
  userId: '12345',
  email: 'user@example.com'
});

// エラーの場合
logger.error('DATABASE', 'クエリ実行失敗', error, {
  query: 'SELECT * FROM users',
  userId: '12345'
});
```

## 移行ガイド

### console.logからの移行

```typescript
// ❌ 非推奨
console.log('ユーザーがログインしました');

// ✅ 推奨
logger.info('AUTH', 'ユーザーがログインしました');
```

### console.errorからの移行

```typescript
// ❌ 非推奨
console.error('エラーが発生しました:', error);

// ✅ 推奨
logger.error('SYSTEM', 'エラーが発生しました', error);
```

### デバッグログ

```typescript
// ❌ 非推奨
console.log('デバッグ:', { data });

// ✅ 推奨
logger.debug('DEBUG', 'デバッグ情報', { data });
```

## コンポーネント名の規約

コンポーネント名（operation）は、ログの発生源を明確にするために使用します。

### 推奨される命名規則

- `APP`: アプリケーション全体
- `CONFIG`: 設定関連
- `DATABASE`: データベース操作
- `API`: 外部API呼び出し
- `DISCORD`: Discord関連
- `SCHEDULER`: スケジューラー
- `GEMINI`: Gemini AI関連
- `AUTH`: 認証関連
- `VALIDATION`: バリデーション
- `SYSTEM`: システム全般

### カスタムコンポーネント名

特定のサービスやハンドラーの場合は、そのクラス名を使用：

```typescript
// GeminiServiceクラスの場合
logger.info('GEMINI_SERVICE', 'AI分析完了');

// UserRepositoryクラスの場合
logger.debug('USER_REPOSITORY', 'ユーザー検索実行');
```

## 環境変数による制御

### ログレベル制御

```bash
# .env
LOG_LEVEL=DEBUG  # DEBUG, INFO, WARN, ERROR
```

### ログ抑制

```bash
# .env
SUPPRESS_LOGS=true  # すべてのログを抑制（テスト環境など）
```

## テストでの使用

### モックの使用

```typescript
import { createMockLogger } from '../utils/mockLogger';

describe('MyService', () => {
  let mockLogger: MockLogger;

  beforeEach(() => {
    mockLogger = createMockLogger();
  });

  test('ログが正しく出力される', () => {
    // テストコード
    
    expect(mockLogger.info).toHaveBeenCalledWith(
      'SERVICE',
      '処理完了',
      { count: 10 }
    );
  });
});
```

## エラーハンドリングとの統合

ErrorHandlerクラスと統合されているため、AppError派生クラスは自動的に適切なログレベルで記録されます：

```typescript
import { DatabaseError } from '../errors';
import { ErrorHandler } from '../utils/errorHandler';

try {
  // データベース操作
} catch (error) {
  const dbError = new DatabaseError('接続失敗', { userId });
  ErrorHandler.handle(dbError); // 自動的にlogger.errorが呼ばれる
}
```

## ベストプラクティス

### 1. 構造化されたデータを渡す

```typescript
// ✅ 良い例
logger.info('USER', 'ユーザー作成', {
  userId: user.id,
  email: user.email,
  timestamp: new Date().toISOString()
});

// ❌ 悪い例
logger.info('USER', `ユーザー ${user.id} (${user.email}) を作成しました`);
```

### 2. エラーオブジェクトは第3引数に

```typescript
// ✅ 良い例
logger.error('API', 'API呼び出し失敗', error, { endpoint: '/users' });

// ❌ 悪い例
logger.error('API', 'API呼び出し失敗', { error, endpoint: '/users' });
```

### 3. 適切なログレベルを選択

- **DEBUG**: 開発時のみ必要な詳細情報
- **INFO**: 正常な処理フロー
- **WARN**: 注意が必要だが処理は継続可能
- **ERROR**: エラーが発生し、処理が失敗
- **SUCCESS**: 重要な処理の成功

### 4. 機密情報をログに含めない

```typescript
// ❌ 悪い例
logger.info('AUTH', 'ログイン', {
  password: user.password,  // パスワードをログに含めない
  token: authToken         // トークンをログに含めない
});

// ✅ 良い例
logger.info('AUTH', 'ログイン', {
  userId: user.id,
  email: user.email
});
```

## Pre-commitフック

コミット時に自動的にconsole使用をチェックします：

```bash
./scripts/code-review/console-usage-check.sh
```

このスクリプトは以下を除外してチェックします：
- テストファイル（`__tests__`、`*.test.ts`、`*.spec.ts`）
- logger.ts自体
- node_modules、dist、coverage

## まとめ

1. **必ず**Loggerサービスを使用する
2. **絶対に**console.log/errorを直接使わない
3. **常に**適切なログレベルを選択する
4. **決して**機密情報をログに含めない
5. **必ず**構造化されたデータを渡す

これらのガイドラインに従うことで、保守性が高く、セキュアなログシステムを維持できます。