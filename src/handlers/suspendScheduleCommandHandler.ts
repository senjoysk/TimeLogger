/**
 * サスペンドスケジュール設定コマンドハンドラー
 * ユーザー別の夜間サスペンド・起床時刻をローカルタイムゾーンで設定
 */

import { Message } from 'discord.js';
import { ICommandHandler } from './interfaces';
import { SqliteActivityLogRepository } from '../repositories/sqliteActivityLogRepository';
import { withErrorHandling, AppError } from '../utils/errorHandler';
import { toZonedTime, format } from 'date-fns-tz';

export class SuspendScheduleCommandHandler implements ICommandHandler {
  constructor(private repository: SqliteActivityLogRepository) {}

  /**
   * !suspend-scheduleコマンドを処理
   */
  async handleCommand(message: Message, args: string[]): Promise<void> {
    try {
      const userId = message.author.id;
      const command = args[0]?.toLowerCase();

      switch (command) {
        case 'set':
          await this.handleSetSchedule(message, userId, args.slice(1));
          break;
        case 'show':
        case undefined:
          await this.handleShowSchedule(message, userId);
          break;
        case 'help':
          await this.handleHelp(message);
          break;
        default:
          await message.reply('❌ 無効なサブコマンドです。`!suspend-schedule help` でヘルプを確認してください。');
      }
    } catch (error) {
      console.error('❌ サスペンドスケジュールコマンドエラー:', error);
      await message.reply('❌ コマンド処理中にエラーが発生しました。しばらく経ってから再試行してください。');
    }
  }

  /**
   * サスペンドスケジュール設定処理
   */
  private async handleSetSchedule(message: Message, userId: string, args: string[]): Promise<void> {
    if (args.length !== 2) {
      await message.reply('❌ 使用方法: `!suspend-schedule set <サスペンド時刻> <起床時刻>`\n例: `!suspend-schedule set 0 7` (0時サスペンド、7時起床)');
      return;
    }

    const suspendHour = parseInt(args[0]);
    const wakeHour = parseInt(args[1]);

    // 時刻の妥当性チェック
    if (isNaN(suspendHour) || isNaN(wakeHour) || 
        suspendHour < 0 || suspendHour > 23 || 
        wakeHour < 0 || wakeHour > 23) {
      await message.reply('❌ 時刻は0-23の範囲で指定してください。\n例: `!suspend-schedule set 0 7`');
      return;
    }

    // 同じ時刻をチェック
    if (suspendHour === wakeHour) {
      await message.reply('❌ サスペンド時刻と起床時刻は異なる時刻を指定してください。');
      return;
    }

    try {
      // ユーザーのタイムゾーンを取得
      const timezone = await this.repository.getUserTimezone(userId) || 'Asia/Tokyo';
      
      // 設定を保存
      await this.repository.saveUserSuspendSchedule(userId, suspendHour, wakeHour);

      // UTC時刻での実際のスケジュールを計算
      const utcSuspendInfo = this.calculateUtcTime(suspendHour, timezone);
      const utcWakeInfo = this.calculateUtcTime(wakeHour, timezone);

      await message.reply(
        `✅ **夜間サスペンドスケジュールを設定しました**\n\n` +
        `⏰ **ローカル時刻** (${timezone}):\n` +
        `　🌙 サスペンド: ${suspendHour.toString().padStart(2, '0')}:00\n` +
        `　🌅 起床: ${wakeHour.toString().padStart(2, '0')}:00\n\n` +
        `🌍 **UTC時刻での実行予定**:\n` +
        `　🌙 サスペンド: ${utcSuspendInfo.utcHour.toString().padStart(2, '0')}:00 UTC\n` +
        `　🌅 起床: ${utcWakeInfo.utcHour.toString().padStart(2, '0')}:00 UTC\n\n` +
        `💡 この設定は次回GitHub Actionsの動的スケジューリング更新時に反映されます。`
      );
    } catch (error) {
      console.error('❌ サスペンドスケジュール設定エラー:', error);
      await message.reply('❌ サスペンドスケジュール設定に失敗しました。しばらく経ってから再試行してください。');
    }
  }

  /**
   * 現在のサスペンドスケジュール表示処理
   */
  private async handleShowSchedule(message: Message, userId: string): Promise<void> {
    try {
      const schedule = await this.repository.getUserSuspendSchedule(userId);
      
      if (!schedule) {
        await message.reply(
          '📋 **夜間サスペンドスケジュール**\n\n' +
          '❌ スケジュールが設定されていません。\n\n' +
          `🔧 設定方法: \`!suspend-schedule set <サスペンド時刻> <起床時刻>\`\n` +
          `例: \`!suspend-schedule set 0 7\` (0時サスペンド、7時起床)\n\n` +
          `💡 デフォルト: 0:00-7:00 JST で動作しています。`
        );
        return;
      }

      // UTC時刻での実際のスケジュールを計算
      const utcSuspendInfo = this.calculateUtcTime(schedule.suspendHour, schedule.timezone);
      const utcWakeInfo = this.calculateUtcTime(schedule.wakeHour, schedule.timezone);

      await message.reply(
        `📋 **夜間サスペンドスケジュール**\n\n` +
        `⏰ **ローカル時刻** (${schedule.timezone}):\n` +
        `　🌙 サスペンド: ${schedule.suspendHour.toString().padStart(2, '0')}:00\n` +
        `　🌅 起床: ${schedule.wakeHour.toString().padStart(2, '0')}:00\n\n` +
        `🌍 **UTC時刻での実行**:\n` +
        `　🌙 サスペンド: ${utcSuspendInfo.utcHour.toString().padStart(2, '0')}:00 UTC\n` +
        `　🌅 起床: ${utcWakeInfo.utcHour.toString().padStart(2, '0')}:00 UTC\n\n` +
        `🔧 変更: \`!suspend-schedule set <サスペンド時刻> <起床時刻>\``
      );
    } catch (error) {
      console.error('❌ サスペンドスケジュール取得エラー:', error);
      await message.reply('❌ サスペンドスケジュール取得に失敗しました。しばらく経ってから再試行してください。');
    }
  }

  /**
   * ヘルプメッセージ表示
   */
  private async handleHelp(message: Message): Promise<void> {
    await message.reply(
      `🛠️ **夜間サスペンドスケジュール設定コマンド**\n\n` +
      `**基本コマンド:**\n` +
      `\`!suspend-schedule\` または \`!suspend-schedule show\` - 現在の設定を表示\n` +
      `\`!suspend-schedule set <時> <時>\` - スケジュールを設定\n` +
      `\`!suspend-schedule help\` - このヘルプを表示\n\n` +
      `**設定例:**\n` +
      `\`!suspend-schedule set 0 7\` - 0時サスペンド、7時起床\n` +
      `\`!suspend-schedule set 23 6\` - 23時サスペンド、6時起床\n` +
      `\`!suspend-schedule set 1 8\` - 1時サスペンド、8時起床\n\n` +
      `**注意事項:**\n` +
      `• 時刻は24時間形式（0-23）で指定\n` +
      `• あなたのタイムゾーン設定（\`!timezone\`）に基づいて動作\n` +
      `• 設定変更後、GitHub Actionsの動的スケジューリング更新が必要\n` +
      `• デフォルトは0:00-7:00（現地時間）`
    );
  }

  /**
   * ローカル時刻からUTC時刻を計算
   */
  private calculateUtcTime(localHour: number, timezone: string): { utcHour: number; utcMinute: number } {
    // 今日の指定時刻でUTC時刻を計算
    const today = new Date();
    const localTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), localHour, 0, 0);
    
    // タイムゾーンを考慮してUTCに変換
    const zonedTime = toZonedTime(localTime, timezone);
    const utcTime = new Date(zonedTime.getTime() - (zonedTime.getTimezoneOffset() * 60000));
    
    // タイムゾーンオフセットを考慮した正確なUTC時刻計算
    const offsetMinutes = this.getTimezoneOffset(timezone);
    const utcHour = (localHour - Math.floor(offsetMinutes / 60) + 24) % 24;
    const utcMinute = (-offsetMinutes % 60 + 60) % 60;
    
    return { utcHour, utcMinute };
  }

  /**
   * タイムゾーンのUTCからのオフセット（分）を取得
   */
  private getTimezoneOffset(timezone: string): number {
    const now = new Date();
    const utc = new Date(now.getTime() + (now.getTimezoneOffset() * 60000));
    const zoned = toZonedTime(utc, timezone);
    return (zoned.getTime() - utc.getTime()) / (60 * 1000);
  }
}