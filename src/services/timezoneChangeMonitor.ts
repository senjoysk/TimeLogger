/**
 * TimezoneChangeMonitor - タイムゾーン変更監視サービス
 * 
 * 🟢 Green Phase: テストを通すための最小限実装
 * 
 * 機能:
 * - データベースポーリングによるタイムゾーン変更検出
 * - 通知テーブルによるタイムゾーン変更検出
 * - TimezoneCommandHandlerとの統合
 * - DynamicReportSchedulerとの連携
 */

import { DynamicReportScheduler } from './dynamicReportScheduler';
import { TimezoneChange } from '../repositories/interfaces';
import { logger } from '../utils/logger';
import { SystemError } from '../errors';

interface UserSettings {
  user_id: string;
  timezone: string;
}

interface ITimezoneRepository {
  getUserTimezoneChanges(since?: Date): Promise<TimezoneChange[]>;
  getUserTimezone(userId: string): Promise<string | null>;
  saveUserTimezone(userId: string, timezone: string): Promise<void>;
}

interface MonitorStatus {
  isPollingRunning: boolean;
  lastCheckTime: Date | null;
  processedNotifications: number;
  pollingInterval: number;
}

interface MonitorStatistics {
  totalProcessedNotifications: number;
  totalErrors: number;
  uptime: number;
  lastActivity: Date | null;
}

export class TimezoneChangeMonitor {
  private scheduler?: DynamicReportScheduler;
  private repository?: ITimezoneRepository;
  private pollingInterval: number = 10000; // 10秒
  private pollingTimer?: NodeJS.Timeout;
  private lastCheckTime: Date | null = null;
  private isPollingRunning: boolean = false;
  private startTime: Date = new Date();
  
  // 統計情報
  private stats: MonitorStatistics = {
    totalProcessedNotifications: 0,
    totalErrors: 0,
    uptime: 0,
    lastActivity: null
  };

  /**
   * コンストラクタ（依存性注入対応）
   * @param repository データリポジトリ（オプショナル）
   * @param scheduler 動的レポートスケジューラー（オプショナル）
   */
  constructor(repository?: ITimezoneRepository, scheduler?: DynamicReportScheduler) {
    this.repository = repository;
    this.scheduler = scheduler;
  }

  /**
   * DynamicReportSchedulerを設定（レガシー対応）
   */
  setScheduler(scheduler: DynamicReportScheduler): void {
    this.scheduler = scheduler;
  }

  /**
   * Repositoryを設定（レガシー対応）
   */
  setRepository(repository: ITimezoneRepository): void {
    this.repository = repository;
  }

  /**
   * ポーリング監視を開始
   */
  async startPollingMonitor(): Promise<void> {
    if (!this.scheduler) {
      throw new SystemError('Scheduler not set');
    }
    if (!this.repository) {
      throw new SystemError('Repository not set');
    }

    if (this.isPollingRunning) {
      return;
    }

    this.isPollingRunning = true;
    this.lastCheckTime = new Date();

    // 即座に1回実行
    await this.pollForChanges();

    // 定期実行を開始
    this.pollingTimer = setInterval(async () => {
      await this.pollForChanges();
    }, this.pollingInterval);

    logger.info('TIMEZONE_MONITOR', `✅ Timezone polling monitor started (interval: ${this.pollingInterval}ms)`);
  }


  /**
   * タイムゾーン変更をポーリングで検出
   */
  private async pollForChanges(): Promise<void> {
    try {
      if (!this.repository || !this.scheduler) {
        return;
      }

      // getUserTimezoneChanges メソッドの存在確認
      if (typeof this.repository.getUserTimezoneChanges !== 'function') {
        logger.error('TIMEZONE_MONITOR', '❌ getUserTimezoneChanges is not a function');
        this.stats.totalErrors++;
        return;
      }

      const changes = await this.repository.getUserTimezoneChanges(this.lastCheckTime || undefined);
      
      // changesがnull、undefined、または配列でない場合の処理
      if (!changes || !Array.isArray(changes)) {
        logger.warn('TIMEZONE_MONITOR', '⚠️ getUserTimezoneChanges returned invalid data, skipping');
        this.lastCheckTime = new Date();
        return;
      }
      
      for (const change of changes) {
        try {
          await this.scheduler.onTimezoneChanged(
            change.user_id,
            change.old_timezone,
            change.new_timezone
          );
          
          this.stats.totalProcessedNotifications++;
          this.stats.lastActivity = new Date();
        } catch (error) {
          logger.error('TIMEZONE_MONITOR', `❌ Failed to process timezone change for user ${change.user_id}:`, error as Error);
          this.stats.totalErrors++;
        }
      }

      this.lastCheckTime = new Date();
    } catch (error) {
      logger.error('TIMEZONE_MONITOR', '❌ Polling for timezone changes failed:', error as Error);
      this.stats.totalErrors++;
    }
  }


  /**
   * TimezoneCommandから呼び出される統合メソッド
   */
  async onTimezoneCommandUpdate(userId: string, newTimezone: string): Promise<void> {
    try {
      if (!this.repository || !this.scheduler) {
        throw new SystemError('Repository or Scheduler not set');
      }

      // 現在のタイムゾーンを取得
      const oldTimezone = await this.repository.getUserTimezone(userId);

      // 同じタイムゾーンの場合はスキップ
      if (oldTimezone === newTimezone) {
        logger.info('TIMEZONE_MONITOR', `ℹ️ User ${userId} already has timezone ${newTimezone}, skipping`);
        return;
      }

      // データベース更新
      await this.repository.saveUserTimezone(userId, newTimezone);

      // スケジューラーに通知
      await this.scheduler.onTimezoneChanged(userId, oldTimezone, newTimezone);

      this.stats.totalProcessedNotifications++;
      this.stats.lastActivity = new Date();

      logger.info('TIMEZONE_MONITOR', `✅ Timezone updated for user ${userId}: ${oldTimezone} → ${newTimezone}`);
    } catch (error) {
      logger.error('TIMEZONE_MONITOR', `❌ Failed to update timezone for user ${userId}:`, error as Error);
      this.stats.totalErrors++;
      throw error;
    }
  }

  /**
   * 監視を停止
   */
  stop(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = undefined;
    }
    this.isPollingRunning = false;
    logger.info('TIMEZONE_MONITOR', '🛑 Timezone polling monitor stopped');
  }


  /**
   * ポーリング間隔を設定
   */
  setPollingInterval(intervalMs: number): void {
    if (intervalMs <= 0) {
      throw new SystemError('Polling interval must be positive');
    }
    
    this.pollingInterval = intervalMs;
    
    // 実行中の場合は再起動
    if (this.isPollingRunning) {
      this.stop();
      this.startPollingMonitor();
    }
  }

  /**
   * ポーリング間隔を取得
   */
  getPollingInterval(): number {
    return this.pollingInterval;
  }

  /**
   * ポーリング監視の実行状態を取得
   */
  isRunning(): boolean {
    return this.isPollingRunning;
  }

  /**
   * 通知プロセッサーの実行状態を取得
   */

  /**
   * 監視状態を取得
   */
  getStatus(): MonitorStatus {
    return {
      isPollingRunning: this.isPollingRunning,
      lastCheckTime: this.lastCheckTime,
      processedNotifications: this.stats.totalProcessedNotifications,
      pollingInterval: this.pollingInterval
    };
  }

  /**
   * 統計情報を取得
   */
  getStatistics(): MonitorStatistics {
    const now = new Date();
    const uptimeMs = now.getTime() - this.startTime.getTime();
    
    return {
      ...this.stats,
      uptime: Math.floor(uptimeMs / 1000) // 秒単位
    };
  }

  /**
   * 統計情報をリセット
   */
  resetStatistics(): void {
    this.stats = {
      totalProcessedNotifications: 0,
      totalErrors: 0,
      uptime: 0,
      lastActivity: null
    };
    this.startTime = new Date();
  }
}