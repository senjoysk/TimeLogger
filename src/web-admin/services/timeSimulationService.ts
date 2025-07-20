/**
 * 時刻シミュレーションサービス
 * 
 * MockTimeProviderを制御して任意の時刻での動作をテストするためのサービス
 */

import { MockTimeProvider } from '../../factories';
import { 
  TimeSetRequest, 
  TimeSetResponse, 
  TimezoneDisplay, 
  TimePreset,
  ApiResponse 
} from '../types/testing';
import { toZonedTime, format } from 'date-fns-tz';

/**
 * 時刻シミュレーションサービス
 */
export class TimeSimulationService {
  private readonly timeProvider: MockTimeProvider;
  private readonly supportedTimezones: string[] = [
    'Asia/Tokyo',
    'Asia/Kolkata',
    'UTC'
  ];

  constructor(timeProvider: MockTimeProvider) {
    this.timeProvider = timeProvider;
  }

  /**
   * 時刻を設定する
   */
  async setTime(request: TimeSetRequest): Promise<TimeSetResponse> {
    try {
      // 入力検証
      const validationError = this.validateTimeRequest(request);
      if (validationError) {
        return {
          success: false,
          error: validationError
        };
      }

      // 指定されたタイムゾーンでのDateオブジェクト作成
      // まずUTCベースの日付を作成し、指定されたタイムゾーンでの時刻として解釈
      const utcDate = new Date(Date.UTC(request.year, request.month - 1, request.day, request.hour, request.minute, 0, 0));
      
      // 指定されたタイムゾーンでの時刻として解釈するため、タイムゾーンオフセットを調整
      const { getTimezoneOffset } = require('date-fns-tz');
      const timezoneOffset = getTimezoneOffset(request.timezone, utcDate);
      const targetDate = new Date(utcDate.getTime() - timezoneOffset);
      
      // 日付の妥当性チェック（例：2月30日など）
      const checkDate = new Date(request.year, request.month - 1, request.day, request.hour, request.minute, 0, 0);
      if (checkDate.getFullYear() !== request.year ||
          checkDate.getMonth() !== request.month - 1 ||
          checkDate.getDate() !== request.day ||
          checkDate.getHours() !== request.hour ||
          checkDate.getMinutes() !== request.minute) {
        return {
          success: false,
          error: '無効な日付または時刻が指定されました'
        };
      }

      // MockTimeProviderに設定
      this.timeProvider.setMockDate(targetDate);

      // 各タイムゾーンでの表示時刻を計算
      const timezoneDisplays = this.calculateTimezoneDisplays(targetDate);

      return {
        success: true,
        setDateTime: targetDate.toISOString(),
        timezone: request.timezone,
        timezoneDisplays
      };

    } catch (error) {
      return {
        success: false,
        error: `時刻設定中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * プリセット時刻を適用する
   */
  async applyPreset(preset: TimePreset, timezone: string): Promise<TimeSetResponse> {
    const today = new Date();
    const request: TimeSetRequest = {
      year: today.getFullYear(),
      month: today.getMonth() + 1,
      day: today.getDate(),
      hour: preset.hour,
      minute: preset.minute,
      timezone
    };

    return this.setTime(request);
  }

  /**
   * 時刻設定をリセットして実時刻に戻す
   */
  resetTime(): ApiResponse {
    try {
      // 現在の実時刻に設定
      this.timeProvider.setMockDate(new Date());
      
      return {
        success: true,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error: `時刻リセット中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 現在の設定時刻を取得
   */
  getCurrentTime(): { year: number; month: number; day: number; hour: number; minute: number; timezone: string } {
    const currentTime = this.timeProvider.now();
    return {
      year: currentTime.getUTCFullYear(),
      month: currentTime.getUTCMonth() + 1,
      day: currentTime.getUTCDate(),
      hour: currentTime.getUTCHours(),
      minute: currentTime.getUTCMinutes(),
      timezone: 'UTC'
    };
  }

  /**
   * サポートされるタイムゾーン一覧を取得
   */
  getSupportedTimezones(): string[] {
    return [...this.supportedTimezones];
  }

  /**
   * タイムゾーンの有効性をチェック
   */
  isValidTimezone(timezone: string): boolean {
    if (!timezone || typeof timezone !== 'string') {
      return false;
    }

    try {
      // date-fns-tzを使用してタイムゾーンの有効性をチェック
      const testDate = new Date();
      toZonedTime(testDate, timezone);
      return this.supportedTimezones.includes(timezone);
    } catch {
      return false;
    }
  }

  /**
   * プリセット時刻一覧を取得
   */
  getTimePresets(): TimePreset[] {
    return [
      {
        name: 'サマリー送信時刻',
        description: '日次サマリーが送信される18:30',
        hour: 18,
        minute: 30,
        defaultTimezone: this.supportedTimezones[0]
      },
      {
        name: '朝の開始時刻',
        description: '一般的な業務開始時刻',
        hour: 9,
        minute: 0,
        defaultTimezone: this.supportedTimezones[0]
      },
      {
        name: '昼休み時刻',
        description: '昼休み開始時刻',
        hour: 12,
        minute: 0,
        defaultTimezone: this.supportedTimezones[0]
      },
      {
        name: '終業時刻',
        description: '一般的な業務終了時刻',
        hour: 18,
        minute: 0,
        defaultTimezone: this.supportedTimezones[0]
      },
      {
        name: 'インド営業開始',
        description: 'インド営業開始時刻（Asia/Kolkata）',
        hour: 9,
        minute: 0,
        defaultTimezone: 'Asia/Kolkata'
      },
      {
        name: 'UTC標準時刻',
        description: 'UTC標準時刻での18:30',
        hour: 18,
        minute: 30,
        defaultTimezone: 'UTC'
      }
    ];
  }

  /**
   * 入力検証
   */
  private validateTimeRequest(request: TimeSetRequest): string | null {
    // 年の検証
    if (!Number.isInteger(request.year) || request.year < 2020 || request.year > 2030) {
      return '年は2020-2030の範囲で指定してください';
    }

    // 月の検証
    if (!Number.isInteger(request.month) || request.month < 1 || request.month > 12) {
      return '月は1-12の範囲で指定してください';
    }

    // 日の検証
    if (!Number.isInteger(request.day) || request.day < 1 || request.day > 31) {
      return '日は1-31の範囲で指定してください';
    }

    // 時間の検証
    if (!Number.isInteger(request.hour) || request.hour < 0 || request.hour > 23) {
      return '無効な時刻が指定されました（時間は0-23）';
    }

    // 分の検証
    if (!Number.isInteger(request.minute) || request.minute < 0 || request.minute > 59) {
      return '無効な時刻が指定されました（分は0-59）';
    }

    // タイムゾーンの検証
    if (!this.isValidTimezone(request.timezone)) {
      return '無効なタイムゾーンが指定されました';
    }

    return null;
  }

  /**
   * 各タイムゾーンでの表示時刻を計算
   */
  private calculateTimezoneDisplays(baseDate: Date): TimezoneDisplay[] {
    return this.supportedTimezones.map(timezone => {
      try {
        const localTime = toZonedTime(baseDate, timezone);
        const localTimeString = format(localTime, 'yyyy-MM-dd HH:mm:ss', { timeZone: timezone });
        const isSummaryTime = localTime.getHours() === 18 && localTime.getMinutes() === 30;

        return {
          timezone,
          displayName: this.getTimezoneDisplayName(timezone),
          localTime: localTimeString,
          isSummaryTime
        };
      } catch (error) {
        return {
          timezone,
          displayName: this.getTimezoneDisplayName(timezone),
          localTime: 'Error',
          isSummaryTime: false
        };
      }
    });
  }

  /**
   * タイムゾーンの表示名を取得
   */
  private getTimezoneDisplayName(timezone: string): string {
    const displayNames: { [key: string]: string } = {
      'Asia/Tokyo': '日本 (JST)',
      'Asia/Kolkata': 'インド (IST)',
      'UTC': '世界標準時 (UTC)',
      'Asia/Shanghai': '中国 (CST)',
      'Australia/Sydney': 'オーストラリア東部 (AEST/AEDT)',
      'America/Chicago': '米国中部 (CST/CDT)',
      'Europe/Berlin': 'ドイツ (CET/CEST)'
    };

    return displayNames[timezone] || timezone;
  }
}