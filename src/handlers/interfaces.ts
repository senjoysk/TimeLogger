import { Message } from 'discord.js';

/**
 * コマンドハンドラーの基本インターフェース
 */
export interface ICommandHandler {
  /**
   * コマンドを処理する
   * @param message - Discordメッセージ
   * @param userId - ユーザーID
   * @param args - コマンド引数
   * @param timezone - タイムゾーン
   */
  handle(message: Message, userId: string, args: string[], timezone: string): Promise<void>;

  /**
   * ヘルプメッセージを取得する
   */
  getHelp?(): string;
}