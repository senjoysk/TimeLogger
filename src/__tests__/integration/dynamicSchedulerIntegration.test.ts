/**
 * DynamicScheduler統合テストスイート
 * 
 * 🔴 Red Phase: 既存scheduler.tsとの統合テストを作成
 * 
 * テスト対象:
 * - 既存Schedulerクラスとの統合
 * - DynamicReportSchedulerの初期化
 * - TimezoneChangeMonitorの統合
 * - 既存の日次サマリー機能との調整
 */

import { Scheduler } from '../../scheduler';
import { EnhancedScheduler } from '../../enhancedScheduler';
import { DynamicReportScheduler } from '../../services/dynamicReportScheduler';
import { TimezoneChangeMonitor } from '../../services/timezoneChangeMonitor';
import { TaskLoggerBot } from '../../bot';
import { SqliteActivityLogRepository } from '../../repositories/sqliteActivityLogRepository';

// モック
jest.mock('../../services/dynamicReportScheduler');
jest.mock('../../services/timezoneChangeMonitor');
jest.mock('../../bot');
jest.mock('../../repositories/sqliteActivityLogRepository');
jest.mock('node-cron');

const MockDynamicReportScheduler = DynamicReportScheduler as jest.MockedClass<typeof DynamicReportScheduler>;
const MockTimezoneChangeMonitor = TimezoneChangeMonitor as jest.MockedClass<typeof TimezoneChangeMonitor>;
const MockTaskLoggerBot = TaskLoggerBot as jest.MockedClass<typeof TaskLoggerBot>;
const MockSqliteActivityLogRepository = SqliteActivityLogRepository as jest.MockedClass<typeof SqliteActivityLogRepository>;

describe('DynamicScheduler Integration', () => {
  let scheduler: Scheduler;
  let mockBot: jest.Mocked<TaskLoggerBot>;
  let mockRepository: jest.Mocked<SqliteActivityLogRepository>;
  let mockDynamicScheduler: jest.Mocked<DynamicReportScheduler>;
  let mockTimezoneMonitor: jest.Mocked<TimezoneChangeMonitor>;

  beforeEach(() => {
    // モックインスタンス作成
    mockBot = new MockTaskLoggerBot() as jest.Mocked<TaskLoggerBot>;
    mockRepository = new MockSqliteActivityLogRepository('test.db') as jest.Mocked<SqliteActivityLogRepository>;
    mockDynamicScheduler = new MockDynamicReportScheduler() as jest.Mocked<DynamicReportScheduler>;
    mockTimezoneMonitor = new MockTimezoneChangeMonitor() as jest.Mocked<TimezoneChangeMonitor>;

    // Schedulerインスタンス作成
    scheduler = new Scheduler(mockBot, mockRepository);

    // botのメソッドモック
    mockBot.getRepository = jest.fn().mockReturnValue(mockRepository);
    mockBot.sendDailySummaryForAllUsers = jest.fn();
    mockBot.sendApiCostReportForAllUsers = jest.fn();

    // repositoryのメソッドモック
    mockRepository.getAllUsers = jest.fn().mockResolvedValue([
      { userId: 'user1', timezone: 'Asia/Tokyo' },
      { userId: 'user2', timezone: 'America/New_York' }
    ]);

    // dynamicSchedulerのメソッドモック
    mockDynamicScheduler.initialize = jest.fn();
    mockDynamicScheduler.onTimezoneChanged = jest.fn();
    mockDynamicScheduler.getActiveJobCount = jest.fn().mockReturnValue(2);

    // timezoneMonitorのメソッドモック
    mockTimezoneMonitor.setScheduler = jest.fn();
    mockTimezoneMonitor.setRepository = jest.fn();
    mockTimezoneMonitor.startPollingMonitor = jest.fn();
    mockTimezoneMonitor.isRunning = jest.fn().mockReturnValue(true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('🔴 Red Phase: 既存Schedulerとの統合', () => {
    test('should enhance existing scheduler with dynamic functionality', async () => {
      // 🔴 Red: まだEnhancedSchedulerクラスが実装されていない

      // Enhanced Schedulerを作成（既存Schedulerを拡張）
      const enhancedScheduler = new EnhancedScheduler(mockBot, mockRepository);

      // 動的スケジューラーとモニターを設定
      enhancedScheduler.setDynamicScheduler(mockDynamicScheduler);
      enhancedScheduler.setTimezoneMonitor(mockTimezoneMonitor);

      // 開始
      await enhancedScheduler.start();

      // 既存機能が正常に動作
      expect(mockBot.sendDailySummaryForAllUsers).toBeDefined();
      expect(mockBot.sendApiCostReportForAllUsers).toBeDefined();

      // 動的スケジューラーが初期化される
      expect(mockDynamicScheduler.initialize).toHaveBeenCalled();

      // タイムゾーン監視が開始される
      expect(mockTimezoneMonitor.startPollingMonitor).toHaveBeenCalled();
    });

    test('should coordinate between static and dynamic schedules', async () => {
      // 🔴 Red: 静的と動的スケジュールの協調テスト

      const enhancedScheduler = new EnhancedScheduler(mockBot, mockRepository);
      enhancedScheduler.setDynamicScheduler(mockDynamicScheduler);

      await enhancedScheduler.start();

      // 静的スケジュール（APIコストレポート）は継続
      const status = enhancedScheduler.getStatus();
      expect(status.some(s => s.name === 'apiCostReport')).toBe(true);

      // 動的スケジュール（日次サマリー）は動的に管理
      expect(status.some(s => s.name === 'dynamicDailySummary')).toBe(true);

      // 従来の固定cronスケジュールは無効化
      expect(status.some(s => s.name === 'dailySummary')).toBe(false);
    });

    test('should fallback to static schedule if dynamic fails', async () => {
      // 🔴 Red: 動的スケジューラー失敗時のフォールバック

      // 動的スケジューラーの初期化失敗
      mockDynamicScheduler.initialize.mockRejectedValue(new Error('Dynamic scheduler failed'));

      const enhancedScheduler = new EnhancedScheduler(mockBot, mockRepository);
      enhancedScheduler.setDynamicScheduler(mockDynamicScheduler);

      await enhancedScheduler.start();

      // フォールバック：従来の固定スケジュールが有効化
      const status = enhancedScheduler.getStatus();
      expect(status.some(s => s.name === 'dailySummary')).toBe(true);

      // エラーログが出力される
      expect(enhancedScheduler.getLastError()).toContain('Dynamic scheduler failed');
    });
  });

  describe('🔴 Red Phase: タイムゾーン変更統合', () => {
    test('should integrate timezone monitor with existing timezone handler', async () => {
      // 🔴 Red: TimezoneCommandHandlerとの統合

      const enhancedScheduler = new EnhancedScheduler(mockBot, mockRepository);
      enhancedScheduler.setTimezoneMonitor(mockTimezoneMonitor);

      await enhancedScheduler.start();

      // タイムゾーン変更通知の統合
      await enhancedScheduler.onUserTimezoneChanged('user1', 'Asia/Tokyo', 'Europe/London');

      // モニターに通知される
      expect(mockTimezoneMonitor.onTimezoneCommandUpdate).toHaveBeenCalledWith(
        'user1', 'Europe/London'
      );
    });

    test('should update dynamic schedules when timezone changes', async () => {
      // 🔴 Red: タイムゾーン変更時の動的スケジュール更新

      const enhancedScheduler = new EnhancedScheduler(mockBot, mockRepository);
      enhancedScheduler.setDynamicScheduler(mockDynamicScheduler);
      enhancedScheduler.setTimezoneMonitor(mockTimezoneMonitor);

      await enhancedScheduler.start();

      // ユーザーのタイムゾーン変更
      await enhancedScheduler.onUserTimezoneChanged('user1', 'Asia/Tokyo', 'Europe/London');

      // 動的スケジューラーに反映される
      expect(mockDynamicScheduler.onTimezoneChanged).toHaveBeenCalledWith(
        'user1', 'Asia/Tokyo', 'Europe/London'
      );
    });

    test('should handle timezone changes for new users', async () => {
      // 🔴 Red: 新規ユーザーのタイムゾーン設定

      const enhancedScheduler = new EnhancedScheduler(mockBot, mockRepository);
      enhancedScheduler.setDynamicScheduler(mockDynamicScheduler);

      await enhancedScheduler.start();

      // 新規ユーザー追加
      await enhancedScheduler.onUserTimezoneChanged('user3', null, 'Australia/Sydney');

      // 動的スケジューラーに新ユーザーとして追加
      expect(mockDynamicScheduler.onTimezoneChanged).toHaveBeenCalledWith(
        'user3', null, 'Australia/Sydney'
      );
    });
  });

  describe('🔴 Red Phase: 18:30レポート送信統合', () => {
    test('should send daily reports at 18:30 user local time', async () => {
      // 🔴 Red: 18:30での日次レポート送信

      const enhancedScheduler = new EnhancedScheduler(mockBot, mockRepository);
      enhancedScheduler.setDynamicScheduler(mockDynamicScheduler);

      await enhancedScheduler.start();

      // モック：18:30になったときの処理
      const mockReportSender = jest.fn();
      enhancedScheduler.setReportSender(mockReportSender);

      // 動的スケジューラーからのトリガー
      await enhancedScheduler.onReportTimeReached('user1', 'Asia/Tokyo');

      // 18:30用の専用レポート送信処理が呼ばれる
      expect(mockReportSender).toHaveBeenCalledWith('user1', 'Asia/Tokyo');
    });

    test('should differentiate between 18:00 and 18:30 reports', async () => {
      // 🔴 Red: 18:00と18:30レポートの区別

      const enhancedScheduler = new EnhancedScheduler(mockBot, mockRepository);
      enhancedScheduler.setDynamicScheduler(mockDynamicScheduler);

      await enhancedScheduler.start();

      // 18:00の既存サマリーはAPIコストレポートなど他の機能として残る
      const status = enhancedScheduler.getStatus();
      expect(status.some(s => s.name === 'apiCostReport')).toBe(true);

      // 18:30の新しいレポートは動的管理
      expect(mockDynamicScheduler.initialize).toHaveBeenCalled();
    });

    test('should handle report sending errors gracefully', async () => {
      // 🔴 Red: レポート送信エラーの処理

      const enhancedScheduler = new EnhancedScheduler(mockBot, mockRepository);
      
      const mockReportSender = jest.fn().mockRejectedValue(new Error('Report sending failed'));
      enhancedScheduler.setReportSender(mockReportSender);

      // エラーが発生してもクラッシュしない
      await expect(
        enhancedScheduler.onReportTimeReached('user1', 'Asia/Tokyo')
      ).resolves.not.toThrow();

      // エラー統計が記録される
      const errorStats = enhancedScheduler.getErrorStatistics();
      expect(errorStats.reportSendingErrors).toBe(1);
    });
  });

  describe('🔴 Red Phase: 監視・デバッグ機能', () => {
    test('should provide comprehensive status information', async () => {
      // 🔴 Red: 包括的な状態情報提供

      const enhancedScheduler = new EnhancedScheduler(mockBot, mockRepository);
      enhancedScheduler.setDynamicScheduler(mockDynamicScheduler);
      enhancedScheduler.setTimezoneMonitor(mockTimezoneMonitor);

      await enhancedScheduler.start();

      const status = enhancedScheduler.getComprehensiveStatus();

      // 既存スケジュールの状態
      expect(status.staticSchedules).toBeDefined();
      expect(status.staticSchedules.length).toBeGreaterThan(0);

      // 動的スケジュールの状態
      expect(status.dynamicSchedules).toBeDefined();
      expect(status.dynamicSchedules.activeJobCount).toBe(2);

      // タイムゾーン監視の状態
      expect(status.timezoneMonitoring).toBeDefined();
      expect(status.timezoneMonitoring.isRunning).toBe(true);
    });

    test('should provide performance metrics', async () => {
      // 🔴 Red: パフォーマンス指標提供

      const enhancedScheduler = new EnhancedScheduler(mockBot, mockRepository);
      enhancedScheduler.setDynamicScheduler(mockDynamicScheduler);

      await enhancedScheduler.start();

      const metrics = enhancedScheduler.getPerformanceMetrics();

      expect(metrics).toHaveProperty('totalReportsSent');
      expect(metrics).toHaveProperty('averageReportTime');
      expect(metrics).toHaveProperty('cronJobEfficiency');
      expect(metrics).toHaveProperty('timezoneDistribution');
    });

    test('should support manual testing and debugging', async () => {
      // 🔴 Red: 手動テスト・デバッグ支援

      const enhancedScheduler = new EnhancedScheduler(mockBot, mockRepository);
      enhancedScheduler.setDynamicScheduler(mockDynamicScheduler);

      await enhancedScheduler.start();

      // 手動トリガー機能
      await enhancedScheduler.manuallyTriggerReportForUser('user1');
      
      // 動的スケジューラーの手動トリガー
      expect(mockDynamicScheduler.onTimezoneChanged).toHaveBeenCalled();

      // デバッグ情報取得
      const debugInfo = enhancedScheduler.getDebugInformation();
      expect(debugInfo).toHaveProperty('activeTimezones');
      expect(debugInfo).toHaveProperty('cronJobs');
      expect(debugInfo).toHaveProperty('recentActivities');
    });
  });

  describe('🔴 Red Phase: エラーハンドリング・復旧', () => {
    test('should recover from component failures', async () => {
      // 🔴 Red: コンポーネント障害からの復旧

      const enhancedScheduler = new EnhancedScheduler(mockBot, mockRepository);
      enhancedScheduler.setDynamicScheduler(mockDynamicScheduler);
      enhancedScheduler.setTimezoneMonitor(mockTimezoneMonitor);

      // 動的スケジューラー初期化失敗
      mockDynamicScheduler.initialize.mockRejectedValueOnce(new Error('Init failed'));

      await enhancedScheduler.start();

      // 自動復旧試行
      await enhancedScheduler.attemptRecovery();

      // 復旧後の再初期化
      expect(mockDynamicScheduler.initialize).toHaveBeenCalledTimes(2);
    });

    test('should maintain service during partial failures', async () => {
      // 🔴 Red: 部分的障害時のサービス継続

      const enhancedScheduler = new EnhancedScheduler(mockBot, mockRepository);
      enhancedScheduler.setTimezoneMonitor(mockTimezoneMonitor);

      // タイムゾーン監視が失敗
      mockTimezoneMonitor.startPollingMonitor.mockRejectedValue(new Error('Monitor failed'));

      await enhancedScheduler.start();

      // 既存機能は継続動作
      const status = enhancedScheduler.getStatus();
      expect(status.some(s => s.name === 'apiCostReport')).toBe(true);

      // 障害状態が記録される
      expect(enhancedScheduler.getComponentHealth().timezoneMonitor).toBe('failed');
    });
  });
});

