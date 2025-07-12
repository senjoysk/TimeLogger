/**
 * コマンドハンドラー共通インターフェース
 */

import { Message } from 'discord.js';

/**
 * コマンドハンドラーインターフェース
 */
export interface ICommandHandler {
  /**
   * コマンドを処理
   * @param message Discordメッセージ
   * @param args コマンド引数
   */
  handleCommand(message: Message, args: string[]): Promise<void>;
}