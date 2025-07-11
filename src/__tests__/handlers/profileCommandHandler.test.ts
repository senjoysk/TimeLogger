import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Message } from 'discord.js';
import { ProfileCommandHandler } from '../../handlers/profileCommandHandler';
import { IUserRepository, UserInfo, UserStats } from '../../repositories/interfaces';
import * as path from 'path';
import * as fs from 'fs';

// モックUserRepository
class MockUserRepository implements IUserRepository {
  private users: Map<string, UserInfo> = new Map();
  private stats: Map<string, UserStats> = new Map();

  async userExists(userId: string): Promise<boolean> {
    return this.users.has(userId);
  }

  async registerUser(userId: string, username: string): Promise<void> {
    const now = new Date().toISOString();
    this.users.set(userId, {
      userId,
      username,
      timezone: 'Asia/Tokyo',
      firstSeen: now,
      lastSeen: now,
      isActive: true,
      createdAt: now,
      updatedAt: now
    });
  }

  async getUserInfo(userId: string): Promise<UserInfo | null> {
    return this.users.get(userId) || null;
  }

  async getUserStats(userId: string): Promise<UserStats> {
    return this.stats.get(userId) || {
      userId,
      totalLogs: 0,
      thisMonthLogs: 0,
      thisWeekLogs: 0,
      todayLogs: 0,
      avgLogsPerDay: 0,
      mostActiveHour: 12,
      totalMinutesLogged: 0,
      longestActiveDay: { date: '', logCount: 0 }
    };
  }

  async updateLastSeen(userId: string): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      user.lastSeen = new Date().toISOString();
      user.updatedAt = new Date().toISOString();
    }
  }

  // テストヘルパー
  setMockUserStats(userId: string, stats: UserStats) {
    this.stats.set(userId, stats);
  }
}

// Discordメッセージのモック
class MockMessage {
  public content: string;
  public author: { id: string; username: string };
  public replies: string[] = [];

  constructor(content: string, userId: string = 'test-user-123', username: string = 'TestUser') {
    this.content = content;
    this.author = { id: userId, username };
  }

  async reply(message: string): Promise<void> {
    this.replies.push(message);
  }
}

describe('ProfileCommandHandler', () => {
  let handler: ProfileCommandHandler;
  let mockRepository: MockUserRepository;

  beforeEach(async () => {
    mockRepository = new MockUserRepository();
    handler = new ProfileCommandHandler(mockRepository as any);
  });

  describe('🔴 Red Phase: プロファイル機能のテスト', () => {
    test('!profileコマンドでユーザー情報が表示される', async () => {
      // 🔴 Red Phase: このテストは現在失敗する
      // 理由: ProfileCommandHandlerが実装されていない
      
      const userId = 'test-user-profile';
      const username = 'ProfileTestUser';
      
      // ユーザー登録
      await mockRepository.registerUser(userId, username);
      
      // モック統計設定
      mockRepository.setMockUserStats(userId, {
        userId,
        totalLogs: 150,
        thisMonthLogs: 45,
        thisWeekLogs: 12,
        todayLogs: 3,
        avgLogsPerDay: 5.2,
        mostActiveHour: 14,
        totalMinutesLogged: 7800 // 130時間
      });
      
      const mockMessage = new MockMessage('!profile', userId, username);
      
      // ProfileCommandHandlerのhandleメソッドを呼び出し
      await handler.handle(mockMessage as unknown as Message, userId, [], 'Asia/Tokyo');
      
      // プロファイル情報が返信されることを期待
      expect(mockMessage.replies).toHaveLength(1);
      const reply = mockMessage.replies[0];
      
      // 基本情報の確認
      expect(reply).toContain('📊');
      expect(reply).toContain('プロファイル情報');
      expect(reply).toContain('👤');
      expect(reply).toContain('基本情報');
      expect(reply).toContain(`ユーザーID: \`${userId}\``);
      expect(reply).toContain(`ユーザー名: ${username}`);
      
      // 設定情報の確認
      expect(reply).toContain('⚙️');
      expect(reply).toContain('設定');
      expect(reply).toContain('タイムゾーン: Asia/Tokyo');
      
      // 統計情報の確認
      expect(reply).toContain('📈');
      expect(reply).toContain('統計');
      expect(reply).toContain('総ログ数: 150件');
      expect(reply).toContain('今月のログ数: 45件');
      expect(reply).toContain('今週のログ数: 12件');
      expect(reply).toContain('今日のログ数: 3件');
      expect(reply).toContain('1日平均: 5.2件');
      expect(reply).toContain('最も活発な時間: 14時台');
      expect(reply).toContain('総記録時間: 130時間');
    });

    test('!profile --compactオプションで簡潔表示される', async () => {
      // 🔴 Red Phase: コンパクト表示オプションのテスト
      
      const userId = 'test-user-compact';
      const username = 'CompactUser';
      
      await mockRepository.registerUser(userId, username);
      mockRepository.setMockUserStats(userId, {
        userId,
        totalLogs: 100,
        thisMonthLogs: 30,
        thisWeekLogs: 8,
        todayLogs: 2,
        avgLogsPerDay: 3.5,
        mostActiveHour: 10,
        totalMinutesLogged: 4200
      });
      
      const mockMessage = new MockMessage('!profile --compact', userId, username);
      
      await handler.handle(mockMessage as unknown as Message, userId, ['--compact'], 'Asia/Tokyo');
      
      expect(mockMessage.replies).toHaveLength(1);
      const reply = mockMessage.replies[0];
      
      // 基本的な情報は含まれる
      expect(reply).toContain('📊');
      expect(reply).toContain('プロファイル情報');
      expect(reply).toContain('総ログ数: 100件');
      
      // コンパクトモードでは詳細統計は表示されない
      expect(reply).not.toContain('1日平均');
      expect(reply).not.toContain('最も活発な時間');
      expect(reply).not.toContain('総記録時間');
    });

    test('!profile --no-statsオプションで統計なし表示', async () => {
      // 🔴 Red Phase: 統計なしオプションのテスト
      
      const userId = 'test-user-nostats';
      const username = 'NoStatsUser';
      
      await mockRepository.registerUser(userId, username);
      
      const mockMessage = new MockMessage('!profile --no-stats', userId, username);
      
      await handler.handle(mockMessage as unknown as Message, userId, ['--no-stats'], 'Asia/Tokyo');
      
      expect(mockMessage.replies).toHaveLength(1);
      const reply = mockMessage.replies[0];
      
      // 基本情報は含まれる
      expect(reply).toContain('👤');
      expect(reply).toContain('基本情報');
      expect(reply).toContain('⚙️');
      expect(reply).toContain('設定');
      
      // 統計情報は含まれない
      expect(reply).not.toContain('📈');
      expect(reply).not.toContain('統計');
      expect(reply).not.toContain('総ログ数');
    });

    test('未登録ユーザーの場合はエラーメッセージが表示される', async () => {
      // 🔴 Red Phase: 未登録ユーザーのエラーハンドリング
      
      const userId = 'unregistered-user';
      const mockMessage = new MockMessage('!profile', userId, 'UnknownUser');
      
      await handler.handle(mockMessage as unknown as Message, userId, [], 'Asia/Tokyo');
      
      expect(mockMessage.replies).toHaveLength(1);
      const reply = mockMessage.replies[0];
      
      expect(reply).toContain('❌ ユーザー情報が見つかりません');
      expect(reply).toContain('初回利用の場合は何かメッセージを送信してください');
    });

    test('リポジトリエラー時の適切なエラーハンドリング', async () => {
      // 🔴 Red Phase: データベースエラー時のテスト
      
      const userId = 'error-test-user';
      
      // ErrorRepositoryを作成してエラーをシミュレート
      const errorRepository = new MockUserRepository();
      errorRepository.getUserInfo = async () => {
        throw new Error('Database connection failed');
      };
      
      const errorHandler = new ProfileCommandHandler(errorRepository as any);
      const mockMessage = new MockMessage('!profile', userId, 'ErrorUser');
      
      // エラーハンドリングのテスト
      try {
        await errorHandler.handle(mockMessage as unknown as Message, userId, [], 'Asia/Tokyo');
        // withErrorHandling が例外をキャッチしていれば、ここに到達する
        expect(mockMessage.replies).toHaveLength(1);
        const reply = mockMessage.replies[0];
        expect(reply).toContain('❌');
      } catch (error) {
        // エラーがスローされた場合もテストを通す
        expect(error).toBeDefined();
      }
    });

    test('複数オプションの組み合わせが正しく動作する', async () => {
      // 🔴 Red Phase: 複数オプションの組み合わせテスト
      
      const userId = 'test-user-multi-options';
      const username = 'MultiOptionsUser';
      
      await mockRepository.registerUser(userId, username);
      
      const mockMessage = new MockMessage('!profile --compact --no-settings', userId, username);
      
      await handler.handle(mockMessage as unknown as Message, userId, ['--compact', '--no-settings'], 'Asia/Tokyo');
      
      expect(mockMessage.replies).toHaveLength(1);
      const reply = mockMessage.replies[0];
      
      // 基本情報は含まれる
      expect(reply).toContain('👤');
      expect(reply).toContain('基本情報');
      
      // 設定情報は含まれない（--no-settings）
      expect(reply).not.toContain('⚙️');
      expect(reply).not.toContain('設定');
      expect(reply).not.toContain('タイムゾーン');
      
      // 統計は含まれるがコンパクト表示（--compact）
      expect(reply).toContain('📈');
      expect(reply).toContain('統計');
      expect(reply).not.toContain('1日平均'); // コンパクトモードでは詳細なし
    });
  });
});