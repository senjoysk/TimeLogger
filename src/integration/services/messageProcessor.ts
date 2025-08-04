/**
 * MessageProcessor
 * メッセージ処理の責任を分離
 */

import { Message } from 'discord.js';
import { IUnifiedRepository } from '../../repositories/interfaces';
import { ActivityLogError } from '../../types/activityLog';
import { logger } from '../../utils/logger';
import { IReminderReplyService } from '../../services/reminderReplyService';
import { MessageSelectionHandler } from '../../handlers/messageSelectionHandler';

export interface IMessageProcessor {
  processMessage(message: Message): Promise<boolean>;
  setReminderReplyService(service: IReminderReplyService): void;
  setMessageSelectionHandler(handler: MessageSelectionHandler): void;
}

export class MessageProcessor implements IMessageProcessor {
  private reminderReplyService?: IReminderReplyService;
  private messageSelectionHandler?: MessageSelectionHandler;

  constructor(
    private repository: IUnifiedRepository,
    private getUserTimezone: (userId: string) => Promise<string>,
    private formatTimeForUser: (date: Date, timezone: string) => string,
    private calculateBusinessDate: (date: Date, timezone: string) => string
  ) {}

  setReminderReplyService(service: IReminderReplyService): void {
    this.reminderReplyService = service;
  }

  setMessageSelectionHandler(handler: MessageSelectionHandler): void {
    this.messageSelectionHandler = handler;
  }

  async processMessage(message: Message): Promise<boolean> {
    try {
      // Bot自身のメッセージは無視
      if (message.author.bot) {
        logger.info('MESSAGE_PROCESSOR', 'Botメッセージのため無視');
        return false;
      }

      // DMのみを処理
      if (message.guild) {
        logger.info('MESSAGE_PROCESSOR', 'ギルドメッセージのため無視');
        return false;
      }

      const userId = message.author.id;
      const content = message.content.trim();
      const timezone = await this.getUserTimezone(userId);

      // コマンドは別処理
      if (content.startsWith('!')) {
        return false; // コマンドハンドラーに委譲
      }

      // リマインダーReply検出処理
      if (this.reminderReplyService) {
        const reminderReplyResult = await this.reminderReplyService.isReminderReply(message);
        
        if (reminderReplyResult.isReminderReply && reminderReplyResult.timeRange) {
          await this.handleReminderReply(message, userId, content, timezone, reminderReplyResult);
          return true;
        }
      }

      // 通常のメッセージ処理
      if (content.length > 0 && content.length <= 2000 && this.messageSelectionHandler) {
        await this.messageSelectionHandler.processNonCommandMessage(message, userId, timezone);
        return true;
      }

      return false;
    } catch (error) {
      logger.error('MESSAGE_PROCESSOR', 'メッセージ処理エラー:', error);
      
      const errorMessage = error instanceof ActivityLogError 
        ? `❌ ${error.message}`
        : '❌ メッセージ処理中にエラーが発生しました。';
        
      try {
        await message.reply(errorMessage);
      } catch (replyError) {
        logger.error('MESSAGE_PROCESSOR', 'エラー返信失敗:', replyError);
      }
      
      return false;
    }
  }

  private async handleReminderReply(
    message: Message, 
    userId: string, 
    content: string, 
    timezone: string,
    reminderReplyResult: any
  ): Promise<void> {
    logger.info('MESSAGE_PROCESSOR', '✅ リマインダーReply検出成功', { 
      timeRange: reminderReplyResult.timeRange 
    });
    
    // リマインダーReplyとして活動ログに記録
    const activityLog = {
      userId,
      content,
      inputTimestamp: message.createdAt.toISOString(),
      businessDate: this.calculateBusinessDate(message.createdAt, timezone),
      isReminderReply: true,
      timeRangeStart: reminderReplyResult.timeRange.start.toISOString(),
      timeRangeEnd: reminderReplyResult.timeRange.end.toISOString(),
      contextType: 'REMINDER_REPLY' as const
    };
    
    await this.repository.saveLog(activityLog);
    logger.info('MESSAGE_PROCESSOR', `✅ リマインダーReply活動ログ記録完了: ${userId}`);
    
    // ユーザーに確認メッセージを送信
    const timeRange = reminderReplyResult.timeRange;
    const startTime = this.formatTimeForUser(timeRange.start, timezone);
    const endTime = this.formatTimeForUser(timeRange.end, timezone);
    
    await message.reply(`✅ リマインダーへの返信として記録しました。
⏰ 時間範囲: ${startTime} - ${endTime}`);
  }
}