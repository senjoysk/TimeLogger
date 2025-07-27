import { Message } from 'discord.js';

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
  detectNearbyReminder(userMessage: Message, recentMessages: Message[]): Promise<NearbyReminderResult>;
}

export class ReminderReplyService implements IReminderReplyService {
  private readonly REMINDER_KEYWORDS = ['この30分、何してた'];
  private readonly NEARBY_THRESHOLD_MINUTES = 10;

  async isReminderReply(message: Message): Promise<ReminderReplyResult> {
    if (!message.reference?.messageId) {
      return { isReminderReply: false };
    }

    try {
      const referencedMessage = await message.channel.messages.fetch(message.reference.messageId);
      
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
      
      return {
        isReminderReply: true,
        timeRange,
        reminderTime: referencedMessage.createdAt,
        reminderContent: referencedMessage.content
      };
    } catch (error) {
      return { isReminderReply: false };
    }
  }

  calculateTimeRange(reminderTime: Date): TimeRange {
    const end = new Date(reminderTime);
    const start = new Date(reminderTime.getTime() - 30 * 60 * 1000); // 30分前
    
    return { start, end };
  }

  async detectNearbyReminder(userMessage: Message, recentMessages: Message[]): Promise<NearbyReminderResult> {
    const reminderMessages = recentMessages.filter(msg => 
      msg.author.bot && 
      this.REMINDER_KEYWORDS.some(keyword => msg.content.includes(keyword))
    );

    for (const reminderMsg of reminderMessages) {
      const timeDiff = Math.abs(userMessage.createdAt.getTime() - reminderMsg.createdAt.getTime());
      const minutesDiff = timeDiff / (1000 * 60);

      if (minutesDiff <= this.NEARBY_THRESHOLD_MINUTES) {
        return {
          isPostReminderMessage: true,
          reminderTime: reminderMsg.createdAt
        };
      }
    }

    return { isPostReminderMessage: false };
  }
}