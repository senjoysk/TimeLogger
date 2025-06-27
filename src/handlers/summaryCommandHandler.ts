import { Message } from 'discord.js';
import { ICommandHandler } from './interfaces';
import { SummaryService } from '../services/summaryService';
import { getCurrentBusinessDate } from '../utils/timeUtils';
import { ErrorHandler, ErrorType, AppError, withErrorHandling } from '../utils/errorHandler';

/**
 * サマリーコマンドハンドラー
 * !summary コマンドの処理を担当
 */
export class SummaryCommandHandler implements ICommandHandler {
  private summaryService: SummaryService;

  constructor(summaryService: SummaryService) {
    this.summaryService = summaryService;
  }

  /**
   * サマリーコマンドを処理
   * @param message メッセージオブジェクト
   * @param args コマンド引数
   * @returns 処理が成功した場合true
   */
  public async handle(message: Message, args: string[]): Promise<boolean> {
    const dateArg = args[0]; // 日付引数（例: !summary 2025-06-26）
    
    ErrorHandler.logDebug('SummaryCommandHandler', `サマリーコマンド処理開始: ${message.author.tag}`, { dateArg });
    
    try {
      let targetDate: string | undefined;
      
      if (dateArg) {
        // 日付形式の検証（YYYY-MM-DD）
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(dateArg)) {
          throw new AppError(
            '❌ 日付形式が正しくありません。\n`!summary YYYY-MM-DD` の形式で指定してください。\n例: `!summary 2025-06-26`',
            ErrorType.VALIDATION,
            { userId: message.author.id, operation: 'validateDateFormat', dateArg }
          );
        }
        
        // 日付の妥当性チェック
        const date = new Date(dateArg + 'T00:00:00');
        if (isNaN(date.getTime())) {
          throw new AppError(
            '❌ 無効な日付です。正しい日付を指定してください。',
            ErrorType.VALIDATION,
            { userId: message.author.id, operation: 'validateDate', dateArg }
          );
        }
        
        targetDate = dateArg;
      }

      // UserTimezoneを取得するためにrepositoryが必要だが、
      // 現在のアーキテクチャではSummaryServiceにrepositoryが含まれている
      // とりあえずデフォルトタイムゾーンを使用
      const userTimezone = 'Asia/Tokyo';

      if (!targetDate) {
        targetDate = getCurrentBusinessDate(userTimezone);
      }

      ErrorHandler.logDebug('SummaryCommandHandler', `サマリー対象日: ${targetDate}`);

      // サマリーを取得
      const summary = await withErrorHandling(
        () => this.summaryService.getDailySummary(message.author.id, userTimezone, targetDate),
        ErrorType.API,
        { userId: message.author.id, operation: 'getDailySummary', targetDate }
      );

      // サマリーをフォーマットして送信
      await withErrorHandling(
        () => this.sendSummaryResponse(message, summary, targetDate),
        ErrorType.DISCORD,
        { userId: message.author.id, operation: 'sendSummaryResponse' }
      );

      ErrorHandler.logSuccess('SummaryCommandHandler', 'サマリーコマンド処理完了');
      return true;
    } catch (error) {
      const userMessage = ErrorHandler.handle(error);
      await message.reply(userMessage);
      return true;
    }
  }

  /**
   * サマリーの結果をユーザーに送信
   */
  private async sendSummaryResponse(message: Message, summary: any, targetDate: string): Promise<void> {
    if (!summary) {
      await message.reply(`${targetDate} の活動記録が見つかりませんでした。活動記録を追加してからサマリーをリクエストしてください。`);
      return;
    }

    // カテゴリ別集計のフォーマット
    const categoryList = summary.categoryTotals
      .map((cat: any) => {
        const subCategoryDetails = cat.subCategories && cat.subCategories.length > 0
          ? cat.subCategories.map((sub: any) => `    - ${sub.subCategory}: ${sub.totalMinutes}分`).join('\n')
          : '';
        return `• **${cat.category}**: ${cat.totalMinutes}分 (${cat.recordCount}回)${subCategoryDetails ? '\n' + subCategoryDetails : ''}`;
      })
      .join('\n');

    // 生産性の平均計算
    const totalRecords = summary.categoryTotals.reduce((sum: number, cat: any) => sum + cat.recordCount, 0);
    const weightedProductivity = summary.categoryTotals.reduce((sum: number, cat: any) => 
      sum + (cat.averageProductivity * cat.recordCount), 0
    );
    const overallProductivity = totalRecords > 0 ? Math.round(weightedProductivity / totalRecords * 10) / 10 : 0;

    await message.reply(
      `📊 **${targetDate} の活動サマリー**\n\n` +
      `**📈 活動概要**\n` +
      `${categoryList}\n\n` +
      `**⏱️ 総活動時間:** ${summary.totalMinutes}分 (${Math.round(summary.totalMinutes / 60 * 10) / 10}時間)\n` +
      `**📋 総記録数:** ${totalRecords}件\n` +
      `**⭐ 平均生産性:** ${'⭐'.repeat(Math.round(overallProductivity))} (${overallProductivity}/5)\n\n` +
      `**💭 感想**\n${summary.insights}\n\n` +
      `**🌟 励ましメッセージ**\n${summary.motivation}`
    );
  }
}