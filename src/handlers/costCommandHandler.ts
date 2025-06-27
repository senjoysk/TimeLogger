import { Message } from 'discord.js';
import { ICommandHandler } from './interfaces';
import { IAnalysisService } from '../repositories/interfaces';
import { ErrorHandler, ErrorType, withErrorHandling } from '../utils/errorHandler';

/**
 * コストコマンドハンドラー
 * !cost コマンドの処理を担当
 */
export class CostCommandHandler implements ICommandHandler {
  private analysisService: IAnalysisService;

  constructor(analysisService: IAnalysisService) {
    this.analysisService = analysisService;
  }

  /**
   * コストコマンドを処理
   * @param message メッセージオブジェクト
   * @param args コマンド引数
   * @returns 処理が成功した場合true
   */
  public async handle(message: Message, args: string[]): Promise<boolean> {
    ErrorHandler.logDebug('CostCommandHandler', `API費用レポートコマンド処理開始: ${message.author.tag}`);
    
    try {
      // UserTimezoneを取得するためにrepositoryが必要だが、
      // 現在のアーキテクチャではGeminiServiceにrepositoryが含まれている
      // とりあえずデフォルトタイムゾーンを使用
      const userTimezone = 'Asia/Tokyo';

      // API費用レポートを生成
      const costReport = await withErrorHandling(
        () => this.analysisService.getDailyCostReport(message.author.id, userTimezone),
        ErrorType.API,
        { userId: message.author.id, operation: 'getDailyCostReport' }
      );
      
      // コスト警告もチェック
      const alert = await withErrorHandling(
        () => this.analysisService.checkCostAlerts(message.author.id, userTimezone),
        ErrorType.API,
        { userId: message.author.id, operation: 'checkCostAlerts' }
      );
      
      let responseMessage = costReport;
      if (alert) {
        responseMessage = `${alert.message}\n\n${costReport}`;
      }

      // レポートを送信
      await withErrorHandling(
        () => message.reply(responseMessage),
        ErrorType.DISCORD,
        { userId: message.author.id, operation: 'sendCostReport' }
      );

      ErrorHandler.logSuccess('CostCommandHandler', 'API費用レポートコマンド処理完了');
      return true;
    } catch (error) {
      const userMessage = ErrorHandler.handle(error);
      await message.reply(userMessage);
      return true;
    }
  }
}