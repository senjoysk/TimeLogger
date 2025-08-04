import { config } from '../config';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { addMinutes, setMinutes, setHours, setSeconds, getHours, getMinutes, getDay, subMinutes, subDays, format } from 'date-fns';
import { TimeProviderFactory } from '../services/timeProviderFactory';

/**
 * 時間枠の定義
 */
export interface TimeSlot {
  start: Date;
  end: Date;
  label: string;
}

/**
 * 指定されたタイムゾーンで現在時刻のタイムスロットを取得
 * @param timezone タイムゾーン文字列 (例: 'Asia/Tokyo')
 * @returns 現在のタイムスロット
 */
export function getCurrentTimeSlot(timezone: string): TimeSlot {
  const now = TimeProviderFactory.getGlobalInstance().now();
  const zonedNow = toZonedTime(now, timezone);

  // ユーザー体験としては「前の枠」に記録したいので、30分前の時刻を計算
  const targetTime = subMinutes(zonedNow, 30);

  const minutes = getMinutes(targetTime);
  const slotMinutes = minutes < 30 ? 0 : 30;

  let start = setMinutes(targetTime, slotMinutes);
  start = setSeconds(start, 0);

  const end = addMinutes(start, 30);

  const label = `${format(start, 'HH:mm')}-${format(end, 'HH:mm')}`;

  // UTCに戻して返す
  return {
    start: fromZonedTime(start, timezone),
    end: fromZonedTime(end, timezone),
    label
  };
}

/**
 * 指定されたタイムゾーンで現在が勤務時間内か判定
 * @param timezone タイムゾーン文字列
 * @returns 勤務時間内であればtrue
 */
export function isWorkingHours(timezone: string): boolean {
  const zonedNow = toZonedTime(TimeProviderFactory.getGlobalInstance().now(), timezone);
  const hour = getHours(zonedNow);
  const day = getDay(zonedNow); // 0: Sunday, 1: Monday, ..., 6: Saturday

  if (day === 0 || day === 6) {
    return false;
  }

  return hour >= config.app.workingHours.start && hour < config.app.workingHours.end;
}

/**
 * 指定されたタイムゾーンで現在の業務日を取得
 * @param timezone タイムゾーン文字列
 * @returns 業務日 (YYYY-MM-DD)
 */
export function getCurrentBusinessDate(timezone: string): string {
  return getBusinessDateForDate(TimeProviderFactory.getGlobalInstance().now(), timezone);
}

/**
 * 指定されたタイムゾーンで特定の日付の業務日を取得
 * @param date 日付オブジェクト
 * @param timezone タイムゾーン文字列
 * @returns 業務日 (YYYY-MM-DD)
 */
export function getBusinessDateForDate(date: Date, timezone: string): string {
  let zonedDate = toZonedTime(date, timezone);

  if (getHours(zonedDate) < config.app.dayBoundary.start) {
    zonedDate = subDays(zonedDate, 1);
  }

  return format(zonedDate, 'yyyy-MM-dd');
}

/**
 * 指定されたタイムゾーンで日付をフォーマット
 * @param date 日付オブジェクト
 * @param timezone タイムゾーン文字列
 * @returns フォーマットされた日付 (YYYY-MM-DD)
 */
export function formatDate(date: Date, timezone: string): string {
  return format(toZonedTime(date, timezone), 'yyyy-MM-dd');
}

/**
 * 指定されたタイムゾーンで時刻をフォーマット
 * @param date 日付オブジェクト
 * @param timezone タイムゾーン文字列
 * @returns フォーマットされた時刻 (HH:mm)
 */
export function formatTime(date: Date, timezone: string): string {
  return format(toZonedTime(date, timezone), 'HH:mm');
}

/**
 * 指定されたタイムゾーンで日時をフォーマット
 * @param date 日付オブジェクト
 * @param timezone タイムゾーン文字列
 * @returns フォーマットされた日時 (YYYY-MM-DD HH:mm:ss)
 */
export function formatDateTime(date: Date, timezone: string): string {
  return format(toZonedTime(date, timezone), 'yyyy-MM-dd HH:mm:ss');
}

/**
 * 次の問いかけ時刻を計算
 * @param timezone タイムゾーン文字列
 * @returns 次の問いかけ時刻 (UTC)
 */
export function getNextPromptTime(timezone: string): Date {
  const now = TimeProviderFactory.getGlobalInstance().now();
  let zonedNow = toZonedTime(now, timezone);
  let next = new Date(zonedNow);

  const currentMinutes = getMinutes(zonedNow);
  if (currentMinutes < 30) {
    next = setMinutes(zonedNow, 30);
  } else {
    next = setHours(zonedNow, getHours(zonedNow) + 1);
    next = setMinutes(next, 0);
  }

  // UTCに戻して返す
  return fromZonedTime(next, timezone);
}

/**
 * 今日のサマリー生成時刻を計算
 * @param timezone タイムゾーン文字列
 * @returns サマリー生成時刻 (UTC)
 */
export function getTodaySummaryTime(timezone: string): Date {
  const now = TimeProviderFactory.getGlobalInstance().now();
  let zonedNow = toZonedTime(now, timezone);
  
  let summaryTime = setHours(zonedNow, config.app.summaryTime.hour);
  summaryTime = setMinutes(summaryTime, config.app.summaryTime.minute);

  // UTCに戻して返す
  return fromZonedTime(summaryTime, timezone);
}
