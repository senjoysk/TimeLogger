# 開発チェックリスト（TDD版）

## 🔴🟢♻️ t_wada式TDD開発チェックリスト

### テスト駆動開発の原則
1. **Red Phase（失敗）**: 最初に失敗するテストを書く
2. **Green Phase（成功）**: テストを通す最小限の実装
3. **Refactor Phase（改善）**: テストが通る状態を維持しながらリファクタリング

### 現在のシステム構成
- **メインシステム**: ActivityLoggingIntegration（活動記録システム統合）
- **Repository**: SqliteActivityLogRepository（活動ログ + APIコスト監視）
- **サービス層**: GeminiService, ActivityLogService, UnifiedAnalysisService等
- **ハンドラー層**: ICommandHandler実装による個別コマンド処理
- **テスト**: __tests__/ ディレクトリで45.5%カバレッジ達成

---

## 🚀 新機能開発時のTDDチェックリスト

### 1. 🔴 Red Phase - 失敗するテストから開始
- [ ] **TODOリスト作成**: 実装する機能をTODOリストに分解
- [ ] **テストファイル作成**: `__tests__/` に新しいテストファイルを作成
- [ ] **最初のテスト記述**: 最も簡単な失敗するテストを1つ書く
- [ ] **テスト実行**: `npm run test:watch`で赤い状態を確認
- [ ] **インターフェース定義**: テストに必要な型・インターフェースのみ定義

### 3. ♻️ Refactor Phase - リファクタリング
- [ ] **重複除去**: DRY原則に従ってコードを整理
- [ ] **命名改善**: より明確な変数名・関数名に変更
- [ ] **構造改善**: より良い設計パターンの適用
- [ ] **テスト確認**: 各変更後にテストが通ることを確認
- [ ] **日本語コメント追加**: 実装の意図を説明するコメントを追加

### 4. 新しいコマンド追加時のTDDフロー

#### 4.1 🔴 テストファースト
- [ ] **ハンドラーテスト作成**: `__tests__/handlers/newCommandHandler.test.ts`
- [ ] **失敗するテスト記述**: 
```typescript
describe('NewCommandHandler', () => {
  it('基本的なコマンド処理ができること', async () => {
    const handler = new NewCommandHandler(/* 依存性 */);
    const result = await handler.handle(mockMessage, ['arg1']);
    expect(result).toBe(true);
  });
});
```
- [ ] **テスト実行**: 赤い状態を確認

#### 4.2 🟢 実装
- [ ] **最小限の実装**: `ICommandHandler`を実装
- [ ] **テスト通過確認**: 緑になることを確認
- [ ] **統合テスト追加**: ActivityLoggingIntegrationへの統合テスト
- [ ] **実装拡張**: より複雑なケースに対応

#### 4.3 ♻️ リファクタリング
- [ ] **ActivityLoggingIntegration統合**: `handleCommand()`に追加
- [ ] **自然言語対応**: キーワード検索への追加
- [ ] **ヘルプメッセージ更新**: コマンド説明の追加

### 5. 新しいサービス追加時のTDDフロー

#### 5.1 🔴 インターフェーステスト
- [ ] **インターフェース定義**: 必要最小限のメソッドのみ
- [ ] **モックテスト作成**: インターフェースを使ったテスト
- [ ] **失敗確認**: 実装がないため失敗することを確認

#### 5.2 🟢 サービス実装
- [ ] **空実装**: インターフェースを満たす最小実装
- [ ] **依存性注入**: コンストラクタでリポジトリを受け取る
- [ ] **段階的実装**: テストを1つずつ通していく

#### 5.3 ♻️ 統合
- [ ] **ActivityLoggingIntegration追加**: `initialize()`での初期化
- [ ] **エラーハンドリング**: `withErrorHandling`の適用
- [ ] **ログ出力**: 適切なデバッグログの追加

### 6. データベース変更時のTDDフロー

#### 6.1 🔴 リポジトリテスト
- [ ] **失敗するテスト**: 新しいメソッドのテストを先に書く
- [ ] **型定義**: `types/activityLog.ts` に必要な型のみ追加
- [ ] **インターフェース更新**: 必要なメソッドシグネチャ追加

#### 6.2 🟢 実装
- [ ] **スキーマ更新**: 必要なカラム/テーブル追加
- [ ] **Repository実装**: SqliteActivityLogRepositoryにメソッド追加
- [ ] **テスト通過**: 全テストが緑になることを確認

#### 6.3 ♻️ 改善
- [ ] **インデックス追加**: パフォーマンス最適化
- [ ] **トランザクション**: 適切なトランザクション境界
- [ ] **マイグレーション**: 既存データの移行処理

---

## 🧪 TDDサイクルの実践例

### 例: 新しい「!history」コマンドの追加

#### 1️⃣ Red Phase（5分）
```bash
# テストファイル作成
touch src/__tests__/handlers/historyCommandHandler.test.ts

# テスト実行（監視モード）
npm run test:watch -- historyCommandHandler
```

```typescript
// 最初の失敗するテスト
it('過去7日間の履歴を表示できること', async () => {
  const handler = new HistoryCommandHandler(mockService);
  const result = await handler.handle(mockMessage, ['7']);
  expect(result).toBe(true);
  expect(mockMessage.reply).toHaveBeenCalledWith(
    expect.stringContaining('過去7日間の活動履歴')
  );
});
```

#### 2️⃣ Green Phase（10分）
```typescript
// 最小限の実装
export class HistoryCommandHandler implements ICommandHandler {
  constructor(private activityService: IActivityLogService) {}
  
  async handle(message: Message, args: string[]): Promise<boolean> {
    // 仮実装：固定文字列を返す
    await message.reply('過去7日間の活動履歴\n準備中...');
    return true;
  }
}
```

#### 3️⃣ Refactor Phase（15分）
- 実際のサービス呼び出しに置き換え
- エラーハンドリング追加
- 日付パラメータの検証
- より多くのテストケース追加

---

---

## 🔄 既存コードのリファクタリング時のTDDチェックリスト

### 1. 🧪 特性テスト（Characterization Test）の作成
- [ ] **現状把握テスト**: 既存の動作を記録するテスト作成
- [ ] **カバレッジ確認**: 変更対象のカバレッジを100%に近づける
- [ ] **境界値テスト**: エッジケースのテスト追加
- [ ] **統合テスト**: 全体の動作を保証するテスト

### 2. ♻️ 安全なリファクタリング
- [ ] **小さなステップ**: 1つの変更ごとにテスト実行
- [ ] **Extract Method**: 長いメソッドを分割
- [ ] **Rename**: より適切な名前に変更
- [ ] **Move**: より適切な場所に移動
- [ ] **各ステップでテスト**: 常に緑を維持

---

---

## 🚨 クリティカル機能のTDD保護

### 1. 回帰テストの強化
- [ ] **ゴールデンテスト**: 重要な出力の期待値を保存
- [ ] **スナップショット**: 複雑な出力の自動比較
- [ ] **プロパティベーステスト**: ランダムな入力での不変条件
- [ ] **統合シナリオテスト**: 実際の使用パターンを再現

### 2. 重要コマンドのテスト駆動メンテナンス

#### ActivityLoggingIntegration コアテスト
```bash
# 常に実行すべきテストスイート
npm run test -- --testNamePattern="ActivityLoggingIntegration"
```

- [ ] **初期化テスト**: `initialize()` の全パターン
- [ ] **メッセージ処理テスト**: 各種メッセージタイプ
- [ ] **エラー回復テスト**: 障害からの自動回復
- [ ] **統合テスト**: 実際のワークフロー

#### クリティカルコマンド保護
| コマンド | テストファイル | 最重要テストケース |
|---------|--------------|------------------|
| `!cost` | `__tests__/integration/` | API費用の正確な計算 |
| `!summary` | `__tests__/handlers/newSummaryHandler.test.ts` | 日次サマリー生成 |
| `!timezone` | `__tests__/integration/` | タイムゾーン変換 |
| `!edit` | `__tests__/handlers/newEditCommandHandler.test.ts` | ログの更新・削除 |
| `!logs` | `__tests__/handlers/logsCommandHandler.test.ts` | ログ検索・表示 |

---

---

## 🔍 TDDコードレビューチェックリスト

### テストファースト確認
- [ ] **テストが先**: 実装より先にテストが書かれているか
- [ ] **小さなステップ**: 一度に多くを実装していないか
- [ ] **Red-Green-Refactor**: サイクルが守られているか
- [ ] **テスト可読性**: テストが仕様書として読めるか

### テスト品質
- [ ] **Arrange-Act-Assert**: テストの構造が明確か
- [ ] **単一責任**: 1テスト1検証になっているか
- [ ] **独立性**: テスト間に依存関係がないか
- [ ] **高速性**: テストが素早く実行されるか

### 実装品質
- [ ] **YAGNI**: 必要以上の実装をしていないか
- [ ] **DRY**: 適切な抽象化がされているか
- [ ] **SOLID**: 設計原則に従っているか
- [ ] **日本語コメント**: 意図が明確に説明されているか

---

---

## 📋 緊急時のTDD対応

### 1. 障害再現テストの作成
```bash
# 障害を再現するテストを最初に書く
touch src/__tests__/bugs/issue-xxx.test.ts
```

- [ ] **再現テスト**: 障害を確実に再現するテスト作成
- [ ] **最小再現**: 問題を最小限のコードで再現
- [ ] **失敗確認**: テストが赤であることを確認
- [ ] **修正実装**: テストを通す最小限の修正

### 2. 修正後の検証
- [ ] **回帰テスト**: 全テストスイートの実行
- [ ] **統合テスト**: エンドツーエンドの動作確認
- [ ] **性能テスト**: パフォーマンスへの影響確認
- [ ] **監視強化**: 同様の問題の早期発見体制

---

---

## ✅ TDDチェックリストの日常的な使い方

### 開発の開始
```bash
# 1. TODOリスト作成
# 2. 最初のテストを書く
npm run test:watch

# 3. Red → Green → Refactor のサイクル
# 4. コミット前の確認
npm run build
npm test
npm run test:coverage
```

### TDD習慣化のコツ
1. **タイマー活用**: 各フェーズに時間制限（Red:5分、Green:10分、Refactor:15分）
2. **ペアプロ/モブプロ**: チームでTDDを実践
3. **テストレビュー**: 実装レビューの前にテストをレビュー
4. **メトリクス追跡**: カバレッジとテスト実行時間の監視

### よくあるTDDアンチパターンと対策
| アンチパターン | 症状 | 対策 |
|--------------|------|------|
| 大きすぎるステップ | 30分以上Redのまま | より小さなテストに分割 |
| テスト後回し | 実装完了後にテスト追加 | ペアプロで相互監視 |
| 過剰な事前設計 | 使わないコードが多い | YAGNI原則の徹底 |
| テストのテスト | モックが複雑すぎる | シンプルな設計に変更 |

**🎯 目標**: 全ての変更をRed-Green-Refactorサイクルで実装し、カバレッジ80%以上を維持する