/**
 * ギャップハンドラーテスト
 */

import { GapHandler } from '../../handlers/gapHandler';
import { Message } from 'discord.js';
import { TimeGap } from '../../services/gapDetectionService';
import { ActivityLog } from '../../types/activityLog';

// Discordメッセージのモック
class MockMessage {
  public content: string;
  public author: { id: string; bot: boolean; tag: string };
  public guild: null = null;
  public channel: { isDMBased: () => boolean } = { isDMBased: () => true };
  public components: any[] = [];
  public lastEditContent: string = '';
  public lastEditOptions: any = null;
  
  // 返されたReplyMessageを管理
  private replyMessages: MockMessage[] = [];

  constructor(content: string, userId: string = '770478489203507241') {
    this.content = content;
    this.author = { id: userId, bot: false, tag: 'test-user' };
  }

  async reply(options: any): Promise<MockMessage> {
    const replyMessage = new MockMessage('Reply');
    replyMessage.lastEditContent = typeof options === 'string' ? options : (options.content || '');
    replyMessage.lastEditOptions = typeof options === 'object' ? options : { content: options };
    replyMessage.components = options.components || [];
    
    this.replyMessages.push(replyMessage);
    return replyMessage;
  }

  async edit(options: any): Promise<void> {
    this.components = options.components || [];
    this.lastEditContent = typeof options === 'string' ? options : (options.content || '');
    this.lastEditOptions = typeof options === 'object' ? options : { content: options };
  }

  createMessageComponentCollector(options: any): any {
    return {
      on: jest.fn(),
      stop: jest.fn()
    };
  }
  
  // テスト用ヘルパーメソッド
  getLastReply(): MockMessage | undefined {
    return this.replyMessages[this.replyMessages.length - 1];
  }
  
  getAllReplies(): MockMessage[] {
    return this.replyMessages;
  }
}

// モックギャップ検出サービス
class MockGapDetectionService {
  private gaps: TimeGap[] = [];

  async detectGaps(userId: string, businessDate: string, timezone: string): Promise<TimeGap[]> {
    return this.gaps;
  }

  async detectGapsFromAnalysis(analysisResult: any, timezone: string): Promise<TimeGap[]> {
    console.log(`📊 分析結果からギャップ検出: ${analysisResult.timeline.length}個のタイムライン`);
    return this.gaps;
  }

  setTestGaps(gaps: TimeGap[]) {
    this.gaps = gaps;
  }
}

// モック活動ログサービス
class MockActivityLogService {
  calculateBusinessDate(timezone: string, inputTime?: string) {
    return {
      businessDate: '2025-06-30',
      timezone,
      inputTime: inputTime || new Date().toISOString()
    };
  }

  async recordActivity(userId: string, content: string, timezone: string, inputTime?: string): Promise<ActivityLog> {
    return {
      id: 'test-log-id',
      userId,
      content,
      inputTimestamp: inputTime || new Date().toISOString(),
      businessDate: '2025-06-30',
      isDeleted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }
}

// モック統合分析サービス
class MockUnifiedAnalysisService {
  async analyzeDaily(params: any) {
    return {
      businessDate: params.businessDate,
      timeline: [
        {
          startTime: new Date('2025-06-30T09:00:00Z').toISOString(),
          endTime: new Date('2025-06-30T09:30:00Z').toISOString(),
          category: 'プログラミング',
          summary: 'テスト作業'
        },
        {
          startTime: new Date('2025-06-30T10:00:00Z').toISOString(),
          endTime: new Date('2025-06-30T10:30:00Z').toISOString(),
          category: '会議',
          summary: '1on1会議'
        }
      ]
    };
  }
}

describe('GapHandler', () => {
  let handler: GapHandler;
  let mockGapDetectionService: MockGapDetectionService;
  let mockActivityLogService: MockActivityLogService;
  let mockUnifiedAnalysisService: MockUnifiedAnalysisService;

  beforeEach(() => {
    mockGapDetectionService = new MockGapDetectionService();
    mockActivityLogService = new MockActivityLogService();
    mockUnifiedAnalysisService = new MockUnifiedAnalysisService();
    handler = new GapHandler(
      mockGapDetectionService as any,
      mockActivityLogService as any,
      mockUnifiedAnalysisService as any
    );
  });

  describe('ギャップ検出結果の表示', () => {
    test('ギャップがない場合、成功メッセージを表示', async () => {
      const mockMessage = new MockMessage('!gap');
      mockGapDetectionService.setTestGaps([]);

      await handler.handle(mockMessage as unknown as Message, '770478489203507241', [], 'Asia/Tokyo');

      const replies = mockMessage.getAllReplies();
      expect(replies.length).toBe(1);
      expect(replies[0].lastEditContent).toBe('✅ 7:30〜18:30の間に15分以上の記録の空白はありませんでした。');
    });

    test('ギャップがある場合、Embedとボタンを表示', async () => {
      const mockMessage = new MockMessage('!gap');
      const testGaps: TimeGap[] = [
        {
          startTime: new Date('2025-06-30T00:00:00Z').toISOString(),
          endTime: new Date('2025-06-30T01:00:00Z').toISOString(),
          startTimeLocal: '09:00',
          endTimeLocal: '10:00',
          durationMinutes: 60
        },
        {
          startTime: new Date('2025-06-30T02:30:00Z').toISOString(),
          endTime: new Date('2025-06-30T03:45:00Z').toISOString(),
          startTimeLocal: '11:30',
          endTimeLocal: '12:45',
          durationMinutes: 75
        }
      ];
      mockGapDetectionService.setTestGaps(testGaps);

      await handler.handle(mockMessage as unknown as Message, '770478489203507241', [], 'Asia/Tokyo');

      const replies = mockMessage.getAllReplies();
      expect(replies.length).toBe(1);
      const reply = replies[0];
      
      // Embedの確認
      expect(reply.lastEditOptions.embeds).toBeDefined();
      expect(reply.lastEditOptions.embeds.length).toBe(1);
      
      // ボタンの確認
      expect(reply.lastEditOptions.components).toBeDefined();
      expect(reply.lastEditOptions.components.length).toBeGreaterThan(0);
      expect(reply.lastEditOptions.components[0].components.length).toBe(2); // 2つのギャップ = 2つのボタン
    });

    test('複数のギャップが正しくフォーマットされる', async () => {
      const mockMessage = new MockMessage('!gap');
      const testGaps: TimeGap[] = [
        {
          startTime: new Date('2025-06-30T00:00:00Z').toISOString(),
          endTime: new Date('2025-06-30T00:30:00Z').toISOString(),
          startTimeLocal: '09:00',
          endTimeLocal: '09:30',
          durationMinutes: 30
        }
      ];
      mockGapDetectionService.setTestGaps(testGaps);

      await handler.handle(mockMessage as unknown as Message, '770478489203507241', [], 'Asia/Tokyo');

      const replies = mockMessage.getAllReplies();
      expect(replies.length).toBe(1);
      const reply = replies[0];
      const embed = reply.lastEditOptions.embeds[0];
      
      // Embedのフィールドを確認
      expect(embed.data.fields[0].name).toBe('1. 09:00 〜 09:30');
      expect(embed.data.fields[0].value).toContain('30分');
    });
  });

  describe('エラーハンドリング', () => {
    test('ギャップ検出エラー時にエラーメッセージを表示', async () => {
      const mockMessage = new MockMessage('!gap');
      
      // エラーをスロー
      jest.spyOn(mockGapDetectionService, 'detectGapsFromAnalysis').mockRejectedValue(new Error('Test error'));

      await handler.handle(mockMessage as unknown as Message, '770478489203507241', [], 'Asia/Tokyo');

      const replies = mockMessage.getAllReplies();
      expect(replies.length).toBe(2); // 進行メッセージ + エラーメッセージ
      expect(replies[0].lastEditContent).toBe('🔍 ギャップを検出中です...'); // 進行メッセージ
      expect(replies[1].lastEditContent).toBe('❌ ギャップの検出中にエラーが発生しました\n\nエラー詳細: Test error'); // エラーメッセージ
    });
  });

  describe('ボタンのレイアウト', () => {
    test('6個以上のギャップがある場合、複数行に分割される', async () => {
      const mockMessage = new MockMessage('!gap');
      const testGaps: TimeGap[] = [];
      
      // 6個のギャップを作成
      for (let i = 0; i < 6; i++) {
        testGaps.push({
          startTime: new Date(`2025-06-30T0${i}:00:00Z`).toISOString(),
          endTime: new Date(`2025-06-30T0${i}:30:00Z`).toISOString(),
          startTimeLocal: `0${i + 8}:00`,
          endTimeLocal: `0${i + 8}:30`,
          durationMinutes: 30
        });
      }
      mockGapDetectionService.setTestGaps(testGaps);

      await handler.handle(mockMessage as unknown as Message, '770478489203507241', [], 'Asia/Tokyo');

      const replies = mockMessage.getAllReplies();
      expect(replies.length).toBe(1);
      const reply = replies[0];
      
      // 2行に分割されることを確認（1行最大5個）
      expect(reply.lastEditOptions.components.length).toBe(2);
      expect(reply.lastEditOptions.components[0].components.length).toBe(5); // 1行目: 5個
      expect(reply.lastEditOptions.components[1].components.length).toBe(1); // 2行目: 1個
    });
  });
});