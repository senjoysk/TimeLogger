import { Message } from 'discord.js';
import { IActivityHandler } from './interfaces';
import { ActivityService } from '../services/activityService';
import { getCurrentTimeSlot } from '../utils/timeUtils';
import { ErrorHandler, ErrorType, AppError, withErrorHandling } from '../utils/errorHandler';

/**
 * 活動記録ハンドラー
 * ユーザーの活動記録メッセージの処理を担当
 */
export class ActivityHandler implements IActivityHandler {
  private activityService: ActivityService;

  constructor(activityService: ActivityService) {
    this.activityService = activityService;
  }

  /**
   * 活動記録を処理する
   * @param message Discordメッセージオブジェクト
   * @param content メッセージ内容
   * @param userTimezone ユーザーのタイムゾーン
   */
  public async handleActivityLog(message: Message, content: string, userTimezone: string): Promise<void> {
    ErrorHandler.logDebug('ActivityHandler', `活動記録処理開始: ${message.author.tag}`, { content });
    
    try {
      // 活動記録を処理・保存
      const records = await withErrorHandling(
        () => this.activityService.processActivityRecord(message.author.id, content, userTimezone),
        ErrorType.API,
        { userId: message.author.id, operation: 'processActivityRecord' }
      );

      ErrorHandler.logDebug('ActivityHandler', `${records.length}件の活動記録を作成`);

      // 結果をユーザーに送信
      await withErrorHandling(
        () => this.sendActivityResponse(message, records, userTimezone),
        ErrorType.DISCORD,
        { userId: message.author.id, operation: 'sendActivityResponse' }
      );

      ErrorHandler.logSuccess('ActivityHandler', '活動記録処理完了');
    } catch (error) {
      const userMessage = ErrorHandler.handle(error);
      await message.reply(userMessage);
    }
  }

  /**
   * 活動記録の結果をユーザーに送信
   */
  private async sendActivityResponse(message: Message, records: any[], userTimezone: string): Promise<void> {
    if (records.length === 0) {
      await message.reply('活動記録の処理で問題が発生しました。');
      return;
    }

    const currentSlot = getCurrentTimeSlot(userTimezone);
    
    // 複数記録がある場合の処理
    if (records.length > 1) {
      const recordSummary = records.map(record => 
        `• ${record.timeSlot}: [${record.analysis.category}] ${record.analysis.structuredContent} (${record.analysis.estimatedMinutes}分)`
      ).join('\n');
      
      await message.reply(
        `📝 **活動記録を保存しました！**\n\n` +
        `**記録内容:**\n${recordSummary}\n\n` +
        `**現在の時間枠:** ${currentSlot.label}`
      );
    } else {
      const record = records[0];
      await message.reply(
        `📝 **活動記録を保存しました！**\n\n` +
        `**カテゴリ:** ${record.analysis.category}${record.analysis.subCategory ? ` > ${record.analysis.subCategory}` : ''}\n` +
        `**内容:** ${record.analysis.structuredContent}\n` +
        `**推定時間:** ${record.analysis.estimatedMinutes}分\n` +
        `**生産性:** ${'⭐'.repeat(record.analysis.productivityLevel)} (${record.analysis.productivityLevel}/5)\n` +
        `**時間枠:** ${record.timeSlot}`
      );
    }
  }
}