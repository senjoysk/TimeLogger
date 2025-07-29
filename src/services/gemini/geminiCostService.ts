/**
 * Gemini コストサービス
 * API使用量の監視と報告を担当
 */

import { ApiCostMonitor } from '../apiCostMonitor';
import { CostAlert } from '../../types/costAlert';

/**
 * Gemini コストサービスインターフェース
 */
export interface IGeminiCostService {
  /**
   * API使用量統計を取得
   * @returns 今日の統計情報
   */
  getCostStats(): Promise<any>;

  /**
   * 日次コストレポートを取得
   * @param userId ユーザーID
   * @param timezone タイムゾーン
   * @returns 日次レポート文字列
   */
  getDailyCostReport(userId: string, timezone: string): Promise<string>;

  /**
   * コスト警告をチェック
   * @param userId ユーザーID
   * @param timezone タイムゾーン
   * @returns コスト警告（nullの場合は警告なし）
   */
  checkCostAlerts(userId: string, timezone: string): Promise<CostAlert | null>;
}

/**
 * GeminiCostService の実装
 * 単一責任: API使用量の監視と報告
 */
export class GeminiCostService implements IGeminiCostService {
  constructor(private costMonitor: ApiCostMonitor) {}

  /**
   * API使用量統計を取得
   */
  async getCostStats() {
    return await this.costMonitor.getTodayStats();
  }

  /**
   * 日次コストレポートを取得
   */
  async getDailyCostReport(userId: string, timezone: string): Promise<string> {
    return await this.costMonitor.generateDailyReport(timezone);
  }

  /**
   * コスト警告をチェック
   */
  async checkCostAlerts(userId: string, timezone: string): Promise<CostAlert | null> {
    return await this.costMonitor.checkCostAlerts(timezone);
  }
}