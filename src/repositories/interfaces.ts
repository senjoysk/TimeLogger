import { ActivityRecord, DailySummary, ActivityAnalysis } from '../types';

/**
 * データベース操作の抽象化インターフェース
 * 依存性逆転の原則に従い、具体的な実装に依存しない設計を実現
 */
export interface IDatabaseRepository {
  // 初期化とライフサイクル管理
  initialize(): Promise<void>;
  close(): Promise<void>;

  // ユーザー関連操作
  getUserTimezone(userId: string): Promise<string>;
  setUserTimezone(userId: string, timezone: string): Promise<void>;

  // 活動記録関連操作
  saveActivityRecord(record: ActivityRecord, timezone: string): Promise<void>;
  getActivityRecords(userId: string, timezone: string, businessDate?: string): Promise<ActivityRecord[]>;
  getActivityRecordsByTimeSlot(userId: string, timeSlot: string): Promise<ActivityRecord[]>;

  // 日次サマリー関連操作
  saveDailySummary(summary: DailySummary, timezone: string): Promise<void>;
  getDailySummary(userId: string, timezone: string, businessDate?: string): Promise<DailySummary | null>;
}

/**
 * API使用量監視の抽象化インターフェース
 */
export interface IApiCostRepository {
  recordApiCall(operation: string, inputTokens: number, outputTokens: number): Promise<void>;
  getTodayStats(timezone?: string): Promise<{
    totalCalls: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    estimatedCost: number;
    operationBreakdown: Record<string, { calls: number; inputTokens: number; outputTokens: number; cost: number }>;
  }>;
  checkCostAlerts(timezone?: string): Promise<{ message: string; level: 'warning' | 'critical' } | null>;
  generateDailyReport(timezone: string): Promise<string>;
}

/**
 * AI解析サービスの抽象化インターフェース
 * 活動記録の解析とサマリー生成の責任を分離
 */
export interface IAnalysisService {
  // 活動記録の解析
  analyzeActivity(
    userInput: string,
    timeSlot: string,
    previousActivities: ActivityRecord[],
    timezone: string
  ): Promise<ActivityAnalysis>;

  // 日次サマリーの生成
  generateDailySummary(
    activities: ActivityRecord[],
    businessDate: string
  ): Promise<DailySummary>;

  // API使用量の統計取得
  getCostStats(): Promise<any>;

  // 日次コストレポートの取得
  getDailyCostReport(userId: string, timezone: string): Promise<string>;

  // コスト警告のチェック
  checkCostAlerts(userId: string, timezone: string): Promise<any>;
}