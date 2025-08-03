/**
 * Gemini AIサービスインターフェース
 * Google Gemini APIを使用した分析・分類機能を抽象化
 */

import { ActivityAnalysisResult, ReminderContext } from '../../types/activityAnalysis';
import { PreviousActivities } from '../../types/database';

/**
 * Gemini AIサービスインターフェース
 */
export interface IGeminiService {
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