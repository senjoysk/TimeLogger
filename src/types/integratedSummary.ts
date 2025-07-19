/**
 * 統合サマリー機能の型定義
 * 活動ログとTODO情報を統合したサマリー機能
 */

import { DailyAnalysisResult } from './activityLog';

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

