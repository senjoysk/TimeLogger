import { config } from '../config';
import { IApiCostRepository } from '../repositories/interfaces';
import { getCurrentBusinessDate } from '../utils/timeUtils';

/**
 * Gemini API使用量とコスト監視サービス
 */
export class ApiCostMonitor {
  private repository: IApiCostRepository;
  private config = config;
  
  // Gemini 2.0 Flash の料金（2024年12月時点の公式料金）
  private readonly PRICE_PER_INPUT_TOKEN = 0.0000001; // $0.10/1M tokens
  private readonly PRICE_PER_OUTPUT_TOKEN = 0.0000004;  // $0.40/1M tokens

  constructor(repository: IApiCostRepository) {
    this.repository = repository;
  }

  /**
   * API呼び出しを記録
   */
  public async recordApiCall(
    operation: 'analyzeActivity' | 'generateDailySummary' | 'message_classification' | 'classifyMessage',
    inputTokens: number,
    outputTokens: number
  ): Promise<void> {
    await this.repository.recordApiCall(operation, inputTokens, outputTokens);

    const cost = this.calculateCost(inputTokens, outputTokens);
    console.log(`💰 [API COST] ${operation}: ${inputTokens}入力+${outputTokens}出力トークン, $${cost.toFixed(6)}`);
    
    // 累積情報も出力
    const todayStats = await this.getTodayStats();
    console.log(`📊 [TODAY TOTAL] ${todayStats.totalCalls}回呼び出し, 推定$${todayStats.estimatedCost.toFixed(4)}`);
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
    const stats = await this.repository.getTodayStats(timezone);
    
    return {
      totalCalls: stats.totalCalls,
      analyzeActivityCalls: stats.operationBreakdown['analyzeActivity']?.calls || 0,
      generateSummaryCalls: stats.operationBreakdown['generateDailySummary']?.calls || 0,
      totalInputTokens: stats.totalInputTokens,
      totalOutputTokens: stats.totalOutputTokens,
      estimatedCost: stats.estimatedCost,
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
    return await this.repository.generateDailyReport(timezone);
  }

  /**
   * 警告レベルのチェック
   */
  public async checkCostAlerts(timezone: string = 'Asia/Tokyo'): Promise<{ level: 'info' | 'warning' | 'critical', message: string } | null> {
    const alert = await this.repository.checkCostAlerts(timezone);
    return alert ? { level: alert.level, message: alert.message } : null;
  }

  private calculateCost(inputTokens: number, outputTokens: number): number {
    return (inputTokens * this.PRICE_PER_INPUT_TOKEN) + (outputTokens * this.PRICE_PER_OUTPUT_TOKEN);
  }
}