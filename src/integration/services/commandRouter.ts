/**
 * CommandRouter
 * コマンドルーティングの責任を分離
 */

import { Message } from 'discord.js';
import { logger } from '../../utils/logger';

export interface CommandHandler {
  handle?(message: Message, userId: string, args: string[], timezone: string): Promise<void>;
  handleCommand?(message: Message, userId: string, args: string[], timezone: string): Promise<void>;
}

export interface ICommandRouter {
  registerCommand(command: string, handler: CommandHandler): void;
  routeCommand(message: Message, userId: string, content: string, timezone: string): Promise<boolean>;
}

export class CommandRouter implements ICommandRouter {
  private commands: Map<string, CommandHandler> = new Map();
  private aliases: Map<string, string> = new Map();

  constructor() {
    // エイリアスの設定
    this.aliases.set('編集', 'edit');
    this.aliases.set('サマリー', 'summary');
    this.aliases.set('ログ', 'logs');
    this.aliases.set('ヘルプ', 'help');
    this.aliases.set('ステータス', 'status');
    this.aliases.set('タイムゾーン', 'timezone');
    this.aliases.set('ギャップ', 'gap');
    this.aliases.set('タスク', 'todo');
    this.aliases.set('プロファイル', 'profile');
    this.aliases.set('メモ', 'memo');
    this.aliases.set('プロンプト', 'prompt');
    this.aliases.set('通知', 'prompt');
  }

  /**
   * コマンドハンドラーを登録
   */
  registerCommand(command: string, handler: CommandHandler): void {
    this.commands.set(command, handler);
    logger.info('COMMAND_ROUTER', `コマンド登録: ${command}`);
  }

  /**
   * コマンドをルーティング
   */
  async routeCommand(
    message: Message, 
    userId: string, 
    content: string, 
    timezone: string
  ): Promise<boolean> {
    if (!content.startsWith('!')) {
      return false;
    }

    const parts = content.slice(1).split(' ');
    let command = parts[0].toLowerCase();
    const args = parts.slice(1);

    // エイリアスの解決
    if (this.aliases.has(command)) {
      command = this.aliases.get(command)!;
    }

    logger.info('COMMAND_ROUTER', `🎮 コマンド処理: ${command} (${userId}), args: [${args.join(', ')}]`);

    const handler = this.commands.get(command);
    if (handler) {
      try {
        // 新しいインターフェースをサポート
        if (handler.handleCommand) {
          await handler.handleCommand(message, userId, args, timezone);
        } else if (handler.handle) {
          await handler.handle(message, userId, args, timezone);
        } else {
          // handleもhandleCommandもない場合は、直接呼び出し
          await (handler as any)(message);
        }
        return true;
      } catch (error) {
        logger.error('COMMAND_ROUTER', `コマンド実行エラー (${command}):`, error);
        await message.reply(`❌ コマンド実行中にエラーが発生しました: ${error}`);
        return false;
      }
    }

    logger.info('COMMAND_ROUTER', `📝 未対応コマンド: ${command}`);
    return false;
  }
}