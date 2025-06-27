import { Message } from 'discord.js';
import { ISummaryHandler } from './interfaces';
import { SummaryService } from '../services/summaryService';
import { getCurrentBusinessDate } from '../utils/timeUtils';
import { ErrorHandler, ErrorType, AppError, withErrorHandling } from '../utils/errorHandler';

/**
 * サマリーハンドラー
 * 日次サマリーリクエストの処理を担当
 */
export class SummaryHandler implements ISummaryHandler {
  private summaryService: SummaryService;

  constructor(summaryService: SummaryService) {
    this.summaryService = summaryService;
  }

  /**
   * サマリーリクエストを処理する
   * @param message Discordメッセージオブジェクト
   * @param userTimezone ユーザーのタイムゾーン
   * @param dateString オプション：指定日付（YYYY-MM-DD形式）
   */
  public async handleSummaryRequest(message: Message, userTimezone: string, dateString?: string): Promise<void> {
    ErrorHandler.logDebug('SummaryHandler', `サマリー要求処理開始: ${message.author.tag}`, { dateString });
    
    try {
      let targetDate: string | undefined;
      
      if (dateString) {
        // 日付形式の検証（YYYY-MM-DD）
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(dateString)) {
          throw new AppError(
            '日付の形式が正しくありません。YYYY-MM-DD の形式で指定してください。例: 2025-06-27',
            ErrorType.VALIDATION,
            { userId: message.author.id, operation: 'validateDateFormat', dateString }
          );
        }
        
        // 日付の妥当性チェック
        const date = new Date(dateString);
        if (isNaN(date.getTime())) {
          throw new AppError(
            '指定された日付が無効です。正しい日付を入力してください。',
            ErrorType.VALIDATION,
            { userId: message.author.id, operation: 'validateDate', dateString }
          );
        }
        
        targetDate = dateString;
      } else {
        targetDate = getCurrentBusinessDate(userTimezone);
      }

      ErrorHandler.logDebug('SummaryHandler', `サマリー対象日: ${targetDate}`);

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

      ErrorHandler.logSuccess('SummaryHandler', 'サマリー要求処理完了');
    } catch (error) {
      const userMessage = ErrorHandler.handle(error);
      await message.reply(userMessage);
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