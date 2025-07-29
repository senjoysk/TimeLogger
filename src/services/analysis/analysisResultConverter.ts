/**
 * 分析結果コンバーター
 * 分析結果の型変換・空結果生成・トークン推定を担当
 */

import {
  ActivityLog,
  DailyAnalysisResult,
  GeminiAnalysisResponse
} from '../../types/activityLog';

/**
 * 結果コンバーターインターフェース
 */
export interface IAnalysisResultConverter {
  /**
   * GeminiAnalysisResponseをDailyAnalysisResultに変換
   * @param geminiResponse Gemini分析レスポンス
   * @param businessDate 業務日
   * @param logCount ログ数
   * @returns 変換済みの分析結果
   */
  convertToDailyAnalysisResult(
    geminiResponse: GeminiAnalysisResponse, 
    businessDate: string, 
    logCount: number
  ): DailyAnalysisResult;

  /**
   * 空の分析結果を作成（ログが0件の場合）
   * @param businessDate 業務日
   * @returns 空の分析結果
   */
  createEmptyAnalysis(businessDate: string): DailyAnalysisResult;

  /**
   * トークン数を推定
   * @param logs 分析対象ログ
   * @returns 推定トークン数
   */
  estimateTokenCount(logs: ActivityLog[]): number;
}

/**
 * AnalysisResultConverter の実装
 * 単一責任: 分析結果の変換処理
 */
export class AnalysisResultConverter implements IAnalysisResultConverter {
  /**
   * GeminiAnalysisResponseをDailyAnalysisResultに変換
   */
  convertToDailyAnalysisResult(
    geminiResponse: GeminiAnalysisResponse, 
    businessDate: string, 
    logCount: number
  ): DailyAnalysisResult {
    return {
      businessDate,
      totalLogCount: logCount,
      categories: geminiResponse.categories,
      timeline: geminiResponse.timeline,
      timeDistribution: geminiResponse.timeDistribution,
      insights: geminiResponse.insights,
      warnings: geminiResponse.warnings,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * 空の分析結果を作成（ログが0件の場合）
   */
  createEmptyAnalysis(businessDate: string): DailyAnalysisResult {
    return {
      businessDate,
      totalLogCount: 0,
      categories: [],
      timeline: [],
      timeDistribution: {
        totalEstimatedMinutes: 0,
        workingMinutes: 0,
        breakMinutes: 0,
        unaccountedMinutes: 480, // 8時間分を未記録とする
        overlapMinutes: 0
      },
      insights: {
        productivityScore: 0,
        workBalance: {
          focusTimeRatio: 0,
          meetingTimeRatio: 0,
          breakTimeRatio: 0,
          adminTimeRatio: 0
        },
        suggestions: ['活動記録を始めましょう！'],
        highlights: ['新しい一日の始まりです'],
        motivation: '活動記録をつけて、生産的な一日を過ごしましょう！'
      },
      warnings: [],
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * トークン数を推定
   */
  estimateTokenCount(logs: ActivityLog[]): number {
    // 簡易的なトークン数推定（日本語は1文字≒1.5トークン）
    const totalChars = logs.reduce((sum, log) => sum + log.content.length, 0);
    const promptOverhead = 2000; // プロンプト固定部分
    
    return Math.ceil(totalChars * 1.5) + promptOverhead;
  }
}