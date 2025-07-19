/**
 * GapHandler テスト
 * シンプルサマリーモードでの無効化確認
 */

import { GapHandler } from '../../handlers/gapHandler';
import { Message } from 'discord.js';
import { IGapDetectionService, TimeGap } from '../../services/gapDetectionService';
import { IActivityLogService } from '../../services/activityLogService';
import { BusinessDateInfo, DailyAnalysisResult } from '../../types/activityLog';

// Discord メッセージのモック
class MockMessage {
  public content: string;
  public author: { id: string; bot: boolean; tag: string };
  public guild: null = null;
  public channel: { isDMBased: () => boolean } = { isDMBased: () => true };
  private replies: { content?: string; options?: any }[] = [];

  constructor(content: string, userId: string = '770478489203507241') {
    this.content = content;
    this.author = { id: userId, bot: false, tag: 'test-user' };
  }

  async reply(contentOrOptions: string | any): Promise<MockMessage> {
    this.replies.push(
      typeof contentOrOptions === 'string' 
        ? { content: contentOrOptions }
        : contentOrOptions
    );
    return this;
  }

  getAllReplies() {
    return this.replies.map(reply => ({
      lastEditContent: reply.content || ''
    }));
  }
}

// モック ギャップ検出サービス
class MockGapDetectionService implements IGapDetectionService {
  private testGaps: TimeGap[] = [];

  setTestGaps(gaps: TimeGap[]): void {
    this.testGaps = gaps;
  }

  async detectGapsFromAnalysis(analysisResult: DailyAnalysisResult, timezone: string): Promise<TimeGap[]> {
    return this.testGaps;
  }
}

// モック 活動ログサービス
class MockActivityLogService implements Partial<IActivityLogService> {
  calculateBusinessDate(timezone: string, targetDate?: string): BusinessDateInfo {
    const date = targetDate ? new Date(targetDate) : new Date('2025-06-30T12:00:00Z');
    return {
      businessDate: '2025-06-30',
      startTime: '2025-06-30T05:00:00Z',
      endTime: '2025-07-01T04:59:59Z',
      timezone
    };
  }
}

describe('Test Setup', () => {
  test('環境設定が正しく行われている', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });
});

describe('GapHandler', () => {
  let handler: GapHandler;
  let mockGapDetectionService: MockGapDetectionService;
  let mockActivityLogService: MockActivityLogService;

  beforeEach(() => {
    mockGapDetectionService = new MockGapDetectionService();
    mockActivityLogService = new MockActivityLogService();
    handler = new GapHandler(
      mockGapDetectionService as any,
      mockActivityLogService as any
    );
  });

  describe('シンプルサマリーモードでのギャップ機能', () => {
    test('ギャップ機能が無効化されていることを確認', async () => {
      const mockMessage = new MockMessage('!gap');
      
      await handler.handle(mockMessage as unknown as Message, '770478489203507241', [], 'Asia/Tokyo');
      
      const replies = mockMessage.getAllReplies();
      expect(replies.length).toBe(1);
      expect(replies[0].lastEditContent).toBe('🚧 シンプルサマリーではギャップ機能は使用できません。');
    });

    test('引数がある場合でも無効化メッセージが表示される', async () => {
      const mockMessage = new MockMessage('!gap --force');
      
      await handler.handle(mockMessage as unknown as Message, '770478489203507241', ['--force'], 'Asia/Tokyo');
      
      const replies = mockMessage.getAllReplies();
      expect(replies.length).toBe(1);
      expect(replies[0].lastEditContent).toBe('🚧 シンプルサマリーではギャップ機能は使用できません。');
    });

    test('異なるユーザーでも同じ無効化メッセージが表示される', async () => {
      const mockMessage = new MockMessage('!gap');
      
      await handler.handle(mockMessage as unknown as Message, 'different_user', [], 'America/New_York');
      
      const replies = mockMessage.getAllReplies();
      expect(replies.length).toBe(1);
      expect(replies[0].lastEditContent).toBe('🚧 シンプルサマリーではギャップ機能は使用できません。');
    });
  });
});