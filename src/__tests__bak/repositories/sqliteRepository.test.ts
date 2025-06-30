import { SqliteRepository } from '../../repositories/sqliteRepository';
import { ActivityRecord, DailySummary } from '../../types';
import { promises as fs } from 'fs';
import { join } from 'path';

describe('SqliteRepository', () => {
  let repository: SqliteRepository;
  const testDbPath = './test-db.sqlite';

  beforeEach(async () => {
    // テスト用のデータベースファイルを削除（存在する場合）
    try {
      await fs.unlink(testDbPath);
    } catch {
      // ファイルが存在しない場合は無視
    }

    repository = new SqliteRepository(testDbPath);
  });

  afterEach(async () => {
    await repository.close();
    
    // テスト用のデータベースファイルを削除
    try {
      await fs.unlink(testDbPath);
    } catch {
      // ファイルが存在しない場合は無視
    }
  });

  describe('初期化とライフサイクル', () => {
    it('データベースを正常に初期化できる', async () => {
      await expect(repository.initialize()).resolves.not.toThrow();
    });

    it('データベースを正常に閉じることができる', async () => {
      await repository.initialize();
      await expect(repository.close()).resolves.not.toThrow();
    });

    it('初期化前に操作を実行するとエラーになる', async () => {
      await expect(
        repository.getUserTimezone('test-user')
      ).rejects.toThrow('データベースが初期化されていません');
    });
  });

  describe('ユーザー関連操作', () => {
    beforeEach(async () => {
      await repository.initialize();
    });

    it('ユーザーのタイムゾーンを設定・取得できる', async () => {
      const userId = 'test-user-123';
      const timezone = 'America/New_York';

      await repository.setUserTimezone(userId, timezone);
      const result = await repository.getUserTimezone(userId);

      expect(result).toBe(timezone);
    });

    it('存在しないユーザーのタイムゾーンはデフォルト値を返す', async () => {
      const result = await repository.getUserTimezone('non-existent-user');
      expect(result).toBe('Asia/Tokyo');
    });
  });

  describe('活動記録関連操作', () => {
    beforeEach(async () => {
      await repository.initialize();
    });

    it('活動記録を保存・取得できる', async () => {
      const record: ActivityRecord = {
        id: 'test-record-1',
        userId: 'test-user',
        timeSlot: '2025-06-27 09:00:00',
        originalText: 'テスト活動',
        analysis: {
          category: 'テスト',
          subCategory: 'ユニットテスト',
          structuredContent: 'テスト活動の実行',
          estimatedMinutes: 30,
          productivityLevel: 4
        },
        category: 'テスト',
        subCategory: 'ユニットテスト',
        createdAt: '2025-06-27 09:30:00',
        updatedAt: '2025-06-27 09:30:00'
      };

      await repository.saveActivityRecord(record, 'Asia/Tokyo');
      const records = await repository.getActivityRecords('test-user', 'Asia/Tokyo', '2025-06-27');

      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        id: record.id,
        userId: record.userId,
        originalText: record.originalText,
        category: record.category,
        subCategory: record.subCategory
      });
    });

    it('指定した時間枠の活動記録を取得できる', async () => {
      const record: ActivityRecord = {
        id: 'test-record-2',
        userId: 'test-user',
        timeSlot: '2025-06-27 10:00:00',
        originalText: 'テスト活動2',
        analysis: {
          category: 'テスト',
          structuredContent: 'テスト活動2の実行',
          estimatedMinutes: 60,
          productivityLevel: 3
        },
        category: 'テスト',
        createdAt: '2025-06-27 10:30:00',
        updatedAt: '2025-06-27 10:30:00'
      };

      await repository.saveActivityRecord(record, 'Asia/Tokyo');
      const records = await repository.getActivityRecordsByTimeSlot('test-user', '2025-06-27 10:00:00');

      expect(records).toHaveLength(1);
      expect(records[0].id).toBe(record.id);
    });
  });

  describe('日次サマリー関連操作', () => {
    beforeEach(async () => {
      await repository.initialize();
    });

    it('日次サマリーを保存・取得できる', async () => {
      const summary: DailySummary = {
        date: '2025-06-27',
        categoryTotals: [{
          category: 'テスト',
          totalMinutes: 60,
          recordCount: 1,
          averageProductivity: 4,
          subCategories: []
        }],
        totalMinutes: 60,
        insights: 'テスト用の感想',
        motivation: 'テスト用の励まし',
        generatedAt: '2025-06-27T10:00:00.000Z'
      };

      await repository.saveDailySummary(summary, 'Asia/Tokyo');
      const result = await repository.getDailySummary('test-user', 'Asia/Tokyo', '2025-06-27');

      expect(result).not.toBeNull();
      expect(result!.date).toBe(summary.date);
      expect(result!.totalMinutes).toBe(summary.totalMinutes);
      expect(result!.insights).toBe(summary.insights);
    });

    it('存在しない日次サマリーはnullを返す', async () => {
      const result = await repository.getDailySummary('test-user', 'Asia/Tokyo', '2025-12-31');
      expect(result).toBeNull();
    });
  });
});