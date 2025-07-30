/**
 * DailyReportSender - 日次レポート送信サービス
 * 
 * DynamicReportSchedulerと連携して実際の日次レポートを送信
 */

import { ActivityLoggingIntegration } from '../integration/activityLoggingIntegration';
import { TaskLoggerBot } from '../bot';
import { ActivityLogError } from '../types/activityLog';
import { logger } from '../utils/logger';

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
      logger.info('DAILY_REPORT_SENDER', `日次レポート生成中: ユーザー ${userId} (${timezone})`);
      
      // ActivityLoggingIntegrationで日次サマリーを生成
      const summaryText = await this.integration.generateDailySummaryText(userId, timezone);
      
      // Discord DMで送信
      await this.bot.sendDirectMessage(userId, summaryText);
      
      logger.success('DAILY_REPORT_SENDER', `日次レポート送信完了: ユーザー ${userId} (${timezone})`);
    } catch (error) {
      logger.error('DAILY_REPORT_SENDER', `日次レポート送信失敗: ユーザー ${userId}`, error as Error);
      throw new ActivityLogError(
        '日次レポートの送信に失敗しました',
        'DAILY_REPORT_SEND_ERROR',
        { userId, timezone, error }
      );
    }
  }
}