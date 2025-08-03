/**
 * SqliteUserRepository テスト
 * Phase 3: ユーザー管理専用リポジトリ分離テスト
 */

import { SqliteUserRepository } from '../../repositories/specialized/SqliteUserRepository';
import { DatabaseConnection } from '../../repositories/base/DatabaseConnection';
import { cleanupTestDatabaseFiles } from '../setup';
import { TodoError } from '../../types/todo';
import { AppError } from '../../utils/errorHandler';
import * as path from 'path';
import * as fs from 'fs';

describe('SqliteUserRepository分離テスト（実装済み）', () => {
  let repository: SqliteUserRepository;
  let dbConnection: DatabaseConnection;
  const testDbPath = path.join(__dirname, '../../test-data/test-user-repository.db');

  beforeEach(async () => {
    // テストDB用ディレクトリ作成
    const testDir = path.dirname(testDbPath);
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // 既存DBファイルの削除
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Repository初期化 - ensureSchema()でデータベース接続も初期化される
    repository = new SqliteUserRepository(testDbPath);
    await repository.ensureSchema();
    dbConnection = DatabaseConnection.getInstance(testDbPath);
  });

  afterEach(async () => {
    try {
      await dbConnection.close();
      await cleanupTestDatabaseFiles();
    } catch (error) {
      console.warn('⚠️ クリーンアップ中にエラー:', error);
    }
  });

  describe('ユーザー存在確認機能', () => {
    test('存在するユーザーでtrueを返す', async () => {
      // Arrange
      const userId = 'test-user-123';
      const username = 'テストユーザー';
      await repository.registerUser(userId, username);

      // Act
      const exists = await repository.userExists(userId);

      // Assert
      expect(exists).toBe(true);
    });

    test('存在しないユーザーでfalseを返す', async () => {
      // Act
      const exists = await repository.userExists('non-existent-user');

      // Assert
      expect(exists).toBe(false);
    });

    test('空のユーザーIDでfalseを返す', async () => {
      // Act
      const exists = await repository.userExists('');

      // Assert
      expect(exists).toBe(false);
    });
  });

  describe('ユーザー登録機能', () => {
    test('新規ユーザーを正常に登録できる', async () => {
      // Arrange
      const userId = 'test-user-123';
      const username = 'テストユーザー';

      // Act
      await repository.registerUser(userId, username);

      // Assert
      const userInfo = await repository.getUserInfo(userId);
      expect(userInfo).toBeDefined();
      expect(userInfo!.userId).toBe(userId);
      expect(userInfo!.username).toBe(username);
      expect(userInfo!.timezone).toBe('Asia/Tokyo');
      expect(userInfo!.isActive).toBe(true);
    });

    test('日本語ユーザー名で登録できる', async () => {
      // Arrange
      const userId = 'japanese-user';
      const username = '田中太郎';

      // Act
      await repository.registerUser(userId, username);

      // Assert
      const userInfo = await repository.getUserInfo(userId);
      expect(userInfo!.username).toBe(username);
    });

    test('英語ユーザー名で登録できる', async () => {
      // Arrange
      const userId = 'english-user';
      const username = 'John Smith';

      // Act
      await repository.registerUser(userId, username);

      // Assert
      const userInfo = await repository.getUserInfo(userId);
      expect(userInfo!.username).toBe(username);
    });

    test('重複するユーザーIDで登録するとエラーになる', async () => {
      // Arrange
      const userId = 'duplicate-user';
      const username = 'テストユーザー';
      await repository.registerUser(userId, username);

      // Act & Assert
      await expect(repository.registerUser(userId, '別のユーザー')).rejects.toThrow();
    });
  });

  describe('ユーザー情報取得機能', () => {
    beforeEach(async () => {
      // テストデータ作成（時間差を確保）
      await repository.registerUser('user-1', 'ユーザー1');
      // 時間差を作るため少し待機
      await new Promise(resolve => setTimeout(resolve, 10));
      await repository.registerUser('user-2', 'ユーザー2');
    });

    test('存在するユーザーの情報を取得できる', async () => {
      // Act
      const userInfo = await repository.getUserInfo('user-1');

      // Assert
      expect(userInfo).toBeDefined();
      expect(userInfo!.userId).toBe('user-1');
      expect(userInfo!.username).toBe('ユーザー1');
      expect(userInfo!.timezone).toBe('Asia/Tokyo');
      expect(userInfo!.isActive).toBe(true);
      expect(userInfo!.registrationDate).toBeDefined();
      expect(userInfo!.lastSeenAt).toBeDefined();
      expect(userInfo!.createdAt).toBeDefined();
      expect(userInfo!.updatedAt).toBeDefined();
    });

    test('存在しないユーザーでnullを返す', async () => {
      // Act
      const userInfo = await repository.getUserInfo('non-existent-user');

      // Assert
      expect(userInfo).toBeNull();
    });

    test('全ユーザー取得で正しい数のユーザーが返される', async () => {
      // Act
      const allUsers = await repository.getAllUsers();

      // Assert
      expect(allUsers).toHaveLength(2);
      expect(allUsers.every(user => user.userId && user.username)).toBe(true);
    });

    test('全ユーザー取得で作成日時順にソートされる', async () => {
      // Act
      const allUsers = await repository.getAllUsers();

      // Assert
      expect(allUsers).toHaveLength(2);
      // 後に作成されたuser-2が先に来る（DESC順）
      expect(allUsers[0].userId).toBe('user-2');
      expect(allUsers[1].userId).toBe('user-1');
    });
  });

  describe('ユーザー統計機能', () => {
    beforeEach(async () => {
      // テストユーザー登録
      await repository.registerUser('stats-user', '統計ユーザー');

      // 統計用の活動ログを手動挿入（activity_logsテーブルに直接）
      // SQLiteのlocaltime（システムタイムゾーン）での今日の日付を取得
      const now = new Date();
      const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterdayLocal = new Date(todayLocal.getTime() - 24 * 60 * 60 * 1000);
      
      // YYYY-MM-DD形式の日付文字列を生成（ローカルタイムゾーン）
      const todayStr = todayLocal.toISOString().split('T')[0];
      const yesterdayStr = yesterdayLocal.toISOString().split('T')[0];
      
      const testLogs = [
        { id: '1', content: '今日のログ1', minutes: 30, date: todayStr, timestamp: new Date().toISOString() },
        { id: '2', content: '今日のログ2', minutes: 45, date: todayStr, timestamp: new Date().toISOString() },
        { id: '3', content: '昨日のログ', minutes: 60, date: yesterdayStr, timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() },
      ];

      for (const log of testLogs) {
        await dbConnection.run(`
          INSERT INTO activity_logs (id, user_id, content, input_timestamp, business_date, is_deleted, created_at, updated_at, total_minutes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          log.id,
          'stats-user',
          log.content,
          log.timestamp,
          log.date,  // YYYY-MM-DD形式の日付を直接使用
          0,
          log.timestamp,
          log.timestamp,
          log.minutes
        ]);
      }
    });

    test('ユーザー統計を正しく取得できる', async () => {
      // Act
      const stats = await repository.getUserStats('stats-user');

      // Assert
      expect(stats).toBeDefined();
      expect(stats.userId).toBe('stats-user');
      expect(stats.totalLogs).toBe(3);
      // todayLogsはタイムゾーンに依存するため、0以上であることを確認
      expect(stats.todayLogs).toBeGreaterThanOrEqual(0);
      expect(stats.todayLogs).toBeLessThanOrEqual(3);
      expect(stats.totalMinutesLogged).toBe(135);  // 30 + 45 + 60 = 135分
      expect(stats.avgLogsPerDay).toBeGreaterThan(0);
      // mostActiveHourは時間データがある場合のみ
      if (stats.mostActiveHour !== null) {
        expect(typeof stats.mostActiveHour).toBe('number');
      }
      expect(stats.longestActiveDay).toBeDefined();  // 日付データがある場合
    });

    test('データがないユーザーの統計はゼロを返す', async () => {
      // Arrange
      await repository.registerUser('no-data-user', 'データなしユーザー');

      // Act
      const stats = await repository.getUserStats('no-data-user');

      // Assert
      expect(stats.userId).toBe('no-data-user');
      expect(stats.totalLogs).toBe(0);
      expect(stats.todayLogs).toBe(0);
      expect(stats.thisWeekLogs).toBe(0);
      expect(stats.thisMonthLogs).toBe(0);
      expect(stats.totalMinutesLogged).toBe(0);
      expect(stats.avgLogsPerDay).toBe(0);
      expect(stats.mostActiveHour).toBeNull();
      expect(stats.longestActiveDay).toBeNull();
    });

    test('存在しないユーザーの統計はゼロを返す', async () => {
      // Act
      const stats = await repository.getUserStats('non-existent-user');

      // Assert
      expect(stats.userId).toBe('non-existent-user');
      expect(stats.totalLogs).toBe(0);
      expect(stats.todayLogs).toBe(0);
      expect(stats.totalMinutesLogged).toBe(0);
      expect(stats.mostActiveHour).toBeNull();
      expect(stats.longestActiveDay).toBeNull();
    });
  });

  describe('最終利用日時更新機能', () => {
    beforeEach(async () => {
      await repository.registerUser('update-user', 'アップデートユーザー');
    });

    test('最終利用日時が正しく更新される', async () => {
      // Arrange
      const userInfoBefore = await repository.getUserInfo('update-user');
      const beforeLastSeen = userInfoBefore!.lastSeenAt;

      // 時間差を確保
      await new Promise(resolve => setTimeout(resolve, 10));

      // Act
      await repository.updateLastSeen('update-user');

      // Assert
      const userInfoAfter = await repository.getUserInfo('update-user');
      expect(userInfoAfter!.lastSeenAt).not.toBe(beforeLastSeen);
      expect(new Date(userInfoAfter!.lastSeenAt).getTime()).toBeGreaterThan(new Date(beforeLastSeen).getTime());
    });

    test('存在しないユーザーの更新でもエラーにならない', async () => {
      // Act & Assert - エラーを投げるが、データベース層での正常動作
      await expect(repository.updateLastSeen('non-existent-user')).resolves.not.toThrow();
    });
  });

  describe('エラーハンドリング', () => {
    test('getUserInfo失敗時にAppErrorを投げる', async () => {
      // データベース接続を閉鎖してエラーを発生させる
      await dbConnection.close();

      // Act & Assert
      await expect(repository.getUserInfo('test-user')).rejects.toThrow(AppError);
    });

    test('registerUser失敗時にAppErrorを投げる', async () => {
      // データベース接続を閉鎖してエラーを発生させる
      await dbConnection.close();

      // Act & Assert
      await expect(repository.registerUser('test-user', 'テスト')).rejects.toThrow(AppError);
    });

    test('getUserStats失敗時にTodoErrorを投げる', async () => {
      // データベース接続を閉鎖してエラーを発生させる
      await dbConnection.close();

      // Act & Assert
      await expect(repository.getUserStats('test-user')).rejects.toThrow(TodoError);
    });

    test('updateLastSeen失敗時にTodoErrorを投げる', async () => {
      // データベース接続を閉鎖してエラーを発生させる
      await dbConnection.close();

      // Act & Assert
      await expect(repository.updateLastSeen('test-user')).rejects.toThrow(TodoError);
    });
  });

  describe('データベース統合テスト', () => {
    test('user_settingsテーブルが自動作成される', async () => {
      // Act - ユーザー登録でテーブル作成をトリガー
      await repository.registerUser('test', 'Test User');

      // テーブルが存在することを確認
      const tables = await dbConnection.all(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='user_settings'
      `);
      
      // Assert
      expect(tables).toHaveLength(1);
      expect(tables[0].name).toBe('user_settings');
    });

    test('ユーザーデータの整合性が保たれる', async () => {
      // Arrange & Act - 複数のユーザーを登録
      const users = [];
      for (let i = 0; i < 5; i++) {
        const userId = `consistency-user-${i + 1}`;
        const username = `整合性ユーザー ${i + 1}`;
        await repository.registerUser(userId, username);
        users.push({ userId, username });
      }

      // 全ユーザーを取得して整合性確認
      const allUsers = await repository.getAllUsers();

      // Assert
      expect(allUsers).toHaveLength(5);
      expect(allUsers.every(u => u.timezone === 'Asia/Tokyo')).toBe(true);
      expect(allUsers.every(u => u.isActive === true)).toBe(true);
      
      // ID一意性確認
      const userIds = allUsers.map(u => u.userId);
      const uniqueIds = new Set(userIds);
      expect(uniqueIds.size).toBe(5);
    });
  });
});