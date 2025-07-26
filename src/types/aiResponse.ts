/**
 * AI応答フォーマットの型定義
 * Gemini APIからのレスポンスを型安全に扱うための定義
 */

import { MessageClassification } from './todo';

/**
 * 分類AIレスポンスのJSON構造
 */
export interface ClassificationAIResponse {
  /** メッセージの分類結果 */
  classification: MessageClassification;
  /** 分類の信頼度 (0-1) */
  confidence: number;
  /** 優先度 (1-5) */
  priority?: number;
  /** 分類の理由 */
  reasoning?: string;
  /** 分析結果 */
  analysis?: string;
}

/**
 * 活動分析AIレスポンスのJSON構造
 */
export interface ActivityAnalysisAIResponse {
  /** 時間推定結果 */
  timeEstimation?: {
    startTime?: string;
    endTime?: string;
    duration?: number;
    confidence?: number;
    source?: string;
  };
  /** 活動内容 */
  activityContent?: {
    mainActivity?: string;
    subActivities?: string[];
    structuredContent?: string;
  };
  /** 活動カテゴリー */
  activityCategory?: {
    primaryCategory?: string;
    subCategory?: string;
    tags?: string[];
  };
  /** 分析メタデータ */
  analysisMetadata?: {
    confidence?: number;
    reminderReplyContext?: boolean;
    warnings?: string[];
  };
}

/**
 * サマリー生成AIレスポンスのJSON構造
 */
export interface SummaryAIResponse {
  /** サマリーのタイトル */
  title: string;
  /** 総作業時間（分） */
  total_minutes: number;
  /** カテゴリ別時間配分 */
  categories: {
    [category: string]: {
      minutes: number;
      percentage: number;
    };
  };
  /** ハイライト */
  highlights: string[];
  /** 改善提案 */
  suggestions: string[];
  /** 生産性スコア (0-100) */
  productivity_score?: number;
}

/**
 * ギャップ分析AIレスポンスのJSON構造
 */
export interface GapAnalysisAIResponse {
  /** 検出されたギャップ */
  gaps: Array<{
    start_time: string;
    end_time: string;
    duration_minutes: number;
    suggested_activity?: string;
  }>;
  /** 分析の信頼度 (0-1) */
  confidence: number;
  /** 分析メッセージ */
  message: string;
}

/**
 * TODO抽出AIレスポンスのJSON構造
 */
export interface TodoExtractionAIResponse {
  /** 抽出されたTODO */
  todos: Array<{
    content: string;
    priority: number;
    due_date?: string;
    category?: string;
  }>;
  /** 抽出の信頼度 (0-1) */
  confidence: number;
  /** 抽出理由 */
  reasoning: string;
}

/**
 * AI応答パース結果の共通インターフェース
 */
export interface ParsedAIResponse<T> {
  /** パース成功フラグ */
  success: boolean;
  /** パースされたデータ */
  data?: T;
  /** エラーメッセージ */
  error?: string;
  /** 元のレスポンス文字列 */
  rawResponse: string;
}