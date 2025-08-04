/**
 * TimezoneChangeMonitor テストスイート
 * 
 * タイムゾーン変更監視システムの機能テスト
 * 
 * テスト対象:
 * - データベースポーリングによるタイムゾーン変更検出
 * - 通知テーブルによるタイムゾーン変更検出
 * - TimezoneCommandHandlerとの統合
 * - DynamicReportSchedulerとの連携
 * - メソッド存在確認とエラーハンドリング
 */

import { TimezoneChangeMonitor } from '../../services/timezoneChangeMonitor';
import { DynamicReportScheduler } from '../../services/dynamicReportScheduler';

// モック
jest.mock('../../services/dynamicReportScheduler');
const MockDynamicReportScheduler = DynamicReportScheduler as jest.MockedClass<typeof DynamicReportScheduler>;

// logger のモック
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    success: jest.fn()
  }
}));

describe('TimezoneChangeMonitor', () => {
  let monitor: TimezoneChangeMonitor;
  let mockScheduler: jest.Mocked<DynamicReportScheduler>;
  let mockRepository: any;
  beforeEach(() => {
    // loggerモックをリセット
    const { logger } = require('../../utils/logger');
    jest.clearAllMocks();
    // consoleWarnSpyは必要ない（loggerを使用）
    
    // スケジューラーのモック
    mockScheduler = new MockDynamicReportScheduler() as jest.Mocked<DynamicReportScheduler>;
    mockScheduler.onTimezoneChanged = jest.fn();

    // リポジトリのモック
    mockRepository = {
      getUserTimezoneChanges: jest.fn(),
      getUserTimezone: jest.fn(),
      saveUserTimezone: jest.fn(),
    };

    monitor = new TimezoneChangeMonitor();
    monitor.setScheduler(mockScheduler);
    monitor.setRepository(mockRepository);
  });

  afterEach(async () => {
    // 監視を停止
    monitor.stop();
    
    // 非同期処理の完了を待つ
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // console spyをリストア
    // spyのクリーンアップは不要（loggerモックを使用）
    
    // モックをクリア
    jest.clearAllMocks();
  });

  describe('ポーリング監視テスト', () => {
    test('should detect timezone changes from database polling', async () => {
      // データベースポーリングによるタイムゾーン変更検出テスト

      // モックデータ準備
      mockRepository.getUserTimezoneChanges.mockResolvedValue([
        {
          user_id: 'user1',
          old_timezone: 'Asia/Tokyo',
          new_timezone: 'America/New_York',
          updated_at: '2024-01-01T10:00:00.000Z'
        }
      ]);

      // ポーリング監視開始
      await monitor.startPollingMonitor();

      // 短い間隔で変更をチェック
      await new Promise(resolve => setTimeout(resolve, 100));

      // スケジューラーに通知されることを確認
      expect(mockScheduler.onTimezoneChanged).toHaveBeenCalledWith(
        'user1',
        'Asia/Tokyo',
        'America/New_York'
      );
    });

    test('should handle multiple timezone changes in one poll', async () => {
      // 複数変更の同時処理テスト

      mockRepository.getUserTimezoneChanges.mockResolvedValue([
        {
          user_id: 'user1',
          old_timezone: 'Asia/Tokyo',
          new_timezone: 'Europe/London',
          updated_at: '2024-01-01T10:00:00.000Z'
        },
        {
          user_id: 'user2',
          old_timezone: 'America/New_York',
          new_timezone: 'Asia/Tokyo',
          updated_at: '2024-01-01T10:01:00.000Z'
        }
      ]);

      await monitor.startPollingMonitor();
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockScheduler.onTimezoneChanged).toHaveBeenCalledTimes(2);
      expect(mockScheduler.onTimezoneChanged).toHaveBeenCalledWith(
        'user1', 'Asia/Tokyo', 'Europe/London'
      );
      expect(mockScheduler.onTimezoneChanged).toHaveBeenCalledWith(
        'user2', 'America/New_York', 'Asia/Tokyo'
      );
    });

    test('should track last check time to avoid duplicates', async () => {
      // 重複処理防止テスト

      // 最初のポーリング
      mockRepository.getUserTimezoneChanges.mockResolvedValueOnce([
        {
          user_id: 'user1',
          old_timezone: 'Asia/Tokyo',
          new_timezone: 'Europe/London',
          updated_at: '2024-01-01T10:00:00.000Z'
        }
      ]);

      await monitor.startPollingMonitor();
      await new Promise(resolve => setTimeout(resolve, 100));

      // 2回目のポーリング（同じデータだが、last_check_timeで除外される）
      mockRepository.getUserTimezoneChanges.mockResolvedValueOnce([]);

      await new Promise(resolve => setTimeout(resolve, 100));

      // 1回だけ呼ばれることを確認
      expect(mockScheduler.onTimezoneChanged).toHaveBeenCalledTimes(1);
    });

    test('should handle polling errors gracefully', async () => {
      // ポーリングエラー処理テスト

      mockRepository.getUserTimezoneChanges.mockRejectedValue(
        new Error('Database connection failed')
      );

      // エラーが発生してもクラッシュしない
      await expect(monitor.startPollingMonitor()).resolves.not.toThrow();

      // スケジューラーは呼ばれない
      expect(mockScheduler.onTimezoneChanged).not.toHaveBeenCalled();

      // エラーログが出力されることを確認
      const { logger } = require('../../utils/logger');
      expect(logger.error).toHaveBeenCalledWith(
        'TIMEZONE_MONITOR',
        '❌ Polling for timezone changes failed:',
        expect.any(Error)
      );
    });
  });


  describe('TimezoneCommandHandler統合テスト', () => {
    test('should handle timezone command integration', async () => {
      // コマンドハンドラー統合テスト

      // 既存設定の模擬
      mockRepository.getUserTimezone.mockResolvedValue('Asia/Tokyo');

      // タイムゾーン変更コマンド
      await monitor.onTimezoneCommandUpdate('user1', 'Europe/London');

      // データベース更新
      expect(mockRepository.saveUserTimezone).toHaveBeenCalledWith(
        'user1', 'Europe/London'
      );

      // スケジューラー通知
      expect(mockScheduler.onTimezoneChanged).toHaveBeenCalledWith(
        'user1', 'Asia/Tokyo', 'Europe/London'
      );
    });

    test('should handle command with same timezone gracefully', async () => {
      // 同一タイムゾーン設定時の処理テスト

      mockRepository.getUserTimezone.mockResolvedValue('Asia/Tokyo');

      // 同じタイムゾーンを設定
      await monitor.onTimezoneCommandUpdate('user1', 'Asia/Tokyo');

      // データベース更新はスキップ
      expect(mockRepository.saveUserTimezone).not.toHaveBeenCalled();
      
      // スケジューラー通知もスキップ
      expect(mockScheduler.onTimezoneChanged).not.toHaveBeenCalled();
    });

    test('should handle command for new user', async () => {
      // 新規ユーザーのタイムゾーン設定テスト

      mockRepository.getUserTimezone.mockResolvedValue(null);

      await monitor.onTimezoneCommandUpdate('user1', 'Asia/Tokyo');

      // 新規作成として処理
      expect(mockRepository.saveUserTimezone).toHaveBeenCalledWith(
        'user1', 'Asia/Tokyo'
      );

      expect(mockScheduler.onTimezoneChanged).toHaveBeenCalledWith(
        'user1', null, 'Asia/Tokyo'
      );
    });
  });

  describe('監視制御テスト', () => {
    test('should start and stop polling monitor', async () => {
      // 監視開始・停止テスト

      expect(monitor.isRunning()).toBe(false);

      await monitor.startPollingMonitor();
      expect(monitor.isRunning()).toBe(true);

      monitor.stop();
      expect(monitor.isRunning()).toBe(false);
    });


    test('should configure polling interval', async () => {
      // ポーリング間隔設定テスト

      // デフォルト間隔
      expect(monitor.getPollingInterval()).toBe(10000); // 10秒

      // 間隔変更
      monitor.setPollingInterval(5000); // 5秒
      expect(monitor.getPollingInterval()).toBe(5000);

      // 無効な間隔は拒否
      expect(() => monitor.setPollingInterval(-1)).toThrow();
      expect(() => monitor.setPollingInterval(0)).toThrow();
    });
  });

  describe('ステータス・デバッグテスト', () => {
    test('should provide monitoring status', async () => {
      // 監視状態取得テスト

      const status = monitor.getStatus();
      
      expect(status).toHaveProperty('isPollingRunning');
      expect(status).toHaveProperty('lastCheckTime');
      expect(status).toHaveProperty('processedNotifications');
      expect(status).toHaveProperty('pollingInterval');
    });

    test('should provide statistics', async () => {
      // 統計情報取得テスト

      const stats = monitor.getStatistics();
      expect(stats.totalProcessedNotifications).toBe(0);
      expect(stats.totalErrors).toBe(0);
      expect(stats).toHaveProperty('uptime');
      expect(stats).toHaveProperty('lastActivity');
    });

    test('should reset statistics', () => {
      // 統計リセットテスト

      // 統計をリセット
      monitor.resetStatistics();

      const stats = monitor.getStatistics();
      expect(stats.totalProcessedNotifications).toBe(0);
      expect(stats.totalErrors).toBe(0);
    });
  });

  describe('エラーハンドリングテスト', () => {
    test('should handle scheduler unavailable', async () => {
      // スケジューラー未設定エラーテスト

      const monitorWithoutScheduler = new TimezoneChangeMonitor();
      
      await expect(
        monitorWithoutScheduler.startPollingMonitor()
      ).rejects.toThrow('Scheduler not set');
    });

    test('should handle repository unavailable', async () => {
      // リポジトリ未設定エラーテスト

      const monitorWithoutRepository = new TimezoneChangeMonitor();
      monitorWithoutRepository.setScheduler(mockScheduler);

      await expect(
        monitorWithoutRepository.startPollingMonitor()
      ).rejects.toThrow('Repository not set');
    });

    test('should recover from temporary database errors', async () => {
      // 一時的DB障害からの復旧テスト

      // より短い間隔でテスト
      monitor.setPollingInterval(50); // 50ms

      let callCount = 0;
      mockRepository.getUserTimezoneChanges.mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.reject(new Error('Temporary DB error'));
        }
        return Promise.resolve([]);
      });

      await monitor.startPollingMonitor();
      
      // 3回のポーリング後に復旧（50ms * 3 + バッファ）
      await new Promise(resolve => setTimeout(resolve, 200));

      // 少なくとも3回は呼ばれる（復旧確認）
      expect(mockRepository.getUserTimezoneChanges.mock.calls.length).toBeGreaterThanOrEqual(3);

      // エラーログが出力されることを確認（最初の2回の失敗時）
      const { logger } = require('../../utils/logger');
      expect(logger.error).toHaveBeenCalledWith(
        'TIMEZONE_MONITOR',
        '❌ Polling for timezone changes failed:',
        expect.any(Error)
      );
    });

    test('should handle getUserTimezoneChanges is not a function error', async () => {
      // getUserTimezoneChanges is not a function エラーの検出テスト（timezoneChangeMonitor.ts:159-163で修正済み）
      
      // getUserTimezoneChanges メソッドが存在しないリポジトリを作成
      const incompleteRepository = {
        // getUserTimezoneChanges: jest.fn(), // このメソッドを削除
        getUnprocessedNotifications: jest.fn().mockResolvedValue([]),
        markNotificationAsProcessed: jest.fn().mockResolvedValue(undefined),
        getUserTimezone: jest.fn().mockResolvedValue('Asia/Tokyo'),
        saveUserTimezone: jest.fn().mockResolvedValue(undefined)
      } as any;
      
      monitor.setRepository(incompleteRepository);
      
      // startPollingMonitorで getUserTimezoneChanges is not a function エラーが発生
      await expect(async () => {
        await monitor.startPollingMonitor();
      }).not.toThrow();
      
      // 短い間隔でポーリングを実行
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // エラーログが出力されることを確認
      const { logger } = require('../../utils/logger');
      expect(logger.error).toHaveBeenCalledWith(
        'TIMEZONE_MONITOR',
        '❌ getUserTimezoneChanges is not a function'
      );
      
      // スケジューラーは呼ばれない
      expect(mockScheduler.onTimezoneChanged).not.toHaveBeenCalled();
    });


    test('should handle repository methods returning non-arrays', async () => {
      // リポジトリメソッドが配列以外を返す場合のテスト
      
      const badRepository = {
        getUserTimezoneChanges: jest.fn().mockResolvedValue("not an array"), // 配列でない
        getUnprocessedNotifications: jest.fn().mockResolvedValue(null), // null
        markNotificationAsProcessed: jest.fn().mockResolvedValue(undefined),
        getUserTimezone: jest.fn().mockResolvedValue('Asia/Tokyo'),
        saveUserTimezone: jest.fn().mockResolvedValue(undefined)
      };
      
      monitor.setRepository(badRepository);
      
      // 配列以外が返されてもエラーが発生しない
      await expect(async () => {
        await monitor.startPollingMonitor();
      }).not.toThrow();
      
      // 短い間隔で処理を実行
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // 警告ログが出力されることを確認（配列以外のデータの場合は警告が出力される）
      const { logger } = require('../../utils/logger');
      expect(logger.warn).toHaveBeenCalledWith(
        'TIMEZONE_MONITOR',
        '⚠️ getUserTimezoneChanges returned invalid data, skipping'
      );
    });
  });
});