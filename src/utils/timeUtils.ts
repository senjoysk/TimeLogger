import { TimeSlot } from '../types';
import { config } from '../config';

/**
 * 時間関連のユーティリティ関数
 */

/**
 * 現在の30分間隔の時間枠を取得
 * @returns 現在の30分間隔のTimeSlot
 */
export function getCurrentTimeSlot(): TimeSlot {
  const now = new Date();
  const minutes = now.getMinutes();
  
  // 30分未満は前の30分枠、30分以上は現在の30分枠
  const slotMinutes = minutes < 30 ? 0 : 30;
  
  const start = new Date(now);
  start.setMinutes(slotMinutes, 0, 0); // 秒とミリ秒を0にリセット
  
  const end = new Date(start);
  end.setMinutes(start.getMinutes() + 30);
  
  const label = `${formatTime(start)}-${formatTime(end)}`;
  
  return { start, end, label };
}

/**
 * 指定された時刻の30分間隔の時間枠を取得
 * @param date 対象の日時
 * @returns 指定時刻の30分間隔のTimeSlot
 */
export function getTimeSlotForDate(date: Date): TimeSlot {
  const minutes = date.getMinutes();
  const slotMinutes = minutes < 30 ? 0 : 30;
  
  const start = new Date(date);
  start.setMinutes(slotMinutes, 0, 0);
  
  const end = new Date(start);
  end.setMinutes(start.getMinutes() + 30);
  
  const label = `${formatTime(start)}-${formatTime(end)}`;
  
  return { start, end, label };
}

/**
 * 現在が働く時間帯かどうかをチェック
 * @returns 働く時間帯の場合true
 */
export function isWorkingHours(): boolean {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay(); // 0: 日曜日, 1: 月曜日, ..., 6: 土曜日
  
  // 土日は対象外
  if (day === 0 || day === 6) {
    return false;
  }
  
  // 平日の9:00-18:00
  return hour >= config.app.workingHours.start && hour < config.app.workingHours.end;
}

/**
 * 現在の日付を取得（5:00am境界基準）
 * @returns YYYY-MM-DD形式の日付文字列
 */
export function getCurrentBusinessDate(): string {
  const now = new Date();
  
  // 5:00am未満の場合は前日とみなす
  if (now.getHours() < config.app.dayBoundary.start) {
    now.setDate(now.getDate() - 1);
  }
  
  return formatDate(now);
}

/**
 * 指定された日時の業務日を取得（5:00am境界基準）
 * @param date 対象の日時
 * @returns YYYY-MM-DD形式の日付文字列
 */
export function getBusinessDateForDate(date: Date): string {
  const businessDate = new Date(date);
  
  if (businessDate.getHours() < config.app.dayBoundary.start) {
    businessDate.setDate(businessDate.getDate() - 1);
  }
  
  return formatDate(businessDate);
}

/**
 * 日付をYYYY-MM-DD形式でフォーマット
 * @param date フォーマット対象の日付
 * @returns YYYY-MM-DD形式の文字列
 */
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * 時刻をHH:MM形式でフォーマット
 * @param date フォーマット対象の日時
 * @returns HH:MM形式の文字列
 */
export function formatTime(date: Date): string {
  return date.toTimeString().slice(0, 5);
}

/**
 * 日時をYYYY-MM-DD HH:MM:SS形式でフォーマット
 * @param date フォーマット対象の日時
 * @returns YYYY-MM-DD HH:MM:SS形式の文字列
 */
export function formatDateTime(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * 次回の問いかけ時刻を計算
 * @returns 次回の問いかけ時刻
 */
export function getNextPromptTime(): Date {
  const now = new Date();
  const next = new Date(now);
  
  // 現在の分数に基づいて次の30分区切りを計算
  const currentMinutes = now.getMinutes();
  let nextMinutes: number;
  
  if (currentMinutes < 30) {
    nextMinutes = 30;
  } else {
    nextMinutes = 0;
    next.setHours(next.getHours() + 1);
  }
  
  next.setMinutes(nextMinutes, 0, 0);
  
  return next;
}

/**
 * 今日のサマリー生成時刻を取得
 * @returns 今日の18:00の Date オブジェクト
 */
export function getTodaySummaryTime(): Date {
  const now = new Date();
  const summaryTime = new Date(now);
  
  summaryTime.setHours(
    config.app.summaryTime.hour,
    config.app.summaryTime.minute,
    0,
    0
  );
  
  return summaryTime;
}