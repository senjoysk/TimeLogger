/**
 * 新タイムゾーンハンドラーのテスト
 */

import { NewTimezoneHandler } from '../../handlers/newTimezoneHandler';
import { Message } from 'discord.js';

// ActivityLogRepositoryのモック
const mockRepository = {
  // 必要に応じて他のメソッドをモック
} as any;

// Discordメッセージのモック
class MockMessage {
  public content: string;
  public author: { id: string; bot: boolean; tag: string };
  public guild: null = null;
  public channel: { isDMBased: () => boolean } = { isDMBased: () => true };
  public replies: string[] = [];

  constructor(content: string, userId: string = '770478489203507241') {
    this.content = content;
    this.author = { id: userId, bot: false, tag: 'test-user' };
  }

  async reply(message: string): Promise<void> {
    this.replies.push(message);
  }

  async react(emoji: string): Promise<void> {
    // リアクション処理（モック）
  }
}

describe('NewTimezoneHandler', () => {
  let handler: NewTimezoneHandler;

  beforeEach(() => {
    handler = new NewTimezoneHandler(mockRepository);
    // 環境変数をクリア
    delete process.env.USER_TIMEZONE;
  });

  afterEach(() => {
    // 環境変数をクリア
    delete process.env.USER_TIMEZONE;
  });

  describe('基本的なタイムゾーン表示', () => {
    test('引数なしで現在のタイムゾーンが表示される', async () => {
      const mockMessage = new MockMessage('!timezone');
      
      await handler.handle(mockMessage as unknown as Message, '770478489203507241', []);
      
      expect(mockMessage.replies.length).toBe(1);
      expect(mockMessage.replies[0]).toContain('タイムゾーン設定');
      expect(mockMessage.replies[0]).toContain('Asia/Tokyo'); // デフォルト
      expect(mockMessage.replies[0]).toContain('現在時刻');
    });

    test('環境変数USER_TIMEZONEが設定されている場合', async () => {
      process.env.USER_TIMEZONE = 'Asia/Kolkata';
      const mockMessage = new MockMessage('!timezone');
      
      await handler.handle(mockMessage as unknown as Message, '770478489203507241', []);
      
      expect(mockMessage.replies.length).toBe(1);
      expect(mockMessage.replies[0]).toContain('Asia/Kolkata');
    });
  });

  describe('タイムゾーン検索機能', () => {
    test('Kolkataの検索が正しく動作する', async () => {
      const mockMessage = new MockMessage('!timezone search Kolkata');
      
      await handler.handle(mockMessage as unknown as Message, '770478489203507241', ['search', 'Kolkata']);
      
      expect(mockMessage.replies.length).toBe(1);
      expect(mockMessage.replies[0]).toContain('検索結果');
      expect(mockMessage.replies[0]).toContain('Asia/Kolkata');
      expect(mockMessage.replies[0]).toContain('インド');
      expect(mockMessage.replies[0]).toContain('+5:30');
    });

    test('大文字小文字を無視して検索する', async () => {
      const mockMessage = new MockMessage('!timezone search kolkata');
      
      await handler.handle(mockMessage as unknown as Message, '770478489203507241', ['search', 'kolkata']);
      
      expect(mockMessage.replies.length).toBe(1);
      expect(mockMessage.replies[0]).toContain('Asia/Kolkata');
    });

    test('複数の都市名での検索', async () => {
      const testCases = [
        { query: 'Tokyo', expected: 'Asia/Tokyo' },
        { query: 'New York', expected: 'America/New_York' },
        { query: 'London', expected: 'Europe/London' },
        { query: 'Mumbai', expected: 'Asia/Kolkata' },
        { query: 'India', expected: 'Asia/Kolkata' }
      ];

      for (const testCase of testCases) {
        const mockMessage = new MockMessage(`!timezone search ${testCase.query}`);
        
        await handler.handle(mockMessage as unknown as Message, '770478489203507241', ['search', testCase.query]);
        
        expect(mockMessage.replies.length).toBe(1);
        expect(mockMessage.replies[0]).toContain(testCase.expected);
        
        // 次のテストのためにリプライをクリア
        mockMessage.replies = [];
      }
    });

    test('存在しない都市の検索', async () => {
      const mockMessage = new MockMessage('!timezone search NonExistentCity');
      
      await handler.handle(mockMessage as unknown as Message, '770478489203507241', ['search', 'NonExistentCity']);
      
      expect(mockMessage.replies.length).toBe(1);
      expect(mockMessage.replies[0]).toContain('見つかりませんでした');
      expect(mockMessage.replies[0]).toContain('検索のヒント');
    });

    test('検索キーワードなしでエラーメッセージ', async () => {
      const mockMessage = new MockMessage('!timezone search');
      
      await handler.handle(mockMessage as unknown as Message, '770478489203507241', ['search']);
      
      expect(mockMessage.replies.length).toBe(1);
      expect(mockMessage.replies[0]).toContain('検索する都市名を指定してください');
    });
  });

  describe('タイムゾーン設定機能', () => {
    test('有効なタイムゾーンの設定', async () => {
      const mockMessage = new MockMessage('!timezone set Asia/Kolkata');
      
      await handler.handle(mockMessage as unknown as Message, '770478489203507241', ['set', 'Asia/Kolkata']);
      
      expect(mockMessage.replies.length).toBe(1);
      expect(mockMessage.replies[0]).toContain('タイムゾーン設定');
      expect(mockMessage.replies[0]).toContain('Asia/Kolkata');
      expect(mockMessage.replies[0]).toContain('USER_TIMEZONE');
    });

    test('無効なタイムゾーンの設定', async () => {
      const mockMessage = new MockMessage('!timezone set InvalidTimezone');
      
      await handler.handle(mockMessage as unknown as Message, '770478489203507241', ['set', 'InvalidTimezone']);
      
      expect(mockMessage.replies.length).toBe(1);
      expect(mockMessage.replies[0]).toContain('無効なタイムゾーン');
      expect(mockMessage.replies[0]).toContain('InvalidTimezone');
    });

    test('タイムゾーン名なしでエラーメッセージ', async () => {
      const mockMessage = new MockMessage('!timezone set');
      
      await handler.handle(mockMessage as unknown as Message, '770478489203507241', ['set']);
      
      expect(mockMessage.replies.length).toBe(1);
      expect(mockMessage.replies[0]).toContain('タイムゾーンを指定してください');
    });
  });

  describe('ヘルプ機能', () => {
    test('ヘルプコマンドが正しく動作する', async () => {
      const mockMessage = new MockMessage('!timezone help');
      
      await handler.handle(mockMessage as unknown as Message, '770478489203507241', ['help']);
      
      expect(mockMessage.replies.length).toBe(1);
      expect(mockMessage.replies[0]).toContain('タイムゾーンコマンド');
      expect(mockMessage.replies[0]).toContain('search');
      expect(mockMessage.replies[0]).toContain('set');
      expect(mockMessage.replies[0]).toContain('Asia/Tokyo');
      expect(mockMessage.replies[0]).toContain('Asia/Kolkata');
    });

    test('複数のヘルプキーワードが動作する', async () => {
      const helpKeywords = ['help', 'h', '?', 'ヘルプ'];
      
      for (const keyword of helpKeywords) {
        const mockMessage = new MockMessage(`!timezone ${keyword}`);
        
        await handler.handle(mockMessage as unknown as Message, '770478489203507241', [keyword]);
        
        expect(mockMessage.replies.length).toBe(1);
        expect(mockMessage.replies[0]).toContain('タイムゾーンコマンド');
      }
    });
  });

  describe('エラーハンドリング', () => {
    test('不明なサブコマンドは現在のタイムゾーン表示になる', async () => {
      const mockMessage = new MockMessage('!timezone unknown');
      
      await handler.handle(mockMessage as unknown as Message, '770478489203507241', ['unknown']);
      
      expect(mockMessage.replies.length).toBe(1);
      expect(mockMessage.replies[0]).toContain('タイムゾーン設定');
      expect(mockMessage.replies[0]).toContain('Asia/Tokyo'); // デフォルト
    });
  });

  describe('内部メソッドのテスト', () => {
    test('isValidTimezone メソッドが正しく動作する', () => {
      // プライベートメソッドをテストするため、型アサーションを使用
      const handlerAny = handler as any;
      
      // 有効なタイムゾーン
      expect(handlerAny.isValidTimezone('Asia/Tokyo')).toBe(true);
      expect(handlerAny.isValidTimezone('Asia/Kolkata')).toBe(true);
      expect(handlerAny.isValidTimezone('America/New_York')).toBe(true);
      expect(handlerAny.isValidTimezone('Europe/London')).toBe(true);
      
      // 無効なタイムゾーン
      expect(handlerAny.isValidTimezone('Invalid/Timezone')).toBe(false);
      expect(handlerAny.isValidTimezone('NotATimezone')).toBe(false);
      expect(handlerAny.isValidTimezone('')).toBe(false);
    });

    test('searchTimezones メソッドが正しく動作する', () => {
      const handlerAny = handler as any;
      
      // Kolkataの検索
      const kolkataResults = handlerAny.searchTimezones('Kolkata');
      expect(kolkataResults.length).toBeGreaterThan(0);
      expect(kolkataResults[0].timezone).toBe('Asia/Kolkata');
      expect(kolkataResults[0].description).toContain('インド');
      
      // 大文字小文字を無視
      const tokyoResults = handlerAny.searchTimezones('tokyo');
      expect(tokyoResults.length).toBeGreaterThan(0);
      expect(tokyoResults[0].timezone).toBe('Asia/Tokyo');
      
      // 存在しない都市
      const nonExistentResults = handlerAny.searchTimezones('NonExistentCity');
      expect(nonExistentResults.length).toBe(0);
    });
  });
});