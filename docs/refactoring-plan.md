# 段階的リファクタリング計画

## 📊 現状分析

### 🚨 SRP違反ファイル（優先度別）

#### 🔥 最優先（1500行超・巨大ファイル）
**現在該当なし** - SRPチェックが阻止レベル設定済み

#### ⚠️ 高優先（800-1500行・大型ファイル）
1. **src/repositories/sqliteActivityLogRepository.ts** (2801行)
   - 実装インターフェース: 6個 (IActivityLogRepository, IApiCostRepository等)
   - 責任: 活動ログ、APIコスト、分析キャッシュ、ユーザー管理、統計
   - 技術債務: 高

#### 📋 中優先（500-800行・警告ファイル）
1. **src/services/geminiService.ts** (704行) 
   - 実装インターフェース: 1個 (IGeminiService実装)
   - 責任: AI分析、コスト監視、分類、プロンプト生成
   - 技術債務: 中（前回リファクタリング失敗により保留中）

## 🎯 段階的実行計画

### Phase 1: SqliteActivityLogRepository分割（最優先）
**目標**: 2801行 → 300-500行以下の複数ファイル

#### 1.1 インターフェース分離設計
```
SqliteActivityLogRepository (2801行)
↓
├── SqliteActivityLogRepository (核心機能: 300-400行)
├── SqliteApiCostRepository (APIコスト監視: 200-300行)
├── SqliteAnalysisCacheRepository (分析キャッシュ: 150-200行)
├── SqliteUserRepository (ユーザー管理: 200-250行)
└── SqliteStatsRepository (統計機能: 150-200行)
```

#### 1.2 実装手順
1. **インターフェース定義** - 各リポジトリの責任を明確化
2. **データベース接続共有** - 共通DBコネクション管理クラス作成
3. **段階的分割** - 1機能ずつ分離してテスト
4. **統合テスト** - 分割後の動作確認
5. **置き換え** - 元ファイルを新しい構造に置き換え

### Phase 2: GeminiService分割（中優先）
**目標**: 704行 → 200-300行以下の複数ファイル

#### 2.1 分割設計（前回の失敗を踏まえ慎重に）
```
GeminiService (704行)
↓
├── GeminiApiClient (API呼び出し: 150-200行)
├── GeminiPromptBuilder (プロンプト生成: 150-200行)
├── GeminiResponseParser (レスポンス解析: 100-150行)
└── GeminiService (統合管理: 150-200行)
```

#### 2.2 実装手順（リスク軽減）
1. **型定義強化** - 前回の型エラーを回避する詳細な型定義
2. **1機能ずつ分離** - プロンプト生成から開始（最もリスクが低い）
3. **後方互換性維持** - 既存のIGeminiServiceインターフェース完全保持
4. **広範囲テスト** - 各段階で全テスト実行確認

### Phase 3: 新規SRP違反の防止
**目標**: 継続的な品質保証

#### 3.1 自動監視の強化
- ESLintルールの最適化
- CIパイプラインでのSRPチェック
- 開発チーム向けガイドライン作成

## 📅 実行スケジュール

### Week 1: Phase 1 - SqliteActivityLogRepository分割
- **Day 1-2**: インターフェース設計と基盤作成
- **Day 3-4**: ApiCostRepository分離
- **Day 5**: AnalysisCacheRepository分離
- **Day 6**: UserRepository分離  
- **Day 7**: StatsRepository分離と統合テスト

### Week 2: Phase 2 - GeminiService分割（慎重に）
- **Day 1-2**: 型定義強化と分割設計再検討
- **Day 3**: PromptBuilder分離
- **Day 4**: ResponseParser分離
- **Day 5**: ApiClient分離
- **Day 6-7**: 統合テストと動作確認

### Week 3: Phase 3 - 継続的改善
- **Day 1-2**: 監視システム最適化
- **Day 3-4**: ドキュメント作成
- **Day 5-7**: 品質保証とベストプラクティス策定

## 🛡️ リスク管理

### 高リスク要因
1. **TypeScript型エラー** - 前回GeminiServiceで発生
2. **テスト破綻** - 194テストの維持
3. **統合機能の破損** - 複雑な依存関係

### 軽減戦略
1. **段階的コミット** - 各分離完了後に即座にコミット
2. **後方互換性維持** - 既存インターフェースの完全保持
3. **広範囲テスト** - 各段階で全テスト実行
4. **ロールバック準備** - 問題発生時の即座復旧

## 🎯 成功指標

### 定量的指標
- [ ] SqliteActivityLogRepository: 2801行 → 1500行以下に削減
- [ ] GeminiService: 704行 → 500行以下に削減
- [ ] 全テスト成功維持: 194/194テスト通過
- [ ] SRP違反数: 現在2件 → 0件

### 定性的指標
- [ ] 各ファイルの責任が明確化
- [ ] 新機能追加時の影響範囲縮小
- [ ] テストの保守性向上
- [ ] 開発速度の向上

## 📋 次のアクション

**即座に実行**:
1. Phase 1開始: SqliteActivityLogRepositoryのインターフェース設計
2. 基盤コード作成: DatabaseConnection共有クラス
3. 最初の分離: ApiCostRepository分離とテスト

このリファクタリング計画により、段階的かつ安全にSRP違反を解消し、保守性の高いコードベースを実現します。