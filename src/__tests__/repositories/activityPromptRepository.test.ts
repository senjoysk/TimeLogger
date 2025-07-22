/**
 * 🔴 Red Phase: ActivityPromptRepository テスト
 * TDDアプローチ: 実装前のテスト作成
 */

import { Database } from 'sqlite3';
import { ActivityPromptRepository } from '../../repositories/activityPromptRepository';
import { 
  ActivityPromptSettings, 
  CreateActivityPromptSettingsRequest,
  UpdateActivityPromptSettingsRequest,
  ActivityPromptError
} from '../../types/activityPrompt';

describe('🔴 Red Phase: ActivityPromptRepository', () => {
  let db: Database;
  let repository: ActivityPromptRepository;
  const testUserId = 'test-user-123';

  beforeEach(async () => {
    // インメモリデータベースでテスト環境構築
    db = new Database(':memory:');
    
    // マイグレーション実行（user_settingsテーブルに変更）
    const migrationSql = `
      CREATE TABLE user_settings (
        user_id TEXT PRIMARY KEY,
        timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
        prompt_enabled BOOLEAN DEFAULT FALSE,
        prompt_start_hour INTEGER DEFAULT 8,
        prompt_start_minute INTEGER DEFAULT 30,
        prompt_end_hour INTEGER DEFAULT 18,
        prompt_end_minute INTEGER DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
        CHECK (prompt_start_minute IN (0, 30)),
        CHECK (prompt_end_minute IN (0, 30)),
        CHECK (prompt_start_hour >= 0 AND prompt_start_hour <= 23),
        CHECK (prompt_end_hour >= 0 AND prompt_end_hour <= 23),
        CHECK (
          (prompt_end_hour > prompt_start_hour) OR 
          (prompt_end_hour = prompt_start_hour AND prompt_end_minute > prompt_start_minute)
        )
      );
    `;
    
    await new Promise<void>((resolve, reject) => {
      db.exec(migrationSql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    repository = new ActivityPromptRepository(db);
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      db.close(() => resolve());
    });
  });

  describe('基本操作', () => {
    test('設定を作成できる', async () => {
      const request: CreateActivityPromptSettingsRequest = {
        userId: testUserId,
        isEnabled: true,
        startHour: 9,
        startMinute: 0,
        endHour: 17,
        endMinute: 30
      };

      const settings = await repository.createSettings(request);
      
      expect(settings).toEqual({
        userId: testUserId,
        isEnabled: true,
        startHour: 9,
        startMinute: 0,
        endHour: 17,
        endMinute: 30,
        createdAt: expect.any(String),
        updatedAt: expect.any(String)
      });
    });

    test('設定を取得できる', async () => {
      await repository.createSettings({ 
        userId: testUserId,
        isEnabled: true 
      });

      const settings = await repository.getSettings(testUserId);
      
      expect(settings).not.toBeNull();
      expect(settings!.userId).toBe(testUserId);
      expect(settings!.isEnabled).toBe(true);
    });

    test('存在しない設定を取得するとnullが返る', async () => {
      const settings = await repository.getSettings('non-existent-user');
      expect(settings).toBeNull();
    });

    test('設定を更新できる', async () => {
      await repository.createSettings({ 
        userId: testUserId,
        isEnabled: false 
      });

      const update: UpdateActivityPromptSettingsRequest = {
        isEnabled: true,
        startHour: 10,
        endHour: 16
      };

      await repository.updateSettings(testUserId, update);
      
      const settings = await repository.getSettings(testUserId);
      expect(settings!.isEnabled).toBe(true);
      expect(settings!.startHour).toBe(10);
      expect(settings!.endHour).toBe(16);
    });

    test('設定を削除できる（デフォルト値にリセット）', async () => {
      await repository.createSettings({ 
        userId: testUserId,
        isEnabled: true,
        startHour: 10,
        endHour: 16
      });
      
      await repository.deleteSettings(testUserId);
      
      const settings = await repository.getSettings(testUserId);
      expect(settings).not.toBeNull();
      expect(settings!.isEnabled).toBe(false);
      expect(settings!.startHour).toBe(8);
      expect(settings!.startMinute).toBe(30);
      expect(settings!.endHour).toBe(18);
      expect(settings!.endMinute).toBe(0);
    });
  });

  describe('有効な設定の管理', () => {
    test('有効な設定のみを取得できる', async () => {
      await repository.createSettings({ 
        userId: 'user1',
        isEnabled: true 
      });
      await repository.createSettings({ 
        userId: 'user2',
        isEnabled: false 
      });
      await repository.createSettings({ 
        userId: 'user3',
        isEnabled: true 
      });

      const enabledSettings = await repository.getEnabledSettings();
      
      expect(enabledSettings).toHaveLength(2);
      expect(enabledSettings.every(s => s.isEnabled)).toBe(true);
    });

    test('通知を有効化できる', async () => {
      await repository.createSettings({ 
        userId: testUserId,
        isEnabled: false 
      });

      await repository.enablePrompt(testUserId);
      
      const settings = await repository.getSettings(testUserId);
      expect(settings!.isEnabled).toBe(true);
    });

    test('通知を無効化できる', async () => {
      await repository.createSettings({ 
        userId: testUserId,
        isEnabled: true 
      });

      await repository.disablePrompt(testUserId);
      
      const settings = await repository.getSettings(testUserId);
      expect(settings!.isEnabled).toBe(false);
    });
  });

  describe('スケジュール機能', () => {
    test('特定時刻に通知すべきユーザーを取得できる', async () => {
      // 9:00-17:30の設定
      await repository.createSettings({
        userId: 'user1',
        isEnabled: true,
        startHour: 9,
        startMinute: 0,
        endHour: 17,
        endMinute: 30
      });
      
      // 8:30-18:00の設定
      await repository.createSettings({
        userId: 'user2', 
        isEnabled: true,
        startHour: 8,
        startMinute: 30,
        endHour: 18,
        endMinute: 0
      });

      // 無効な設定
      await repository.createSettings({
        userId: 'user3',
        isEnabled: false,
        startHour: 8,
        startMinute: 30,
        endHour: 18,
        endMinute: 0
      });

      // 9:00の場合
      const users9_00 = await repository.getUsersToPromptAt(9, 0);
      expect(users9_00).toContain('user1');
      expect(users9_00).toContain('user2');
      expect(users9_00).not.toContain('user3');

      // 8:30の場合
      const users8_30 = await repository.getUsersToPromptAt(8, 30);
      expect(users8_30).toContain('user2');
      expect(users8_30).not.toContain('user1'); // 開始時刻前

      // 18:00の場合
      const users18_00 = await repository.getUsersToPromptAt(18, 0);
      expect(users18_00).toContain('user2'); // 終了時刻ぴったり
      expect(users18_00).not.toContain('user1'); // 終了時刻後
    });
  });

  describe('バリデーション', () => {
    test('無効な分（0,30以外）でエラー', async () => {
      const request: CreateActivityPromptSettingsRequest = {
        userId: testUserId,
        startMinute: 15 // 無効
      };

      await expect(repository.createSettings(request))
        .rejects
        .toThrow();
    });

    test('無効な時刻範囲でエラー', async () => {
      const request: CreateActivityPromptSettingsRequest = {
        userId: testUserId,
        startHour: 18,
        endHour: 9 // 開始より前
      };

      await expect(repository.createSettings(request))
        .rejects
        .toThrow();
    });
  });

  describe('設定存在確認', () => {
    test('設定の存在を確認できる', async () => {
      await repository.createSettings({ userId: testUserId });
      
      const exists = await repository.settingsExists(testUserId);
      expect(exists).toBe(true);
      
      const notExists = await repository.settingsExists('non-existent');
      expect(notExists).toBe(false);
    });
  });
});