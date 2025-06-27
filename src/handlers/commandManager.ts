import { Message } from 'discord.js';
import { 
  ICommandHandler, 
  IActivityHandler, 
  ISummaryHandler, 
  ICostReportHandler 
} from './interfaces';

/**
 * コマンドマネージャー
 * 全てのコマンドハンドラーを統括し、適切なハンドラーに処理を委譲
 */
export class CommandManager {
  private commandHandlers: Map<string, ICommandHandler> = new Map();
  private activityHandler: IActivityHandler;
  private summaryHandler: ISummaryHandler;
  private costReportHandler: ICostReportHandler;

  constructor(
    activityHandler: IActivityHandler,
    summaryHandler: ISummaryHandler,
    costReportHandler: ICostReportHandler
  ) {
    this.activityHandler = activityHandler;
    this.summaryHandler = summaryHandler;
    this.costReportHandler = costReportHandler;
  }

  /**
   * コマンドハンドラーを登録
   * @param command コマンド名（!を除く）
   * @param handler ハンドラーインスタンス
   */
  public registerCommandHandler(command: string, handler: ICommandHandler): void {
    this.commandHandlers.set(command, handler);
  }

  /**
   * メッセージを処理し、適切なハンドラーに委譲
   * @param message Discordメッセージオブジェクト
   * @param userTimezone ユーザーのタイムゾーン
   * @returns 処理が実行された場合true
   */
  public async handleMessage(message: Message, userTimezone: string): Promise<boolean> {
    const content = message.content.trim();

    // コマンドの場合
    if (content.startsWith('!')) {
      return await this.handleCommand(message, content);
    }

    // 特定キーワードの場合
    if (this.isSummaryRequest(content)) {
      const dateMatch = content.match(/(\d{4}-\d{2}-\d{2})/);
      await this.summaryHandler.handleSummaryRequest(
        message, 
        userTimezone, 
        dateMatch ? dateMatch[1] : undefined
      );
      return true;
    }

    if (this.isCostReportRequest(content)) {
      await this.costReportHandler.handleCostReportRequest(message, userTimezone);
      return true;
    }

    // 通常の活動記録として処理
    await this.activityHandler.handleActivityLog(message, content, userTimezone);
    return true;
  }

  /**
   * コマンドを処理
   */
  private async handleCommand(message: Message, content: string): Promise<boolean> {
    const parts = content.slice(1).split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    const handler = this.commandHandlers.get(command);
    if (handler) {
      await handler.handle(message, args);
      return true;
    }

    // 不明なコマンドの場合
    await message.reply(
      `不明なコマンドです: \`!${command}\`\n\n` +
      `**利用可能なコマンド:**\n` +
      `• \`!timezone\` - タイムゾーン設定\n` +
      `• \`!timezone set <タイムゾーン名>\` - タイムゾーンを設定\n` +
      `• \`!timezone search <都市名>\` - タイムゾーンを検索\n\n` +
      `**その他の操作:**\n` +
      `• メッセージ投稿で活動記録\n` +
      `• "サマリー" または "まとめ" でサマリー表示\n` +
      `• "費用" または "コスト" でAPI使用料レポート表示`
    );
    return true;
  }

  /**
   * サマリーリクエストかどうかを判定
   */
  private isSummaryRequest(content: string): boolean {
    const summaryKeywords = ['サマリー', 'まとめ', 'summary', '集計', '要約'];
    return summaryKeywords.some(keyword => 
      content.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  /**
   * コストレポートリクエストかどうかを判定
   */
  private isCostReportRequest(content: string): boolean {
    const costKeywords = ['費用', 'コスト', 'cost', '料金', 'api'];
    return costKeywords.some(keyword => 
      content.toLowerCase().includes(keyword.toLowerCase())
    );
  }
}