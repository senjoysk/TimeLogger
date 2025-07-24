import { ReminderReplyService } from '../../services/reminderReplyService';
import { Message } from 'discord.js';

// 🔴 Red Phase: リマインダーReply機能のテスト - 実装前なので失敗する
describe('🟢 Green Phase: ReminderReplyService', () => {
  let reminderReplyService: ReminderReplyService;
  let mockMessage: any;
  let mockReferencedMessage: any;

  beforeEach(() => {
    reminderReplyService = new ReminderReplyService();
    
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
      },
      channel: {
        messages: {
          fetch: jest.fn().mockResolvedValue(mockReferencedMessage)
        }
      }
    };
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