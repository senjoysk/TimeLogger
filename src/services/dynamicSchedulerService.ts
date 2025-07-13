/**
 * 動的スケジューリングサービス
 * ユーザー別タイムゾーンに基づいてサスペンド・起床時刻を動的に管理
 */

import { toZonedTime, format } from 'date-fns-tz';
import { SqliteActivityLogRepository } from '../repositories/sqliteActivityLogRepository';
import { withErrorHandling, AppError } from '../utils/errorHandler';

export interface UserSuspendSchedule {
  userId: string;
  timezone: string;
  suspendHour: number;
  wakeHour: number;
  nextSuspendUtc: Date;
  nextWakeUtc: Date;
}

export interface ScheduleCheckResult {
  shouldSuspend: boolean;
  shouldWake: boolean;
  suspendUsers: string[];
  wakeUsers: string[];
  currentUtc: Date;
}

export class DynamicSchedulerService {
  constructor(private repository: SqliteActivityLogRepository) {}

  /**
   * 現在時刻で実行すべきサスペンド・起床ユーザーをチェック
   * @param toleranceMinutes 実行許容時間（分）
   * @returns スケジュール実行結果
   */
  async checkSchedule(toleranceMinutes: number = 30): Promise<ScheduleCheckResult> {
    const currentUtc = new Date();
    const suspendUsers: string[] = [];
    const wakeUsers: string[] = [];

    try {
      const userSchedules = await this.getAllUserSchedules();
      
      for (const schedule of userSchedules) {
        // サスペンド時刻チェック
        const isSuspendTime = this.isTimeToExecute(currentUtc, schedule.nextSuspendUtc, toleranceMinutes);
        if (isSuspendTime) {
          suspendUsers.push(schedule.userId);
          console.log(`🌙 サスペンド対象: ${schedule.userId} (${schedule.nextSuspendUtc.toISOString()})`);
        }
        
        // 起床時刻チェック
        const isWakeTime = this.isTimeToExecute(currentUtc, schedule.nextWakeUtc, toleranceMinutes);
        if (isWakeTime) {
          wakeUsers.push(schedule.userId);
          console.log(`🌅 起床対象: ${schedule.userId} (${schedule.nextWakeUtc.toISOString()})`);
        }
      }

      console.log(`⏰ スケジュールチェック完了: ${currentUtc.toISOString()}`);
      console.log(`　🌙 サスペンド対象: ${suspendUsers.length}ユーザー [${suspendUsers.join(', ')}]`);
      console.log(`　🌅 起床対象: ${wakeUsers.length}ユーザー [${wakeUsers.join(', ')}]`);

      return {
        shouldSuspend: suspendUsers.length > 0,
        shouldWake: wakeUsers.length > 0,
        suspendUsers,
        wakeUsers,
        currentUtc
      };
    } catch (error) {
      console.error('❌ スケジュールチェック詳細エラー:', error);
      console.error('❌ エラーのスタックトレース:', error instanceof Error ? error.stack : 'スタックトレースなし');
      throw new Error(`動的スケジュールチェックに失敗しました: ${error}`);
    }
  }

  /**
   * 全ユーザーのスケジュール設定を取得
   */
  async getAllUserSchedules(): Promise<UserSuspendSchedule[]> {
    try {
      const userSettings = await this.repository.getAllUserSuspendSchedules();
      const schedules: UserSuspendSchedule[] = [];
      const currentUtc = new Date();
      
      for (const [userId, settings] of Object.entries(userSettings)) {
        const typedSettings = settings as { suspendHour: number; wakeHour: number; timezone: string };
        
        // NULL値チェック（デフォルト値で補完）
        if (typedSettings.suspendHour === null || typedSettings.suspendHour === undefined) {
          console.warn(`⚠️ ユーザー ${userId}: suspend_hourがNULL, デフォルト値(0)を使用`);
          typedSettings.suspendHour = 0;
        }
        if (typedSettings.wakeHour === null || typedSettings.wakeHour === undefined) {
          console.warn(`⚠️ ユーザー ${userId}: wake_hourがNULL, デフォルト値(7)を使用`);
          typedSettings.wakeHour = 7;
        }
        if (!typedSettings.timezone) {
          console.warn(`⚠️ ユーザー ${userId}: timezoneがNULL, デフォルト値(Asia/Tokyo)を使用`);
          typedSettings.timezone = 'Asia/Tokyo';
        }
        
        const schedule = this.calculateUserSchedule(
          userId,
          typedSettings.timezone,
          typedSettings.suspendHour,
          typedSettings.wakeHour,
          currentUtc
        );
        schedules.push(schedule);
      }
      return schedules;
    } catch (error) {
      console.error('❌ 全ユーザースケジュール取得詳細エラー:', error);
      console.error('❌ エラーのスタックトレース:', error instanceof Error ? error.stack : 'スタックトレースなし');
      throw new Error(`ユーザースケジュール取得に失敗しました: ${error}`);
    }
  }

  /**
   * ユーザー個別のスケジュールを計算
   */
  private calculateUserSchedule(
    userId: string,
    timezone: string,
    suspendHour: number,
    wakeHour: number,
    referenceTime: Date
  ): UserSuspendSchedule {
    // 今日の日付でローカル時刻を作成
    const today = toZonedTime(referenceTime, timezone);
    const todayDate = format(today, 'yyyy-MM-dd', { timeZone: timezone });
    
    // サスペンド時刻（今日）
    const suspendLocalToday = new Date(`${todayDate}T${suspendHour.toString().padStart(2, '0')}:00:00`);
    const suspendUtcToday = this.convertLocalToUtc(suspendLocalToday, timezone);
    
    // 起床時刻の計算（翌日になる可能性を考慮）
    let wakeLocalDate = todayDate;
    if (wakeHour <= suspendHour) {
      // 起床時刻がサスペンド時刻より早い＝翌日
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      wakeLocalDate = format(tomorrow, 'yyyy-MM-dd', { timeZone: timezone });
    }
    
    const wakeLocalTime = new Date(`${wakeLocalDate}T${wakeHour.toString().padStart(2, '0')}:00:00`);
    const wakeUtcTime = this.convertLocalToUtc(wakeLocalTime, timezone);
    
    // 既に過ぎている場合は翌日にシフト
    const nextSuspendUtc = suspendUtcToday <= referenceTime 
      ? new Date(suspendUtcToday.getTime() + 24 * 60 * 60 * 1000)
      : suspendUtcToday;
      
    const nextWakeUtc = wakeUtcTime <= referenceTime 
      ? new Date(wakeUtcTime.getTime() + 24 * 60 * 60 * 1000)
      : wakeUtcTime;

    return {
      userId,
      timezone,
      suspendHour,
      wakeHour,
      nextSuspendUtc,
      nextWakeUtc
    };
  }

  /**
   * ローカル時刻をUTCに変換
   */
  private convertLocalToUtc(localTime: Date, timezone: string): Date {
    // date-fns-tzを使用してタイムゾーン変換
    const zonedTime = toZonedTime(localTime, timezone);
    
    // タイムゾーンオフセットを考慮してUTC時刻を計算
    const offsetMinutes = this.getTimezoneOffsetMinutes(timezone, localTime);
    return new Date(localTime.getTime() - (offsetMinutes * 60 * 1000));
  }

  /**
   * 指定時刻のタイムゾーンオフセット（分）を取得
   */
  private getTimezoneOffsetMinutes(timezone: string, date: Date): number {
    // Intl.DateTimeFormat を使用してより正確なオフセットを取得
    const formatter = new Intl.DateTimeFormat('en', {
      timeZone: timezone,
      timeZoneName: 'longOffset'
    });
    
    const parts = formatter.formatToParts(date);
    const offsetPart = parts.find(part => part.type === 'timeZoneName');
    
    if (!offsetPart) {
      // フォールバック: date-fns-tzを使用
      const utc = new Date(date.getTime() + (date.getTimezoneOffset() * 60000));
      const zoned = toZonedTime(utc, timezone);
      return (zoned.getTime() - utc.getTime()) / (60 * 1000);
    }
    
    // GMT+09:00 形式をパース
    const offsetString = offsetPart.value;
    const match = offsetString.match(/GMT([+-])(\d{2}):(\d{2})/);
    
    if (!match) {
      return 0; // パースできない場合は0を返す
    }
    
    const sign = match[1] === '+' ? 1 : -1;
    const hours = parseInt(match[2]);
    const minutes = parseInt(match[3]);
    
    return sign * (hours * 60 + minutes);
  }

  /**
   * 指定時刻が実行時刻範囲内かチェック
   */
  private isTimeToExecute(currentTime: Date, targetTime: Date, toleranceMinutes: number): boolean {
    const timeDiff = Math.abs(currentTime.getTime() - targetTime.getTime());
    const toleranceMs = toleranceMinutes * 60 * 1000;
    
    return timeDiff <= toleranceMs;
  }

  /**
   * 次回実行予定時刻を取得（デバッグ用）
   */
  async getNextExecutionTimes(): Promise<{
    nextSuspend: { time: Date; users: string[] } | null;
    nextWake: { time: Date; users: string[] } | null;
  }> {
    try {
      const schedules = await this.getAllUserSchedules();
      
      // 次回サスペンド時刻を見つける
      const suspendTimes = schedules.map(s => ({ time: s.nextSuspendUtc, userId: s.userId }));
      suspendTimes.sort((a, b) => a.time.getTime() - b.time.getTime());
      
      // 次回起床時刻を見つける
      const wakeTimes = schedules.map(s => ({ time: s.nextWakeUtc, userId: s.userId }));
      wakeTimes.sort((a, b) => a.time.getTime() - b.time.getTime());
      
      const nextSuspend = suspendTimes.length > 0 
        ? {
            time: suspendTimes[0].time,
            users: suspendTimes.filter(s => s.time.getTime() === suspendTimes[0].time.getTime()).map(s => s.userId)
          }
        : null;
        
      const nextWake = wakeTimes.length > 0
        ? {
            time: wakeTimes[0].time,
            users: wakeTimes.filter(w => w.time.getTime() === wakeTimes[0].time.getTime()).map(w => w.userId)
          }
        : null;
      
      return { nextSuspend, nextWake };
    } catch (error) {
      console.error('❌ 次回実行時刻取得エラー:', error);
      throw new Error(`次回実行時刻の取得に失敗しました: ${error}`);
    }
  }

  /**
   * GitHub Actions Cron式を生成（30分間隔で実行）
   */
  generateCronExpression(): string {
    // 30分間隔で実行: 毎時0分と30分
    return '0,30 * * * *';
  }

  /**
   * スケジュール設定の統計情報を取得
   */
  async getScheduleStatistics(): Promise<{
    totalUsers: number;
    timezoneDistribution: { [timezone: string]: number };
    scheduleDistribution: { [schedule: string]: number };
  }> {
    try {
      const userSettings = await this.repository.getAllUserSuspendSchedules();
      const totalUsers = Object.keys(userSettings).length;
      
      const timezoneDistribution: { [timezone: string]: number } = {};
      const scheduleDistribution: { [schedule: string]: number } = {};
      
      for (const settings of Object.values(userSettings)) {
        const typedSettings = settings as { suspendHour: number; wakeHour: number; timezone: string };
        
        // タイムゾーン分布
        timezoneDistribution[typedSettings.timezone] = (timezoneDistribution[typedSettings.timezone] || 0) + 1;
        
        // スケジュール分布
        const scheduleKey = `${typedSettings.suspendHour.toString().padStart(2, '0')}:00-${typedSettings.wakeHour.toString().padStart(2, '0')}:00`;
        scheduleDistribution[scheduleKey] = (scheduleDistribution[scheduleKey] || 0) + 1;
      }
      
      return {
        totalUsers,
        timezoneDistribution,
        scheduleDistribution
      };
    } catch (error) {
      console.error('❌ スケジュール統計取得エラー:', error);
      throw new Error(`スケジュール統計の取得に失敗しました: ${error}`);
    }
  }
}