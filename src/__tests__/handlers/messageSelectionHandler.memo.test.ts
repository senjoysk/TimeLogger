/**
 * MessageSelectionHandler MEMOボタン機能のテスト
 */

import { MessageSelectionHandler } from '../../handlers/messageSelectionHandler';
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

const mockInteraction = {
  customId: 'select_MEMO',
  update: jest.fn(),
  editReply: jest.fn(),
  replied: false,
  deferred: false
};

const mockMessage = {
  content: 'テストメモ内容',
  reply: jest.fn()
};

describe('MessageSelectionHandler MEMOボタン機能テスト', () => {
  let handler: MessageSelectionHandler;
  const userId = 'test-user-123';
  const timezone = 'Asia/Tokyo';

  beforeEach(() => {
    jest.clearAllMocks();
    handler = new MessageSelectionHandler();
    handler.setMemoRepository(mockMemoRepository);
  });

  describe('MEMOボタン選択時の処理', () => {
    test('MEMOボタンを押すとメモが正常に保存される', async () => {
      // Arrange
      const createdMemo: Memo = {
        id: 'memo123',
        userId,
        content: 'テストメモ内容',
        tags: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      };

      mockMemoRepository.createMemo.mockResolvedValue(createdMemo);
      mockInteraction.update.mockResolvedValue(undefined);
      mockInteraction.editReply.mockResolvedValue(undefined);

      // メッセージを保存
      await handler.showSelectionUI(mockMessage as any, userId, 'テストメモ内容');

      // Act
      await handler.handleButtonInteraction(mockInteraction as any, userId, timezone);

      // Assert
      expect(mockMemoRepository.createMemo).toHaveBeenCalledWith({
        userId,
        content: 'テストメモ内容',
        tags: []
      });
      
      expect(mockInteraction.update).toHaveBeenCalledWith({
        content: '📄 メモ保存中...',
        embeds: [],
        components: []
      });
      
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: '📄 メモとして保存しました！'
      });
    });

    test('メモリポジトリが設定されていない場合でもエラーにならない', async () => {
      // Arrange
      const handlerWithoutRepo = new MessageSelectionHandler();
      // メモリポジトリを設定しない

      mockInteraction.update.mockResolvedValue(undefined);
      mockInteraction.editReply.mockResolvedValue(undefined);

      // メッセージを保存
      await handlerWithoutRepo.showSelectionUI(mockMessage as any, userId, 'テストメモ内容');

      // Act
      await handlerWithoutRepo.handleButtonInteraction(mockInteraction as any, userId, timezone);

      // Assert
      expect(mockMemoRepository.createMemo).not.toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: '📄 メモとして保存しました！'
      });
    });

    test('メモ保存中にエラーが発生した場合、適切にエラーハンドリングされる', async () => {
      // Arrange
      const error = new Error('データベース接続エラー');
      mockMemoRepository.createMemo.mockRejectedValue(error);
      mockInteraction.update.mockResolvedValue(undefined);
      mockInteraction.editReply.mockResolvedValue(undefined);

      // メッセージを保存
      await handler.showSelectionUI(mockMessage as any, userId, 'テストメモ内容');

      // Act
      await handler.handleButtonInteraction(mockInteraction as any, userId, timezone);

      // Assert
      expect(mockMemoRepository.createMemo).toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: '❌ メモ保存中にエラーが発生しました: データベース接続エラー'
      });
    });

    test('メッセージ内容が空の場合でもエラーにならない', async () => {
      // Arrange
      mockInteraction.update.mockResolvedValue(undefined);
      mockInteraction.editReply.mockResolvedValue(undefined);

      // 空のメッセージを保存
      await handler.showSelectionUI(mockMessage as any, userId, '');

      // Act
      await handler.handleButtonInteraction(mockInteraction as any, userId, timezone);

      // Assert
      expect(mockMemoRepository.createMemo).not.toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: '📄 メモとして保存しました！'
      });
    });
  });

  describe('統合テスト', () => {
    test('メッセージ選択UIからMEMOボタンまでの全体フロー', async () => {
      // Arrange
      const createdMemo: Memo = {
        id: 'memo456',
        userId,
        content: '統合テストメモ',
        tags: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      };

      mockMemoRepository.createMemo.mockResolvedValue(createdMemo);
      mockMessage.reply.mockResolvedValue(undefined);
      mockInteraction.update.mockResolvedValue(undefined);
      mockInteraction.editReply.mockResolvedValue(undefined);

      // Act 1: 選択UI表示
      await handler.showSelectionUI(mockMessage as any, userId, '統合テストメモ');

      // Assert 1: UIが正しく表示される
      expect(mockMessage.reply).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: '📝 メッセージの種類を選択してください'
            })
          })
        ]),
        components: expect.arrayContaining([
          expect.objectContaining({
            components: expect.arrayContaining([
              expect.objectContaining({
                data: expect.objectContaining({
                  custom_id: 'select_MEMO',
                  label: '📄 メモ'
                })
              })
            ])
          })
        ])
      });

      // Act 2: MEMOボタンクリック
      await handler.handleButtonInteraction(mockInteraction as any, userId, timezone);

      // Assert 2: メモが正常に保存される
      expect(mockMemoRepository.createMemo).toHaveBeenCalledWith({
        userId,
        content: '統合テストメモ',
        tags: []
      });

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: '📄 メモとして保存しました！'
      });

      // Assert 3: 保存されたメッセージがクリアされる
      expect(handler.getStoredMessage(userId)).toBeUndefined();
    });
  });
});