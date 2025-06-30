/**
 * ギャップ検出サービス
 * 活動記録がない時間帯を検出する
 */

import { IActivityLogRepository } from '../repositories/activityLogRepository';
import { ActivityLog } from '../types/activityLog';
import { toZonedTime, format } from 'date-fns-tz';

/**
 * 検出されたギャップ情報
 */
export interface TimeGap {
  startTime: string;      // ISO 8601形式（UTC）
  endTime: string;        // ISO 8601形式（UTC）
  startTimeLocal: string; // ローカル時刻表示用（HH:mm）
  endTimeLocal: string;   // ローカル時刻表示用（HH:mm）
  durationMinutes: number; // ギャップの長さ（分）
}

/**
 * ギャップ検出設定
 */
export interface GapDetectionConfig {
  minGapMinutes: number;    // 最小ギャップ時間（分）
  startHour: number;        // 検出開始時刻（時）
  startMinute: number;      // 検出開始時刻（分）
  endHour: number;          // 検出終了時刻（時）
  endMinute: number;        // 検出終了時刻（分）
}

/**
 * ギャップ検出サービスインターフェース
 */
export interface IGapDetectionService {
  /**
   * 指定日の活動ギャップを検出
   * @param userId ユーザーID
   * @param businessDate 業務日（YYYY-MM-DD）
   * @param timezone タイムゾーン
   * @returns 検出されたギャップのリスト
   */
  detectGaps(userId: string, businessDate: string, timezone: string): Promise<TimeGap[]>;
}

/**
 * ギャップ検出サービスの実装
 */
export class GapDetectionService implements IGapDetectionService {
  private config: GapDetectionConfig;

  constructor(
    private repository: IActivityLogRepository,
    config?: Partial<GapDetectionConfig>
  ) {
    // デフォルト設定
    this.config = {
      minGapMinutes: 15,    // 15分以上のギャップを検出
      startHour: 7,         // 7:30から
      startMinute: 30,
      endHour: 18,          // 18:30まで
      endMinute: 30,
      ...config
    };
  }

  /**
   * 指定日の活動ギャップを検出
   */
  async detectGaps(userId: string, businessDate: string, timezone: string): Promise<TimeGap[]> {
    try {
      // 業務日の活動ログを取得
      const logs = await this.repository.getLogsByDate(userId, businessDate);
      
      // 論理削除されていないログのみを対象にする
      const activeLogs = logs.filter(log => !log.isDeleted);
      
      if (activeLogs.length === 0) {
        // ログがない場合は、全時間帯がギャップ
        return this.createFullDayGap(businessDate, timezone);
      }

      // ログを時刻順にソート
      const sortedLogs = this.sortLogsByTime(activeLogs);
      
      // 検出対象時間帯の範囲を計算
      const { rangeStart, rangeEnd } = this.calculateDetectionRange(businessDate, timezone);
      
      // ギャップを検出
      const gaps: TimeGap[] = [];
      
      // ケース1: 開始時刻から最初のログまでのギャップ
      const firstGap = this.detectFirstGap(sortedLogs[0], rangeStart, timezone);
      if (firstGap) {
        gaps.push(firstGap);
      }
      
      // ケース2: ログ間のギャップ
      for (let i = 0; i < sortedLogs.length - 1; i++) {
        const gap = this.detectLogGap(sortedLogs[i], sortedLogs[i + 1], timezone);
        if (gap) {
          gaps.push(gap);
        }
      }
      
      // ケース3: 最後のログから終了時刻までのギャップ
      const lastGap = this.detectLastGap(sortedLogs[sortedLogs.length - 1], rangeEnd, timezone);
      if (lastGap) {
        gaps.push(lastGap);
      }
      
      return gaps;
    } catch (error) {
      console.error('❌ ギャップ検出エラー:', error);
      throw error;
    }
  }

  /**
   * 検出対象時間帯の範囲を計算
   */
  private calculateDetectionRange(businessDate: string, timezone: string): { rangeStart: Date; rangeEnd: Date } {
    // 業務日の開始時刻を計算（現地時間で7:30）
    const startLocal = new Date(`${businessDate}T00:00:00`);
    startLocal.setHours(this.config.startHour, this.config.startMinute, 0, 0);
    
    // 業務日の終了時刻を計算（現地時間で18:30）
    const endLocal = new Date(`${businessDate}T00:00:00`);
    endLocal.setHours(this.config.endHour, this.config.endMinute, 0, 0);
    
    // 現在時刻を取得
    const now = new Date();
    const nowLocal = toZonedTime(now, timezone);
    
    // 今日の場合は現在時刻と終了時刻の早い方を使用
    const today = format(nowLocal, 'yyyy-MM-dd', { timeZone: timezone });
    if (businessDate === today && nowLocal < endLocal) {
      return { rangeStart: startLocal, rangeEnd: nowLocal };
    }
    
    return { rangeStart: startLocal, rangeEnd: endLocal };
  }

  /**
   * ログがない場合の全時間帯ギャップを作成
   */
  private createFullDayGap(businessDate: string, timezone: string): TimeGap[] {
    const { rangeStart, rangeEnd } = this.calculateDetectionRange(businessDate, timezone);
    
    const gap = this.createGap(rangeStart, rangeEnd, timezone);
    return gap ? [gap] : [];
  }

  /**
   * 開始時刻から最初のログまでのギャップを検出
   */
  private detectFirstGap(firstLog: ActivityLog, rangeStart: Date, timezone: string): TimeGap | null {
    const logTime = new Date(firstLog.inputTimestamp);
    const logLocal = toZonedTime(logTime, timezone);
    
    // ログが範囲開始時刻より前の場合はギャップなし
    if (logLocal <= rangeStart) {
      return null;
    }
    
    return this.createGap(rangeStart, logLocal, timezone);
  }

  /**
   * ログ間のギャップを検出
   */
  private detectLogGap(prevLog: ActivityLog, nextLog: ActivityLog, timezone: string): TimeGap | null {
    const prevTime = new Date(prevLog.inputTimestamp);
    const nextTime = new Date(nextLog.inputTimestamp);
    
    const prevLocal = toZonedTime(prevTime, timezone);
    const nextLocal = toZonedTime(nextTime, timezone);
    
    return this.createGap(prevLocal, nextLocal, timezone);
  }

  /**
   * 最後のログから終了時刻までのギャップを検出
   */
  private detectLastGap(lastLog: ActivityLog, rangeEnd: Date, timezone: string): TimeGap | null {
    const logTime = new Date(lastLog.inputTimestamp);
    const logLocal = toZonedTime(logTime, timezone);
    
    // ログが範囲終了時刻より後の場合はギャップなし
    if (logLocal >= rangeEnd) {
      return null;
    }
    
    return this.createGap(logLocal, rangeEnd, timezone);
  }

  /**
   * ギャップを作成（最小時間以上の場合のみ）
   */
  private createGap(start: Date, end: Date, timezone: string): TimeGap | null {
    const durationMs = end.getTime() - start.getTime();
    const durationMinutes = Math.floor(durationMs / (1000 * 60));
    
    // 最小ギャップ時間未満の場合はnull
    if (durationMinutes < this.config.minGapMinutes) {
      return null;
    }
    
    // UTC時刻に変換
    const startUtc = new Date(start.getTime() - start.getTimezoneOffset() * 60 * 1000);
    const endUtc = new Date(end.getTime() - end.getTimezoneOffset() * 60 * 1000);
    
    return {
      startTime: startUtc.toISOString(),
      endTime: endUtc.toISOString(),
      startTimeLocal: format(start, 'HH:mm', { timeZone: timezone }),
      endTimeLocal: format(end, 'HH:mm', { timeZone: timezone }),
      durationMinutes
    };
  }

  /**
   * ログを時刻順にソート
   */
  private sortLogsByTime(logs: ActivityLog[]): ActivityLog[] {
    return [...logs].sort((a, b) => {
      const timeA = new Date(a.inputTimestamp).getTime();
      const timeB = new Date(b.inputTimestamp).getTime();
      return timeA - timeB;
    });
  }

  /**
   * 設定を更新
   */
  updateConfig(config: Partial<GapDetectionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 現在の設定を取得
   */
  getConfig(): GapDetectionConfig {
    return { ...this.config };
  }
}