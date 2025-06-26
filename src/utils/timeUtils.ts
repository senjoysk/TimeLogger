import { TimeSlot } from '../types';
import { config } from '../config';

const JST_OFFSET = 9 * 60 * 60 * 1000; // 9 hours in milliseconds

function getJSTDate(date: Date): Date {
  return new Date(date.getTime() + JST_OFFSET);
}

export function getTimeSlotForDate(date: Date): TimeSlot {
  const utcDate = new Date(date);
  const minutes = utcDate.getUTCMinutes();
  const slotMinutes = minutes < 30 ? 0 : 30;

  const start = new Date(utcDate);
  start.setUTCMinutes(slotMinutes, 0, 0);

  const end = new Date(start.getTime() + 30 * 60 * 1000);

  const label = `${formatTime(start)}-${formatTime(end)}`;

  return { start, end, label };
}

export function getCurrentTimeSlot(): TimeSlot {
    // 現在時刻をUTCで取得し、そこからタイムスロットを計算する
    // ただし、ユーザー体験としてはJSTの「前の枠」に記録したい
    const now = new Date();
    const jstNow = getJSTDate(now);
    
    // JSTでの現在時刻の30分前の時刻を計算
    const targetTime = new Date(jstNow.getTime() - 30 * 60 * 1000);
    
    // 30分前の時刻が属するスロットを計算
    return getTimeSlotForDate(targetTime);
}


export function isWorkingHours(): boolean {
  const jstNow = getJSTDate(new Date());
  const hour = jstNow.getUTCHours();
  const day = jstNow.getUTCDay(); // 0: Sunday, 1: Monday, ..., 6: Saturday

  if (day === 0 || day === 6) {
    return false;
  }

  return hour >= config.app.workingHours.start && hour < config.app.workingHours.end;
}

export function getCurrentBusinessDate(): string {
  return getBusinessDateForDate(new Date());
}

export function getBusinessDateForDate(date: Date): string {
  const jstDate = getJSTDate(date);

  if (jstDate.getUTCHours() < config.app.dayBoundary.start) {
    jstDate.setUTCDate(jstDate.getUTCDate() - 1);
  }

  return formatDate(jstDate);
}

export function formatDate(date: Date): string {
  return getJSTDate(date).toISOString().split('T')[0];
}

export function formatTime(date: Date): string {
  return getJSTDate(date).toISOString().substr(11, 5);
}

export function formatDateTime(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

export function getNextPromptTime(): Date {
  const now = new Date();
  const jstNow = getJSTDate(now);
  const next = new Date(jstNow);

  const currentMinutes = jstNow.getUTCMinutes();
  if (currentMinutes < 30) {
    next.setUTCMinutes(30, 0, 0);
  } else {
    next.setUTCHours(jstNow.getUTCHours() + 1, 0, 0, 0);
  }

  // Convert back to UTC for the timer
  return new Date(next.getTime() - JST_OFFSET);
}

export function getTodaySummaryTime(): Date {
  const now = new Date();
  const jstDate = getJSTDate(now);
  
  const summaryTime = new Date(jstDate);
  summaryTime.setUTCHours(config.app.summaryTime.hour, config.app.summaryTime.minute, 0, 0);

  // Convert back to UTC for the timer
  return new Date(summaryTime.getTime() - JST_OFFSET);
}
