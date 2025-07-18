/**
 * 🔴 Red Phase: メモコマンドハンドラーのテスト
 */

import { Message } from 'discord.js';
import { MemoCommandHandler } from '../../handlers/memoCommandHandler';
import { IMemoRepository } from '../../repositories/interfaces';
import { Memo } from '../../types/memo';

// モックの設定
const mockMemoRepository: jest.Mocked<IMemoRepository> = {
  createMemo: jest.fn(),
  getMemosByUserId: jest.fn(),
  getMemoById: jest.fn(),
  updateMemo: jest.fn(),
  deleteMemo: jest.fn(),
  searchMemos: jest.fn(),
  getMemosByTag: jest.fn()
};

const mockMessage = {
  reply: jest.fn(),
  author: { id: 'user123' }
} as unknown as Message;

describe('🔴 Red Phase: MemoCommandHandler', () => {
  let handler: MemoCommandHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    handler = new MemoCommandHandler(mockMemoRepository);
  });

  describe('!memo list コマンド', () => {
    test('メモ一覧を表示する', async () => {
      // Arrange
      const mockMemos: Memo[] = [
        {
          id: 'memo1',
          userId: 'user123',
          content: 'テストメモ1',
          tags: ['work'],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z'
        },
        {
          id: 'memo2',
          userId: 'user123',
          content: 'テストメモ2',
          tags: ['personal'],
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z'
        }
      ];

      mockMemoRepository.getMemosByUserId.mockResolvedValue(mockMemos);

      // Act
      await handler.handleCommand(mockMessage, []);

      // Assert
      expect(mockMemoRepository.getMemosByUserId).toHaveBeenCalledWith('user123');
      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                title: expect.stringContaining('📝 メモ一覧')
              })
            })
          ])
        })
      );
    });

    test('メモが0件の場合、適切なメッセージを表示する', async () => {
      // Arrange
      mockMemoRepository.getMemosByUserId.mockResolvedValue([]);

      // Act
      await handler.handleCommand(mockMessage, []);

      // Assert
      expect(mockMessage.reply).toHaveBeenCalledWith('📝 メモがありません。`!memo add <内容>` でメモを追加してください。');
    });
  });

  describe('!memo add コマンド', () => {
    test('メモを追加する', async () => {
      // Arrange
      const newMemo: Memo = {
        id: 'memo123',
        userId: 'user123',
        content: '新しいメモ',
        tags: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      };

      mockMemoRepository.createMemo.mockResolvedValue(newMemo);

      // Act
      await handler.handleCommand(mockMessage, ['add', '新しいメモ']);

      // Assert
      expect(mockMemoRepository.createMemo).toHaveBeenCalledWith({
        userId: 'user123',
        content: '新しいメモ',
        tags: []
      });
      expect(mockMessage.reply).toHaveBeenCalledWith('✅ メモ「新しいメモ」を追加しました！');
    });

    test('内容が空の場合、エラーメッセージを表示する', async () => {
      // Act
      await handler.handleCommand(mockMessage, ['add']);

      // Assert
      expect(mockMessage.reply).toHaveBeenCalledWith('❌ メモ内容を入力してください。例: `!memo add 覚えておきたいこと`\n\n使用方法: `!memo help` でヘルプを確認してください。');
    });
  });

  describe('!memo delete コマンド', () => {
    test('メモを削除する', async () => {
      // Arrange
      const existingMemo: Memo = {
        id: 'memo123',
        userId: 'user123',
        content: '削除するメモ',
        tags: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      };

      mockMemoRepository.getMemoById.mockResolvedValue(existingMemo);

      // Act
      await handler.handleCommand(mockMessage, ['delete', 'memo123']);

      // Assert
      expect(mockMemoRepository.getMemoById).toHaveBeenCalledWith('memo123');
      expect(mockMemoRepository.deleteMemo).toHaveBeenCalledWith('memo123');
      expect(mockMessage.reply).toHaveBeenCalledWith('🗑️ メモ「削除するメモ」を削除しました。');
    });

    test('存在しないメモIDの場合、エラーメッセージを表示する', async () => {
      // Arrange
      mockMemoRepository.getMemoById.mockResolvedValue(null);

      // Act
      await handler.handleCommand(mockMessage, ['delete', 'nonexistent']);

      // Assert
      expect(mockMessage.reply).toHaveBeenCalledWith('❌ 指定されたメモが見つかりません。');
    });

    test('他のユーザーのメモを削除しようとした場合、エラーメッセージを表示する', async () => {
      // Arrange
      const otherUserMemo: Memo = {
        id: 'memo123',
        userId: 'other-user',
        content: '他のユーザーのメモ',
        tags: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      };

      mockMemoRepository.getMemoById.mockResolvedValue(otherUserMemo);

      // Act
      await handler.handleCommand(mockMessage, ['delete', 'memo123']);

      // Assert
      expect(mockMessage.reply).toHaveBeenCalledWith('❌ 他のユーザーのメモは削除できません。');
    });
  });

  describe('!memo search コマンド', () => {
    test('キーワードでメモを検索する', async () => {
      // Arrange
      const searchResults: Memo[] = [
        {
          id: 'memo1',
          userId: 'user123',
          content: 'TypeScriptの勉強メモ',
          tags: ['study'],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z'
        }
      ];

      mockMemoRepository.searchMemos.mockResolvedValue(searchResults);

      // Act
      await handler.handleCommand(mockMessage, ['search', 'TypeScript']);

      // Assert
      expect(mockMemoRepository.searchMemos).toHaveBeenCalledWith('user123', 'TypeScript');
      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                title: expect.stringContaining('🔍 検索結果: "TypeScript"')
              })
            })
          ])
        })
      );
    });

    test('検索結果が0件の場合、適切なメッセージを表示する', async () => {
      // Arrange
      mockMemoRepository.searchMemos.mockResolvedValue([]);

      // Act
      await handler.handleCommand(mockMessage, ['search', 'nonexistent']);

      // Assert
      expect(mockMessage.reply).toHaveBeenCalledWith('🔍 「nonexistent」に一致するメモが見つかりませんでした。');
    });
  });

  describe('!memo help コマンド', () => {
    test('ヘルプメッセージを表示する', async () => {
      // Act
      await handler.handleCommand(mockMessage, ['help']);

      // Assert
      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                title: expect.stringContaining('📝 メモコマンドヘルプ')
              })
            })
          ])
        })
      );
    });
  });
});