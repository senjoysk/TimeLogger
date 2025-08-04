/**
 * TimezonePollingService
 * タイムゾーン変更のポーリング処理を担当
 */

import { TimezoneChange } from '../../repositories/interfaces';
import { logger } from '../../utils/logger';
import { SystemError } from '../../errors';

interface ITimezoneRepository {
  getUserTimezoneChanges(since?: Date): Promise<TimezoneChange[]>;
}

export interface ITimezonePollingService {
  startPolling(callback: (change: TimezoneChange) => Promise<void>): void;
  stopPolling(): void;
  isRunning(): boolean;
  setInterval(intervalMs: number): void;
  getInterval(): number;
}

export class TimezonePollingService implements ITimezonePollingService {
  private pollingTimer?: NodeJS.Timeout;
  private pollingInterval: number = 10000; // デフォルト10秒
  private isPollingRunning: boolean = false;
  private lastCheckTime: Date | null = null;
  private callback?: (change: TimezoneChange) => Promise<void>;

  constructor(
    private repository: ITimezoneRepository
  ) {}

  /**
   * ポーリングを開始
   */
  startPolling(callback: (change: TimezoneChange) => Promise<void>): void {
    if (this.isPollingRunning) {
      logger.info('TIMEZONE_POLLING', 'ポーリングは既に実行中です');
      return;
    }

    this.callback = callback;
    this.isPollingRunning = true;
    this.lastCheckTime = new Date();

    // 即座に1回実行
    this.pollForChanges();

    // 定期実行を開始
    this.pollingTimer = setInterval(async () => {
      await this.pollForChanges();
    }, this.pollingInterval);

    logger.info('TIMEZONE_POLLING', `✅ ポーリング開始 (間隔: ${this.pollingInterval}ms)`);
  }

  /**
   * ポーリングを停止
   */
  stopPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = undefined;
    }
    this.isPollingRunning = false;
    this.callback = undefined;
    logger.info('TIMEZONE_POLLING', '🛑 ポーリング停止');
  }

  /**
   * ポーリング実行中かどうか
   */
  isRunning(): boolean {
    return this.isPollingRunning;
  }

  /**
   * ポーリング間隔を設定
   */
  setInterval(intervalMs: number): void {
    if (intervalMs <= 0) {
      throw new SystemError('ポーリング間隔は正の値でなければなりません');
    }
    
    this.pollingInterval = intervalMs;
    
    // 実行中の場合は再起動
    if (this.isPollingRunning && this.callback) {
      this.stopPolling();
      this.startPolling(this.callback);
    }
  }

  /**
   * ポーリング間隔を取得
   */
  getInterval(): number {
    return this.pollingInterval;
  }

  /**
   * タイムゾーン変更をポーリング
   */
  private async pollForChanges(): Promise<void> {
    try {
      // getUserTimezoneChanges メソッドの存在確認
      if (typeof this.repository.getUserTimezoneChanges !== 'function') {
        logger.error('TIMEZONE_POLLING', '❌ getUserTimezoneChanges is not a function');
        return;
      }

      const changes = await this.repository.getUserTimezoneChanges(this.lastCheckTime || undefined);
      
      // changesがnull、undefined、または配列でない場合の処理
      if (!changes || !Array.isArray(changes)) {
        logger.warn('TIMEZONE_POLLING', '⚠️ getUserTimezoneChanges returned invalid data, skipping');
        this.lastCheckTime = new Date();
        return;
      }
      
      // 変更を処理
      for (const change of changes) {
        if (this.callback) {
          try {
            await this.callback(change);
          } catch (error) {
            logger.error('TIMEZONE_POLLING', `❌ 変更処理エラー (user: ${change.user_id}):`, error as Error);
          }
        }
      }

      this.lastCheckTime = new Date();
    } catch (error) {
      logger.error('TIMEZONE_POLLING', '❌ ポーリングエラー:', error as Error);
    }
  }
}