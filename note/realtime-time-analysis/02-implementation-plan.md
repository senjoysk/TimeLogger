# RealTimeActivityAnalyzer 実装計画

## ファイル構造

```
src/
├── services/
│   ├── realTimeActivityAnalyzer.ts      # メインクラス
│   ├── timeInformationExtractor.ts      # 時刻抽出
│   ├── activityContentAnalyzer.ts       # 活動内容分析
│   └── timeConsistencyValidator.ts      # 整合性チェック
├── types/
│   └── realTimeAnalysis.ts              # 型定義
├── utils/
│   └── timePatterns.ts                  # 時刻パターン定義
└── __tests__/
    ├── services/
    │   ├── realTimeActivityAnalyzer.test.ts
    │   ├── timeInformationExtractor.test.ts
    │   ├── activityContentAnalyzer.test.ts
    │   └── timeConsistencyValidator.test.ts
    └── fixtures/
        └── timeAnalysisTestCases.ts      # テストケース
```

## 実装順序

### Step 1: 型定義とインターフェース
1. `src/types/realTimeAnalysis.ts` - 全ての型定義
2. `src/utils/timePatterns.ts` - 時刻パターンの定義

### Step 2: コアコンポーネント
1. `TimeInformationExtractor` - 時刻抽出ロジック
2. `ActivityContentAnalyzer` - 活動内容分析
3. `TimeConsistencyValidator` - 整合性チェック

### Step 3: メインクラス
1. `RealTimeActivityAnalyzer` - 全体統合
2. `ActivityLogService` への統合

### Step 4: テストとデバッグ
1. ユニットテスト作成
2. 統合テスト
3. パフォーマンステスト

## テストケース例

```typescript
const testCases = [
  {
    input: "[08:19] 7:38から8:20までTimeLoggerのリファクタリング",
    expected: {
      startTime: "2025-06-30T22:38:00.000Z", // 前日UTC
      endTime: "2025-06-30T23:20:00.000Z",
      totalMinutes: 42,
      confidence: 0.95,
      method: "explicit"
    }
  },
  {
    input: "さっき1時間プログラミングしてた",
    expected: {
      totalMinutes: 60,
      confidence: 0.7,
      method: "relative"
    }
  },
  // ... 他のテストケース
];
```

## 段階的移行計画

### Phase 1A: プロトタイプ (Week 1-2)
- 基本的な時刻抽出機能
- 明示的時刻パターンのサポート
- 簡単な活動分析

### Phase 1B: 機能拡張 (Week 3-4)
- 相対時刻の対応
- 並列活動の検出
- 警告システム

### Phase 1C: 統合 (Week 5-6)
- 既存システムとの統合
- データベース拡張
- パフォーマンス最適化

### Phase 1D: 検証 (Week 7-8)
- 実運用テスト
- バグ修正
- ドキュメント整備

## 成功指標

### 精度目標
- **明示的時刻**: 95%以上の正確性
- **相対時刻**: 80%以上の正確性  
- **推定時刻**: 70%以上の正確性

### パフォーマンス目標
- **応答時間**: 平均3秒以内
- **メモリ使用量**: 50MB以内の追加使用量
- **API呼び出し**: 記録1件あたり1-2回のGemini呼び出し

### ユーザビリティ
- **使いやすさ**: 既存の入力方法を維持
- **信頼性**: エラー率5%以下
- **透明性**: 解析結果の説明可能性

これらの計画に基づいて実装を進めていきます。