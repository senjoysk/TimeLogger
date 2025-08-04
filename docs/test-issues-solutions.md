# テスト実行時の既知の問題と解決策

## 1. プロセス強制終了の警告

### 症状
```
A worker process has failed to exit gracefully and has been force exited. 
This is likely caused by tests leaking due to improper teardown.
```

### 原因
- SQLiteデータベース接続の非同期処理
- Discord.jsのWebSocketコネクション
- node-cronのスケジューラー
- タイマーやPromiseのリーク

### 解決策

#### 現在の対策（実装済み）
1. **`forceExit: true`** - Jestがテスト完了後に強制終了
2. **接続プール管理** - データベース接続を適切にクローズ
3. **タイマークリーンアップ** - `jest.clearAllTimers()`を各テスト後に実行

#### デバッグ方法
```bash
# ハンドルリークを検出
DEBUG=true npm test

# 特定のテストファイルで調査
npm test -- --detectOpenHandles path/to/test.ts
```

### 影響
- **テスト結果には影響なし** - テストは正常に完了
- **CI/CD環境では問題なし** - 強制終了は期待される動作

## 2. Logger モックの問題

### 症状
```
Expected: "DATABASE", "データベースエラー", ...
Number of calls: 0
```

### 原因
- `logger`がクラスインスタンスとしてエクスポートされている
- モックのタイミングが遅い

### 解決策
```typescript
// テストファイルの先頭でモック
jest.mock('../../utils/logger');

// または、setup.tsでグローバルモック
jest.mock('./utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    success: jest.fn()
  }
}));
```

## 3. テストの不安定性

### 症状
- テストが時々失敗する
- 再実行すると成功する

### 原因
- データベースの競合
- タイミング依存のテスト
- 非同期処理の待機不足

### 解決策

#### 安定実行モード
```bash
# 順次実行（最も安定）
npm run test:stable

# デフォルト（2ワーカー、バランス型）
npm test
```

#### テストヘルパーの活用
```typescript
import { 
  generateTestUserId,
  cleanupTestData 
} from '../test-helper';

// テストごとにユニークなIDを使用
const userId = generateTestUserId('my-test');
```

## 4. 推奨される実行方法

### 開発時
```bash
# 通常の開発（高速、適度な並列化）
npm test

# 問題がある場合（安定性重視）
npm run test:stable
```

### CI環境
```bash
# 自動的に1ワーカーで実行（環境変数CI=trueで判定）
npm test
```

### デバッグ時
```bash
# 詳細ログとハンドル検出
DEBUG=true npm test -- --verbose
```

## 5. パフォーマンス最適化のトレードオフ

| 設定 | 速度 | 安定性 | 使用場面 |
|------|------|--------|----------|
| 4ワーカー | 最速 | 低 | ローカル開発（問題ない場合） |
| 2ワーカー | 速い | 中 | デフォルト設定 |
| 1ワーカー | 遅い | 高 | CI環境、トラブルシューティング |

## まとめ

現在の設定は以下のバランスを取っています：

1. **実行速度**: 2ワーカーでの適度な並列化
2. **安定性**: 共有データベースとデータ分離キー
3. **保守性**: 強制終了で確実にプロセスを終了

プロセス強制終了の警告は無視して問題ありません。これは、非同期リソースを使用するアプリケーションでは一般的な現象です。