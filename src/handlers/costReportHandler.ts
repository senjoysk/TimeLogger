import { Message } from 'discord.js';
import { ICostReportHandler } from './interfaces';
import { IAnalysisService } from '../repositories/interfaces';

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
    console.log(`💰 [DEBUG] API費用レポート要求処理開始: ${message.author.tag}`);
    
    try {
      // API費用レポートを生成
      console.log('  ↳ [DEBUG] AnalysisServiceでAPI費用レポート取得中...');
      const report = await this.analysisService.getDailyCostReport(
        message.author.id, 
        userTimezone
      );

      // レポートを送信
      await message.reply(report);

      console.log('✅ [DEBUG] API費用レポート要求処理完了');
    } catch (error) {
      console.error('❌ [DEBUG] API費用レポート要求処理エラー:', error);
      await message.reply('申し訳ありません。API費用レポートの取得中にエラーが発生しました。しばらく後にもう一度お試しください。');
    }
  }
}