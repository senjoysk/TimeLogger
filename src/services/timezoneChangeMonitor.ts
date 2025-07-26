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

interface TimezoneChange {
  user_id: string;
  old_timezone: string;
  new_timezone: string;
  updated_at: string;
}

interface TimezoneNotification {
  id: string;
  user_id: string;
  old_timezone: string | null;
  new_timezone: string;
  changed_at: string;
  processed: boolean;
}

interface UserSettings {
  user_id: string;
  timezone: string;
}

interface Repository {
  getUserTimezoneChanges(since?: Date): Promise<TimezoneChange[]>;
  getUnprocessedNotifications(): Promise<TimezoneNotification[]>;
  markNotificationAsProcessed(notificationId: string): Promise<void>;
  getUserTimezone(userId: string): Promise<string | null>;
  saveUserTimezone(userId: string, timezone: string): Promise<void>;
}

interface MonitorStatus {
  isPollingRunning: boolean;
  isProcessorRunning: boolean;
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
  private repository?: Repository;
  private pollingInterval: number = 10000; // 10秒
  private pollingTimer?: NodeJS.Timeout;
  private processorTimer?: NodeJS.Timeout;
  private lastCheckTime: Date | null = null;
  private isPollingRunning: boolean = false;
  private isProcessorRunning: boolean = false;
  private startTime: Date = new Date();
  
  // 統計情報
  private stats: MonitorStatistics = {
    totalProcessedNotifications: 0,
    totalErrors: 0,
    uptime: 0,
    lastActivity: null
  };

  /**
   * DynamicReportSchedulerを設定
   */
  setScheduler(scheduler: DynamicReportScheduler): void {
    this.scheduler = scheduler;
  }

  /**
   * Repositoryを設定
   */
  setRepository(repository: Repository): void {
    this.repository = repository;
  }

  /**
   * ポーリング監視を開始
   */
  async startPollingMonitor(): Promise<void> {
    if (!this.scheduler) {
      throw new Error('Scheduler not set');
    }
    if (!this.repository) {
      throw new Error('Repository not set');
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

    console.log(`✅ Timezone polling monitor started (interval: ${this.pollingInterval}ms)`);
  }

  /**
   * 通知プロセッサーを開始
   */
  async startNotificationProcessor(): Promise<void> {
    if (!this.scheduler) {
      throw new Error('Scheduler not set');
    }
    if (!this.repository) {
      throw new Error('Repository not set');
    }

    if (this.isProcessorRunning) {
      return;
    }

    this.isProcessorRunning = true;

    // 即座に1回実行
    await this.processNotifications();

    // 定期実行を開始
    this.processorTimer = setInterval(async () => {
      if (this.repository && this.scheduler) {
        await this.processNotifications();
      }
    }, this.pollingInterval);

    console.log(`✅ Timezone notification processor started`);
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
        console.error('❌ getUserTimezoneChanges is not a function');
        this.stats.totalErrors++;
        return;
      }

      const changes = await this.repository.getUserTimezoneChanges(this.lastCheckTime || undefined);
      
      // changesがnull、undefined、または配列でない場合の処理
      if (!changes || !Array.isArray(changes)) {
        console.warn('⚠️ getUserTimezoneChanges returned invalid data, skipping');
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
          console.error(`❌ Failed to process timezone change for user ${change.user_id}:`, error);
          this.stats.totalErrors++;
        }
      }

      this.lastCheckTime = new Date();
    } catch (error) {
      console.error('❌ Polling for timezone changes failed:', error);
      this.stats.totalErrors++;
    }
  }

  /**
   * 通知テーブルから未処理通知を処理
   */
  private async processNotifications(): Promise<void> {
    try {
      if (!this.repository || !this.scheduler) {
        // テスト環境などでrepositoryが設定されていない場合は静かに終了
        return;
      }

      // getUnprocessedNotifications メソッドの存在確認
      if (typeof this.repository.getUnprocessedNotifications !== 'function') {
        console.error('❌ getUnprocessedNotifications is not a function');
        this.stats.totalErrors++;
        return;
      }

      const notifications = await this.repository.getUnprocessedNotifications();

      // notificationsがnull、undefined、または配列でない場合の処理
      if (!notifications || !Array.isArray(notifications)) {
        console.warn('⚠️ getUnprocessedNotifications returned invalid data, skipping');
        return;
      }

      for (const notification of notifications) {
        try {
          await this.scheduler.onTimezoneChanged(
            notification.user_id,
            notification.old_timezone,
            notification.new_timezone
          );

          // 処理済みマーク
          if (typeof this.repository.markNotificationAsProcessed === 'function') {
            await this.repository.markNotificationAsProcessed(notification.id);
          }
          
          this.stats.totalProcessedNotifications++;
          this.stats.lastActivity = new Date();
        } catch (error) {
          console.error(`❌ Failed to process notification ${notification.id}:`, error);
          this.stats.totalErrors++;
          // エラー時は処理済みマークしない（再試行可能）
        }
      }
    } catch (error) {
      console.error('❌ Processing notifications failed:', error);
      this.stats.totalErrors++;
    }
  }

  /**
   * TimezoneCommandから呼び出される統合メソッド
   */
  async onTimezoneCommandUpdate(userId: string, newTimezone: string): Promise<void> {
    try {
      if (!this.repository || !this.scheduler) {
        throw new Error('Repository or Scheduler not set');
      }

      // 現在のタイムゾーンを取得
      const oldTimezone = await this.repository.getUserTimezone(userId);

      // 同じタイムゾーンの場合はスキップ
      if (oldTimezone === newTimezone) {
        console.log(`ℹ️ User ${userId} already has timezone ${newTimezone}, skipping`);
        return;
      }

      // データベース更新
      await this.repository.saveUserTimezone(userId, newTimezone);

      // スケジューラーに通知
      await this.scheduler.onTimezoneChanged(userId, oldTimezone, newTimezone);

      this.stats.totalProcessedNotifications++;
      this.stats.lastActivity = new Date();

      console.log(`✅ Timezone updated for user ${userId}: ${oldTimezone} → ${newTimezone}`);
    } catch (error) {
      console.error(`❌ Failed to update timezone for user ${userId}:`, error);
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
    console.log('🛑 Timezone polling monitor stopped');
  }

  /**
   * 通知プロセッサーを停止
   */
  stopProcessor(): void {
    if (this.processorTimer) {
      clearInterval(this.processorTimer);
      this.processorTimer = undefined;
    }
    this.isProcessorRunning = false;
    console.log('🛑 Timezone notification processor stopped');
  }

  /**
   * ポーリング間隔を設定
   */
  setPollingInterval(intervalMs: number): void {
    if (intervalMs <= 0) {
      throw new Error('Polling interval must be positive');
    }
    
    this.pollingInterval = intervalMs;
    
    // 実行中の場合は再起動
    if (this.isPollingRunning) {
      this.stop();
      this.startPollingMonitor();
    }
    if (this.isProcessorRunning) {
      this.stopProcessor();
      this.startNotificationProcessor();
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
  isProcessorActive(): boolean {
    return this.isProcessorRunning;
  }

  /**
   * 監視状態を取得
   */
  getStatus(): MonitorStatus {
    return {
      isPollingRunning: this.isPollingRunning,
      isProcessorRunning: this.isProcessorRunning,
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