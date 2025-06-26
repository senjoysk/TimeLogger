import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  getCurrentTimeSlot,
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

  describe('getCurrentTimeSlot', () => {
    it('should return the correct 30-minute slot for the current time in a specific timezone', () => {
      // 2024-01-15 14:45:00 UTC (23:45:00 JST)
      jest.setSystemTime(new Date('2024-01-15T14:45:00.000Z'));
      const result = getCurrentTimeSlot('Asia/Tokyo');
      
      // The start and end times should be in UTC
      expect(result.start.toISOString()).toBe('2024-01-15T14:30:00.000Z');
      expect(result.end.toISOString()).toBe('2024-01-15T15:00:00.000Z');
      
      // The label should be in the specified timezone (JST)
      expect(result.label).toBe('23:30-00:00');
    });
  });

  describe('isWorkingHours', () => {
    it('should return true for weekdays between 9:00 and 18:00 in the specified timezone', () => {
      // Monday 10:00 JST
      jest.setSystemTime(new Date('2024-01-15T01:00:00.000Z'));
      expect(isWorkingHours('Asia/Tokyo')).toBe(true);
    });

    it('should return false for weekdays at or after 18:00 in the specified timezone', () => {
      // Monday 18:00 JST
      jest.setSystemTime(new Date('2024-01-15T09:00:00.000Z'));
      expect(isWorkingHours('Asia/Tokyo')).toBe(false);
    });
  });

  describe('getBusinessDateForDate', () => {
    it('should return the correct business date based on the 5:00 AM cutoff in the specified timezone', () => {
      // Jan 15, 6:00 JST
      const date1 = new Date('2024-01-14T21:00:00.000Z');
      expect(getBusinessDateForDate(date1, 'Asia/Tokyo')).toBe('2024-01-15');

      // Jan 15, 4:59 JST
      const date2 = new Date('2024-01-14T19:59:00.000Z');
      expect(getBusinessDateForDate(date2, 'Asia/Tokyo')).toBe('2024-01-14');
    });
  });

  describe('formatTime', () => {
    it('should format the time as HH:MM in the specified timezone', () => {
      const date = new Date('2024-01-15T14:25:30.000Z');
      expect(formatTime(date, 'Asia/Tokyo')).toBe('23:25');
    });
  });

  describe('formatDateTime', () => {
    it('should format the datetime as YYYY-MM-DD HH:MM:SS in the specified timezone', () => {
      const date = new Date('2024-01-15T14:25:30.000Z');
      expect(formatDateTime(date, 'Asia/Tokyo')).toBe('2024-01-15 23:25:30');
    });
  });

  describe('getTodaySummaryTime', () => {
    it('should return 18:00 in the specified timezone for the current day, converted to UTC', () => {
      jest.setSystemTime(new Date('2024-01-15T02:00:00.000Z')); // 11:00 JST
      const result = getTodaySummaryTime('Asia/Tokyo');
      // Expected: 2024-01-15 18:00 JST, which is 2024-01-15 09:00 UTC
      expect(result.toISOString()).toBe('2024-01-15T09:00:00.000Z');
    });
  });
});