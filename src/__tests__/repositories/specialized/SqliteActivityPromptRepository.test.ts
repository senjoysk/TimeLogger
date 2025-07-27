/**
 * SqliteActivityPromptRepository専用リポジトリのテスト
 * 活動促し通知設定管理機能の単一責務テスト
 */

import { SqliteActivityPromptRepository } from '../../../repositories/specialized/SqliteActivityPromptRepository';
import { DatabaseConnection } from '../../../repositories/base/DatabaseConnection';
import { getTestDbPath, cleanupTestDatabase } from '../../../utils/testDatabasePath';
import { CreateActivityPromptSettingsRequest } from '../../../types/activityPrompt';

describe('SqliteActivityPromptRepository専用テスト', () => {
  const testDbPath = getTestDbPath(__filename);
  let repository: SqliteActivityPromptRepository;

  beforeAll(async () => {
    // テストDB準備
    cleanupTestDatabase(testDbPath);
    
    // 専用リポジトリ初期化
    repository = new SqliteActivityPromptRepository(testDbPath);
    await repository.ensureSchema();
    
    // データベース初期化（メインスキーマが必要）
    const db = DatabaseConnection.getInstance(testDbPath);
    await db.initializeDatabase();
  });

  afterAll(async () => {
    // DB接続を閉じる
    const db = DatabaseConnection.getInstance(testDbPath);
    await db.close();
    
    // テストDBクリーンアップ
    cleanupTestDatabase(testDbPath);
  });

  describe('基本操作', () => {
    test('活動促し通知設定を作成できる', async () => {
      const request: CreateActivityPromptSettingsRequest = {
        userId: 'test-user-1',
        isEnabled: true,
        startHour: 9,
        startMinute: 0,
        endHour: 18,
        endMinute: 0
      };

      const settings = await repository.createSettings(request);

      expect(settings).toBeDefined();
      expect(settings.userId).toBe(request.userId);
      expect(settings.isEnabled).toBe(request.isEnabled);
      expect(settings.startHour).toBe(request.startHour);
      expect(settings.startMinute).toBe(request.startMinute);
      expect(settings.endHour).toBe(request.endHour);
      expect(settings.endMinute).toBe(request.endMinute);
      expect(settings.createdAt).toBeDefined();
      expect(settings.updatedAt).toBeDefined();
    });

    test('活動促し通知設定を取得できる', async () => {
      const userId = 'test-user-2';
      
      // 設定を作成
      await repository.createSettings({
        userId,
        isEnabled: true,
        startHour: 8,
        startMinute: 30,
        endHour: 17,
        endMinute: 30
      });

      const settings = await repository.getSettings(userId);

      expect(settings).toBeDefined();
      expect(settings!.userId).toBe(userId);
      expect(settings!.isEnabled).toBe(true);
      expect(settings!.startHour).toBe(8);
      expect(settings!.startMinute).toBe(30);
      expect(settings!.endHour).toBe(17);
      expect(settings!.endMinute).toBe(30);
    });

    test('存在しないユーザーの設定取得はnullを返す', async () => {
      const settings = await repository.getSettings('non-existent-user');
      expect(settings).toBeNull();
    });

    test('活動促し通知設定を更新できる', async () => {
      const userId = 'test-user-3';
      
      // 初期設定作成
      await repository.createSettings({
        userId,
        isEnabled: true,
        startHour: 9,
        startMinute: 0,
        endHour: 18,
        endMinute: 0
      });

      // 設定更新
      await repository.updateSettings(userId, {
        isEnabled: false,
        startHour: 10,
        endHour: 16
      });

      const updatedSettings = await repository.getSettings(userId);

      expect(updatedSettings).toBeDefined();
      expect(updatedSettings!.isEnabled).toBe(false);
      expect(updatedSettings!.startHour).toBe(10);
      expect(updatedSettings!.startMinute).toBe(0); // 更新されていない値は維持
      expect(updatedSettings!.endHour).toBe(16);
      expect(updatedSettings!.endMinute).toBe(0); // 更新されていない値は維持
    });

    test('活動促し通知設定を削除できる', async () => {
      const userId = 'test-user-4';
      
      // 設定作成
      await repository.createSettings({
        userId,
        isEnabled: true,
        startHour: 9,
        startMinute: 0,
        endHour: 18,
        endMinute: 0
      });

      // 削除前は取得できる
      const beforeDelete = await repository.getSettings(userId);
      expect(beforeDelete).toBeDefined();

      // 削除実行
      await repository.deleteSettings(userId);

      // 削除後は取得できない
      const afterDelete = await repository.getSettings(userId);
      expect(afterDelete).toBeNull();
    });
  });

  describe('有効な設定の取得', () => {
    test('有効な設定のみを取得できる', async () => {
      // 複数ユーザーの設定を作成（有効・無効含む）
      await repository.createSettings({
        userId: 'enabled-user-1',
        isEnabled: true,
        startHour: 9,
        startMinute: 0,
        endHour: 18,
        endMinute: 0
      });

      await repository.createSettings({
        userId: 'enabled-user-2',
        isEnabled: true,
        startHour: 8,
        startMinute: 0,
        endHour: 17,
        endMinute: 0
      });

      await repository.createSettings({
        userId: 'disabled-user',
        isEnabled: false,
        startHour: 9,
        startMinute: 0,
        endHour: 18,
        endMinute: 0
      });

      const enabledSettings = await repository.getEnabledSettings();

      expect(enabledSettings.length).toBeGreaterThanOrEqual(2);
      
      // 有効な設定のみが含まれていることを確認
      const enabledUserIds = enabledSettings.map(s => s.userId);
      expect(enabledUserIds).toContain('enabled-user-1');
      expect(enabledUserIds).toContain('enabled-user-2');
      expect(enabledUserIds).not.toContain('disabled-user');
      
      // すべての設定が有効であることを確認
      enabledSettings.forEach(setting => {
        expect(setting.isEnabled).toBe(true);
      });
    });
  });

  describe('特定時刻に通知すべきユーザーの取得', () => {
    beforeAll(async () => {
      // 時刻テスト用のユーザー設定を作成
      await repository.createSettings({
        userId: 'time-test-user-1',
        isEnabled: true,
        startHour: 9,   // 9:00-18:00
        startMinute: 0,
        endHour: 18,
        endMinute: 0
      });

      await repository.createSettings({
        userId: 'time-test-user-2',
        isEnabled: true,
        startHour: 8,   // 8:30-17:30
        startMinute: 30,
        endHour: 17,
        endMinute: 30
      });

      await repository.createSettings({
        userId: 'time-test-user-3',
        isEnabled: true,
        startHour: 10,  // 10:00-16:00
        startMinute: 0,
        endHour: 16,
        endMinute: 0
      });

      await repository.createSettings({
        userId: 'time-test-disabled',
        isEnabled: false, // 無効なので対象外
        startHour: 9,
        startMinute: 0,
        endHour: 18,
        endMinute: 0
      });
    });

    test('午前中の時刻（10:30）で適切なユーザーを取得', async () => {
      const userIds = await repository.getUsersToPromptAt(10, 30);

      expect(userIds).toContain('time-test-user-1'); // 9:00-18:00 → 対象
      expect(userIds).not.toContain('time-test-user-2'); // 8:30-17:30 → 対象外（17:30 < 10:30は不正）
      expect(userIds).toContain('time-test-user-3'); // 10:00-16:00 → 対象
      expect(userIds).not.toContain('time-test-disabled'); // 無効 → 対象外
    });

    test('営業時間開始時刻（9:00）で適切なユーザーを取得', async () => {
      const userIds = await repository.getUsersToPromptAt(9, 0);

      expect(userIds).toContain('time-test-user-1'); // 9:00-18:00 → 対象（境界値）
      expect(userIds).not.toContain('time-test-user-3'); // 10:00-16:00 → 対象外（まだ開始前）
    });

    test('営業時間外（19:00）では対象ユーザーなし', async () => {
      const userIds = await repository.getUsersToPromptAt(19, 0);

      // 19時は全ユーザーの営業時間外なので空配列
      expect(userIds).toHaveLength(0);
    });
  });

  describe('設定の有効/無効切り替え', () => {
    test('活動促し通知を有効化できる', async () => {
      const userId = 'toggle-test-user-1';
      
      // 無効な設定で作成
      await repository.createSettings({
        userId,
        isEnabled: false,
        startHour: 9,
        startMinute: 0,
        endHour: 18,
        endMinute: 0
      });

      // 有効化
      await repository.enablePrompt(userId);

      const settings = await repository.getSettings(userId);
      expect(settings!.isEnabled).toBe(true);
    });

    test('活動促し通知を無効化できる', async () => {
      const userId = 'toggle-test-user-2';
      
      // 有効な設定で作成
      await repository.createSettings({
        userId,
        isEnabled: true,
        startHour: 9,
        startMinute: 0,
        endHour: 18,
        endMinute: 0
      });

      // 無効化
      await repository.disablePrompt(userId);

      const settings = await repository.getSettings(userId);
      expect(settings!.isEnabled).toBe(false);
    });
  });

  describe('設定存在確認', () => {
    test('設定が存在するユーザーでtrueを返す', async () => {
      const userId = 'exists-test-user';
      
      await repository.createSettings({
        userId,
        isEnabled: true,
        startHour: 9,
        startMinute: 0,
        endHour: 18,
        endMinute: 0
      });

      const exists = await repository.settingsExists(userId);
      expect(exists).toBe(true);
    });

    test('設定が存在しないユーザーでfalseを返す', async () => {
      const exists = await repository.settingsExists('non-existent-settings-user');
      expect(exists).toBe(false);
    });

    test('削除された設定でfalseを返す', async () => {
      const userId = 'deleted-settings-user';
      
      // 設定作成
      await repository.createSettings({
        userId,
        isEnabled: true,
        startHour: 9,
        startMinute: 0,
        endHour: 18,
        endMinute: 0
      });

      // 削除
      await repository.deleteSettings(userId);

      // 存在確認
      const exists = await repository.settingsExists(userId);
      expect(exists).toBe(false);
    });
  });

  describe('設定の重複作成', () => {
    test('同じユーザーの設定を再作成すると更新される', async () => {
      const userId = 'duplicate-test-user';
      
      // 初回作成
      await repository.createSettings({
        userId,
        isEnabled: true,
        startHour: 9,
        startMinute: 0,
        endHour: 18,
        endMinute: 0
      });

      // 同じユーザーで再作成（更新）
      await repository.createSettings({
        userId,
        isEnabled: false,
        startHour: 10,
        startMinute: 30,
        endHour: 16,
        endMinute: 30
      });

      const settings = await repository.getSettings(userId);
      expect(settings!.isEnabled).toBe(false);
      expect(settings!.startHour).toBe(10);
      expect(settings!.startMinute).toBe(30);
      expect(settings!.endHour).toBe(16);
      expect(settings!.endMinute).toBe(30);
    });
  });
});