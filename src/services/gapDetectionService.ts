/**
 * ギャップ検出サービス
 * 活動記録がない時間帯を検出する
 */

import { IActivityLogRepository } from '../repositories/activityLogRepository';
import { DailyAnalysisResult, TimelineEntry } from '../types/activityLog';
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
   * 分析結果からギャップを検出
   * @param analysisResult 分析結果
   * @param timezone タイムゾーン
   * @returns 検出されたギャップのリスト
   */
  detectGapsFromAnalysis(analysisResult: DailyAnalysisResult, timezone: string): Promise<TimeGap[]>;
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
   * 分析結果からギャップを検出
   */
  async detectGapsFromAnalysis(analysisResult: DailyAnalysisResult, timezone: string): Promise<TimeGap[]> {
    try {
      console.log(`📊 分析結果からギャップ検出: ${analysisResult.timeline.length}個のタイムライン`);
      
      if (!analysisResult.timeline || analysisResult.timeline.length === 0) {
        // タイムラインがない場合は全時間帯がギャップ
        return this.createFullDayGapFromDate(analysisResult.businessDate, timezone);
      }
      
      // タイムラインを時刻順にソート
      const sortedTimeline = this.sortTimelineByTime(analysisResult.timeline);
      
      // 検出対象時間帯の範囲を計算
      const { rangeStart, rangeEnd } = this.calculateDetectionRange(analysisResult.businessDate, timezone);
      
      const gaps: TimeGap[] = [];
      
      // ケース1: 開始時刻から最初の活動まで
      const firstGap = this.detectFirstGapFromTimeline(sortedTimeline[0], rangeStart, timezone);
      if (firstGap) {
        gaps.push(firstGap);
      }
      
      // ケース2: 活動間のギャップ
      for (let i = 0; i < sortedTimeline.length - 1; i++) {
        const gap = this.detectTimelineGap(sortedTimeline[i], sortedTimeline[i + 1], timezone);
        if (gap) {
          gaps.push(gap);
        }
      }
      
      // ケース3: 最後の活動から終了時刻まで
      const lastGap = this.detectLastGapFromTimeline(sortedTimeline[sortedTimeline.length - 1], rangeEnd, timezone);
      if (lastGap) {
        gaps.push(lastGap);
      }
      
      console.log(`📊 分析結果ベースギャップ検出完了: ${gaps.length}件`);
      return gaps;
      
    } catch (error) {
      console.error('❌ 分析結果ベースギャップ検出エラー:', error);
      throw error;
    }
  }

  /**
   * 検出対象時間帯の範囲を計算
   */
  private calculateDetectionRange(businessDate: string, timezone: string): { rangeStart: Date; rangeEnd: Date } {
    // 業務日の開始時刻を計算（指定タイムゾーンで7:30）
    const startTimeStr = `${businessDate}T${this.config.startHour.toString().padStart(2, '0')}:${this.config.startMinute.toString().padStart(2, '0')}:00`;
    const startLocal = new Date(startTimeStr);
    
    // 業務日の終了時刻を計算（指定タイムゾーンで18:30）
    const endTimeStr = `${businessDate}T${this.config.endHour.toString().padStart(2, '0')}:${this.config.endMinute.toString().padStart(2, '0')}:00`;
    const endLocal = new Date(endTimeStr);
    
    // 現在時刻を取得
    const now = new Date();
    const nowLocal = toZonedTime(now, timezone);
    
    // 今日の場合は現在時刻と終了時刻の早い方を使用
    const today = format(nowLocal, 'yyyy-MM-dd', { timeZone: timezone });
    if (businessDate === today) {
      const currentTime = new Date(format(nowLocal, "yyyy-MM-dd'T'HH:mm:ss", { timeZone: timezone }));
      if (currentTime < endLocal) {
        return { rangeStart: startLocal, rangeEnd: currentTime };
      }
    }
    
    return { rangeStart: startLocal, rangeEnd: endLocal };
  }


  /**
   * ログがない場合の全時間帯ギャップを作成
   */
  private createFullDayGapFromDate(businessDate: string, timezone: string): TimeGap[] {
    const { rangeStart, rangeEnd } = this.calculateDetectionRange(businessDate, timezone);
    
    const gap = this.createGap(rangeStart, rangeEnd, timezone);
    return gap ? [gap] : [];
  }

  /**
   * ギャップを作成（最小時間以上の場合のみ）
   */
  private createGap(start: Date, end: Date, _timezone: string): TimeGap | null {
    const durationMs = end.getTime() - start.getTime();
    const durationMinutes = Math.floor(durationMs / (1000 * 60));
    
    // 最小ギャップ時間未満の場合はnull
    if (durationMinutes < this.config.minGapMinutes) {
      return null;
    }
    
    // ローカル時刻をそのままISO形式に変換（UTCとして扱う）
    const startTime = start.toISOString();
    const endTime = end.toISOString();
    
    return {
      startTime,
      endTime,
      startTimeLocal: format(start, 'HH:mm'),
      endTimeLocal: format(end, 'HH:mm'),
      durationMinutes
    };
  }


  /**
   * タイムラインを時刻順にソート
   */
  private sortTimelineByTime(timeline: TimelineEntry[]): TimelineEntry[] {
    return [...timeline].sort((a, b) => {
      const timeA = new Date(a.startTime).getTime();
      const timeB = new Date(b.startTime).getTime();
      return timeA - timeB;
    });
  }

  /**
   * タイムライン：開始時刻から最初の活動までのギャップを検出
   */
  private detectFirstGapFromTimeline(firstEntry: TimelineEntry, rangeStart: Date, timezone: string): TimeGap | null {
    const entryStartTime = new Date(firstEntry.startTime);
    const entryStartLocal = toZonedTime(entryStartTime, timezone);
    
    // 活動の現地開始時刻を文字列に変換してからDateオブジェクトに変換（タイムゾーン問題回避）
    const entryStartLocalTime = new Date(format(entryStartLocal, "yyyy-MM-dd'T'HH:mm:ss", { timeZone: timezone }));
    
    // 活動が範囲開始時刻より前の場合はギャップなし
    if (entryStartLocalTime <= rangeStart) {
      return null;
    }
    
    return this.createGap(rangeStart, entryStartLocalTime, timezone);
  }

  /**
   * タイムライン：活動間のギャップを検出
   */
  private detectTimelineGap(prevEntry: TimelineEntry, nextEntry: TimelineEntry, timezone: string): TimeGap | null {
    const prevEndTime = new Date(prevEntry.endTime);
    const nextStartTime = new Date(nextEntry.startTime);
    
    const prevEndLocal = toZonedTime(prevEndTime, timezone);
    const nextStartLocal = toZonedTime(nextStartTime, timezone);
    
    // 現地時刻を文字列に変換してからDateオブジェクトに変換（タイムゾーン問題回避）
    const prevEndLocalTime = new Date(format(prevEndLocal, "yyyy-MM-dd'T'HH:mm:ss", { timeZone: timezone }));
    const nextStartLocalTime = new Date(format(nextStartLocal, "yyyy-MM-dd'T'HH:mm:ss", { timeZone: timezone }));
    
    return this.createGap(prevEndLocalTime, nextStartLocalTime, timezone);
  }

  /**
   * タイムライン：最後の活動から終了時刻までのギャップを検出
   */
  private detectLastGapFromTimeline(lastEntry: TimelineEntry, rangeEnd: Date, timezone: string): TimeGap | null {
    const entryEndTime = new Date(lastEntry.endTime);
    const entryEndLocal = toZonedTime(entryEndTime, timezone);
    
    // 活動の現地終了時刻を文字列に変換してからDateオブジェクトに変換（タイムゾーン問題回避）
    const entryEndLocalTime = new Date(format(entryEndLocal, "yyyy-MM-dd'T'HH:mm:ss", { timeZone: timezone }));
    
    // 活動が範囲終了時刻より後の場合はギャップなし
    if (entryEndLocalTime >= rangeEnd) {
      return null;
    }
    
    return this.createGap(entryEndLocalTime, rangeEnd, timezone);
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