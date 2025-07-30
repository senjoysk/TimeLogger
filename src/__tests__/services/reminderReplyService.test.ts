import { ReminderReplyService } from '../../services/reminderReplyService';
import { IDiscordMessageClient } from '../../interfaces/discordClient';
import { Message } from 'discord.js';

// MockDiscordMessageClient for testing
class MockDiscordMessageClient implements IDiscordMessageClient {
  private mockMessages: Map<string, Message | null> = new Map();

  setMockMessage(messageId: string, message: Message | null): void {
    this.mockMessages.set(messageId, message);
  }

  async fetchReferencedMessage(message: Message, messageId: string): Promise<Message | null> {
    return this.mockMessages.get(messageId) || null;
  }

  async fetchRecentMessages(message: Message, limit?: number): Promise<Message[]> {
    return []; // テストでは空配列を返す
  }
}

describe('ReminderReplyService', () => {
  let reminderReplyService: ReminderReplyService;
  let mockDiscordClient: MockDiscordMessageClient;
  let mockMessage: any;
  let mockReferencedMessage: any;

  beforeEach(() => {
    mockDiscordClient = new MockDiscordMessageClient();
    reminderReplyService = new ReminderReplyService(mockDiscordClient);
    
    // モックメッセージの設定
    mockReferencedMessage = {
      id: 'reminder-message-id',
      content: '🤖 **活動記録のお時間です！**\n\nこの30分、何してた？',
      author: {
        bot: true,
        id: 'bot-user-id'
      },
      createdAt: new Date('2024-01-15T11:30:00Z')
    };

    mockMessage = {
      id: 'user-reply-id',
      content: '会議とメール返信をしていました',
      author: {
        bot: false,
        id: 'user-id'
      },
      createdAt: new Date('2024-01-15T11:32:00Z'),
      reference: {
        messageId: 'reminder-message-id'
      }
    };

    // MockDiscordMessageClientにメッセージを設定
    mockDiscordClient.setMockMessage('reminder-message-id', mockReferencedMessage as Message);
  });

  describe('isReminderReply', () => {
    test('リマインダーへのreplyを正しく検出する', async () => {
      // この時点では実装がないため、テストは失敗する
      const result = await reminderReplyService.isReminderReply(mockMessage as Message);
      
      expect(result.isReminderReply).toBe(true); // ❌ 失敗する
      expect(result.timeRange).toBeDefined(); // ❌ 失敗する
    });

    test('通常のreplyはリマインダーReplyではない', async () => {
      mockReferencedMessage.content = '普通のメッセージ';
      
      const result = await reminderReplyService.isReminderReply(mockMessage as Message);
      
      expect(result.isReminderReply).toBe(false); // ❌ 失敗する
    });

    test('replyではないメッセージはリマインダーReplyではない', async () => {
      mockMessage.reference = undefined;
      
      const result = await reminderReplyService.isReminderReply(mockMessage as Message);
      
      expect(result.isReminderReply).toBe(false); // ❌ 失敗する
    });
  });

  describe('calculateTimeRange', () => {
    test('リマインダー時刻から30分前の時間範囲を計算する', () => {
      const reminderTime = new Date('2024-01-15T11:30:00Z');
      
      const timeRange = reminderReplyService.calculateTimeRange(reminderTime);
      
      expect(timeRange.start).toEqual(new Date('2024-01-15T11:00:00Z')); // ❌ 失敗する
      expect(timeRange.end).toEqual(new Date('2024-01-15T11:30:00Z')); // ❌ 失敗する
    });
  });

  describe('detectNearbyReminder', () => {
    test('10分以内のリマインダーを検出する', async () => {
      const recentMessages = [mockReferencedMessage as Message];
      const userMessage = mockMessage as Message;
      
      const result = await reminderReplyService.detectNearbyReminder(userMessage, recentMessages);
      
      expect(result.isPostReminderMessage).toBe(true); // ❌ 失敗する
      expect(result.reminderTime).toEqual(mockReferencedMessage.createdAt); // ❌ 失敗する
    });

    test('10分を超えたリマインダーは検出しない', async () => {
      const oldReminderMessage = {
        ...mockReferencedMessage,
        createdAt: new Date('2024-01-15T11:15:00Z') // 17分前
      };
      const recentMessages = [oldReminderMessage as Message];
      const userMessage = mockMessage as Message;
      
      const result = await reminderReplyService.detectNearbyReminder(userMessage, recentMessages);
      
      expect(result.isPostReminderMessage).toBe(false); // ❌ 失敗する
    });
  });
});