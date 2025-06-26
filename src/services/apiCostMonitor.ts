import { config } from '../config';
import { Database } from '../database/database';
import { getCurrentBusinessDate } from '../utils/timeUtils';

/**
 * Gemini API使用量とコスト監視サービス
 */
export class ApiCostMonitor {
  private database: Database;
  private config = config;
  
  // Gemini 1.5 Flash の料金（2024年6月時点の推定）
  private readonly PRICE_PER_INPUT_TOKEN = 0.00000075; // $0.075/1M tokens
  private readonly PRICE_PER_OUTPUT_TOKEN = 0.0000003;  // $0.3/1M tokens

  constructor(database: Database) {
    this.database = database;
  }

  /**
   * API呼び出しを記録
   */
  public async recordApiCall(
    operation: 'analyzeActivity' | 'generateDailySummary',
    inputTokens: number,
    outputTokens: number
  ): Promise<void> {
    const cost = this.calculateCost(inputTokens, outputTokens);
    
    await this.database.saveApiUsageLog({
      operation,
      inputTokens,
      outputTokens,
      cost,
    });

    console.log(`💰 [API COST] ${operation}: ${inputTokens}入力+${outputTokens}出力トークン, ${cost.toFixed(6)}`);
    
    // 累積情報も出力
    const todayStats = await this.getTodayStats();
    console.log(`📊 [TODAY TOTAL] ${todayStats.totalCalls}回呼び出し, 推定${todayStats.estimatedCost.toFixed(4)}`);
  }

  /**
   * 本日の統計を取得
   */
  public async getTodayStats(timezone: string = 'Asia/Tokyo'): Promise<{
    totalCalls: number;
    analyzeActivityCalls: number;
    generateSummaryCalls: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    estimatedCost: number;
  }> {
    const today = getCurrentBusinessDate(timezone);
    // 現在の実装ではシングルユーザーのため、コンフィグのユーザーIDを使用
    const stats = await this.database.getApiUsageStats(config.discord.targetUserId, timezone);
    
    return {
      totalCalls: stats.totalCalls,
      analyzeActivityCalls: stats.callsByOperation['analyzeActivity'] || 0,
      generateSummaryCalls: stats.callsByOperation['generateDailySummary'] || 0,
      totalInputTokens: stats.totalInputTokens,
      totalOutputTokens: stats.totalOutputTokens,
      estimatedCost: stats.totalCost,
    };
  }

  /**
   * 月間推定コストを計算
   */
  public async getMonthlyEstimate(timezone: string = 'Asia/Tokyo', workingDaysPerMonth: number = 20): Promise<{
    estimatedMonthlyCost: number;
    estimatedMonthlyCalls: number;
  }> {
    const todayStats = await this.getTodayStats(timezone);
    
    return {
      estimatedMonthlyCalls: todayStats.totalCalls * workingDaysPerMonth,
      estimatedMonthlyCost: todayStats.estimatedCost * workingDaysPerMonth,
    };
  }

  /**
   * 日次レポートを生成
   */
  public async generateDailyReport(timezone: string = 'Asia/Tokyo'): Promise<string> {
    const stats = await this.getTodayStats(timezone);
    const monthly = await this.getMonthlyEstimate(timezone);
    
    return [
      '💰 **Gemini API 使用量レポート**',
      '',
      `📅 **本日 (${getCurrentBusinessDate(timezone)})**`,
      `• 総API呼び出し数: ${stats.totalCalls}回`,
      `• 活動解析: ${stats.analyzeActivityCalls}回`,
      `• サマリー生成: ${stats.generateSummaryCalls}回`,
      `• 入力トークン: ${stats.totalInputTokens.toLocaleString()}`,
      `• 出力トークン: ${stats.totalOutputTokens.toLocaleString()}`,
      `• 推定コスト: ${stats.estimatedCost.toFixed(4)}`,
      '',
      `📊 **月間推定 (20営業日)**`,
      `• 月間呼び出し数: ${monthly.estimatedMonthlyCalls}回`,
      `• 月間コスト: ${monthly.estimatedMonthlyCost.toFixed(2)}`,
      '',
      `ℹ️ 料金は2024年6月のGemini 1.5 Flash価格に基づく推定値です`,
    ].join('\n');
  }

  /**
   * 警告レベルのチェック
   */
  public async checkCostAlerts(timezone: string = 'Asia/Tokyo'): Promise<{ level: 'info' | 'warning' | 'critical', message: string } | null> {
    const stats = await this.getTodayStats(timezone);
    const monthly = await this.getMonthlyEstimate(timezone);
    
    if (monthly.estimatedMonthlyCost > 50) {
      return {
        level: 'critical',
        message: `🚨 月間コスト推定が${monthly.estimatedMonthlyCost.toFixed(2)}に達しています！使用量を確認してください。`
      };
    }
    
    if (monthly.estimatedMonthlyCost > 20) {
      return {
        level: 'warning',
        message: `⚠️ 月間コスト推定が${monthly.estimatedMonthlyCost.toFixed(2)}です。使用量にご注意ください。`
      };
    }
    
    if (stats.totalCalls > 50) {
      return {
        level: 'warning',
        message: `⚠️ 本日のAPI呼び出しが${stats.totalCalls}回に達しています。`
      };
    }
    
    return null;
  }

  private calculateCost(inputTokens: number, outputTokens: number): number {
    return (inputTokens * this.PRICE_PER_INPUT_TOKEN) + (outputTokens * this.PRICE_PER_OUTPUT_TOKEN);
  }
}