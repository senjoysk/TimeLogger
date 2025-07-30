import { Message } from 'discord.js';
import { IDiscordMessageClient } from '../interfaces/discordClient';
import { logger } from '../utils/logger';

export interface TimeRange {
  start: Date;
  end: Date;
}

export interface ReminderReplyResult {
  isReminderReply: boolean;
  timeRange?: TimeRange;
  reminderTime?: Date;
  reminderContent?: string;
}

export interface NearbyReminderResult {
  isPostReminderMessage: boolean;
  reminderTime?: Date;
}

export interface IReminderReplyService {
  isReminderReply(message: Message): Promise<ReminderReplyResult>;
  calculateTimeRange(reminderTime: Date): TimeRange;
  detectNearbyReminder(userMessage: Message, recentMessages?: Message[]): Promise<NearbyReminderResult>;
}

/**
 * リマインダー返信サービス
 * ビジネスロジックとDiscord API操作を分離した実装
 */
export class ReminderReplyService implements IReminderReplyService {
  private readonly REMINDER_KEYWORDS = ['この30分、何してた'];
  private readonly NEARBY_THRESHOLD_MINUTES = 10;

  constructor(
    private discordClient: IDiscordMessageClient
  ) {}

  /**
   * メッセージがリマインダーへの返信かどうかを判定
   */
  async isReminderReply(message: Message): Promise<ReminderReplyResult> {
    if (!message.reference?.messageId) {
      return { isReminderReply: false };
    }

    try {
      // Discord APIクライアント経由でメッセージを取得（レイヤー分離）
      const referencedMessage = await this.discordClient.fetchReferencedMessage(
        message, 
        message.reference.messageId
      );
      
      if (!referencedMessage) {
        logger.debug('REMINDER_REPLY_SERVICE', 'Referenced message not found', {
          messageId: message.reference.messageId
        });
        return { isReminderReply: false };
      }

      if (!referencedMessage.author.bot) {
        return { isReminderReply: false };
      }

      const isReminder = this.REMINDER_KEYWORDS.some(keyword => 
        referencedMessage.content.includes(keyword)
      );

      if (!isReminder) {
        return { isReminderReply: false };
      }

      const timeRange = this.calculateTimeRange(referencedMessage.createdAt);
      
      logger.debug('REMINDER_REPLY_SERVICE', 'Reminder reply detected', {
        reminderTime: referencedMessage.createdAt,
        timeRange,
        reminderContent: referencedMessage.content.substring(0, 50)
      });
      
      return {
        isReminderReply: true,
        timeRange,
        reminderTime: referencedMessage.createdAt,
        reminderContent: referencedMessage.content
      };
    } catch (error) {
      logger.error('REMINDER_REPLY_SERVICE', 'Error checking reminder reply', error as Error);
      return { isReminderReply: false };
    }
  }

  /**
   * リマインダー時刻から30分の時間範囲を計算
   */
  calculateTimeRange(reminderTime: Date): TimeRange {
    const end = new Date(reminderTime);
    const start = new Date(reminderTime.getTime() - 30 * 60 * 1000); // 30分前
    
    return { start, end };
  }

  /**
   * 近傍のリマインダーメッセージを検出
   * recentMessagesが提供されない場合は、Discord APIクライアント経由で取得
   */
  async detectNearbyReminder(userMessage: Message, recentMessages?: Message[]): Promise<NearbyReminderResult> {
    try {
      let messagesToCheck = recentMessages;
      
      // recentMessagesが提供されない場合、Discord APIクライアント経由で取得
      if (!messagesToCheck) {
        logger.debug('REMINDER_REPLY_SERVICE', 'Fetching recent messages for nearby reminder detection');
        messagesToCheck = await this.discordClient.fetchRecentMessages(userMessage, 20);
      }

      const reminderMessages = messagesToCheck.filter(msg => 
        msg.author.bot && 
        this.REMINDER_KEYWORDS.some(keyword => msg.content.includes(keyword))
      );

      for (const reminderMsg of reminderMessages) {
        const timeDiff = Math.abs(userMessage.createdAt.getTime() - reminderMsg.createdAt.getTime());
        const minutesDiff = timeDiff / (1000 * 60);

        if (minutesDiff <= this.NEARBY_THRESHOLD_MINUTES) {
          logger.debug('REMINDER_REPLY_SERVICE', 'Nearby reminder detected', {
            reminderTime: reminderMsg.createdAt,
            minutesDifference: minutesDiff
          });
          
          return {
            isPostReminderMessage: true,
            reminderTime: reminderMsg.createdAt
          };
        }
      }

      return { isPostReminderMessage: false };
    } catch (error) {
      logger.error('REMINDER_REPLY_SERVICE', 'Error detecting nearby reminder', error as Error);
      return { isPostReminderMessage: false };
    }
  }
}