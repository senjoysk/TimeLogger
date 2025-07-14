/**
 * DailyReportSender - 日次レポート送信サービス
 * 
 * DynamicReportSchedulerと連携して実際の日次レポートを送信
 */

import { ActivityLoggingIntegration } from '../integration/activityLoggingIntegration';
import { TaskLoggerBot } from '../bot';
import { ActivityLogError } from '../types/activityLog';

export class DailyReportSender {
  constructor(
    private integration: ActivityLoggingIntegration,
    private bot: TaskLoggerBot
  ) {}

  /**
   * 指定ユーザーに日次レポートを送信
   */
  async sendDailyReport(userId: string, timezone: string): Promise<void> {
    try {
      console.log(`📊 Generating daily report for user ${userId} (${timezone})`);
      
      // ActivityLoggingIntegrationで日次サマリーを生成
      const summaryText = await this.integration.generateDailySummaryText(userId, timezone);
      
      // Discord DMで送信
      await this.bot.sendDirectMessage(userId, summaryText);
      
      console.log(`✅ Daily report sent to user ${userId} (${timezone})`);
    } catch (error) {
      console.error(`❌ Failed to send daily report to user ${userId}:`, error);
      throw new ActivityLogError(
        '日次レポートの送信に失敗しました',
        'DAILY_REPORT_SEND_ERROR',
        { userId, timezone, error }
      );
    }
  }
}