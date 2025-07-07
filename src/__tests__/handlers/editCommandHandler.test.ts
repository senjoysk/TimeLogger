/**
 * EditCommandHandler のテスト
 * TDD開発: Red Phase - まず失敗するテストを書く
 */

import { Message } from 'discord.js';
import { EditCommandHandler, ParsedEditCommand } from '../../handlers/editCommandHandler';
import { IActivityLogService } from '../../services/activityLogService';
import { ActivityLogError } from '../../types/activityLog';

// モックActivityLogService実装
class MockActivityLogService implements IActivityLogService {
  private logs = [
    {
      id: 'log1',
      userId: 'user123',
      content: '朝のミーティングに参加',
      inputTimestamp: '2025-01-07T09:00:00Z',
      businessDate: '2025-01-07',
      isDeleted: false,
      createdAt: '2025-01-07T09:00:00Z',
      updatedAt: '2025-01-07T09:00:00Z'
    },
    {
      id: 'log2', 
      userId: 'user123',
      content: 'プロジェクト資料を作成',
      inputTimestamp: '2025-01-07T10:30:00Z',
      businessDate: '2025-01-07',
      isDeleted: false,
      createdAt: '2025-01-07T10:30:00Z',
      updatedAt: '2025-01-07T10:30:00Z'
    },
    {
      id: 'log3',
      userId: 'user123', 
      content: 'コードレビューを実施',
      inputTimestamp: '2025-01-07T14:00:00Z',
      businessDate: '2025-01-07',
      isDeleted: false,
      createdAt: '2025-01-07T14:00:00Z',
      updatedAt: '2025-01-07T14:00:00Z'
    }
  ];

  async getLogsForEdit(userId: string, timezone: string) {
    return this.logs.filter(log => log.userId === userId);
  }

  formatLogsForEdit(logs: any[], timezone: string): string {
    return `📝 **今日の活動ログ一覧**\n\n${logs.map((log, index) => 
      `**${index + 1}.** ${log.content}`
    ).join('\n\n')}\n\n編集: \`!edit <番号> <新しい内容>\`\n削除: \`!edit delete <番号>\``;
  }

  async editLog(request: any) {
    const log = this.logs.find(l => l.id === request.logId);
    if (!log) throw new ActivityLogError('ログが見つかりません', 'LOG_NOT_FOUND');
    
    log.content = request.newContent;
    return log;
  }

  async deleteLog(request: any) {
    const index = this.logs.findIndex(l => l.id === request.logId);
    if (index === -1) throw new ActivityLogError('ログが見つかりません', 'LOG_NOT_FOUND');
    
    const deleted = this.logs[index];
    this.logs.splice(index, 1);
    return deleted;
  }

  async getLatestLogs(userId: string, limit?: number) {
    return this.logs.filter(log => log.userId === userId).slice(0, limit || 10);
  }

  // その他必要なメソッドのスタブ
  async recordActivity() { return {} as any; }
  async getStatistics() { return {} as any; }
  async getLogsForDate() { return []; }
  async analyzeActivities() { return {} as any; }
  async getMatchingLogs() { return []; }
  async matchLogs() {}
  async searchLogs() { return []; }
  async getUnmatchedLogs() { return []; }
  async manualMatchLogs() { return { startLog: {} as any, endLog: {} as any }; }
  formatSearchResults() { return ''; }
  calculateBusinessDate() { return { businessDate: '', startTime: '', endTime: '', timezone: '' }; }
}

// モックMessage実装
function createMockMessage(): Message {
  return {
    reply: jest.fn().mockResolvedValue({}),
    author: { id: 'user123' },
    content: '!edit'
  } as any;
}

describe('Test Setup', () => {
  test('環境設定が正しく行われている', () => {
    expect(jest).toBeDefined();
    expect(MockActivityLogService).toBeDefined();
    expect(EditCommandHandler).toBeDefined();
  });
});

describe('EditCommandHandler', () => {
  let handler: EditCommandHandler;
  let mockService: MockActivityLogService;
  let mockMessage: Message;

  beforeEach(() => {
    mockService = new MockActivityLogService();
    handler = new EditCommandHandler(mockService);
    mockMessage = createMockMessage();
  });

  describe('handle - コマンド処理', () => {
    test('引数なしでログ一覧が表示される', async () => {
      await handler.handle(mockMessage, 'user123', [], 'Asia/Tokyo');

      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('📝 **今日の活動ログ一覧**')
      );
      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('1. 朝のミーティングに参加')
      );
    });

    test('ログが0件の場合のメッセージが表示される', async () => {
      jest.spyOn(mockService, 'getLogsForEdit').mockResolvedValue([]);

      await handler.handle(mockMessage, 'user123', [], 'Asia/Tokyo');

      expect(mockMessage.reply).toHaveBeenCalledWith(
        '📝 今日の活動ログはまだありません。\n\n活動内容を自由に投稿すると記録されます！'
      );
    });

    test('ヘルプコマンドが正しく動作する', async () => {
      await handler.handle(mockMessage, 'user123', ['help'], 'Asia/Tokyo');

      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('📝 **活動ログ編集コマンド**')
      );
    });

    test('ログ編集が正しく動作する', async () => {
      await handler.handle(mockMessage, 'user123', ['2', '会議資料を更新'], 'Asia/Tokyo');

      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('✅ **ログを編集しました！**')
      );
      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('プロジェクト資料を作成')
      );
      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('会議資料を更新')
      );
    });

    test('ログ削除が正しく動作する', async () => {
      await handler.handle(mockMessage, 'user123', ['delete', '1'], 'Asia/Tokyo');

      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('🗑️ **ログを削除しました！**')
      );
      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('朝のミーティングに参加')
      );
    });
  });

  describe('エラーハンドリング', () => {
    test('無効なログ番号でエラーメッセージが表示される', async () => {
      await handler.handle(mockMessage, 'user123', ['5', '新しい内容'], 'Asia/Tokyo');

      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('❌ ログ番号が無効です。1〜3の範囲で指定してください。')
      );
    });

    test('編集内容が空の場合エラーメッセージが表示される', async () => {
      await handler.handle(mockMessage, 'user123', ['1'], 'Asia/Tokyo');

      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('❌ 新しい内容を入力してください')
      );
    });

    test('削除番号が指定されていない場合エラーメッセージが表示される', async () => {
      await handler.handle(mockMessage, 'user123', ['delete'], 'Asia/Tokyo');

      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('❌ 削除するログ番号を指定してください')
      );
    });

    test('数値以外のログ番号でエラーメッセージが表示される', async () => {
      await handler.handle(mockMessage, 'user123', ['abc', '新しい内容'], 'Asia/Tokyo');

      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('❌ 有効なログ番号を指定してください')
      );
    });

    test('ActivityLogServiceエラーが適切にハンドリングされる', async () => {
      jest.spyOn(mockService, 'editLog').mockRejectedValue(
        new ActivityLogError('データベースエラー', 'DB_ERROR')
      );

      await handler.handle(mockMessage, 'user123', ['1', '新しい内容'], 'Asia/Tokyo');

      expect(mockMessage.reply).toHaveBeenCalledWith(
        '❌ データベースエラー'
      );
    });

    test('一般的なエラーが適切にハンドリングされる', async () => {
      jest.spyOn(mockService, 'getLogsForEdit').mockRejectedValue(
        new Error('予期しないエラー')
      );

      await handler.handle(mockMessage, 'user123', [], 'Asia/Tokyo');

      expect(mockMessage.reply).toHaveBeenCalledWith(
        '❌ 編集コマンドの処理中にエラーが発生しました。'
      );
    });
  });

  describe('parseEditCommand - コマンド解析', () => {
    test('引数なしで一覧表示コマンドが解析される', () => {
      const result = handler['parseEditCommand']([]);
      expect(result.type).toBe('list');
    });

    test('ヘルプコマンドが正しく解析される', () => {
      const helpVariants = ['help', 'h', '?', 'ヘルプ'];
      
      helpVariants.forEach(variant => {
        const result = handler['parseEditCommand']([variant]);
        expect(result.type).toBe('help');
      });
    });

    test('削除コマンドが正しく解析される', () => {
      const deleteVariants = ['delete', 'del', 'd', '削除'];
      
      deleteVariants.forEach(variant => {
        const result = handler['parseEditCommand']([variant, '2']);
        expect(result.type).toBe('delete');
        expect(result.logIndex).toBe(2);
      });
    });

    test('編集コマンドが正しく解析される', () => {
      const result = handler['parseEditCommand'](['3', '新しい', 'コンテンツ']);
      
      expect(result.type).toBe('edit');
      expect(result.logIndex).toBe(3);
      expect(result.newContent).toBe('新しい コンテンツ');
    });

    test('長すぎる内容でエラーが返される', () => {
      const longContent = 'a'.repeat(2001);
      const result = handler['parseEditCommand'](['1', longContent]);
      
      expect(result.type).toBe('edit');
      expect(result.error).toContain('内容が長すぎます');
    });

    test('空の内容でエラーが返される', () => {
      const result = handler['parseEditCommand'](['1', '   ']);
      
      expect(result.type).toBe('edit');
      expect(result.error).toContain('新しい内容が空です');
    });
  });

  describe('showHelp', () => {
    test('ヘルプメッセージが正しく表示される', async () => {
      await handler.showHelp(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('📝 **活動ログ編集コマンド**')
      );
      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('!edit <番号> <新しい内容>')
      );
      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('!edit delete <番号>')
      );
    });
  });

  describe('境界値テスト', () => {
    test('ログインデックス0でエラーが返される', () => {
      const result = handler['parseEditCommand'](['0', '内容']);
      expect(result.error).toContain('有効なログ番号を指定してください');
    });

    test('負のログインデックスでエラーが返される', () => {
      const result = handler['parseEditCommand'](['-1', '内容']);
      expect(result.error).toContain('有効なログ番号を指定してください');
    });

    test('ちょうど2000文字の内容は正常に処理される', () => {
      const content = 'a'.repeat(2000);
      const result = handler['parseEditCommand'](['1', content]);
      
      expect(result.type).toBe('edit');
      expect(result.error).toBeUndefined();
      expect(result.newContent).toBe(content);
    });

    test('最大ログ数を超えたインデックスでエラーハンドリング', async () => {
      await handler.handle(mockMessage, 'user123', ['999', '新しい内容'], 'Asia/Tokyo');

      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('❌ ログ番号が無効です')
      );
    });
  });

  describe('複雑なシナリオ', () => {
    test('日本語コマンドが正しく処理される', () => {
      const result = handler['parseEditCommand'](['削除', '2']);
      expect(result.type).toBe('delete');
      expect(result.logIndex).toBe(2);
    });

    test('複数の単語を含む編集内容が正しく結合される', () => {
      const result = handler['parseEditCommand'](['1', '今日は', '会議で', 'プレゼンを', '行いました']);
      
      expect(result.type).toBe('edit');
      expect(result.newContent).toBe('今日は 会議で プレゼンを 行いました');
    });

    test('空白だけのコマンド引数が適切に処理される', () => {
      const result = handler['parseEditCommand'](['1', '', '  ', 'content']);
      
      expect(result.type).toBe('edit');
      expect(result.newContent).toBe('  content');
    });
  });

  describe('権限チェック機能', () => {
    test('checkEditPermission - 有効なログIDで権限がある', async () => {
      const hasPermission = await handler['checkEditPermission']('user123', 'log1');
      expect(hasPermission).toBe(true);
    });

    test('checkEditPermission - 存在しないログIDで権限がない', async () => {
      const hasPermission = await handler['checkEditPermission']('user123', 'nonexistent');
      expect(hasPermission).toBe(false);
    });

    test('checkEditPermission - 他のユーザーのログで権限がない', async () => {
      const hasPermission = await handler['checkEditPermission']('other_user', 'log1');
      expect(hasPermission).toBe(false);
    });

    test('getCurrentLogCount - 正しいログ数が返される', async () => {
      const count = await handler['getCurrentLogCount']('user123', 'Asia/Tokyo');
      expect(count).toBe(3);
    });

    test('getCurrentLogCount - エラー時に0が返される', async () => {
      jest.spyOn(mockService, 'getLogsForEdit').mockRejectedValue(new Error('DB Error'));
      
      const count = await handler['getCurrentLogCount']('user123', 'Asia/Tokyo');
      expect(count).toBe(0);
    });
  });
});