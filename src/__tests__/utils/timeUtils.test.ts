import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  getCurrentTimeSlot,
  getTimeSlotForDate,
  isWorkingHours,
  getCurrentBusinessDate,
  getBusinessDateForDate,
  formatDate,
  formatTime,
  formatDateTime,
  getNextPromptTime,
  getTodaySummaryTime,
} from '../../utils/timeUtils';

describe('timeUtils', () => {
  // 現在の日時をモックするための設定
  let mockDate: Date;

  beforeEach(() => {
    // デフォルトのモック日時を設定
    mockDate = new Date('2024-01-15T14:25:00.000Z'); // 月曜日 23:25 JST
    jest.useFakeTimers();
    jest.setSystemTime(mockDate);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('getCurrentTimeSlot', () => {
    it('30分未満の場合は前の30分枠を返す', () => {
      // 14:25 の場合
      const result = getCurrentTimeSlot();
      
      expect(result.start.getHours()).toBe(23); // JST
      expect(result.start.getMinutes()).toBe(0);
      expect(result.end.getHours()).toBe(23);
      expect(result.end.getMinutes()).toBe(30);
      expect(result.label).toBe('23:00-23:30');
    });

    it('30分以上の場合は現在の30分枠を返す', () => {
      // 14:35 の場合
      jest.setSystemTime(new Date('2024-01-15T14:35:00.000Z'));
      const result = getCurrentTimeSlot();
      
      expect(result.start.getHours()).toBe(23);
      expect(result.start.getMinutes()).toBe(30);
      expect(result.end.getHours()).toBe(0);
      expect(result.end.getMinutes()).toBe(0);
      expect(result.label).toBe('23:30-00:00');
    });
  });

  describe('isWorkingHours', () => {
    it('平日の9:00-18:00の間はtrueを返す', () => {
      // 月曜日 10:00
      jest.setSystemTime(new Date('2024-01-15T01:00:00.000Z'));
      expect(isWorkingHours()).toBe(true);
      
      // 金曜日 17:59
      jest.setSystemTime(new Date('2024-01-19T08:59:00.000Z'));
      expect(isWorkingHours()).toBe(true);
    });

    it('平日の9:00前はfalseを返す', () => {
      // 月曜日 8:59
      jest.setSystemTime(new Date('2024-01-15T23:59:00.000Z'));
      expect(isWorkingHours()).toBe(false);
    });

    it('平日の18:00以降はfalseを返す', () => {
      // 月曜日 18:00
      jest.setSystemTime(new Date('2024-01-15T09:00:00.000Z'));
      expect(isWorkingHours()).toBe(false);
    });

    it('土日はfalseを返す', () => {
      // 土曜日 12:00
      jest.setSystemTime(new Date('2024-01-13T03:00:00.000Z'));
      expect(isWorkingHours()).toBe(false);
      
      // 日曜日 12:00
      jest.setSystemTime(new Date('2024-01-14T03:00:00.000Z'));
      expect(isWorkingHours()).toBe(false);
    });
  });

  describe('getCurrentBusinessDate', () => {
    it('5:00am以降は当日の日付を返す', () => {
      // 1月15日 10:00
      jest.setSystemTime(new Date('2024-01-15T01:00:00.000Z'));
      expect(getCurrentBusinessDate()).toBe('2024-01-15');
    });

    it('5:00am未満は前日の日付を返す', () => {
      // 1月15日 4:59
      jest.setSystemTime(new Date('2024-01-14T19:59:00.000Z'));
      expect(getCurrentBusinessDate()).toBe('2024-01-14');
    });
  });

  describe('formatDate', () => {
    it('日付をYYYY-MM-DD形式でフォーマットする', () => {
      const date = new Date('2024-01-15T14:25:00.000Z');
      expect(formatDate(date)).toBe('2024-01-15');
    });
  });

  describe('formatTime', () => {
    it('時刻をHH:MM形式でフォーマットする', () => {
      const date = new Date('2024-01-15T14:25:30.000Z');
      expect(formatTime(date)).toBe('23:25'); // JST
    });
  });

  describe('formatDateTime', () => {
    it('日時をYYYY-MM-DD HH:MM:SS形式でフォーマットする', () => {
      const date = new Date('2024-01-15T14:25:30.000Z');
      expect(formatDateTime(date)).toBe('2024-01-15 14:25:30');
    });
  });

  describe('getNextPromptTime', () => {
    it('現在が0-29分の場合は30分を返す', () => {
      // 14:25の場合
      const result = getNextPromptTime();
      expect(result.getMinutes()).toBe(30);
    });

    it('現在が30-59分の場合は次の時間の0分を返す', () => {
      // 14:35の場合
      jest.setSystemTime(new Date('2024-01-15T14:35:00.000Z'));
      const result = getNextPromptTime();
      expect(result.getMinutes()).toBe(0);
      expect(result.getHours()).toBe(0); // 翌日の0時 JST
    });
  });

  describe('getTodaySummaryTime', () => {
    it('今日の18:00を返す', () => {
      const result = getTodaySummaryTime();
      expect(result.getHours()).toBe(18);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
    });
  });

  describe('getTimeSlotForDate', () => {
    it('指定された日時の30分枠を返す', () => {
      const date = new Date('2024-01-15T14:45:00.000Z');
      const result = getTimeSlotForDate(date);
      
      expect(result.start.getMinutes()).toBe(30);
      expect(result.end.getMinutes()).toBe(0);
      expect(result.label).toBe('23:30-00:00');
    });
  });

  describe('getBusinessDateForDate', () => {
    it('指定された日時の業務日を返す（5:00am境界）', () => {
      // 1月15日 6:00
      const date1 = new Date('2024-01-14T21:00:00.000Z');
      expect(getBusinessDateForDate(date1)).toBe('2024-01-15');
      
      // 1月15日 4:00
      const date2 = new Date('2024-01-14T19:00:00.000Z');
      expect(getBusinessDateForDate(date2)).toBe('2024-01-14');
    });
  });
});