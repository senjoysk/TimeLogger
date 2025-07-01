import { Message } from 'discord.js';

/**
 * コマンドハンドラーの抽象化インターフェース
 * 各コマンドの処理を独立したハンドラーに分離
 */
export interface ICommandHandler {
  /**
   * コマンドを処理する
   * @param message Discordメッセージオブジェクト
   * @param args コマンド引数
   * @returns 処理が成功した場合true、該当しない場合false
   */
  handle(message: Message, args: string[]): Promise<boolean>;
}



/**
 * コストレポートハンドラーの抽象化インターフェース
 */
export interface ICostReportHandler {
  /**
   * コストレポートリクエストを処理する
   * @param message Discordメッセージオブジェクト
   * @param userTimezone ユーザーのタイムゾーン
   */
  handleCostReportRequest(message: Message, userTimezone: string): Promise<void>;
}