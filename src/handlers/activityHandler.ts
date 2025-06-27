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
      const recordSummary = records.map(record => {
        const timeDisplay = this.formatTimeDisplay(record, userTimezone);
        return `• ${timeDisplay}: [${record.analysis.category}] ${record.analysis.structuredContent} (${record.analysis.estimatedMinutes}分)`;
      }).join('\n');
      
      await message.reply(
        `📝 **活動記録を保存しました！**\n\n` +
        `**記録内容:**\n${recordSummary}\n\n` +
        `**現在の時間枠:** ${currentSlot.label}`
      );
    } else {
      const record = records[0];
      const timeDisplay = this.formatTimeDisplay(record, userTimezone);
      
      await message.reply(
        `✅ **活動記録を保存しました！**\n\n` +
        `⏰ **時間:** ${timeDisplay} (${record.analysis.estimatedMinutes}分)\n` +
        `📂 **カテゴリ:** ${record.analysis.category}${record.analysis.subCategory ? ` > ${record.analysis.subCategory}` : ''}\n` +
        `⭐ **生産性:** ${'⭐'.repeat(record.analysis.productivityLevel)} (${record.analysis.productivityLevel}/5)\n` +
        `\n💡 ${record.analysis.structuredContent}`
      );
    }
  }

  /**
   * 時刻表示をフォーマット
   */
  private formatTimeDisplay(record: any, userTimezone: string): string {
    if (record.analysis.startTime && record.analysis.endTime) {
      const startTime = new Date(record.analysis.startTime);
      const endTime = new Date(record.analysis.endTime);
      
      const startTimeStr = startTime.toLocaleTimeString('ja-JP', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: userTimezone
      });
      
      const endTimeStr = endTime.toLocaleTimeString('ja-JP', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: userTimezone
      });
      
      return `${startTimeStr} - ${endTimeStr}`;
    }
    
    // フォールバック: timeSlotをローカル時刻で表示
    try {
      const slotTime = new Date(record.timeSlot);
      const slotEndTime = new Date(slotTime.getTime() + 30 * 60 * 1000);
      
      const startStr = slotTime.toLocaleTimeString('ja-JP', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: userTimezone
      });
      
      const endStr = slotEndTime.toLocaleTimeString('ja-JP', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: userTimezone
      });
      
      return `${startStr} - ${endStr}`;
    } catch {
      // 最終フォールバック
      return record.timeSlot;
    }
  }
}