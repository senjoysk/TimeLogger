/**
 * MorningMessageRecoveryクラスのテスト
 * TDD: Red Phase - 失敗するテストを先に書く
 */

import { MorningMessageRecovery } from '../../services/morningMessageRecovery';
import { Client, Collection, DMChannel, Message, User } from 'discord.js';
import { INightSuspendRepository } from '../../repositories/interfaces';

// モック作成
const mockRepository = {
  existsByDiscordMessageId: jest.fn(),
  getByDiscordMessageId: jest.fn(),
  getUnprocessedMessages: jest.fn(),
  markAsRecoveryProcessed: jest.fn(),
  saveSuspendState: jest.fn(),
  getLastSuspendState: jest.fn(),
  createActivityLogFromDiscord: jest.fn(),
} as jest.Mocked<INightSuspendRepository>;

const mockFetch = jest.fn();
const mockClient = {
  users: {
    fetch: mockFetch,
  },
} as unknown as jest.Mocked<Client>;

const mockCreateDM = jest.fn();
const mockSend = jest.fn();
const mockUser = {
  id: 'test-user-id',
  createDM: mockCreateDM,
  send: mockSend,
} as unknown as jest.Mocked<User>;

const mockMessagesFetch = jest.fn();
const mockChannel = {
  messages: {
    fetch: mockMessagesFetch,
  },
} as unknown as jest.Mocked<DMChannel>;

describe('🔴 Red Phase: MorningMessageRecovery クラス', () => {
  let recovery: MorningMessageRecovery;
  const targetUserId = 'test-user-id';
  const config = {
    targetUserId,
    timezone: 'Asia/Tokyo',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockClear();
    mockCreateDM.mockClear();
    mockSend.mockClear();
    mockMessagesFetch.mockClear();
    recovery = new MorningMessageRecovery(mockClient, mockRepository, config);
  });

  describe('コンストラクタ', () => {
    test('正しいパラメータでインスタンスを作成できる', () => {
      expect(recovery).toBeInstanceOf(MorningMessageRecovery);
    });

    test('必要な依存関係が設定される', () => {
      expect(recovery).toBeDefined();
      expect(recovery['client']).toBe(mockClient);
      expect(recovery['repository']).toBe(mockRepository);
      expect(recovery['config']).toBe(config);
    });
  });

  describe('recoverNightMessages メソッド', () => {
    test('夜間メッセージリカバリを実行する', async () => {
      // モックセットアップ
      mockFetch.mockResolvedValue(mockUser);
      mockCreateDM.mockResolvedValue(mockChannel);
      
      const mockMessages = new Collection<string, Message>();
      const mockMessage = {
        id: 'msg-123',
        content: 'テストメッセージ',
        author: { id: targetUserId, bot: false },
        createdAt: new Date('2025-01-01T01:00:00Z'),
      } as Message;
      
      mockMessages.set('msg-123', mockMessage);
      mockMessagesFetch.mockResolvedValue(mockMessages);
      
      mockRepository.existsByDiscordMessageId.mockResolvedValue(false);
      mockRepository.createActivityLogFromDiscord.mockResolvedValue({
        id: 'log-123',
        user_id: targetUserId,
        content: 'テストメッセージ',
        discord_message_id: 'msg-123',
        recovery_processed: true,
      });

      const result = await recovery.recoverNightMessages();

      expect(result).toBeDefined();
      expect(result.length).toBe(1);
      expect(mockRepository.createActivityLogFromDiscord).toHaveBeenCalledWith({
        user_id: targetUserId,
        content: 'テストメッセージ',
        input_timestamp: '2025-01-01T01:00:00.000Z',
        business_date: '2024-12-31', // 5am基準での業務日
        discord_message_id: 'msg-123',
        recovery_processed: true,
        recovery_timestamp: expect.any(String),
      });
    });

    test('時間範囲を正しく計算する', async () => {
      // 現在時刻を2025-01-01T07:00:00Zに固定
      const fixedDate = new Date('2025-01-01T07:00:00Z');
      jest.spyOn(Date, 'now').mockReturnValue(fixedDate.getTime());

      mockFetch.mockResolvedValue(mockUser);
      mockCreateDM.mockResolvedValue(mockChannel);
      mockMessagesFetch.mockResolvedValue(new Collection());

      await recovery.recoverNightMessages();

      // 期待される時間範囲：2025-01-01T00:00:00Z から 2025-01-01T07:00:00Z
      expect(mockFetch).toHaveBeenCalledWith(targetUserId);
      expect(mockCreateDM).toHaveBeenCalled();
      expect(mockMessagesFetch).toHaveBeenCalled();
    });

    test('重複メッセージをスキップする', async () => {
      mockFetch.mockResolvedValue(mockUser);
      mockCreateDM.mockResolvedValue(mockChannel);
      
      const mockMessages = new Collection<string, Message>();
      const mockMessage = {
        id: 'msg-123',
        content: 'テストメッセージ',
        author: { id: targetUserId, bot: false },
        createdAt: new Date('2025-01-01T01:00:00Z'),
      } as Message;
      
      mockMessages.set('msg-123', mockMessage);
      mockMessagesFetch.mockResolvedValue(mockMessages);
      
      // 既に処理済みのメッセージとしてモック
      mockRepository.existsByDiscordMessageId.mockResolvedValue(true);

      const result = await recovery.recoverNightMessages();

      expect(result.length).toBe(0);
      expect(mockRepository.createActivityLogFromDiscord).not.toHaveBeenCalled();
    });

    test('Botメッセージをスキップする', async () => {
      mockFetch.mockResolvedValue(mockUser);
      mockCreateDM.mockResolvedValue(mockChannel);
      
      const mockMessages = new Collection<string, Message>();
      const mockMessage = {
        id: 'msg-123',
        content: 'Botメッセージ',
        author: { id: 'bot-id', bot: true },
        createdAt: new Date('2025-01-01T01:00:00Z'),
      } as Message;
      
      mockMessages.set('msg-123', mockMessage);
      mockMessagesFetch.mockResolvedValue(mockMessages);

      const result = await recovery.recoverNightMessages();

      expect(result.length).toBe(0);
      expect(mockRepository.existsByDiscordMessageId).not.toHaveBeenCalled();
    });

    test('対象ユーザー以外のメッセージをスキップする', async () => {
      mockFetch.mockResolvedValue(mockUser);
      mockCreateDM.mockResolvedValue(mockChannel);
      
      const mockMessages = new Collection<string, Message>();
      const mockMessage = {
        id: 'msg-123',
        content: 'テストメッセージ',
        author: { id: 'other-user-id', bot: false },
        createdAt: new Date('2025-01-01T01:00:00Z'),
      } as Message;
      
      mockMessages.set('msg-123', mockMessage);
      mockMessagesFetch.mockResolvedValue(mockMessages);

      const result = await recovery.recoverNightMessages();

      expect(result.length).toBe(0);
      expect(mockRepository.existsByDiscordMessageId).not.toHaveBeenCalled();
    });
  });

  describe('fetchMessagesBetween メソッド', () => {
    test('指定された時間範囲のメッセージを取得する', async () => {
      const startTime = new Date('2025-01-01T00:00:00Z');
      const endTime = new Date('2025-01-01T07:00:00Z');
      
      mockFetch.mockResolvedValue(mockUser);
      mockCreateDM.mockResolvedValue(mockChannel);
      
      const mockMessages = new Collection<string, Message>();
      const mockMessage = {
        id: 'msg-123',
        createdAt: new Date('2025-01-01T01:00:00Z'),
      } as Message;
      
      mockMessages.set('msg-123', mockMessage);
      mockMessagesFetch.mockResolvedValue(mockMessages);

      const result = await recovery.recoverNightMessages();

      expect(mockMessagesFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 100,
        })
      );
    });

    test('時間範囲外のメッセージを除外する', async () => {
      mockFetch.mockResolvedValue(mockUser);
      mockCreateDM.mockResolvedValue(mockChannel);
      
      const mockMessages = new Collection<string, Message>();
      
      // 時間範囲外のメッセージ
      const outOfRangeMessage = {
        id: 'msg-out',
        content: '範囲外メッセージ',
        author: { id: targetUserId, bot: false },
        createdAt: new Date('2025-01-01T08:00:00Z'), // 7:00以降
      } as Message;
      
      mockMessages.set('msg-out', outOfRangeMessage);
      mockMessagesFetch.mockResolvedValue(mockMessages);

      const result = await recovery.recoverNightMessages();

      expect(result.length).toBe(0);
    });
  });

  describe('sendRecoveryReport メソッド', () => {
    test('処理完了レポートを送信する', async () => {
      mockFetch.mockResolvedValue(mockUser);
      mockCreateDM.mockResolvedValue(mockChannel);
      mockMessagesFetch.mockResolvedValue(new Collection());

      await recovery.recoverNightMessages();

      expect(mockSend).toHaveBeenCalledWith(
        expect.stringContaining('🌅 **朝のメッセージリカバリ完了**')
      );
    });

    test('処理されたメッセージ数を正しく報告する', async () => {
      const mockSend = jest.fn();
      mockUser.send = mockSend;
      
      mockFetch.mockResolvedValue(mockUser);
      mockCreateDM.mockResolvedValue(mockChannel);
      
      const mockMessages = new Collection<string, Message>();
      const mockMessage = {
        id: 'msg-123',
        content: 'テストメッセージ',
        author: { id: targetUserId, bot: false },
        createdAt: new Date('2025-01-01T01:00:00Z'),
      } as Message;
      
      mockMessages.set('msg-123', mockMessage);
      mockMessagesFetch.mockResolvedValue(mockMessages);
      
      mockRepository.existsByDiscordMessageId.mockResolvedValue(false);
      mockRepository.createActivityLogFromDiscord.mockResolvedValue({
        id: 'log-123',
        discord_message_id: 'msg-123',
      });

      await recovery.recoverNightMessages();

      expect(mockSend).toHaveBeenCalledWith(
        expect.stringContaining('処理済みメッセージ: 1件')
      );
    });
  });

  describe('getBusinessDate メソッド', () => {
    test('5am基準で業務日を計算する', () => {
      // 2025-01-01T01:00:00Z (5am前) → 2024-12-31
      const result1 = recovery['getBusinessDate'](new Date('2025-01-01T01:00:00Z'));
      expect(result1).toBe('2024-12-31');
      
      // 2025-01-01T06:00:00Z (5am後) → 2025-01-01
      const result2 = recovery['getBusinessDate'](new Date('2025-01-01T06:00:00Z'));
      expect(result2).toBe('2025-01-01');
    });
  });

  describe('エラーハンドリング', () => {
    test('Discord API エラーをハンドリングする', async () => {
      mockFetch.mockRejectedValue(new Error('Discord API Error'));

      await expect(recovery.recoverNightMessages()).rejects.toThrow('Discord API Error');
    });

    test('リポジトリエラーをハンドリングする', async () => {
      mockFetch.mockResolvedValue(mockUser);
      mockCreateDM.mockResolvedValue(mockChannel);
      
      const mockMessages = new Collection<string, Message>();
      const mockMessage = {
        id: 'msg-123',
        content: 'テストメッセージ',
        author: { id: targetUserId, bot: false },
        createdAt: new Date('2025-01-01T01:00:00Z'),
      } as Message;
      
      mockMessages.set('msg-123', mockMessage);
      mockMessagesFetch.mockResolvedValue(mockMessages);
      
      mockRepository.existsByDiscordMessageId.mockResolvedValue(false);
      mockRepository.createActivityLogFromDiscord.mockRejectedValue(new Error('Repository Error'));

      // エラーが発生してもリカバリ処理は継続される
      const result = await recovery.recoverNightMessages();
      
      expect(result.length).toBe(0);
    });
  });
});