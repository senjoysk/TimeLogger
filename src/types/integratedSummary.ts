/**
 * 統合サマリー機能の型定義
 * 活動ログとTODO情報を統合したサマリー機能
 */

import { DailyAnalysisResult } from './activityLog';
import { TodoCompletionSuggestion, ProductivityInsights } from './correlation';

/**
 * 統合サマリー結果
 */
export interface IntegratedSummaryResult {
  /** 対象業務日 */
  businessDate: string;
  /** 活動ログサマリー */
  activitySummary: DailyAnalysisResult;
  /** TODOサマリー */
  todoSummary: TodoSummary;
  /** 相関分析インサイト */
  correlationInsights: CorrelationInsights;
  /** 生産性メトリクス */
  productivityMetrics: ProductivityMetrics;
  /** 統合推奨事項 */
  recommendations: IntegratedRecommendation[];
  /** 生成日時 */
  generatedAt: string;
}

/**
 * TODOサマリー
 */
export interface TodoSummary {
  /** 総TODO数 */
  totalTodos: number;
  /** 完了済みTODO数 */
  completedTodos: number;
  /** 進行中TODO数 */
  inProgressTodos: number;
  /** 保留中TODO数 */
  pendingTodos: number;
  /** 完了率 (0-1) */
  completionRate: number;
  /** AI分類によるTODO数 */
  aiClassifiedCount: number;
  /** 手動作成TODO数 */
  manualCreatedCount: number;
  /** 平均優先度 */
  averagePriority: number;
  /** 優先度別分布 */
  priorityDistribution: PriorityDistribution;
  /** ステータス変更履歴 */
  statusTransitions: StatusTransition[];
}

/**
 * 優先度分布
 */
export interface PriorityDistribution {
  /** 高優先度 (2) の数 */
  high: number;
  /** 中優先度 (1) の数 */
  medium: number;
  /** 低優先度 (0) の数 */
  low: number;
}

/**
 * ステータス変更履歴
 */
export interface StatusTransition {
  /** TODO ID */
  todoId: string;
  /** 変更前ステータス */
  fromStatus: string;
  /** 変更後ステータス */
  toStatus: string;
  /** 変更時刻 */
  timestamp: string;
  /** 変更時間（分） */
  durationMinutes?: number;
}

/**
 * 相関分析インサイト
 */
export interface CorrelationInsights {
  /** 相関が見つかったペア数 */
  correlatedPairs: number;
  /** 自動リンクの機会数 */
  autoLinkOpportunities: number;
  /** TODO完了提案 */
  completionSuggestions: TodoCompletionSuggestion[];
  /** 活動パターン分析 */
  activityPatterns: ActivityPattern[];
  /** 時間配分の一致度 */
  timeAllocationAlignment: number;
}

/**
 * 活動パターン
 */
export interface ActivityPattern {
  /** パターンタイプ */
  type: 'recurring' | 'batch' | 'interruption' | 'deep_work';
  /** パターンの説明 */
  description: string;
  /** 発生頻度 */
  frequency: number;
  /** 関連活動数 */
  relatedActivities: number;
  /** TODOとの関連性 */
  todoRelevance: number;
}

/**
 * 生産性メトリクス
 */
export interface ProductivityMetrics {
  /** 総合生産性スコア (0-100) */
  overallScore: number;
  /** TODO完了率 (0-1) */
  todoCompletionRate: number;
  /** 平均タスク実行時間（分） */
  averageTaskDuration: number;
  /** 効率性トレンド */
  efficiencyTrend: 'improving' | 'stable' | 'declining';
  /** 最も生産的な時間帯 */
  mostProductiveHours: string[];
  /** フォーカス時間の割合 (0-1) */
  focusTimeRatio: number;
  /** 中断回数 */
  interruptionCount: number;
  /** タスク切り替え頻度 */
  taskSwitchingFrequency: number;
}

/**
 * 統合推奨事項
 */
export interface IntegratedRecommendation {
  /** 推奨事項のタイプ */
  type: 'todo_optimization' | 'time_management' | 'focus_improvement' | 'workflow_efficiency';
  /** 推奨内容 */
  content: string;
  /** 優先度 */
  priority: 'high' | 'medium' | 'low';
  /** 期待される効果 */
  expectedImpact: string;
  /** 実装の難易度 */
  implementationDifficulty: 'easy' | 'medium' | 'hard';
  /** 根拠データ */
  evidenceSource: string[];
}

/**
 * 週次統合サマリー
 */
export interface WeeklyIntegratedSummary {
  /** 対象期間 */
  period: {
    startDate: string;
    endDate: string;
  };
  /** 日別サマリー */
  dailySummaries: IntegratedSummaryResult[];
  /** 週次メトリクス */
  weeklyMetrics: WeeklyMetrics;
  /** 週次トレンド */
  weeklyTrends: WeeklyTrend[];
  /** 週次インサイト */
  weeklyInsights: WeeklyInsight[];
  /** 来週への推奨事項 */
  nextWeekRecommendations: IntegratedRecommendation[];
}

/**
 * 週次メトリクス
 */
export interface WeeklyMetrics {
  /** 平均完了率 */
  averageCompletionRate: number;
  /** 総活動時間（分） */
  totalActivityMinutes: number;
  /** 総TODO数 */
  totalTodos: number;
  /** 完了したTODO数 */
  completedTodos: number;
  /** 平均生産性スコア */
  averageProductivityScore: number;
  /** 最も生産的だった日 */
  mostProductiveDay: string;
  /** 最も効率的だった時間帯 */
  mostEfficientTimeSlot: string;
}

/**
 * 週次トレンド
 */
export interface WeeklyTrend {
  /** メトリクス名 */
  metric: string;
  /** トレンドの方向 */
  direction: 'up' | 'down' | 'stable';
  /** 変化量（パーセンテージ） */
  changePercent: number;
  /** トレンドの説明 */
  description: string;
}

/**
 * 週次インサイト
 */
export interface WeeklyInsight {
  /** インサイトタイプ */
  type: 'strength' | 'improvement_area' | 'pattern' | 'anomaly';
  /** タイトル */
  title: string;
  /** 詳細説明 */
  description: string;
  /** 関連データ */
  relatedData: Record<string, any>;
}

/**
 * 統合メトリクス計算結果
 */
export interface IntegratedMetrics {
  /** TODO-活動の一致度 (0-1) */
  todoActivityAlignment: number;
  /** 完了予測の精度 (0-1) */
  completionPredictionAccuracy: number;
  /** 時間見積もりの精度 (0-1) */
  timeEstimationAccuracy: number;
  /** ワークフロー効率性 (0-1) */
  workflowEfficiency: number;
  /** 計画実行率 (0-1) */
  planExecutionRate: number;
}

/**
 * 時間配分分析
 */
export interface TimeAllocationAnalysis {
  /** 計画された時間配分 */
  plannedAllocation: CategoryTimeAllocation[];
  /** 実際の時間配分 */
  actualAllocation: CategoryTimeAllocation[];
  /** 配分の一致度 (0-1) */
  alignmentScore: number;
  /** 最大の乖離カテゴリ */
  largestDeviation: {
    category: string;
    plannedMinutes: number;
    actualMinutes: number;
    deviationPercent: number;
  };
}

/**
 * カテゴリ別時間配分
 */
export interface CategoryTimeAllocation {
  /** カテゴリ名 */
  category: string;
  /** 配分時間（分） */
  minutes: number;
  /** 全体に占める割合 (0-1) */
  percentage: number;
  /** TODO数 */
  todoCount: number;
}

/**
 * TODO効率性分析
 */
export interface TodoEfficiencyAnalysis {
  /** 平均完了時間（分） */
  averageCompletionTime: number;
  /** 予定より早く完了したTODO数 */
  earlyCompletions: number;
  /** 予定より遅く完了したTODO数 */
  lateCompletions: number;
  /** 時間見積もり精度 (0-1) */
  estimationAccuracy: number;
  /** 最も効率的なカテゴリ */
  mostEfficientCategory: string;
  /** 改善が必要なカテゴリ */
  improvementNeededCategory: string;
}

/**
 * 活動品質評価
 */
export interface ActivityQualityAssessment {
  /** 記録の詳細度スコア (0-1) */
  detailScore: number;
  /** 記録の一貫性スコア (0-1) */
  consistencyScore: number;
  /** 時間記録の精度スコア (0-1) */
  timeAccuracyScore: number;
  /** カテゴリ分類の精度スコア (0-1) */
  categoryAccuracyScore: number;
  /** 改善提案 */
  improvementSuggestions: string[];
}