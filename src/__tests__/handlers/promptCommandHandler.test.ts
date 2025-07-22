/**
 * 🔴 Red Phase: PromptCommandHandler テスト
 * TDDアプローチ: 実装前のテスト作成
 */

import { PromptCommandHandler } from '../../handlers/promptCommandHandler';
import { IActivityPromptRepository } from '../../repositories/interfaces';
import { 
  ActivityPromptSettings, 
  CreateActivityPromptSettingsRequest,
  UpdateActivityPromptSettingsRequest 
} from '../../types/activityPrompt';

// 簡略化されたMock
interface MockMessage {
  reply: jest.Mock;
  content: string;
  author: {
    id: string;
    username: string;
  };
}

describe('🔴 Red Phase: PromptCommandHandler', () => {
  let handler: PromptCommandHandler;
  let mockRepository: jest.Mocked<IActivityPromptRepository>;
  let mockMessage: MockMessage;
  const testUserId = 'test-user-123';
  const testTimezone = 'Asia/Tokyo';

  beforeEach(() => {
    // Repository モック
    mockRepository = {
      createSettings: jest.fn(),
      getSettings: jest.fn(),
      updateSettings: jest.fn(),
      deleteSettings: jest.fn(),
      getEnabledSettings: jest.fn(),
      getUsersToPromptAt: jest.fn(),
      enablePrompt: jest.fn(),
      disablePrompt: jest.fn(),
      settingsExists: jest.fn()
    };

    // Message モック
    mockMessage = {
      reply: jest.fn().mockResolvedValue(undefined),
      content: '',
      author: {
        id: testUserId,
        username: 'testuser'
      }
    };

    handler = new PromptCommandHandler(mockRepository);
  });

  describe('コマンド解析', () => {
    test('ON コマンドを解析できる', async () => {
      mockRepository.settingsExists.mockResolvedValue(false);
      mockRepository.createSettings.mockResolvedValue({
        userId: testUserId,
        isEnabled: true,
        startHour: 8,
        startMinute: 30,
        endHour: 18,
        endMinute: 0,
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z'
      });

      await handler.handleCommand(
        mockMessage as any,
        ['on'],
        testUserId,
        testTimezone
      );

      expect(mockRepository.createSettings).toHaveBeenCalledWith({
        userId: testUserId,
        isEnabled: true
      });
      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('✅ 活動促し通知を有効にしました')
      );
    });

    test('OFF コマンドを解析できる', async () => {
      mockRepository.settingsExists.mockResolvedValue(true);

      await handler.handleCommand(
        mockMessage as any,
        ['off'],
        testUserId,
        testTimezone
      );

      expect(mockRepository.disablePrompt).toHaveBeenCalledWith(testUserId);
      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('❌ 活動促し通知を無効にしました')
      );
    });

    test('時刻設定コマンドを解析できる', async () => {
      mockRepository.settingsExists.mockResolvedValue(true);

      await handler.handleCommand(
        mockMessage as any,
        ['time', '9:00', '17:30'],
        testUserId,
        testTimezone
      );

      expect(mockRepository.updateSettings).toHaveBeenCalledWith(testUserId, {
        startHour: 9,
        startMinute: 0,
        endHour: 17,
        endMinute: 30
      });
      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('⏰ 通知時間を設定しました')
      );
    });

    test('ステータス表示コマンドを解析できる', async () => {
      const mockSettings: ActivityPromptSettings = {
        userId: testUserId,
        isEnabled: true,
        startHour: 9,
        startMinute: 0,
        endHour: 17,
        endMinute: 30,
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z'
      };

      mockRepository.getSettings.mockResolvedValue(mockSettings);

      await handler.handleCommand(
        mockMessage as any,
        ['status'],
        testUserId,
        testTimezone
      );

      expect(mockRepository.getSettings).toHaveBeenCalledWith(testUserId);
      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                title: '📋 活動促し通知設定'
              })
            })
          ])
        })
      );
    });

    test('ヘルプコマンドを解析できる', async () => {
      await handler.handleCommand(
        mockMessage as any,
        ['help'],
        testUserId,
        testTimezone
      );

      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                title: '🤖 活動促し通知ヘルプ'
              })
            })
          ])
        })
      );
    });
  });

  describe('エラーハンドリング', () => {
    test('無効な時刻フォーマットでエラー', async () => {
      await handler.handleCommand(
        mockMessage as any,
        ['time', '25:00', '17:30'],
        testUserId,
        testTimezone
      );

      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('❌ 無効な時刻形式です')
      );
    });

    test('設定が存在しない状態でOFFコマンドでエラー', async () => {
      mockRepository.settingsExists.mockResolvedValue(false);

      await handler.handleCommand(
        mockMessage as any,
        ['off'],
        testUserId,
        testTimezone
      );

      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('❌ 設定が存在しません')
      );
    });

    test('引数不足でエラー', async () => {
      await handler.handleCommand(
        mockMessage as any,
        ['time', '9:00'],
        testUserId,
        testTimezone
      );

      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('❌ 開始時刻と終了時刻の両方を指定してください')
      );
    });

    test('無効な分（0,30以外）でエラー', async () => {
      await handler.handleCommand(
        mockMessage as any,
        ['time', '9:15', '17:45'],
        testUserId,
        testTimezone
      );

      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('❌ 分は0または30を指定してください')
      );
    });
  });

  describe('設定管理', () => {
    test('初回設定では自動的に設定を作成', async () => {
      mockRepository.settingsExists.mockResolvedValue(false);
      mockRepository.createSettings.mockResolvedValue({
        userId: testUserId,
        isEnabled: true,
        startHour: 8,
        startMinute: 30,
        endHour: 18,
        endMinute: 0,
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z'
      });

      await handler.handleCommand(
        mockMessage as any,
        ['on'],
        testUserId,
        testTimezone
      );

      expect(mockRepository.createSettings).toHaveBeenCalledWith({
        userId: testUserId,
        isEnabled: true
      });
    });

    test('既存設定がある場合は更新', async () => {
      mockRepository.settingsExists.mockResolvedValue(true);

      await handler.handleCommand(
        mockMessage as any,
        ['on'],
        testUserId,
        testTimezone
      );

      expect(mockRepository.enablePrompt).toHaveBeenCalledWith(testUserId);
    });
  });

  describe('時刻フォーマット', () => {
    test('HH:MM形式を正しく解析', async () => {
      mockRepository.settingsExists.mockResolvedValue(true);

      await handler.handleCommand(
        mockMessage as any,
        ['time', '08:30', '18:00'],
        testUserId,
        testTimezone
      );

      expect(mockRepository.updateSettings).toHaveBeenCalledWith(testUserId, {
        startHour: 8,
        startMinute: 30,
        endHour: 18,
        endMinute: 0
      });
    });

    test('H:MM形式を正しく解析', async () => {
      mockRepository.settingsExists.mockResolvedValue(true);

      await handler.handleCommand(
        mockMessage as any,
        ['time', '9:30', '17:00'],
        testUserId,
        testTimezone
      );

      expect(mockRepository.updateSettings).toHaveBeenCalledWith(testUserId, {
        startHour: 9,
        startMinute: 30,
        endHour: 17,
        endMinute: 0
      });
    });
  });

  describe('未知のコマンド', () => {
    test('未知のコマンドでヘルプを表示', async () => {
      await handler.handleCommand(
        mockMessage as any,
        ['unknown'],
        testUserId,
        testTimezone
      );

      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('❌ 未知のコマンドです')
      );
    });

    test('引数なしでヘルプを表示', async () => {
      await handler.handleCommand(
        mockMessage as any,
        [],
        testUserId,
        testTimezone
      );

      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                title: '🤖 活動促し通知ヘルプ'
              })
            })
          ])
        })
      );
    });
  });
});