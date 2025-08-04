# テスト安定性向上ガイド

## 概要
このガイドは、TimeLoggerプロジェクトのテストの安定性を向上させ、実行時間を最適化するための推奨事項をまとめたものです。

## 問題の背景
- **並列実行による競合**: 複数のテストが同じデータベースファイルにアクセスすることで競合が発生
- **WALファイルの残留**: SQLiteのWrite-Ahead Loggingファイルが適切にクリーンアップされない
- **タイミング依存**: 非同期処理のタイミングに依存するテストの不安定性
- **オーバーヘッド**: テストごとの独立したデータベース作成による実行時間の増大

## 最適化された解決策

### アーキテクチャの改善点
1. **単一共有データベース**: すべてのテストで1つのデータベースファイルを共有
2. **データ分離キー**: 各テストに一意のキーを付与し、データの衝突を防止
3. **接続プール**: データベース接続を再利用し、オーバーヘッドを削減
4. **WALモード**: SQLiteのWrite-Ahead Loggingで並行性を向上

### 1. テスト実行モードの使い分け

#### 安定性重視（推奨）
```bash
# 最も安定した実行方法（順次実行）
npm run test:stable

# デバッグ情報付き
npm run test:debug
```

#### 速度重視
```bash
# 並列実行（4ワーカー）
npm run test:fast

# バランス型（2ワーカー）
npm run test:balanced
```

#### 特定のテストグループ
```bash
# 単体テストのみ
npm run test:unit

# 統合テストのみ（順次実行）
npm run test:integration:sequential

# E2Eテストのみ
npm run test:e2e
```

### 2. データベース分離戦略

#### テストごとの独立したデータベース
各テストファイルは独自のデータベースを使用します：
- ファイル名: `test-{testname}-{timestamp}-{random}.db`
- 場所: `test-data/` ディレクトリ
- 自動クリーンアップ: テスト終了後に自動削除

#### 実装例
```typescript
import { getTestDatabaseConnection } from '../jest-setup';

describe('MyFeature', () => {
  let connection: DatabaseConnection;
  
  beforeEach(async () => {
    // テスト専用のデータベースを取得
    connection = getTestDatabaseConnection('my-feature');
    await connection.ensureSchema();
  });
  
  afterEach(async () => {
    // 自動的にクリーンアップされる
    await connection.close();
  });
});
```

### 3. タイミング問題の回避

#### 非同期処理の適切な待機
```typescript
// ❌ 悪い例: タイミング依存
await someAsyncOperation();
expect(result).toBe(expected); // タイミングによって失敗する可能性

// ✅ 良い例: 明示的な待機
await someAsyncOperation();
await new Promise(resolve => setTimeout(resolve, 100)); // 必要に応じて待機
expect(result).toBe(expected);
```

#### リトライロジックの実装
```typescript
// タイミング依存のテストにはリトライを実装
async function waitForCondition(
  condition: () => boolean, 
  timeout: number = 5000
): Promise<void> {
  const start = Date.now();
  while (!condition() && Date.now() - start < timeout) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!condition()) {
    throw new Error('Condition not met within timeout');
  }
}
```

### 4. クリーンアップの徹底

#### WALファイルの手動クリーンアップ
```bash
# テスト後のWALファイル削除
npm run test:cleanup
```

#### グローバルクリーンアップ設定
`jest-setup.ts`により以下が自動実行されます：
- 各テスト後: 使用したデータベース接続のクローズ
- 全テスト後: 残留ファイルの削除

### 5. CI/CD環境での設定

#### GitHub Actions設定例
```yaml
- name: Run Tests (Stable)
  run: |
    npm run test:stable
  env:
    CI: true
    NODE_ENV: test
```

### 6. トラブルシューティング

#### テストが不安定な場合
1. まず順次実行を試す: `npm run test:stable`
2. デバッグ情報を確認: `npm run test:debug`
3. 特定のテストを単独実行: `npm test -- path/to/test.ts`

#### データベースエラーの場合
1. WALファイルをクリーンアップ: `npm run test:cleanup`
2. test-dataディレクトリを確認: `ls test-data/`
3. 必要に応じて手動削除: `rm test-data/test-*.db*`

### 7. ベストプラクティス

#### テスト作成時の注意点
- ✅ 各テストファイルで独立したデータベースを使用
- ✅ 非同期処理は適切に待機
- ✅ グローバルな状態に依存しない
- ✅ テスト後のクリーンアップを確実に実行
- ❌ 他のテストの実行順序に依存しない
- ❌ ファイルシステムの共有リソースを直接操作しない

#### パフォーマンス最適化
- 単体テストは並列実行可能（`test:fast`）
- データベーステストは順次実行推奨（`test:stable`）
- CI環境では安定性を優先

## まとめ
テストの安定性と速度はトレードオフの関係にあります。開発時は`test:stable`で安定性を優先し、CI環境では適切な設定で両立を図ることを推奨します。