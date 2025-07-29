/**
 * 🔴 Red Phase: ActivityLogFormattingServiceのテスト
 * フォーマット処理専門サービスのテスト実装
 */

import { ActivityLogFormattingService } from '../../services/activityLogFormattingService';
import { ActivityLog } from '../../types/activityLog';

describe('🔴 Red Phase: ActivityLogFormattingServiceのテスト', () => {
  let service: ActivityLogFormattingService;

  beforeEach(() => {
    service = new ActivityLogFormattingService();
  });

  describe('formatLogsForEdit', () => {
    test('ログを編集用にフォーマットする', () => {
      const logs: ActivityLog[] = [
        {
          id: 'log1',
          userId: 'user123',
          content: 'プロジェクト会議を実施しました',
          inputTimestamp: '2024-07-29T10:30:00.000Z',
          businessDate: '2024-07-29',
          isDeleted: false,
          createdAt: '2024-07-29T10:30:00.000Z',
          updatedAt: '2024-07-29T10:30:00.000Z',
        },
        {
          id: 'log2',
          userId: 'user123',
          content: 'コード レビューを実行し、バグ修正のためのプルリクエストを作成しました。非常に長い内容でテストしています。',
          inputTimestamp: '2024-07-29T14:15:00.000Z',
          businessDate: '2024-07-29',
          isDeleted: false,
          createdAt: '2024-07-29T14:15:00.000Z',
          updatedAt: '2024-07-29T14:15:00.000Z',
        },
      ];
      const timezone = 'Asia/Tokyo';

      const result = service.formatLogsForEdit(logs, timezone);

      expect(result).toContain('📝 **今日の活動ログ一覧:**');
      expect(result).toContain('1. [19:30] プロジェクト会議を実施しました');
      expect(result).toContain('2. [23:15] コード レビューを実行し、バグ修正のためのプルリクエストを作成しました。非常に長い内容でテスト...');
      expect(result).toContain('**使用方法:**');
      expect(result).toContain('`!edit <番号> <新しい内容>`');
    });

    test('空のログ配列で適切なメッセージを返す', () => {
      const logs: ActivityLog[] = [];
      const timezone = 'Asia/Tokyo';

      const result = service.formatLogsForEdit(logs, timezone);

      expect(result).toBe('📝 今日の活動ログはまだありません。');
    });

    test('50文字以下の内容は省略されない', () => {
      const logs: ActivityLog[] = [
        {
          id: 'log1',
          userId: 'user123',  
          content: '短い内容',
          inputTimestamp: '2024-07-29T10:30:00.000Z',
          businessDate: '2024-07-29',
          isDeleted: false,
          createdAt: '2024-07-29T10:30:00.000Z',
          updatedAt: '2024-07-29T10:30:00.000Z',
        },
      ];
      const timezone = 'Asia/Tokyo';

      const result = service.formatLogsForEdit(logs, timezone);

      expect(result).toContain('1. [19:30] 短い内容');
      expect(result).not.toContain('...');
    });
  });

  describe('formatSearchResults', () => {
    test('検索結果をフォーマットする', () => {
      const logs: ActivityLog[] = [
        {
          id: 'log1',
          userId: 'user123',
          content: 'プロジェクト会議を実施',
          inputTimestamp: '2024-07-29T10:30:00.000Z',
          businessDate: '2024-07-29',
          isDeleted: false,
          createdAt: '2024-07-29T10:30:00.000Z',
          updatedAt: '2024-07-29T10:30:00.000Z',
        },
        {
          id: 'log2',
          userId: 'user123',
          content: 'プロジェクト管理に関するタスクを実行しました。非常に長い内容でテストしており、80文字を確実に超過して省略されることを確認するためのテスト内容です。追加のテキストでさらに長くします。',
          inputTimestamp: '2024-07-28T14:15:00.000Z',
          businessDate: '2024-07-28',
          isDeleted: false,
          createdAt: '2024-07-28T14:15:00.000Z',
          updatedAt: '2024-07-28T14:15:00.000Z',
        },
      ];
      const query = 'プロジェクト';
      const timezone = 'Asia/Tokyo';

      const result = service.formatSearchResults(logs, query, timezone);

      expect(result).toContain('🔍 **「プロジェクト」の検索結果:** 2件');
      expect(result).toContain('• [07/29 19:30] プロジェクト会議を実施');
      expect(result).toContain('• [07/28 23:15] プロジェクト管理に関するタスクを実行しました。非常に長い内容でテストしており、80文字を確実に超過して省略されることを確認するためのテスト内容です。追加の...');
    });

    test('空の検索結果で適切なメッセージを返す', () => {
      const logs: ActivityLog[] = [];
      const query = 'テスト';
      const timezone = 'Asia/Tokyo';

      const result = service.formatSearchResults(logs, query, timezone);

      expect(result).toBe('🔍 「テスト」に一致するログが見つかりませんでした。');
    });

    test('10件を超える結果では残り件数を表示する', () => {
      const logs: ActivityLog[] = Array.from({ length: 15 }, (_, i) => ({
        id: `log${i}`,
        userId: 'user123',
        content: `ログ内容 ${i}`,
        inputTimestamp: '2024-07-29T10:30:00.000Z',
        businessDate: '2024-07-29',
        isDeleted: false,
        createdAt: '2024-07-29T10:30:00.000Z',
        updatedAt: '2024-07-29T10:30:00.000Z',
      }));
      const query = 'ログ';
      const timezone = 'Asia/Tokyo';

      const result = service.formatSearchResults(logs, query, timezone);

      expect(result).toContain('🔍 **「ログ」の検索結果:** 15件');
      expect(result).toContain('他 5 件の結果があります。');
      // 表示は10件まで
      expect((result.match(/•/g) || []).length).toBe(10);
    });

    test('80文字以下の内容は省略されない', () => {
      const logs: ActivityLog[] = [
        {
          id: 'log1',
          userId: 'user123',
          content: '短い検索結果',
          inputTimestamp: '2024-07-29T10:30:00.000Z',
          businessDate: '2024-07-29',
          isDeleted: false,
          createdAt: '2024-07-29T10:30:00.000Z',
          updatedAt: '2024-07-29T10:30:00.000Z',
        },
      ];
      const query = '短い';
      const timezone = 'Asia/Tokyo';

      const result = service.formatSearchResults(logs, query, timezone);

      expect(result).toContain('• [07/29 19:30] 短い検索結果');
      expect(result).not.toContain('...');
    });
  });
});