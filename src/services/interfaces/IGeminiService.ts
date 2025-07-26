/**
 * Gemini AIサービスインターフェース
 * Google Gemini APIを使用した分析・分類機能を抽象化
 */

import { ClassificationResult } from '../../types/todo';
import { ActivityAnalysisResult, ReminderContext } from '../../types/activityAnalysis';
import { PreviousActivities } from '../../types/database';

/**
 * API使用量統計
 */
export interface ApiCostStats {
  totalCalls: number;
  analyzeActivityCalls: number;
  generateSummaryCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCost: number;
}

/**
 * Gemini AIサービスインターフェース
 */
export interface IGeminiService {
  /**
   * API使用量統計を取得
   * @returns 今日のAPI使用量統計
   */
  getCostStats(): Promise<ApiCostStats>;

  /**
   * 日次コストレポートを取得
   * @param userId ユーザーID
   * @param timezone タイムゾーン
   * @returns 日次コストレポート文字列
   */
  getDailyCostReport(userId: string, timezone: string): Promise<string>;

  /**
   * コストアラートをチェック
   * @param userId ユーザーID
   * @param timezone タイムゾーン
   * @returns アラート情報
   */
  checkCostAlerts(userId: string, timezone: string): Promise<any>;

  /**
   * メッセージをAIで分類
   * @param message 分類するメッセージ
   * @returns 分類結果
   */
  classifyMessageWithAI(message: string): Promise<ClassificationResult>;

  /**
   * リマインダーコンテキスト付きでメッセージを分類
   * @param messageContent 分類するメッセージ
   * @param timeRange 時間範囲
   * @param reminderTime リマインダー送信時刻（オプション）
   * @param reminderContent リマインダーメッセージ内容（オプション）
   * @returns 分類結果
   */
  classifyMessageWithReminderContext(
    messageContent: string,
    timeRange: { start: Date; end: Date },
    reminderTime?: Date,
    reminderContent?: string
  ): Promise<ClassificationResult & { contextType: 'REMINDER_REPLY' }>;

  /**
   * 近くのリマインダーコンテキスト付きでメッセージを分類
   * @param messageContent 分類するメッセージ
   * @param reminderTime リマインダー送信時刻
   * @param timeDiff 時間差（分）
   * @returns 分類結果
   */
  classifyMessageWithNearbyReminderContext(
    messageContent: string,
    reminderTime: Date,
    timeDiff: number
  ): Promise<ClassificationResult & { contextType: 'POST_REMINDER' }>;

  /**
   * リマインダーコンテキストプロンプトを構築
   * @param messageContent メッセージ内容
   * @param timeRange 時間範囲
   * @param reminderTime リマインダー送信時刻（オプション）
   * @param reminderContent リマインダーメッセージ内容（オプション）
   * @returns 構築されたプロンプト
   */
  buildReminderContextPrompt(
    messageContent: string,
    timeRange: { start: Date; end: Date },
    reminderTime?: Date,
    reminderContent?: string
  ): string;

  /**
   * 活動内容を分析
   * @param message 分析するメッセージ
   * @param currentTime 現在時刻
   * @param timezone タイムゾーン
   * @param reminderContext リマインダーコンテキスト（オプション）
   * @returns 活動分析結果
   */
  analyzeActivityContent(
    message: string,
    currentTime: Date,
    timezone: string,
    reminderContext?: ReminderContext
  ): Promise<ActivityAnalysisResult>;

  /**
   * 活動を分析
   * @param content 活動内容
   * @param userId ユーザーID
   * @param timezone タイムゾーン
   * @param previousActivities 過去の活動データ（オプション）
   * @returns 活動分析結果
   */
  analyzeActivity(
    content: string,
    userId: string,
    timezone: string,
    previousActivities?: PreviousActivities
  ): Promise<ActivityAnalysisResult>;
}