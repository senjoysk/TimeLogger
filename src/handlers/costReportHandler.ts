import { Message } from 'discord.js';
import { ICostReportHandler } from './interfaces';
import { IAnalysisService } from '../repositories/interfaces';
import { ErrorHandler, ErrorType, withErrorHandling } from '../utils/errorHandler';

/**
 * コストレポートハンドラー
 * API使用量とコストレポートリクエストの処理を担当
 */
export class CostReportHandler implements ICostReportHandler {
  private analysisService: IAnalysisService;

  constructor(analysisService: IAnalysisService) {
    this.analysisService = analysisService;
  }

  /**
   * コストレポートリクエストを処理する
   * @param message Discordメッセージオブジェクト
   * @param userTimezone ユーザーのタイムゾーン
   */
  public async handleCostReportRequest(message: Message, userTimezone: string): Promise<void> {
    ErrorHandler.logDebug('CostReportHandler', `API費用レポート要求処理開始: ${message.author.tag}`);
    
    try {
      // API費用レポートを生成
      const report = await withErrorHandling(
        () => this.analysisService.getDailyCostReport(message.author.id, userTimezone),
        ErrorType.API,
        { userId: message.author.id, operation: 'getDailyCostReport' }
      );

      // レポートを送信
      await withErrorHandling(
        () => message.reply(report),
        ErrorType.DISCORD,
        { userId: message.author.id, operation: 'sendCostReport' }
      );

      ErrorHandler.logSuccess('CostReportHandler', 'API費用レポート要求処理完了');
    } catch (error) {
      const userMessage = ErrorHandler.handle(error);
      await message.reply(userMessage);
    }
  }
}