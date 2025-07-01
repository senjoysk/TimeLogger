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
 * 活動記録ハンドラーの抽象化インターフェース
 */
export interface IActivityHandler {
  /**
   * 活動記録を処理する
   * @param message Discordメッセージオブジェクト
   * @param content メッセージ内容
   * @param userTimezone ユーザーのタイムゾーン
   */
  handleActivityLog(message: Message, content: string, userTimezone: string): Promise<void>;
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