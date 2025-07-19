/**
 * SummaryHandler テスト
 * サマリーコマンドとキャッシュ動作の確認
 */

import { SummaryHandler } from '../../handlers/summaryHandler';
import { Message } from 'discord.js';
import { ActivityLog } from '../../types/activityLog';
import { Todo } from '../../types/todo';

// Discordメッセージのモック
class MockMessage {
  public content: string;
  public author: { id: string; bot: boolean; tag: string };
  public guild: null = null;
  public channel: { isDMBased: () => boolean } = { isDMBased: () => true };
  public replies: string[] = [];
  public edits: string[] = [];

  constructor(content: string, userId: string = '770478489203507241') {
    this.content = content;
    this.author = { id: userId, bot: false, tag: 'test-user' };
  }

  async reply(message: string): Promise<MockMessage> {
    this.replies.push(message);
    const progressMessage = new MockMessage('Progress message');
    // プログレスメッセージのeditメソッドを、元のメッセージのedits配列に追加するよう修正
    progressMessage.edit = async (content: string) => {
      this.edits.push(content); // 元のmockMessageのedits配列に追加
    };
    return progressMessage;
  }

  async edit(message: string): Promise<void> {
    this.edits.push(message);
  }
}

// モックリポジトリ
class MockRepository {
  async getLogsByDate(userId: string, businessDate: string): Promise<ActivityLog[]> {
    return [
      {
        id: 'log1',
        userId,
        content: 'プログラミング作業を開始',
        inputTimestamp: `${businessDate}T09:00:00.000Z`,
        businessDate,
        isDeleted: false,
        createdAt: `${businessDate}T09:00:00.000Z`,
        updatedAt: `${businessDate}T09:00:00.000Z`
      },
      {
        id: 'log2',
        userId,
        content: 'デバッグ作業',
        inputTimestamp: `${businessDate}T10:30:00.000Z`,
        businessDate,
        isDeleted: false,
        createdAt: `${businessDate}T10:30:00.000Z`,
        updatedAt: `${businessDate}T10:30:00.000Z`
      }
    ];
  }

  async getTodosByUserId(userId: string): Promise<Todo[]> {
    return [
      {
        id: 'todo1',
        userId,
        content: 'テストケース作成',
        status: 'completed',
        priority: 0, // 通常
        createdAt: '2025-06-30T08:00:00.000Z',
        updatedAt: '2025-06-30T11:00:00.000Z',
        completedAt: '2025-06-30T11:00:00.000Z',
        sourceType: 'manual'
      },
      {
        id: 'todo2',
        userId,
        content: 'コードレビュー',
        status: 'completed',
        priority: 1, // 高
        createdAt: '2025-06-30T09:00:00.000Z',
        updatedAt: '2025-06-30T14:00:00.000Z',
        completedAt: '2025-06-30T14:00:00.000Z',
        sourceType: 'manual'
      }
    ];
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
}

describe('SummaryHandler', () => {
  let summaryHandler: SummaryHandler;
  let mockRepository: MockRepository;
  let mockActivityLogService: MockActivityLogService;

  beforeEach(() => {
    mockRepository = new MockRepository();
    mockActivityLogService = new MockActivityLogService();
    summaryHandler = new SummaryHandler(
      mockActivityLogService as any,
      mockRepository as any
    );
  });

  describe('基本的なサマリー機能', () => {
    test('通常のサマリーコマンドが正しく処理される', async () => {
      const mockMessage = new MockMessage('!summary');
      
      await summaryHandler.handle(mockMessage as unknown as Message, '770478489203507241', [], 'Asia/Tokyo');
      
      expect(mockMessage.replies.length).toBeGreaterThan(0);
      expect(mockMessage.edits.length).toBeGreaterThan(0);
      expect(mockMessage.edits[0]).toContain('活動サマリー');
      expect(mockMessage.edits[0]).toContain('完了したTODO');
      expect(mockMessage.edits[0]).toContain('活動ログ');
    });

    test('引数なしの場合は今日のサマリーが生成される', async () => {
      const mockMessage = new MockMessage('!summary');
      
      await summaryHandler.handle(mockMessage as unknown as Message, '770478489203507241', [], 'Asia/Tokyo');
      
      expect(mockMessage.edits.length).toBeGreaterThan(0);
      // 日付フォーマットがyyyy/MM/dd形式に変更されていることを確認
      expect(mockMessage.edits[0]).toContain('2025/06/30');
    });
  });

  describe('基本機能の継続テスト', () => {
    test('指定された日付でサマリーが生成される', async () => {
      const mockMessage = new MockMessage('!summary 2025-06-29');
      
      await summaryHandler.handle(mockMessage as unknown as Message, '770478489203507241', ['2025-06-29'], 'Asia/Tokyo');
      
      expect(mockMessage.replies.length).toBeGreaterThan(0);
      expect(mockMessage.edits.length).toBeGreaterThan(0);
      expect(mockMessage.edits[0]).toContain('活動サマリー');
      expect(mockMessage.edits[0]).toContain('2025/06/29');
    });

    test('不正な引数でもエラーハンドリングされる', async () => {
      const mockMessage = new MockMessage('!summary unknown_arg');
      
      await summaryHandler.handle(mockMessage as unknown as Message, '770478489203507241', ['unknown_arg'], 'Asia/Tokyo');
      
      expect(mockMessage.replies.length).toBeGreaterThan(0);
      // 不正な引数の場合はエラーメッセージが返される
      expect(mockMessage.replies[0]).toContain('❌');
    });
  });

  describe('日付指定機能', () => {
    test('特定の日付でサマリーが生成される', async () => {
      const mockMessage = new MockMessage('!summary 2025-06-29');
      
      await summaryHandler.handle(mockMessage as unknown as Message, '770478489203507241', ['2025-06-29'], 'Asia/Tokyo');
      
      expect(mockMessage.edits[0]).toContain('活動サマリー');
    });

    test('昨日のサマリーが正しく処理される', async () => {
      const mockMessage = new MockMessage('!summary yesterday');
      
      await summaryHandler.handle(mockMessage as unknown as Message, '770478489203507241', ['yesterday'], 'Asia/Tokyo');
      
      expect(mockMessage.replies.length).toBeGreaterThan(0);
      expect(mockMessage.edits.length).toBeGreaterThan(0);
      expect(mockMessage.edits[0]).toContain('活動サマリー');
    });

    test('相対日付指定が正しく処理される', async () => {
      const mockMessage = new MockMessage('!summary -1');
      
      await summaryHandler.handle(mockMessage as unknown as Message, '770478489203507241', ['-1'], 'Asia/Tokyo');
      
      expect(mockMessage.replies.length).toBeGreaterThan(0);
      expect(mockMessage.edits.length).toBeGreaterThan(0);
      expect(mockMessage.edits[0]).toContain('活動サマリー');
    });
  });

  describe('ヘルプ機能', () => {
    test('ヘルプコマンドが正しく表示される', async () => {
      const mockMessage = new MockMessage('!summary help');
      
      await summaryHandler.handle(mockMessage as unknown as Message, '770478489203507241', ['help'], 'Asia/Tokyo');
      
      expect(mockMessage.replies.length).toBeGreaterThan(0);
      expect(mockMessage.replies[0]).toContain('サマリーコマンド');
      expect(mockMessage.replies[0]).toContain('refresh');
      expect(mockMessage.replies[0]).toContain('キャッシュを無視して再分析');
    });
  });

  describe('エラーハンドリング', () => {
    test('無効な日付形式でエラーメッセージが表示される', async () => {
      const mockMessage = new MockMessage('!summary 2025-13-40');
      
      await summaryHandler.handle(mockMessage as unknown as Message, '770478489203507241', ['2025-13-40'], 'Asia/Tokyo');
      
      expect(mockMessage.replies.length).toBeGreaterThan(0);
      expect(mockMessage.replies[0]).toContain('❌');
    });

    test('未来の日付でエラーメッセージが表示される', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);
      const futureDateStr = futureDate.toISOString().split('T')[0];
      
      const mockMessage = new MockMessage(`!summary ${futureDateStr}`);
      
      await summaryHandler.handle(mockMessage as unknown as Message, '770478489203507241', [futureDateStr], 'Asia/Tokyo');
      
      expect(mockMessage.replies.length).toBeGreaterThan(0);
      expect(mockMessage.replies[0]).toContain('❌');
    });

  });
});