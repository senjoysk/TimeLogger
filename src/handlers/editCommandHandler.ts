import { Message } from 'discord.js';
import { ICommandHandler } from './interfaces';
import { IDatabaseRepository } from '../repositories/interfaces';
import { ErrorHandler, AppError, ErrorType } from '../utils/errorHandler';
import { getCurrentBusinessDate, formatTime } from '../utils/timeUtils';

/**
 * 活動記録編集コマンドハンドラー
 * !edit コマンドで直前の活動記録の時刻を修正
 */
export class EditCommandHandler implements ICommandHandler {
  private repository: IDatabaseRepository;

  constructor(repository: IDatabaseRepository) {
    this.repository = repository;
  }

  /**
   * 編集コマンドを処理
   * 使用方法: !edit HH:MM-HH:MM
   */
  public async handle(message: Message, args: string[]): Promise<boolean> {
    try {
      if (args.length === 0) {
        await this.sendUsageMessage(message);
        return true;
      }

      const timeInput = args.join(' ');
      const userTimezone = await this.repository.getUserTimezone(message.author.id);
      
      // 時刻パターンの解析
      const timePattern = /(\d{1,2}):(\d{2})\s*[-~]\s*(\d{1,2}):(\d{2})/;
      const match = timeInput.match(timePattern);
      
      if (!match) {
        await message.reply(
          '❌ 時刻の形式が正しくありません。\n' +
          '正しい形式: `!edit HH:MM-HH:MM` (例: `!edit 13:00-13:30`)'
        );
        return true;
      }

      const [, startHour, startMin, endHour, endMin] = match.map(m => m ? parseInt(m) : 0);
      
      // 時刻の妥当性チェック
      if (startHour < 0 || startHour > 23 || endHour < 0 || endHour > 23 ||
          startMin < 0 || startMin > 59 || endMin < 0 || endMin > 59) {
        await message.reply('❌ 無効な時刻が指定されました。');
        return true;
      }

      // 今日の最新の活動記録を取得
      const businessDate = getCurrentBusinessDate(userTimezone);
      const activities = await this.repository.getActivityRecords(
        message.author.id,
        userTimezone,
        businessDate
      );

      if (activities.length === 0) {
        await message.reply('📝 本日の活動記録がありません。');
        return true;
      }

      // 最新の記録を取得（作成日時でソート）
      const latestActivity = activities.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0];

      // 新しい時刻でUTCに変換
      const today = new Date();
      const startTime = new Date(today);
      startTime.setHours(startHour, startMin, 0, 0);
      
      const endTime = new Date(today);
      endTime.setHours(endHour, endMin, 0, 0);

      // 時間の論理チェック
      if (startTime >= endTime) {
        await message.reply('❌ 開始時刻は終了時刻より前である必要があります。');
        return true;
      }

      const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60));

      // 活動記録を更新
      await this.repository.updateActivityTime(
        latestActivity.id,
        startTime.toISOString(),
        endTime.toISOString(),
        durationMinutes
      );

      // 確認メッセージ
      const startTimeStr = formatTime(startTime, userTimezone);
      const endTimeStr = formatTime(endTime, userTimezone);
      
      await message.reply(
        `✅ **活動記録を修正しました！**\n\n` +
        `📝 **内容:** ${latestActivity.analysis.structuredContent}\n` +
        `⏰ **修正前:** ${this.formatOriginalTime(latestActivity, userTimezone)}\n` +
        `⏰ **修正後:** ${startTimeStr} - ${endTimeStr} (${durationMinutes}分)\n`
      );

      ErrorHandler.logSuccess('EditCommand', `活動記録の時刻を修正: ${latestActivity.id}`);
      return true;

    } catch (error) {
      ErrorHandler.logDebug('EditCommand', 'エラー発生', error);
      const userMessage = ErrorHandler.handle(error);
      await message.reply(userMessage);
      return true;
    }
  }

  /**
   * 使用方法メッセージを送信
   */
  private async sendUsageMessage(message: Message): Promise<void> {
    await message.reply(
      '📝 **!edit - 直前の活動記録の時刻を修正**\n\n' +
      '**使用方法:**\n' +
      '`!edit HH:MM-HH:MM` - 時刻を指定して修正\n\n' +
      '**例:**\n' +
      '`!edit 13:00-13:30` - 13:00〜13:30に修正\n' +
      '`!edit 9:30-10:00` - 9:30〜10:00に修正'
    );
  }

  /**
   * 元の時刻をフォーマット
   */
  private formatOriginalTime(activity: any, timezone: string): string {
    if (activity.analysis.startTime && activity.analysis.endTime) {
      const start = formatTime(new Date(activity.analysis.startTime), timezone);
      const end = formatTime(new Date(activity.analysis.endTime), timezone);
      return `${start} - ${end}`;
    }
    return '時刻情報なし';
  }
}