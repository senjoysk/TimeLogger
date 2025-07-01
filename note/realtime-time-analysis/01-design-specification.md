# RealTimeActivityAnalyzer 設計書 - Phase 1

## 概要
現在の時刻不一致問題を根本解決するため、活動記録入力時点でリアルタイムに詳細な時刻解析を行うシステムを実装する。

## 問題の現状分析

### 既存システムの課題
1. **後処理での時刻推定**: `UnifiedAnalysisService`で後からまとめて時刻を推定
2. **低い時刻精度**: Geminiへの変換例が不正確（修正済みだが根本解決ではない）
3. **並列活動の曖昧さ**: 同時間帯での複数活動の時間配分が不明確
4. **コンテキスト喪失**: 記録時の詳細情報が後の分析で失われる

### 具体的な問題例
```
ユーザー入力: "[08:19] 7:38から8:20までTimeLoggerのリファクタリング"
期待結果: 07:38-08:20 (JST) → 22:38-23:20 (UTC前日)
実際結果: 09:08-09:50 (JST) → 00:08-00:50 (UTC)
```

## Phase 1 設計

### アーキテクチャ概要

```
┌─────────────────────────────────────────────┐
│            ユーザー入力                        │
│    "[08:19] 7:38から8:20まで開発作業"           │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│        RealTimeActivityAnalyzer             │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │    TimeInformationExtractor         │   │
│  │    - 明示的時刻の抽出                │   │
│  │    - 相対的時刻の解析                │   │
│  │    - タイムゾーン変換                │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │    ActivityContentAnalyzer          │   │
│  │    - 活動内容の詳細分析              │   │
│  │    - 並列タスクの検出                │   │
│  │    - カテゴリ分類                    │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │    TimeConsistencyValidator         │   │
│  │    - 時間重複の検出                  │   │
│  │    - 物理的整合性チェック             │   │
│  │    - 警告生成                       │   │
│  └─────────────────────────────────────┘   │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│        DetailedActivityAnalysis             │
│  - 正確な開始・終了時刻                      │
│  - 活動の詳細内訳                           │
│  - 信頼度スコア                             │
│  - 警告・注意事項                           │
└─────────────────────────────────────────────┘
```

### データ構造設計

#### 1. 入力データ型

```typescript
interface AnalysisInput {
  userInput: string;           // 元の入力文字列
  userId: string;              // ユーザーID
  timezone: string;            // ユーザーのタイムゾーン
  inputTimestamp: Date;        // 入力時刻
  context: RecentActivityContext; // 最近の活動コンテキスト
}

interface RecentActivityContext {
  recentLogs: ActivityLog[];   // 直近のログ（重複検出用）
  userPatterns: UserPattern[]; // ユーザーの記録パターン
  currentSession?: {           // 現在のセッション情報
    startTime: Date;
    expectedEndTime?: Date;
  };
}
```

#### 2. 出力データ型

```typescript
interface DetailedActivityAnalysis {
  // 時刻情報
  timeAnalysis: TimeAnalysisResult;
  
  // 活動詳細
  activities: ActivityDetail[];
  
  // 品質情報
  confidence: number;          // 全体的な信頼度 (0-1)
  warnings: AnalysisWarning[]; // 警告・注意事項
  
  // メタ情報  
  metadata: AnalysisMetadata;
}

interface TimeAnalysisResult {
  startTime: string;           // ISO 8601 UTC
  endTime: string;             // ISO 8601 UTC
  totalMinutes: number;        // 総時間（分）
  confidence: number;          // 時刻推定の信頼度
  method: TimeExtractionMethod; // 抽出方法
  timezone: string;            // 使用したタイムゾーン
  
  // デバッグ情報
  extractedComponents: ParsedTimeComponent[];
}

enum TimeExtractionMethod {
  EXPLICIT = 'explicit',      // "14:00-15:30" のような明示的指定
  RELATIVE = 'relative',      // "さっき1時間" のような相対指定
  INFERRED = 'inferred',      // "午前中" のような推定
  CONTEXTUAL = 'contextual'   // 前後のログから推定
}

interface ActivityDetail {
  content: string;             // 活動内容
  category: string;            // メインカテゴリ
  subCategory?: string;        // サブカテゴリ
  
  // 時間配分
  timePercentage: number;      // この活動の時間比率 (0-100)
  actualMinutes: number;       // 実際の分数
  priority: ActivityPriority;  // 活動の優先度
  
  // 品質情報
  confidence: number;          // この活動分析の信頼度
}

enum ActivityPriority {
  PRIMARY = 'primary',         // 主要活動
  SECONDARY = 'secondary',     // 副次活動  
  BACKGROUND = 'background'    // バックグラウンド活動
}

interface AnalysisWarning {
  type: WarningType;
  severity: 'low' | 'medium' | 'high';
  message: string;
  affectedTimeRange?: {
    startTime: string;
    endTime: string;
  };
  suggestions: string[];       // 対処提案
}

enum WarningType {
  TIME_OVERLAP = 'time_overlap',           // 時間重複
  TIME_GAP = 'time_gap',                   // 時間ギャップ
  INCONSISTENT_INPUT = 'inconsistent_input', // 入力矛盾
  LOW_CONFIDENCE = 'low_confidence',       // 低信頼度
  IMPOSSIBLE_DURATION = 'impossible_duration' // 物理的に不可能な時間
}
```

### コンポーネント設計

#### 1. RealTimeActivityAnalyzer (メインクラス)

```typescript
export class RealTimeActivityAnalyzer {
  constructor(
    private geminiService: GeminiService,
    private repository: IActivityLogRepository
  ) {}

  /**
   * メイン分析メソッド
   */
  async analyzeActivity(input: AnalysisInput): Promise<DetailedActivityAnalysis> {
    // 1. 時刻情報の抽出
    const timeAnalysis = await this.timeExtractor.extractTimeInformation(
      input.userInput, 
      input.timezone, 
      input.inputTimestamp,
      input.context
    );
    
    // 2. 活動内容の詳細分析
    const activityDetails = await this.contentAnalyzer.analyzeActivityContent(
      input.userInput, 
      timeAnalysis
    );
    
    // 3. 整合性チェック
    const warnings = await this.validator.validateConsistency(
      timeAnalysis, 
      activityDetails, 
      input.context
    );
    
    // 4. 統合結果の構築
    return this.buildFinalAnalysis(timeAnalysis, activityDetails, warnings, input);
  }

  private timeExtractor = new TimeInformationExtractor();
  private contentAnalyzer = new ActivityContentAnalyzer();
  private validator = new TimeConsistencyValidator();
}
```

#### 2. TimeInformationExtractor

```typescript
export class TimeInformationExtractor {
  /**
   * 時刻情報を抽出・解析
   */
  async extractTimeInformation(
    input: string,
    timezone: string, 
    inputTimestamp: Date,
    context: RecentActivityContext
  ): Promise<TimeAnalysisResult> {
    
    // 1. パターンマッチングによる時刻抽出
    const patterns = this.detectTimePatterns(input);
    
    // 2. Geminiによる高精度解析
    const geminiAnalysis = await this.analyzeWithGemini(input, timezone, inputTimestamp, patterns);
    
    // 3. コンテキストベースの補正
    const contextualAdjustment = this.adjustWithContext(geminiAnalysis, context);
    
    // 4. 最終結果の構築
    return this.buildTimeAnalysisResult(contextualAdjustment, patterns);
  }

  /**
   * 正規表現パターンで基本的な時刻を検出
   */
  private detectTimePatterns(input: string): ParsedTimeComponent[] {
    const patterns = [
      // 明示的時刻範囲: "14:00-15:30", "9時から10時"
      /(\d{1,2}):(\d{2})\s*[-〜～から]\s*(\d{1,2}):(\d{2})/g,
      /(\d{1,2})時\s*[-〜～から]\s*(\d{1,2})時/g,
      
      // 相対時刻: "さっき1時間", "30分前から"
      /(さっき|先ほど)\s*(\d+)\s*(分|時間)/g,
      /(\d+)\s*(分|時間)\s*前/g,
      
      // 時間帯: "午前中", "夕方"
      /(午前中|午後|夕方|夜|朝)/g,
      
      // 継続時間: "1時間", "30分間"
      /(\d+)\s*(分|時間)(間?)/g
    ];
    
    // パターンマッチング実行
    return this.executePatternMatching(input, patterns);
  }
}
```

#### 3. ActivityContentAnalyzer

```typescript
export class ActivityContentAnalyzer {
  /**
   * 活動内容を詳細分析
   */
  async analyzeActivityContent(
    input: string,
    timeAnalysis: TimeAnalysisResult
  ): Promise<ActivityDetail[]> {
    
    // Geminiプロンプトで並列活動・時間配分を詳細分析
    const prompt = this.buildContentAnalysisPrompt(input, timeAnalysis);
    const result = await this.geminiService.generateContent(prompt);
    
    return this.parseActivityDetails(result.response.text());
  }

  private buildContentAnalysisPrompt(input: string, timeAnalysis: TimeAnalysisResult): string {
    return `
あなたは活動分析の専門家です。以下の活動記録を詳細に分析してください。

【入力情報】
- 活動記録: "${input}"
- 推定時間: ${timeAnalysis.totalMinutes}分 (${timeAnalysis.startTime} - ${timeAnalysis.endTime})
- 信頼度: ${timeAnalysis.confidence}

【分析項目】
1. **活動の分解**: 単一活動か並列活動かを判定
2. **時間配分**: 各活動の時間比率を推定
3. **優先度**: 主要活動・副次活動・バックグラウンド活動を分類
4. **カテゴリ分類**: 適切なカテゴリ・サブカテゴリを設定

【出力形式】
{
  "activities": [
    {
      "content": "具体的な活動内容",
      "category": "開発",
      "subCategory": "プログラミング",
      "timePercentage": 85,
      "actualMinutes": 34,
      "priority": "primary",
      "confidence": 0.9
    }
  ],
  "analysis": {
    "hasParallelActivities": true,
    "complexityLevel": "medium",
    "totalPercentage": 100
  }
}

JSON形式のみで回答してください。
`;
  }
}
```

### 統合ポイント

#### 既存システムとの連携

1. **ActivityLogService への統合**
```typescript
// src/services/activityLogService.ts の修正
export class ActivityLogService {
  constructor(
    private repository: IActivityLogRepository,
    private realTimeAnalyzer: RealTimeActivityAnalyzer // 新規追加
  ) {}

  async recordActivity(userId: string, content: string, timezone: string): Promise<ActivityLog> {
    // 従来の簡易解析の代わりにリアルタイム解析を使用
    const detailedAnalysis = await this.realTimeAnalyzer.analyzeActivity({
      userInput: content,
      userId,
      timezone,
      inputTimestamp: new Date(),
      context: await this.buildRecentContext(userId)
    });

    // 詳細解析結果をActivityLogに変換
    return this.saveDetailedAnalysis(detailedAnalysis, userId, content);
  }
}
```

2. **データベーススキーマの拡張**
```sql
-- 詳細解析結果を保存するテーブル
CREATE TABLE IF NOT EXISTS detailed_activity_analysis (
  id TEXT PRIMARY KEY,
  activity_log_id TEXT NOT NULL,
  time_analysis JSON NOT NULL,        -- TimeAnalysisResult
  activity_details JSON NOT NULL,     -- ActivityDetail[]
  warnings JSON,                      -- AnalysisWarning[]
  metadata JSON,                      -- AnalysisMetadata
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (activity_log_id) REFERENCES activity_logs(id)
);
```

### 実装スケジュール

#### Week 1: 基盤実装
- [ ] データ型定義の作成
- [ ] RealTimeActivityAnalyzer の基本構造
- [ ] TimeInformationExtractor の実装
- [ ] 基本的なパターンマッチング

#### Week 2: 詳細機能
- [ ] ActivityContentAnalyzer の実装  
- [ ] Geminiプロンプトの設計・テスト
- [ ] TimeConsistencyValidator の実装
- [ ] 警告システムの構築

#### Week 3: 統合・テスト
- [ ] ActivityLogService への統合
- [ ] データベーススキーマの更新
- [ ] 既存システムとの互換性確保
- [ ] ユニットテストの作成

#### Week 4: 品質向上
- [ ] エラーハンドリングの強化
- [ ] パフォーマンス最適化
- [ ] ログ・デバッグ機能の追加
- [ ] ドキュメント作成

### 期待される効果

#### 解決される問題
1. **時刻精度の向上**: 90%以上の精度で正確な時刻を特定
2. **並列活動の明確化**: 複数活動の時間配分を定量化
3. **リアルタイム警告**: 入力時点での矛盾検出
4. **コンテキスト保持**: 記録時の詳細情報を保存

#### パフォーマンス目標
- **応答時間**: 3秒以内でリアルタイム解析完了
- **精度**: 明示的時刻で95%以上、相対時刻で80%以上
- **カバレッジ**: 一般的な入力パターンの90%以上をサポート

### リスク・課題

#### 技術的リスク
1. **Gemini API レスポンス時間**: 応答遅延の可能性
2. **複雑な入力パターン**: 予期しない入力への対応
3. **メモリ使用量**: 詳細分析結果の保存コスト

#### 対策
1. **キャッシュ機能**: 類似パターンの結果キャッシュ
2. **フォールバック**: 解析失敗時の既存システム使用
3. **段階的移行**: 既存システムと並行運用期間を設ける

---

## 次のステップ

1. **設計レビュー**: この設計書の確認・承認
2. **プロトタイプ作成**: 基本機能の実装開始
3. **テストデータ準備**: 様々な入力パターンのテストケース作成
4. **段階的ロールアウト**: 限定的なテスト運用から開始

このPhase 1の実装により、時刻不一致問題の根本解決と、より高精度な活動記録システムの実現を目指します。