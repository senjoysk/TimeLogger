/**
 * LogsCommandHandler のテスト
 * TDD開発: Red Phase - まず失敗するテストを書く
 */

import { Message } from 'discord.js';
import { LogsCommandHandler, ParsedLogsCommand } from '../../handlers/logsCommandHandler';
import { IActivityLogService } from '../../services/activityLogService';
import { ActivityLog, ActivityLogError } from '../../types/activityLog';
import { format, toZonedTime } from 'date-fns-tz';

// モックActivityLogService実装
class MockActivityLogService implements IActivityLogService {
  private logs: ActivityLog[] = [
    {
      id: 'log1',
      userId: 'user123',
      content: '朝のミーティングに参加',
      inputTimestamp: '2025-01-07T09:00:00Z',
      businessDate: '2025-01-07',
      isDeleted: false,
      createdAt: '2025-01-07T09:00:00Z',
      updatedAt: '2025-01-07T09:00:00Z',
      startTime: '2025-01-07T09:00:00Z',
      endTime: '2025-01-07T10:00:00Z',
      totalMinutes: 60,
      categories: '会議',
      analysisMethod: 'AI分析'
    },
    {
      id: 'log2',
      userId: 'user123',
      content: 'プロジェクト資料を作成',
      inputTimestamp: '2025-01-07T10:30:00Z',
      businessDate: '2025-01-07',
      isDeleted: false,
      createdAt: '2025-01-07T10:30:00Z',
      updatedAt: '2025-01-07T10:30:00Z',
      startTime: '2025-01-07T10:30:00Z',
      endTime: '2025-01-07T12:00:00Z',
      totalMinutes: 90,
      categories: '作業',
      analysisMethod: 'AI分析'
    },
    {
      id: 'log3',
      userId: 'user123',
      content: 'コードレビューを実施',
      inputTimestamp: '2025-01-07T14:00:00Z',
      businessDate: '2025-01-07',
      isDeleted: false,
      createdAt: '2025-01-07T14:00:00Z',
      updatedAt: '2025-01-07T14:00:00Z',
      startTime: '2025-01-07T14:00:00Z',
      endTime: undefined,
      totalMinutes: undefined,
      categories: '開発',
      analysisMethod: 'AI分析'
    }
  ];

  private stats = {
    totalLogs: 15,
    todayLogs: 3,
    weekLogs: 12,
    averageLogsPerDay: 2.5
  };

  async getLogsForDate(userId: string, targetDate?: string, timezone?: string): Promise<ActivityLog[]> {
    return this.logs.filter(log => log.userId === userId);
  }

  async searchLogs(userId: string, query: string, timezone: string, limit: number): Promise<ActivityLog[]> {
    return this.logs.filter(log => 
      log.userId === userId && 
      log.content.toLowerCase().includes(query.toLowerCase())
    );
  }

  formatSearchResults(logs: ActivityLog[], query: string, timezone: string): string {
    return `🔍 **検索結果**: "${query}" (${logs.length}件)\n\n${logs.map(log => 
      `• ${log.content}`
    ).join('\n')}\n\n💡 \`!edit\` でログ編集 | \`!summary\` で分析結果表示`;
  }

  async getLatestLogs(userId: string, limit?: number): Promise<ActivityLog[]> {
    return this.logs.filter(log => log.userId === userId).slice(0, limit || 10);
  }

  async getStatistics(userId: string) {
    return this.stats;
  }

  // その他必要なメソッドのスタブ
  async recordActivity() { return {} as any; }
  async getLogsForEdit() { return []; }
  formatLogsForEdit() { return ''; }
  async editLog() { return {} as any; }
  async deleteLog() { return {} as any; }
  calculateBusinessDate() { return { businessDate: '', startTime: '', endTime: '', timezone: '' }; }
}

// モックMessage実装
function createMockMessage(): Message {
  return {
    reply: jest.fn().mockResolvedValue({}),
    author: { id: 'user123' },
    content: '!logs'
  } as any;
}

describe('Test Setup', () => {
  test('環境設定が正しく行われている', () => {
    expect(jest).toBeDefined();
    expect(MockActivityLogService).toBeDefined();
    expect(LogsCommandHandler).toBeDefined();
  });
});

describe('LogsCommandHandler', () => {
  let handler: LogsCommandHandler;
  let mockService: MockActivityLogService;
  let mockMessage: Message;

  beforeEach(() => {
    mockService = new MockActivityLogService();
    handler = new LogsCommandHandler(mockService);
    mockMessage = createMockMessage();
  });

  describe('handle - コマンド処理', () => {
    test('引数なしで今日のログが表示される', async () => {
      await handler.handle(mockMessage, 'user123', [], 'Asia/Tokyo');

      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('📋 **今日のログ** (3件)')
      );
      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('朝のミーティングに参加')
      );
    });

    test('今日のログが0件の場合のメッセージが表示される', async () => {
      jest.spyOn(mockService, 'getLogsForDate').mockResolvedValue([]);

      await handler.handle(mockMessage, 'user123', [], 'Asia/Tokyo');

      expect(mockMessage.reply).toHaveBeenCalledWith(
        '📝 今日の活動ログはまだありません。\n\n活動内容を自由に投稿すると記録されます！'
      );
    });

    test('指定日のログが正しく表示される', async () => {
      await handler.handle(mockMessage, 'user123', ['2025-01-07'], 'Asia/Tokyo');

      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('📋 **1月7日(Tue)のログ** (3件)')
      );
    });

    test('検索コマンドが正しく動作する', async () => {
      await handler.handle(mockMessage, 'user123', ['search', 'ミーティング'], 'Asia/Tokyo');

      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('🔍 **検索結果**: "ミーティング"')
      );
    });

    test('最新ログコマンドが正しく動作する', async () => {
      await handler.handle(mockMessage, 'user123', ['latest', '5'], 'Asia/Tokyo');

      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('📋 **最新3件のログ** (3件)')
      );
    });

    test('統計コマンドが正しく動作する', async () => {
      await handler.handle(mockMessage, 'user123', ['stats'], 'Asia/Tokyo');

      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('📊 **活動ログ統計**')
      );
      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('総記録数**: 15件')
      );
    });

    test('ヘルプコマンドが正しく動作する', async () => {
      await handler.handle(mockMessage, 'user123', ['help'], 'Asia/Tokyo');

      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('📋 **活動ログ表示コマンド**')
      );
    });
  });

  describe('エラーハンドリング', () => {
    test('検索キーワードが空の場合エラーメッセージが表示される', async () => {
      await handler.handle(mockMessage, 'user123', ['search'], 'Asia/Tokyo');

      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('❌ 検索キーワードを指定してください')
      );
    });

    test('無効な日付形式でエラーメッセージが表示される', async () => {
      await handler.handle(mockMessage, 'user123', ['2025-13-45'], 'Asia/Tokyo');

      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('❌ 無効な日付形式です')
      );
    });

    test('未来の日付でエラーメッセージが表示される', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);
      const futureDateStr = futureDate.toISOString().split('T')[0];

      await handler.handle(mockMessage, 'user123', [futureDateStr], 'Asia/Tokyo');

      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('❌ 未来の日付は指定できません')
      );
    });

    test('無効な表示件数でエラーメッセージが表示される', async () => {
      await handler.handle(mockMessage, 'user123', ['latest', '100'], 'Asia/Tokyo');

      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('❌ 表示件数は1〜50の数値で指定してください')
      );
    });

    test('ActivityLogServiceエラーが適切にハンドリングされる', async () => {
      jest.spyOn(mockService, 'getLogsForDate').mockRejectedValue(
        new ActivityLogError('データベースエラー', 'DB_ERROR')
      );

      await handler.handle(mockMessage, 'user123', [], 'Asia/Tokyo');

      expect(mockMessage.reply).toHaveBeenCalledWith(
        '❌ 今日のログの表示に失敗しました'
      );
    });

    test('一般的なエラーが適切にハンドリングされる', async () => {
      jest.spyOn(mockService, 'getStatistics').mockRejectedValue(
        new Error('予期しないエラー')
      );

      await handler.handle(mockMessage, 'user123', ['stats'], 'Asia/Tokyo');

      expect(mockMessage.reply).toHaveBeenCalledWith(
        '❌ 統計情報の表示に失敗しました'
      );
    });
  });

  describe('parseLogsCommand - コマンド解析', () => {
    test('引数なしで今日のログコマンドが解析される', () => {
      const result = handler['parseLogsCommand']([]);
      expect(result.type).toBe('today');
    });

    test('ヘルプコマンドが正しく解析される', () => {
      const helpVariants = ['help', 'h', '?', 'ヘルプ'];
      
      helpVariants.forEach(variant => {
        const result = handler['parseLogsCommand']([variant]);
        expect(result.type).toBe('help');
      });
    });

    test('統計コマンドが正しく解析される', () => {
      const statsVariants = ['stats', 'statistics', '統計', 'stat'];
      
      statsVariants.forEach(variant => {
        const result = handler['parseLogsCommand']([variant]);
        expect(result.type).toBe('stats');
      });
    });

    test('検索コマンドが正しく解析される', () => {
      const result = handler['parseLogsCommand'](['search', '会議', 'プロジェクト']);
      
      expect(result.type).toBe('search');
      expect(result.searchQuery).toBe('会議 プロジェクト');
    });

    test('最新ログコマンドが正しく解析される', () => {
      const result = handler['parseLogsCommand'](['latest', '15']);
      
      expect(result.type).toBe('latest');
      expect(result.limit).toBe(15);
    });

    test('最新ログコマンドでデフォルト件数が設定される', () => {
      const result = handler['parseLogsCommand'](['latest']);
      
      expect(result.type).toBe('latest');
      expect(result.limit).toBe(10);
    });

    test('今日のコマンドが正しく解析される', () => {
      const todayVariants = ['today', '今日'];
      
      todayVariants.forEach(variant => {
        const result = handler['parseLogsCommand']([variant]);
        expect(result.type).toBe('today');
      });
    });

    test('昨日のコマンドが正しく解析される', () => {
      const yesterdayVariants = ['yesterday', '昨日'];
      
      yesterdayVariants.forEach(variant => {
        const result = handler['parseLogsCommand']([variant]);
        expect(result.type).toBe('date');
        expect(result.targetDate).toBeDefined();
      });
    });

    test('相対日付が正しく解析される', () => {
      const result = handler['parseLogsCommand'](['-7']);
      
      expect(result.type).toBe('date');
      expect(result.targetDate).toBeDefined();
    });

    test('YYYY-MM-DD形式の日付が正しく解析される', () => {
      const result = handler['parseLogsCommand'](['2025-01-01']);
      
      expect(result.type).toBe('date');
      expect(result.targetDate).toBe('2025-01-01');
    });
  });

  describe('formatLogsDisplay - ログフォーマット', () => {
    test('ログが正しくフォーマットされる', () => {
      const logs = [
        {
          id: 'log1',
          userId: 'user123',
          content: 'テストログ',
          startTime: '2025-01-07T09:00:00Z',
          endTime: '2025-01-07T10:00:00Z',
          inputTimestamp: '2025-01-07T09:00:00Z',
          businessDate: '2025-01-07',
          isDeleted: false,
          createdAt: '2025-01-07T09:00:00Z',
          updatedAt: '2025-01-07T09:00:00Z',
          categories: '会議',
          totalMinutes: 60,
          analysisMethod: 'AI分析'
        } as ActivityLog
      ];

      const result = handler['formatLogsDisplay'](logs, 'Asia/Tokyo', 'テスト');

      expect(result).toContain('📋 **テストのログ** (1件)');
      expect(result).toContain('**18:00-19:00** テストログ [会議] 60分 (AI分析)');
      expect(result).toContain('💡 **操作**: `!edit` でログ編集');
    });

    test('時間情報がないログが正しくフォーマットされる', () => {
      const logs = [
        {
          id: 'log1',
          userId: 'user123',
          content: 'シンプルログ',
          startTime: undefined,
          endTime: undefined,
          inputTimestamp: '2025-01-07T09:00:00Z',
          businessDate: '2025-01-07',
          isDeleted: false,
          createdAt: '2025-01-07T09:00:00Z',
          updatedAt: '2025-01-07T09:00:00Z'
        } as ActivityLog
      ];

      const result = handler['formatLogsDisplay'](logs, 'Asia/Tokyo', 'テスト');

      expect(result).toContain('**18:00** シンプルログ');
    });

    test('空のログリストが正しくフォーマットされる', () => {
      const result = handler['formatLogsDisplay']([], 'Asia/Tokyo', 'テスト');

      expect(result).toContain('📋 **テストのログ** (0件)');
      expect(result).toContain('ログがありません。');
    });
  });

  describe('formatDateLabel - 日付ラベル', () => {
    test('今日の日付が「今日」と表示される', () => {
      // タイムゾーンを考慮した今日の日付を取得
      const nowInTimezone = toZonedTime(new Date(), 'Asia/Tokyo');
      const today = format(nowInTimezone, 'yyyy-MM-dd');
      
      const result = handler['formatDateLabel'](today, 'Asia/Tokyo');
      expect(result).toBe('今日');
    });

    test('昨日の日付が「昨日」と表示される', () => {
      // タイムゾーンを考慮した昨日の日付を取得
      const nowInTimezone = toZonedTime(new Date(), 'Asia/Tokyo');
      const yesterdayInTimezone = new Date(nowInTimezone);
      yesterdayInTimezone.setDate(yesterdayInTimezone.getDate() - 1);
      const yesterdayStr = format(yesterdayInTimezone, 'yyyy-MM-dd');
      
      const result = handler['formatDateLabel'](yesterdayStr, 'Asia/Tokyo');
      expect(result).toBe('昨日');
    });

    test('その他の日付が適切にフォーマットされる', () => {
      const result = handler['formatDateLabel']('2025-01-01', 'Asia/Tokyo');
      expect(result).toMatch(/\d+月\d+日/);
    });

    test('無効な日付でも安全に処理される', () => {
      const result = handler['formatDateLabel']('invalid-date', 'Asia/Tokyo');
      expect(result).toBe('invalid-date');
    });
  });

  describe('getUsageInsight - 使用状況洞察', () => {
    test('総ログ数0での洞察メッセージ', () => {
      const stats = { totalLogs: 0, todayLogs: 0, weekLogs: 0, averageLogsPerDay: 0 };
      const result = handler['getUsageInsight'](stats);
      expect(result).toContain('記録を始めましょう');
    });

    test('今日のログ0での洞察メッセージ', () => {
      const stats = { totalLogs: 10, todayLogs: 0, weekLogs: 5, averageLogsPerDay: 2 };
      const result = handler['getUsageInsight'](stats);
      expect(result).toContain('今日はまだ記録がありません');
    });

    test('今日のログ10件以上での洞察メッセージ', () => {
      const stats = { totalLogs: 20, todayLogs: 12, weekLogs: 15, averageLogsPerDay: 3 };
      const result = handler['getUsageInsight'](stats);
      expect(result).toContain('今日は活発に記録されています');
    });

    test('平均5件以上での洞察メッセージ', () => {
      const stats = { totalLogs: 50, todayLogs: 5, weekLogs: 35, averageLogsPerDay: 7 };
      const result = handler['getUsageInsight'](stats);
      expect(result).toContain('継続的に記録されています');
    });

    test('週ログありでの洞察メッセージ', () => {
      const stats = { totalLogs: 15, todayLogs: 2, weekLogs: 8, averageLogsPerDay: 2 };
      const result = handler['getUsageInsight'](stats);
      expect(result).toContain('記録習慣が身についてきています');
    });

    test('デフォルトの洞察メッセージ', () => {
      const stats = { totalLogs: 5, todayLogs: 1, weekLogs: 0, averageLogsPerDay: 1 };
      const result = handler['getUsageInsight'](stats);
      expect(result).toContain('記録データが蓄積されています');
    });
  });

  describe('showHelp', () => {
    test('ヘルプメッセージが正しく表示される', async () => {
      await handler.showHelp(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('📋 **活動ログ表示コマンド**')
      );
      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('!logs search <キーワード>')
      );
      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('YYYY-MM-DD')
      );
    });
  });

  describe('境界値テスト', () => {
    test('相対日付の範囲外(-31)でエラーが返される', () => {
      const result = handler['parseLogsCommand'](['-31']);
      expect(result.error).toContain('相対日付は1〜30日前まで指定できます');
    });

    test('最新ログ件数0でエラーが返される', () => {
      const result = handler['parseLogsCommand'](['latest', '0']);
      expect(result.error).toContain('表示件数は1〜50の数値で指定してください');
    });

    test('最新ログ件数51でエラーが返される', () => {
      const result = handler['parseLogsCommand'](['latest', '51']);
      expect(result.error).toContain('表示件数は1〜50の数値で指定してください');
    });

    test('空の検索クエリでエラーが返される', () => {
      const result = handler['parseLogsCommand'](['search', '   ']);
      expect(result.error).toContain('検索キーワードが空です');
    });

    test('相対日付の境界値(-1, -30)が正常に処理される', () => {
      const result1 = handler['parseLogsCommand'](['-1']);
      expect(result1.type).toBe('date');
      expect(result1.error).toBeUndefined();

      const result30 = handler['parseLogsCommand'](['-30']);
      expect(result30.type).toBe('date');
      expect(result30.error).toBeUndefined();
    });

    test('最新ログ件数の境界値(1, 50)が正常に処理される', () => {
      const result1 = handler['parseLogsCommand'](['latest', '1']);
      expect(result1.type).toBe('latest');
      expect(result1.limit).toBe(1);

      const result50 = handler['parseLogsCommand'](['latest', '50']);
      expect(result50.type).toBe('latest');
      expect(result50.limit).toBe(50);
    });
  });

  describe('複雑なシナリオ', () => {
    test('日本語コマンドが正しく処理される', () => {
      const searchResult = handler['parseLogsCommand'](['検索', '会議']);
      expect(searchResult.type).toBe('search');
      expect(searchResult.searchQuery).toBe('会議');

      const latestResult = handler['parseLogsCommand'](['最新', '5']);
      expect(latestResult.type).toBe('latest');
      expect(latestResult.limit).toBe(5);
    });

    test('複数キーワード検索が正しく処理される', () => {
      const result = handler['parseLogsCommand'](['search', '会議', 'プロジェクト', 'レビュー']);
      expect(result.type).toBe('search');
      expect(result.searchQuery).toBe('会議 プロジェクト レビュー');
    });

    test('検索結果なしの場合が正しく処理される', async () => {
      jest.spyOn(mockService, 'searchLogs').mockResolvedValue([]);

      await handler.handle(mockMessage, 'user123', ['search', '存在しないキーワード'], 'Asia/Tokyo');

      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('🔍 「存在しないキーワード」に一致するログが見つかりませんでした')
      );
    });

    test('指定日のログなしの場合が正しく処理される', async () => {
      jest.spyOn(mockService, 'getLogsForDate').mockResolvedValue([]);

      await handler.handle(mockMessage, 'user123', ['2025-01-01'], 'Asia/Tokyo');

      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('📝 1月1日(Wed)の活動ログはありません')
      );
    });

    test('最新ログなしの場合が正しく処理される', async () => {
      jest.spyOn(mockService, 'getLatestLogs').mockResolvedValue([]);

      await handler.handle(mockMessage, 'user123', ['latest'], 'Asia/Tokyo');

      expect(mockMessage.reply).toHaveBeenCalledWith(
        '📝 まだ活動ログがありません。\n\n活動内容を自由に投稿すると記録されます！'
      );
    });
  });
});