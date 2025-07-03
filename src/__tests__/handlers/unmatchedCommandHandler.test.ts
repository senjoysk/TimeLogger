/**
 * UnmatchedCommandHandlerのテスト
 * TDD Red-Green-Refactorサイクルで実装
 */

import { UnmatchedCommandHandler } from '../../handlers/unmatchedCommandHandler';
import { IActivityLogService } from '../../services/activityLogService';
import { ActivityLog, ActivityLogError } from '../../types/activityLog';

describe('UnmatchedCommandHandler', () => {
  let handler: UnmatchedCommandHandler;
  let mockActivityLogService: jest.Mocked<IActivityLogService>;
  let mockMessage: any;

  beforeEach(() => {
    // モックサービスの作成
    mockActivityLogService = {
      getUnmatchedLogs: jest.fn(),
      manualMatchLogs: jest.fn(),
      recordActivity: jest.fn(),
      getLogsForDate: jest.fn(),
      getLogsForEdit: jest.fn(),
      editLog: jest.fn(),
      deleteLog: jest.fn(),
      getLatestLogs: jest.fn(),
      searchLogs: jest.fn(),
      getStatistics: jest.fn(),
      formatLogsForEdit: jest.fn(),
      formatSearchResults: jest.fn(),
      calculateBusinessDate: jest.fn(),
    };

    // モックメッセージの作成
    mockMessage = {
      reply: jest.fn().mockResolvedValue(undefined),
      author: { id: 'test-user' }
    };

    handler = new UnmatchedCommandHandler(mockActivityLogService);
  });

  describe('🔴 Red: コマンド解析機能', () => {
    it('引数なしの場合はlistコマンドとして解析される', async () => {
      // Arrange
      mockActivityLogService.getUnmatchedLogs.mockResolvedValue([]);

      // Act
      await handler.handle(mockMessage, 'test-user', [], 'Asia/Tokyo');

      // Assert
      expect(mockActivityLogService.getUnmatchedLogs).toHaveBeenCalledWith('test-user', 'Asia/Tokyo');
    });

    it('helpコマンドが正しく解析される', async () => {
      // Act
      await handler.handle(mockMessage, 'test-user', ['help'], 'Asia/Tokyo');

      // Assert
      expect(mockMessage.reply).toHaveBeenCalledWith(expect.stringContaining('マッチング待ちログ管理コマンド'));
    });

    it('matchコマンドが正しく解析される', async () => {
      // Arrange
      const startLog = createMockLog('start-001', 'start_only', '今から会議を始めます');
      const endLog = createMockLog('end-001', 'end_only', '会議を終えました');
      
      mockActivityLogService.manualMatchLogs.mockResolvedValue({
        startLog,
        endLog
      });

      // Act
      await handler.handle(mockMessage, 'test-user', ['match', 'start-001', 'end-001'], 'Asia/Tokyo');

      // Assert
      expect(mockActivityLogService.manualMatchLogs).toHaveBeenCalledWith('start-001', 'end-001', 'test-user');
    });

    it('不正なmatchコマンド（引数不足）でエラーメッセージが表示される', async () => {
      // Act
      await handler.handle(mockMessage, 'test-user', ['match', 'only-one-id'], 'Asia/Tokyo');

      // Assert
      expect(mockMessage.reply).toHaveBeenCalledWith(expect.stringContaining('開始ログIDと終了ログIDを指定してください'));
    });
  });

  describe('🔴 Red: マッチング待ちログ表示機能', () => {
    it('マッチング待ちログがない場合の適切なメッセージ表示', async () => {
      // Arrange
      mockActivityLogService.getUnmatchedLogs.mockResolvedValue([]);

      // Act
      await handler.handle(mockMessage, 'test-user', [], 'Asia/Tokyo');

      // Assert
      expect(mockMessage.reply).toHaveBeenCalledWith(expect.stringContaining('すべてのログがマッチング済み'));
    });

    it('マッチング待ちログがある場合の一覧表示', async () => {
      // Arrange
      const unmatchedLogs = [
        createMockLog('start-001', 'start_only', '今から会議を始めます', '会議'),
        createMockLog('end-001', 'end_only', '作業を終えました', '作業'),
      ];
      
      mockActivityLogService.getUnmatchedLogs.mockResolvedValue(unmatchedLogs);

      // Act
      await handler.handle(mockMessage, 'test-user', [], 'Asia/Tokyo');

      // Assert
      expect(mockMessage.reply).toHaveBeenCalledWith(expect.stringContaining('マッチング待ちログ'));
      expect(mockMessage.reply).toHaveBeenCalledWith(expect.stringContaining('開始ログ'));
      expect(mockMessage.reply).toHaveBeenCalledWith(expect.stringContaining('終了ログ'));
      expect(mockMessage.reply).toHaveBeenCalledWith(expect.stringContaining('start-001'.slice(-8)));
      expect(mockMessage.reply).toHaveBeenCalledWith(expect.stringContaining('end-001'.slice(-8)));
    });

    it('開始ログのみがある場合の表示', async () => {
      // Arrange
      const unmatchedLogs = [
        createMockLog('start-001', 'start_only', '今からプログラミングを始めます', 'プログラミング'),
      ];
      
      mockActivityLogService.getUnmatchedLogs.mockResolvedValue(unmatchedLogs);

      // Act
      await handler.handle(mockMessage, 'test-user', [], 'Asia/Tokyo');

      // Assert
      expect(mockMessage.reply).toHaveBeenCalledWith(expect.stringContaining('**開始ログ** (1件)'));
      expect(mockMessage.reply).toHaveBeenCalledWith(expect.not.stringContaining('**終了ログ**'));
    });
  });

  describe('🔴 Red: 手動マッチング機能', () => {
    it('正常なマッチング処理', async () => {
      // Arrange
      const startLog = createMockLog('start-001', 'start_only', '今から会議を始めます', '会議');
      const endLog = createMockLog('end-001', 'end_only', '会議を終えました', '会議');
      endLog.similarityScore = 1.0;
      startLog.similarityScore = 1.0;
      
      mockActivityLogService.manualMatchLogs.mockResolvedValue({
        startLog,
        endLog
      });

      // Act
      await handler.handle(mockMessage, 'test-user', ['match', 'start-001', 'end-001'], 'Asia/Tokyo');

      // Assert
      expect(mockActivityLogService.manualMatchLogs).toHaveBeenCalledWith('start-001', 'end-001', 'test-user');
      expect(mockMessage.reply).toHaveBeenCalledWith(expect.stringContaining('ログマッチング完了'));
      expect(mockMessage.reply).toHaveBeenCalledWith(expect.stringContaining('📊 **類似度スコア**: 1.00'));
    });

    it('ログが見つからない場合のエラーハンドリング', async () => {
      // Arrange
      mockActivityLogService.manualMatchLogs.mockRejectedValue(
        new ActivityLogError('指定されたログが見つかりません', 'LOG_NOT_FOUND')
      );

      // Act
      await handler.handle(mockMessage, 'test-user', ['match', 'invalid-id', 'another-id'], 'Asia/Tokyo');

      // Assert
      expect(mockMessage.reply).toHaveBeenCalledWith(expect.stringContaining('指定されたログが見つかりません'));
    });

    it('既にマッチング済みログのエラーハンドリング', async () => {
      // Arrange
      mockActivityLogService.manualMatchLogs.mockRejectedValue(
        new ActivityLogError('既にマッチング済みのログは再マッチングできません', 'ALREADY_MATCHED')
      );

      // Act
      await handler.handle(mockMessage, 'test-user', ['match', 'matched-log-1', 'matched-log-2'], 'Asia/Tokyo');

      // Assert
      expect(mockMessage.reply).toHaveBeenCalledWith(expect.stringContaining('既にマッチング済みのログは再マッチングできません'));
    });

    it('不正なログタイプのエラーハンドリング', async () => {
      // Arrange
      mockActivityLogService.manualMatchLogs.mockRejectedValue(
        new ActivityLogError('開始ログと終了ログのみマッチングできます', 'INVALID_LOG_TYPE_FOR_MATCH')
      );

      // Act
      await handler.handle(mockMessage, 'test-user', ['match', 'complete-log', 'another-log'], 'Asia/Tokyo');

      // Assert
      expect(mockMessage.reply).toHaveBeenCalledWith(expect.stringContaining('開始ログ（start_only）と終了ログ（end_only）のみマッチングできます'));
    });
  });

  describe('🔴 Red: ヘルプ機能', () => {
    it('ヘルプメッセージが正しく表示される', async () => {
      // Act
      await handler.showHelp(mockMessage);

      // Assert
      expect(mockMessage.reply).toHaveBeenCalledWith(expect.stringContaining('マッチング待ちログ管理コマンド'));
      expect(mockMessage.reply).toHaveBeenCalledWith(expect.stringContaining('!unmatched'));
      expect(mockMessage.reply).toHaveBeenCalledWith(expect.stringContaining('!unmatched match'));
      expect(mockMessage.reply).toHaveBeenCalledWith(expect.stringContaining('自動マッチング'));
    });
  });

  describe('🔴 Red: エラーハンドリング', () => {
    it('予期しないエラーが適切に処理される', async () => {
      // Arrange
      mockActivityLogService.getUnmatchedLogs.mockRejectedValue(new Error('Database connection failed'));

      // Act
      await handler.handle(mockMessage, 'test-user', [], 'Asia/Tokyo');

      // Assert
      expect(mockMessage.reply).toHaveBeenCalledWith(expect.stringContaining('マッチング待ちログの表示に失敗しました'));
    });

    it('無効なコマンド形式のエラーハンドリング', async () => {
      // Act
      await handler.handle(mockMessage, 'test-user', ['invalid-command'], 'Asia/Tokyo');

      // Assert
      expect(mockMessage.reply).toHaveBeenCalledWith(expect.stringContaining('無効な指定です'));
    });
  });
});

/**
 * テスト用のモックログを作成
 */
function createMockLog(id: string, logType: 'start_only' | 'end_only' | 'complete', content: string, activityKey?: string): ActivityLog {
  return {
    id,
    userId: 'test-user',
    content,
    inputTimestamp: '2025-07-03T10:00:00.000Z',
    businessDate: '2025-07-03',
    isDeleted: false,
    createdAt: '2025-07-03T10:00:00.000Z',
    updatedAt: '2025-07-03T10:00:00.000Z',
    logType,
    matchStatus: 'unmatched',
    activityKey,
    startTime: '2025-07-03T10:00:00.000Z',
    endTime: logType === 'end_only' ? '2025-07-03T11:00:00.000Z' : undefined,
    totalMinutes: logType === 'complete' ? 60 : undefined,
    confidence: 0.8,
    analysisMethod: 'test',
    categories: 'テスト',
  };
}