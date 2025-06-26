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
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('getTimeSlotForDate', () => {
    it('should return the correct 30-minute slot for a given UTC date', () => {
      const date = new Date('2024-01-15T14:45:00.000Z');
      const result = getTimeSlotForDate(date);
      expect(result.start.toISOString()).toBe('2024-01-15T14:30:00.000Z');
      expect(result.end.toISOString()).toBe('2024-01-15T15:00:00.000Z');
      // The label should be in JST
      expect(result.label).toBe('23:30-00:00');
    });
  });

  describe('isWorkingHours', () => {
    it('should return true for weekdays between 9:00 and 18:00 JST', () => {
      // Monday 10:00 JST (01:00 UTC)
      jest.setSystemTime(new Date('2024-01-15T01:00:00.000Z'));
      expect(isWorkingHours()).toBe(true);
    });

    it('should return false for weekdays at or after 18:00 JST', () => {
      // Monday 18:00 JST (09:00 UTC)
      jest.setSystemTime(new Date('2024-01-15T09:00:00.000Z'));
      expect(isWorkingHours()).toBe(false);
    });
  });

  describe('getBusinessDateForDate', () => {
    it('should return the correct business date based on the 5:00 AM JST cutoff', () => {
      // Jan 15, 6:00 JST (21:00 UTC on Jan 14)
      const date1 = new Date('2024-01-14T21:00:00.000Z');
      expect(getBusinessDateForDate(date1)).toBe('2024-01-15');

      // Jan 15, 4:59 JST (19:59 UTC on Jan 14)
      const date2 = new Date('2024-01-14T19:59:00.000Z');
      expect(getBusinessDateForDate(date2)).toBe('2024-01-14');
    });
  });

  describe('formatTime', () => {
    it('should format the time as HH:MM in JST', () => {
      const date = new Date('2024-01-15T14:25:30.000Z'); // 23:25 JST
      expect(formatTime(date)).toBe('23:25');
    });
  });

  describe('formatDateTime', () => {
    it('should format the datetime as YYYY-MM-DD HH:MM:SS in UTC', () => {
      const date = new Date('2024-01-15T14:25:30.000Z');
      expect(formatDateTime(date)).toBe('2024-01-15 14:25:30');
    });
  });

  describe('getTodaySummaryTime', () => {
    it('should return 18:00 JST for the current day in UTC', () => {
      jest.setSystemTime(new Date('2024-01-15T02:00:00.000Z')); // 11:00 JST
      const result = getTodaySummaryTime();
      // Expected: 2024-01-15 18:00 JST, which is 2024-01-15 09:00 UTC
      expect(result.toISOString()).toBe('2024-01-15T09:00:00.000Z');
    });
  });
});