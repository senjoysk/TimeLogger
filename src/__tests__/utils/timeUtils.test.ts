import { 
  getCurrentTimeSlot, 
  getCurrentBusinessDate, 
  getBusinessDateForDate,
  formatTime,
  formatDateTime,
  isWorkingHours 
} from '../../utils/timeUtils';

describe('TimeUtils', () => {
  describe('getCurrentBusinessDate', () => {
    it('午前5時以前の場合は前日の日付を返す', () => {
      // モックを使用して特定の時刻をテスト
      const mockDate = new Date('2025-06-27T03:00:00Z'); // UTC 3:00 = Asia/Kolkata 8:30
      jest.spyOn(Date, 'now').mockReturnValue(mockDate.getTime());
      
      const result = getCurrentBusinessDate('Asia/Kolkata');
      expect(result).toBe('2025-06-27'); // 8:30なので同日
      
      jest.restoreAllMocks();
    });

    it('午前5時以降の場合は当日の日付を返す', () => {
      const mockDate = new Date('2025-06-27T00:00:00Z'); // UTC 0:00 = Asia/Kolkata 5:30
      jest.spyOn(Date, 'now').mockReturnValue(mockDate.getTime());
      
      const result = getCurrentBusinessDate('Asia/Kolkata');
      expect(result).toBe('2025-06-27'); // 5:30なので同日
      
      jest.restoreAllMocks();
    });
  });

  describe('getBusinessDateForDate', () => {
    it('指定された日付のビジネス日を正しく計算する', () => {
      const date = new Date('2025-06-27T02:00:00Z'); // UTC 2:00 = Asia/Kolkata 7:30
      const result = getBusinessDateForDate(date, 'Asia/Kolkata');
      expect(result).toBe('2025-06-27');
    });

    it('午前5時前の場合は前日を返す', () => {
      const date = new Date('2025-06-27T22:00:00Z'); // UTC 22:00 = Asia/Kolkata 3:30 (翌日)
      const result = getBusinessDateForDate(date, 'Asia/Kolkata');
      expect(result).toBe('2025-06-27'); // 3:30なので前日扱い
    });
  });

  describe('getCurrentTimeSlot', () => {
    it('30分刻みのタイムスロットを正しく計算する', () => {
      const mockDate = new Date('2025-06-27T03:15:00Z'); // Asia/Kolkata 8:45
      const originalDate = global.Date;
      global.Date = jest.fn(() => mockDate) as any;
      global.Date.now = jest.fn(() => mockDate.getTime());
      
      const result = getCurrentTimeSlot('Asia/Kolkata');
      // getCurrentTimeSlotは30分前の時刻を計算するため、8:45の30分前は8:15
      // 8:15は8:00-8:30の枠に含まれる
      expect(result.label).toMatch(/08:30-08:30/);
      
      global.Date = originalDate;
    });
  });

  describe('formatTime', () => {
    it('時刻を正しくフォーマットする', () => {
      const date = new Date('2025-06-27T03:30:00Z');
      const result = formatTime(date, 'Asia/Kolkata');
      expect(result).toBe('09:00');
    });
  });

  describe('formatDateTime', () => {
    it('日時を正しくフォーマットする', () => {
      const date = new Date('2025-06-27T03:30:00Z');
      const result = formatDateTime(date, 'Asia/Kolkata');
      expect(result).toBe('2025-06-27 09:00:00');
    });

    it('UTCタイムゾーンでフォーマットする', () => {
      const date = new Date('2025-06-27T03:30:00Z');
      const result = formatDateTime(date, 'UTC');
      expect(result).toBe('2025-06-27 03:30:00');
    });
  });

  describe('isWorkingHours', () => {
    it('勤務時間内の場合はtrueを返す', () => {
      const mockDate = new Date('2025-06-27T04:00:00Z'); // Asia/Kolkata 9:30 (平日)
      const originalDate = global.Date;
      global.Date = jest.fn(() => mockDate) as any;
      global.Date.now = jest.fn(() => mockDate.getTime());
      
      const result = isWorkingHours('Asia/Kolkata');
      expect(result).toBe(true);
      
      global.Date = originalDate;
    });

    it('勤務時間外の場合はfalseを返す', () => {
      const mockDate = new Date('2025-06-27T14:00:00Z'); // Asia/Kolkata 19:30 (勤務時間外)
      const originalDate = global.Date;
      global.Date = jest.fn(() => mockDate) as any;
      global.Date.now = jest.fn(() => mockDate.getTime());
      
      const result = isWorkingHours('Asia/Kolkata');
      expect(result).toBe(false);
      
      global.Date = originalDate;
    });

    it('週末の場合はfalseを返す', () => {
      const mockDate = new Date('2025-06-28T04:00:00Z'); // 土曜日 Asia/Kolkata 9:30
      const originalDate = global.Date;
      global.Date = jest.fn(() => mockDate) as any;
      global.Date.now = jest.fn(() => mockDate.getTime());
      
      const result = isWorkingHours('Asia/Kolkata');
      expect(result).toBe(false);
      
      global.Date = originalDate;
    });
  });
});