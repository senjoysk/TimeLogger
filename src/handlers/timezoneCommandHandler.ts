import { Message } from 'discord.js';
import { ICommandHandler } from './interfaces';
import { IDatabaseRepository } from '../repositories/interfaces';
import timezones from 'timezones.json';

/**
 * タイムゾーン設定コマンドハンドラー
 * !timezone コマンドの処理を担当
 */
export class TimezoneCommandHandler implements ICommandHandler {
  private repository: IDatabaseRepository;

  constructor(repository: IDatabaseRepository) {
    this.repository = repository;
  }

  /**
   * タイムゾーンコマンドを処理
   * @param message メッセージオブジェクト
   * @param args コマンド引数
   * @returns 処理が成功した場合true
   */
  public async handle(message: Message, args: string[]): Promise<boolean> {
    if (args.length === 0) {
      await this.showCurrentTimezone(message);
      return true;
    }

    const subcommand = args[0];
    const value = args.slice(1).join(' ');

    switch (subcommand) {
      case 'set':
        await this.setTimezone(message, value);
        break;
      case 'search':
        await this.searchTimezone(message, value);
        break;
      default:
        await this.showCurrentTimezone(message);
        break;
    }

    return true;
  }

  /**
   * タイムゾーンを設定する
   */
  private async setTimezone(message: Message, value: string): Promise<void> {
    if (!value) {
      await message.reply('タイムゾーンを設定するには、`!timezone set <タイムゾーン名>` の形式で指定してください。例: `!timezone set Asia/Tokyo`');
      return;
    }

    // タイムゾーンの検証（IANAタイムゾーン名で検証）
    const isValidTimezone = timezones.some((tz: any) => 
      tz.utc && tz.utc.includes(value)
    );

    if (!isValidTimezone) {
      await message.reply(`無効なタイムゾーンです: \`${value}\`。IANAタイムゾーンデータベースの形式で指定してください。例: \`Asia/Tokyo\`。または \`!timezone search <都市名>\` で検索してください。`);
      return;
    }

    await this.repository.setUserTimezone(message.author.id, value);
    await message.reply(`タイムゾーンを \`${value}\` に設定しました。`);
  }

  /**
   * タイムゾーンを検索する
   */
  private async searchTimezone(message: Message, value: string): Promise<void> {
    if (!value) {
      await message.reply('検索する都市名を指定してください。例: `!timezone search Tokyo`');
      return;
    }

    // timezones.jsonの実際の構造に合わせて検索
    const results = timezones.filter((tz: any) => {
      // textフィールドから都市名を検索
      const searchInText = tz.text && tz.text.toLowerCase().includes(value.toLowerCase());
      // utcフィールドからタイムゾーン名を検索
      const searchInUtc = tz.utc && tz.utc.some((utcZone: string) => 
        utcZone.toLowerCase().includes(value.toLowerCase())
      );
      return searchInText || searchInUtc;
    });

    if (results.length > 0) {
      const response = results.slice(0, 5).map((tz: any) => {
        // 主要なIANAタイムゾーンを取得（最初のものを使用）
        const mainTimezone = tz.utc && tz.utc.length > 0 ? tz.utc[0] : '不明';
        // textフィールドから都市名を抽出
        const cityPart = tz.text ? tz.text.split(') ')[1] || tz.text : '不明';
        return `• ${mainTimezone} (${cityPart})`;
      }).join('\n');
      await message.reply(`見つかったタイムゾーン:\n${response}\n\n設定するには \`!timezone set <タイムゾーン名>\` を使用してください。`);
    } else {
      await message.reply(`\`${value}\` に一致するタイムゾーンは見つかりませんでした。`);
    }
  }

  /**
   * 現在のタイムゾーンを表示する
   */
  private async showCurrentTimezone(message: Message): Promise<void> {
    const currentTimezone = await this.repository.getUserTimezone(message.author.id);
    await message.reply(`現在のタイムゾーンは \`${currentTimezone}\` です。変更するには \`!timezone set <タイムゾーン名>\` を使用してください。`);
  }
}