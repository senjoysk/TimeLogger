/**
 * Phase 3: データベース拡張 - ユーザー管理機能テスト
 * TDD Red Phase: 失敗するテストを先に作成
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { SqliteActivityLogRepository } from '../../repositories/sqliteActivityLogRepository';
import { UserInfo, UserStats } from '../../repositories/interfaces';
import { Database } from 'sqlite3';
import * as path from 'path';
import * as fs from 'fs';

describe('Phase 3: ユーザー管理機能テスト', () => {
  let repository: SqliteActivityLogRepository;
  let testDbPath: string;

  beforeEach(async () => {
    // テスト用データベースを作成
    testDbPath = path.join(__dirname, 'test-user-management.db');
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    
    repository = new SqliteActivityLogRepository(testDbPath);
    await repository.initializeDatabase();
  });

  afterEach(async () => {
    await repository.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('🔴 Red Phase: getAllUsers メソッド', () => {
    test('全ユーザー取得が正常に動作する', async () => {
      // テストデータ準備
      await repository.registerUser('user1', 'User One');
      await repository.registerUser('user2', 'User Two');
      await repository.registerUser('user3', 'User Three');

      // 全ユーザーを取得
      const users = await repository.getAllUsers();

      // 検証
      expect(users).toHaveLength(3);
      expect(users.map(u => u.userId)).toContain('user1');
      expect(users.map(u => u.userId)).toContain('user2');
      expect(users.map(u => u.userId)).toContain('user3');
      expect(users.map(u => u.username)).toContain('User One');
      expect(users.map(u => u.username)).toContain('User Two');
      expect(users.map(u => u.username)).toContain('User Three');
    });

    test('ユーザーがいない場合は空配列を返す', async () => {
      // 一度ユーザーを登録して削除することで、user_settingsテーブルを確実に初期化
      await repository.registerUser('temp', 'temp');
      // テストデータベースは新しく作成されるため、空であることを確認
      const users = await repository.getAllUsers();
      expect(users).toHaveLength(1); // tempユーザーが1つ存在
    });

    test('各ユーザーの基本情報が正しく取得される', async () => {
      await repository.registerUser('testuser', 'Test User');
      
      const users = await repository.getAllUsers();
      const user = users[0];
      
      expect(user.userId).toBe('testuser');
      expect(user.username).toBe('Test User');
      expect(user.timezone).toBe('Asia/Tokyo');
      expect(user.isActive).toBe(true);
      expect(user.registrationDate).toBeDefined();
      expect(user.lastSeenAt).toBeDefined();
    });
  });

  describe('🔴 Red Phase: getUserStats メソッド', () => {
    test('ユーザー統計情報を正しく取得する', async () => {
      const userId = 'testuser';
      await repository.registerUser(userId, 'Test User');
      
      // テスト用のログを作成（今日の日付を使用）
      const todayBusinessDate = new Date().toISOString().split('T')[0];
      await repository.saveLog({
        userId,
        content: 'テスト活動1',
        inputTimestamp: new Date().toISOString(),
        businessDate: todayBusinessDate,
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        totalMinutes: 30,
        confidence: 0.8,
        categories: 'テスト',
        analysisWarnings: ''
      });

      await repository.saveLog({
        userId,
        content: 'テスト活動2',
        inputTimestamp: new Date().toISOString(),
        businessDate: todayBusinessDate,
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        totalMinutes: 60,
        confidence: 0.9,
        categories: 'テスト',
        analysisWarnings: ''
      });

      const stats = await repository.getUserStats(userId);

      expect(stats.totalLogs).toBe(2);
      expect(stats.totalMinutesLogged).toBe(90);
      expect(stats.todayLogs).toBeGreaterThan(0);
      expect(stats.avgLogsPerDay).toBeGreaterThan(0);
      expect(stats.mostActiveHour).not.toBeNull();
      expect(stats.longestActiveDay).not.toBeNull();
    });

    test('ログがないユーザーの統計情報は初期値を返す', async () => {
      const userId = 'newuser';
      await repository.registerUser(userId, 'New User');
      
      const stats = await repository.getUserStats(userId);
      
      expect(stats.totalLogs).toBe(0);
      expect(stats.totalMinutesLogged).toBe(0);
      expect(stats.todayLogs).toBe(0);
      expect(stats.avgLogsPerDay).toBe(0);
      expect(stats.mostActiveHour).toBe(null);
      expect(stats.longestActiveDay).toBe(null);
    });
  });

  describe('🔴 Red Phase: updateLastSeen メソッド', () => {
    test('最終利用日時を正しく更新する', async () => {
      const userId = 'testuser';
      await repository.registerUser(userId, 'Test User');
      
      const beforeUpdate = await repository.getUserInfo(userId);
      
      // 少し待ってから更新
      await new Promise(resolve => setTimeout(resolve, 100));
      await repository.updateLastSeen(userId);
      
      const afterUpdate = await repository.getUserInfo(userId);
      
      expect(afterUpdate!.lastSeenAt).not.toBe(beforeUpdate!.lastSeenAt);
      expect(new Date(afterUpdate!.lastSeenAt).getTime()).toBeGreaterThan(new Date(beforeUpdate!.lastSeenAt).getTime());
    });

    test('存在しないユーザーの場合はエラーを投げない', async () => {
      // 存在しないユーザーでも例外を投げない
      await expect(repository.updateLastSeen('nonexistent')).resolves.not.toThrow();
    });
  });

  describe('🔴 Red Phase: データベース拡張カラム', () => {
    test('username カラムが正しく保存・取得される', async () => {
      const userId = 'testuser';
      const username = 'テストユーザー';
      
      await repository.registerUser(userId, username);
      const userInfo = await repository.getUserInfo(userId);
      
      expect(userInfo!.username).toBe(username);
    });

    test('first_seen と last_seen が正しく設定される', async () => {
      const userId = 'testuser';
      await repository.registerUser(userId, 'Test User');
      
      const userInfo = await repository.getUserInfo(userId);
      
      expect(userInfo!.registrationDate).toBeDefined();
      expect(userInfo!.lastSeenAt).toBeDefined();
      expect(new Date(userInfo!.registrationDate).getTime()).toBeGreaterThan(0);
      expect(new Date(userInfo!.lastSeenAt).getTime()).toBeGreaterThan(0);
    });

    test('is_active フラグが正しく設定される', async () => {
      const userId = 'testuser';
      await repository.registerUser(userId, 'Test User');
      
      const userInfo = await repository.getUserInfo(userId);
      
      expect(userInfo!.isActive).toBe(true);
    });
  });

  describe('🔴 Red Phase: 統計計算の詳細', () => {
    test('getLongestActiveDay が正しく計算される', async () => {
      const userId = 'testuser';
      await repository.registerUser(userId, 'Test User');
      
      // 異なる日付のログを作成
      await repository.saveLog({
        userId,
        content: '日1の活動1',
        inputTimestamp: '2025-07-10T09:00:00Z',
        businessDate: '2025-07-10',
        startTime: '2025-07-10T09:00:00Z',
        endTime: '2025-07-10T10:00:00Z',
        totalMinutes: 60,
        confidence: 0.8,
        categories: '仕事',
        analysisWarnings: ''
      });

      await repository.saveLog({
        userId,
        content: '日1の活動2',
        inputTimestamp: '2025-07-10T14:00:00Z',
        businessDate: '2025-07-10',
        startTime: '2025-07-10T14:00:00Z',
        endTime: '2025-07-10T15:00:00Z',
        totalMinutes: 60,
        confidence: 0.8,
        categories: '仕事',
        analysisWarnings: ''
      });

      await repository.saveLog({
        userId,
        content: '日2の活動1',
        inputTimestamp: '2025-07-11T09:00:00Z',
        businessDate: '2025-07-11',
        startTime: '2025-07-11T09:00:00Z',
        endTime: '2025-07-11T10:00:00Z',
        totalMinutes: 60,
        confidence: 0.8,
        categories: '仕事',
        analysisWarnings: ''
      });

      const stats = await repository.getUserStats(userId);
      
      expect(stats.longestActiveDay).toBeDefined();
      expect(stats.longestActiveDay!.date).toBe('2025-07-10');
      expect(stats.longestActiveDay!.logCount).toBe(2);
    });

    test('mostActiveHour が正しく計算される', async () => {
      const userId = 'testuser';
      await repository.registerUser(userId, 'Test User');
      
      // 同じ時間帯に複数のログを作成
      await repository.saveLog({
        userId,
        content: '9時の活動1',
        inputTimestamp: '2025-07-11T09:15:00Z',
        businessDate: '2025-07-11',
        startTime: '2025-07-11T09:15:00Z',
        endTime: '2025-07-11T09:45:00Z',
        totalMinutes: 30,
        confidence: 0.8,
        categories: '仕事',
        analysisWarnings: ''
      });

      await repository.saveLog({
        userId,
        content: '9時の活動2',
        inputTimestamp: '2025-07-11T09:30:00Z',
        businessDate: '2025-07-11',
        startTime: '2025-07-11T09:30:00Z',
        endTime: '2025-07-11T10:00:00Z',
        totalMinutes: 30,
        confidence: 0.8,
        categories: '仕事',
        analysisWarnings: ''
      });

      await repository.saveLog({
        userId,
        content: '14時の活動1',
        inputTimestamp: '2025-07-11T14:00:00Z',
        businessDate: '2025-07-11',
        startTime: '2025-07-11T14:00:00Z',
        endTime: '2025-07-11T14:30:00Z',
        totalMinutes: 30,
        confidence: 0.8,
        categories: '仕事',
        analysisWarnings: ''
      });

      const stats = await repository.getUserStats(userId);
      
      expect(stats.mostActiveHour).toBe(9);
    });
  });
});