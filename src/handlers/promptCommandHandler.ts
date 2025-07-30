/**
 * 🟢 Green Phase: PromptCommandHandler 実装
 * TDDアプローチ: テストを通す最小限の実装
 */

import { Message, EmbedBuilder } from 'discord.js';
import { IActivityPromptRepository } from '../repositories/interfaces';
import { 
  ActivityPromptSettings,
  ActivityPromptError,
  ACTIVITY_PROMPT_VALIDATION
} from '../types/activityPrompt';
import { logger } from '../utils/logger';

/**
 * 活動促し通知コマンドハンドラーインターフェース
 */
export interface IPromptCommandHandler {
  /**
   * コマンドを処理
   */
  handleCommand(message: Message, args: string[], userId: string, timezone: string): Promise<void>;
}

/**
 * 活動促し通知コマンドハンドラー
 */
export class PromptCommandHandler implements IPromptCommandHandler {
  constructor(private repository: IActivityPromptRepository) {}

  /**
   * !prompt コマンドを処理
   */
  async handleCommand(message: Message, args: string[], userId: string, timezone: string): Promise<void> {
    try {
      logger.debug('HANDLER', `📢 活動促しコマンド処理開始: ${userId} ${args.join(' ')}`);

      if (args.length === 0) {
        await this.showHelp(message);
        return;
      }

      const command = args[0].toLowerCase();

      switch (command) {
        case 'on':
        case '有効':
          await this.enablePrompt(message, userId);
          break;

        case 'off':
        case '無効':
          await this.disablePrompt(message, userId);
          break;

        case 'time':
        case '時間':
          await this.setTime(message, userId, args.slice(1));
          break;

        case 'status':
        case '状態':
          await this.showStatus(message, userId, timezone);
          break;

        case 'help':
        case 'ヘルプ':
          await this.showHelp(message);
          break;

        default:
          await message.reply(`❌ 未知のコマンドです: \`${command}\`\n使用方法: \`!prompt help\` でヘルプを確認してください。`);
      }

    } catch (error) {
      logger.error('HANDLER', '❌ 活動促しコマンド処理エラー:', error);
      
      if (error instanceof ActivityPromptError) {
        await message.reply(`❌ ${error.message}`);
      } else {
        await message.reply('❌ コマンド処理中にエラーが発生しました。');
      }
    }
  }

  /**
   * 通知を有効化
   */
  private async enablePrompt(message: Message, userId: string): Promise<void> {
    const exists = await this.repository.settingsExists(userId);

    if (!exists) {
      // 初回設定：デフォルト値で作成
      const settings = await this.repository.createSettings({
        userId,
        isEnabled: true
      });

      await message.reply(
        `✅ 活動促し通知を有効にしました！\n` +
        `⏰ 通知時間: ${this.formatTime(settings.startHour, settings.startMinute)} - ${this.formatTime(settings.endHour, settings.endMinute)}\n` +
        `💡 時間を変更する場合: \`!prompt time 9:00 17:30\``
      );
    } else {
      // 既存設定を有効化
      await this.repository.enablePrompt(userId);
      await message.reply('✅ 活動促し通知を有効にしました！');
    }

    logger.debug('HANDLER', `✅ 活動促し有効化完了: ${userId}`);
  }

  /**
   * 通知を無効化
   */
  private async disablePrompt(message: Message, userId: string): Promise<void> {
    const exists = await this.repository.settingsExists(userId);
    
    if (!exists) {
      await message.reply('❌ 設定が存在しません。まず `!prompt on` で有効化してください。');
      return;
    }

    await this.repository.disablePrompt(userId);
    await message.reply('❌ 活動促し通知を無効にしました。');
    
    logger.debug('HANDLER', `❌ 活動促し無効化完了: ${userId}`);
  }

  /**
   * 通知時間を設定
   */
  private async setTime(message: Message, userId: string, timeArgs: string[]): Promise<void> {
    if (timeArgs.length < 2) {
      await message.reply(
        '❌ 開始時刻と終了時刻の両方を指定してください。\n' +
        '例: `!prompt time 9:00 17:30`'
      );
      return;
    }

    const startTime = this.parseTime(timeArgs[0]);
    const endTime = this.parseTime(timeArgs[1]);

    if (!startTime) {
      await message.reply(`❌ 無効な時刻形式です: ${timeArgs[0]}\n正しい形式: HH:MM (例: 9:00, 17:30)`);
      return;
    }

    if (!endTime) {
      await message.reply(`❌ 無効な時刻形式です: ${timeArgs[1]}\n正しい形式: HH:MM (例: 9:00, 17:30)`);
      return;
    }

    // 分のバリデーション
    if (!ACTIVITY_PROMPT_VALIDATION.TIME.VALID_MINUTES.includes(startTime.minute as 0 | 30) ||
        !ACTIVITY_PROMPT_VALIDATION.TIME.VALID_MINUTES.includes(endTime.minute as 0 | 30)) {
      await message.reply('❌ 分は0または30を指定してください。例: 9:00, 9:30');
      return;
    }

    // 時刻範囲チェック
    if (endTime.hour < startTime.hour || 
        (endTime.hour === startTime.hour && endTime.minute <= startTime.minute)) {
      await message.reply('❌ 終了時刻は開始時刻より後である必要があります。');
      return;
    }

    const exists = await this.repository.settingsExists(userId);
    
    if (!exists) {
      await message.reply('❌ 設定が存在しません。まず `!prompt on` で有効化してください。');
      return;
    }

    await this.repository.updateSettings(userId, {
      startHour: startTime.hour,
      startMinute: startTime.minute,
      endHour: endTime.hour,
      endMinute: endTime.minute
    });

    await message.reply(
      `⏰ 通知時間を設定しました！\n` +
      `📅 新しい時間: ${this.formatTime(startTime.hour, startTime.minute)} - ${this.formatTime(endTime.hour, endTime.minute)}`
    );

    logger.debug('HANDLER', `⏰ 通知時間設定完了: ${userId} ${this.formatTime(startTime.hour, startTime.minute)}-${this.formatTime(endTime.hour, endTime.minute)}`);
  }

  /**
   * 現在の設定状態を表示
   */
  private async showStatus(message: Message, userId: string, timezone: string): Promise<void> {
    const settings = await this.repository.getSettings(userId);

    if (!settings) {
      await message.reply(
        '❌ 設定が存在しません。\n' +
        '💡 `!prompt on` で活動促し通知を有効化してください。'
      );
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('📋 活動促し通知設定')
      .setDescription(`ユーザー: <@${userId}>`)
      .addFields(
        {
          name: '🔔 状態',
          value: settings.isEnabled ? '✅ 有効' : '❌ 無効',
          inline: true
        },
        {
          name: '⏰ 通知時間',
          value: `${this.formatTime(settings.startHour, settings.startMinute)} - ${this.formatTime(settings.endHour, settings.endMinute)}`,
          inline: true
        },
        {
          name: '🌍 タイムゾーン',
          value: timezone,
          inline: true
        },
        {
          name: '📅 通知間隔',
          value: '30分ごと（毎時0分・30分）',
          inline: true
        },
        {
          name: '📝 最終更新',
          value: new Date(settings.updatedAt).toLocaleString('ja-JP', { 
            timeZone: timezone 
          }),
          inline: true
        }
      )
      .setColor(settings.isEnabled ? 0x00ff00 : 0xff0000)
      .setTimestamp();

    if (settings.isEnabled) {
      embed.addFields({
        name: '💭 通知メッセージ',
        value: ACTIVITY_PROMPT_VALIDATION.MESSAGES.DEFAULT_PROMPT,
        inline: false
      });
    }

    await message.reply({ embeds: [embed] });
  }

  /**
   * ヘルプを表示
   */
  private async showHelp(message: Message): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle('🤖 活動促し通知ヘルプ')
      .setDescription('定期的な活動記録を促す通知機能の使用方法')
      .addFields(
        {
          name: '📝 基本コマンド',
          value: [
            '`!prompt on` - 通知を有効化',
            '`!prompt off` - 通知を無効化',
            '`!prompt time 9:00 17:30` - 通知時間設定',
            '`!prompt status` - 現在の設定確認',
            '`!prompt help` - このヘルプ'
          ].join('\n'),
          inline: false
        },
        {
          name: '⏰ 時間設定について',
          value: [
            '• 時刻は HH:MM 形式で指定',
            '• 分は 0 または 30 のみ',
            '• 例: 8:30, 9:00, 17:30',
            '• 終了時刻は開始時刻より後'
          ].join('\n'),
          inline: false
        },
        {
          name: '🔔 通知について',
          value: [
            '• 設定した時間内に30分間隔で通知',
            '• 毎時0分と30分に実行',
            '• メッセージ: "この30分、何してた？"',
            '• あなたのタイムゾーンに対応'
          ].join('\n'),
          inline: false
        },
        {
          name: '💡 使用例',
          value: [
            '`!prompt on` → デフォルト(8:30-18:00)で有効化',
            '`!prompt time 9:00 17:00` → 9:00-17:00に変更',
            '`!prompt off` → 通知を無効化'
          ].join('\n'),
          inline: false
        }
      )
      .setColor(0x0099ff)
      .setFooter({ 
        text: '活動記録を習慣化して、より良い時間管理を！' 
      })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  }

  /**
   * 時刻文字列を解析
   */
  private parseTime(timeStr: string): { hour: number; minute: number } | null {
    const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;

    const hour = parseInt(match[1], 10);
    const minute = parseInt(match[2], 10);

    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return null;
    }

    return { hour, minute };
  }

  /**
   * 時刻をフォーマット
   */
  private formatTime(hour: number, minute: number): string {
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  }
}