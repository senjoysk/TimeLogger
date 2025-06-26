/**
 * タスク記録のデータ型定義
 */

/**
 * 30分間の活動記録
 */
export interface ActivityRecord {
  id: string;
  userId: string;
  /** 30分枠の開始時刻 (YYYY-MM-DD HH:MM:SS) */
  timeSlot: string;
  /** ユーザーからの投稿内容 */
  originalText: string;
  /** Geminiによる解析結果 */
  analysis: ActivityAnalysis;
  /** 記録日時 */
  createdAt: string;
  /** 更新日時 */
  updatedAt: string;
}

/**
 * Geminiによる活動解析結果
 */
export interface ActivityAnalysis {
  category: string;
  subCategory?: string;
  structuredContent: string;
  estimatedMinutes: number;
  productivityLevel: number; // 1-5
  startTime?: string; // ISO 8601 format
  endTime?: string;   // ISO 8601 format
}

/**
 * 日次サマリー
 */
export interface DailySummary {
  /** サマリー日付 (YYYY-MM-DD) */
  date: string;
  /** カテゴリ別時間集計 */
  categoryTotals: CategoryTotal[];
  /** 総活動時間（分） */
  totalMinutes: number;
  /** 感想とコメント */
  insights: string;
  /** 明日に向けた前向きな一言 */
  motivation: string;
  /** 生成日時 */
  generatedAt: string;
}

/**
 * カテゴリ別時間集計
 */
export interface CategoryTotal {
  category: string;
  totalMinutes: number;
  /** そのカテゴリの活動記録数 */
  recordCount: number;
  /** 平均生産性レベル */
  averageProductivity: number;
}

/**
 * 30分間の時間枠
 */
export interface TimeSlot {
  /** 開始時刻 */
  start: Date;
  /** 終了時刻 */
  end: Date;
  /** 時間枠の文字列表現 (HH:MM-HH:MM) */
  label: string;
}

/**
 * Gemini APIへのリクエスト用の型
 */
export interface GeminiAnalysisRequest {
  userInput: string;
  timeSlot: string;
  previousActivities?: ActivityRecord[];
}

/**
 * Bot の動作状態
 */
export interface BotStatus {
  isRunning: boolean;
  lastPromptTime?: Date;
  lastSummaryTime?: Date;
  scheduledJobs: string[];
}