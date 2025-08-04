/**
 * TimezoneStatisticsService
 * タイムゾーン変更監視の統計情報管理を担当
 */

import { logger } from '../../utils/logger';

export interface MonitorStatistics {
  totalProcessedNotifications: number;
  totalErrors: number;
  uptime: number;
  lastActivity: Date | null;
}

export interface ITimezoneStatisticsService {
  incrementProcessed(): void;
  incrementErrors(): void;
  updateLastActivity(): void;
  getStatistics(): MonitorStatistics;
  reset(): void;
}

export class TimezoneStatisticsService implements ITimezoneStatisticsService {
  private startTime: Date = new Date();
  private stats: MonitorStatistics = {
    totalProcessedNotifications: 0,
    totalErrors: 0,
    uptime: 0,
    lastActivity: null
  };

  /**
   * 処理済み通知数をインクリメント
   */
  incrementProcessed(): void {
    this.stats.totalProcessedNotifications++;
    this.updateLastActivity();
  }

  /**
   * エラー数をインクリメント
   */
  incrementErrors(): void {
    this.stats.totalErrors++;
  }

  /**
   * 最終活動時刻を更新
   */
  updateLastActivity(): void {
    this.stats.lastActivity = new Date();
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
  reset(): void {
    this.stats = {
      totalProcessedNotifications: 0,
      totalErrors: 0,
      uptime: 0,
      lastActivity: null
    };
    this.startTime = new Date();
    logger.info('TIMEZONE_STATS', '統計情報をリセットしました');
  }
}