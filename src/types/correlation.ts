/**
 * 活動ログとTODO相関分析機能の型定義
 */

/**
 * 活動ログとTODOの相関分析結果
 */
export interface ActivityTodoCorrelationResult {
  /** 相関関係のペア */
  correlations: ActivityTodoCorrelation[];
  /** 統計情報 */
  stats: CorrelationStats;
  /** 分析日時 */
  analysisTimestamp: string;
}

/**
 * 個別の相関関係
 */
export interface ActivityTodoCorrelation {
  /** 活動ログID */
  activityId: string;
  /** TODO ID */
  todoId: string;
  /** 類似度スコア (0-1) */
  similarity: number;
  /** 相関の理由 */
  reason: string;
  /** 既に関連付けられているか */
  isAlreadyLinked: boolean;
  /** 推奨アクション */
  recommendedAction: 'link' | 'ignore' | 'review';
}

/**
 * 相関分析統計情報
 */
export interface CorrelationStats {
  /** 分析対象の活動ログ数 */
  totalActivities: number;
  /** 分析対象のTODO数 */
  totalTodos: number;
  /** 相関が見つかったペア数 */
  correlatedPairs: number;
  /** 自動リンク推奨数 */
  autoLinkRecommendations: number;
  /** 手動確認推奨数 */
  manualReviewRecommendations: number;
}

/**
 * TODO完了提案
 */
export interface TodoCompletionSuggestion {
  /** TODO ID */
  todoId: string;
  /** TODO内容 */
  todoContent: string;
  /** 完了の確信度 (0-1) */
  completionConfidence: number;
  /** 提案理由 */
  reason: string;
  /** 関連する活動ログID */
  relatedActivityIds: string[];
  /** 完了時刻の推定 */
  suggestedCompletionTime?: string;
}

/**
 * 生産性インサイト
 */
export interface ProductivityInsights {
  /** TODO完了率 (0-1) */
  completionRate: number;
  /** 平均タスク実行時間（分） */
  averageTaskDuration: number;
  /** 最も生産的な時間帯 */
  mostProductiveHours: string[];
  /** 効率性スコア (0-100) */
  efficiencyScore: number;
  /** 改善推奨事項 */
  recommendations: string[];
  /** パフォーマンストレンド */
  performanceTrend: 'improving' | 'stable' | 'declining';
}

/**
 * 自動リンク結果
 */
export interface AutoLinkResult {
  /** 活動ログID */
  activityId: string;
  /** TODO ID */
  todoId: string;
  /** リンクの確信度 (0-1) */
  confidence: number;
  /** リンク理由 */
  reason: string;
  /** リンク成功フラグ */
  success: boolean;
  /** エラーメッセージ（失敗時） */
  error?: string;
}

/**
 * 相関分析設定
 */
export interface CorrelationAnalysisConfig {
  /** 最小類似度閾値 */
  minSimilarityThreshold: number;
  /** 自動リンク閾値 */
  autoLinkThreshold: number;
  /** キーワード一致の重み */
  keywordWeight: number;
  /** 意味的類似性の重み */
  semanticWeight: number;
  /** 時間的近接性の重み */
  temporalWeight: number;
  /** 最大分析期間（日） */
  maxAnalysisDays: number;
}

/**
 * 類似性計算結果
 */
export interface SimilarityScore {
  /** 総合類似度 (0-1) */
  overall: number;
  /** キーワード一致度 (0-1) */
  keyword: number;
  /** 意味的類似度 (0-1) */
  semantic: number;
  /** 時間的近接度 (0-1) */
  temporal: number;
  /** 計算詳細 */
  details: {
    /** 共通キーワード */
    commonKeywords: string[];
    /** 時間差（分） */
    timeDifferenceMinutes: number;
    /** 使用したアルゴリズム */
    algorithm: string;
  };
}

/**
 * 時系列パフォーマンス分析
 */
export interface TimeSeriesPerformance {
  /** 分析期間 */
  period: {
    startDate: string;
    endDate: string;
  };
  /** 日別データ */
  dailyMetrics: DailyPerformanceMetric[];
  /** トレンド情報 */
  trends: {
    /** 完了率トレンド */
    completionRateTrend: number;
    /** 効率性トレンド */
    efficiencyTrend: number;
    /** 活動量トレンド */
    activityVolumeTrend: number;
  };
}

/**
 * 日別パフォーマンス指標
 */
export interface DailyPerformanceMetric {
  /** 日付 */
  date: string;
  /** TODO完了数 */
  completedTodos: number;
  /** TODO作成数 */
  createdTodos: number;
  /** 完了率 */
  completionRate: number;
  /** 総活動時間（分） */
  totalActivityMinutes: number;
  /** 生産的活動時間（分） */
  productiveMinutes: number;
  /** 効率性スコア */
  efficiencyScore: number;
}

/**
 * カテゴリ別パフォーマンス
 */
export interface CategoryPerformance {
  /** カテゴリ名 */
  category: string;
  /** このカテゴリのTODO数 */
  todoCount: number;
  /** 完了済みTODO数 */
  completedCount: number;
  /** 完了率 */
  completionRate: number;
  /** 平均完了時間（分） */
  averageCompletionTime: number;
  /** このカテゴリの活動時間（分） */
  totalActivityTime: number;
  /** 生産性スコア */
  productivityScore: number;
}

/**
 * スマート提案
 */
export interface SmartSuggestion {
  /** 提案ID */
  id: string;
  /** 提案タイプ */
  type: 'todo_creation' | 'todo_completion' | 'activity_link' | 'schedule_optimization';
  /** 提案内容 */
  content: string;
  /** 確信度 (0-1) */
  confidence: number;
  /** 根拠 */
  reasoning: string;
  /** 期待される効果 */
  expectedBenefit: string;
  /** 実行アクション */
  actionRequired: boolean;
}