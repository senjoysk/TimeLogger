/**
 * 時刻シミュレーションサービス
 * 
 * MockTimeProviderを制御して任意の時刻での動作をテストするためのサービス
 */

import { MockTimeProvider } from '../../factories';
import { TimeProviderService } from '../../services/timeProviderService';
import { 
  TimeSetRequest, 
  TimeSetResponse, 
  TimezoneDisplay, 
  ApiResponse 
} from '../types/testing';
import { toZonedTime, format, fromZonedTime } from 'date-fns-tz';

/**
 * 時刻シミュレーションサービス
 */
export class TimeSimulationService {
  private readonly supportedTimezones: string[] = [
    'Asia/Tokyo',
    'Asia/Kolkata',
    'UTC'
  ];
  private readonly timeProviderService: TimeProviderService;

  constructor(timeProvider?: MockTimeProvider) {
    // TimeProviderServiceシングルトンを使用
    this.timeProviderService = TimeProviderService.getInstance();
    
    // シミュレーションモードを有効化
    if (!this.timeProviderService.isInSimulationMode()) {
      this.timeProviderService.enableSimulationMode();
    }
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

      // 数値変換（バリデーション済みだが念のため）
      const year = parseInt(String(request.year), 10);
      const month = parseInt(String(request.month), 10);
      const day = parseInt(String(request.day), 10);
      const hour = parseInt(String(request.hour), 10);
      const minute = parseInt(String(request.minute), 10);
      const second = parseInt(String(request.second || 0), 10);
      
      // 指定されたタイムゾーンでの時刻を作成
      // ローカル時刻として指定された日時を作成（秒も含む）
      const localDate = new Date(year, month - 1, day, hour, minute, second, 0);
      
      // 指定されたタイムゾーンでの時刻としてUTCに変換
      const targetDate = fromZonedTime(localDate, request.timezone);
      
      // 日付の妥当性チェック（例：2月30日など）
      const checkDate = new Date(year, month - 1, day, hour, minute, second, 0);
      if (checkDate.getFullYear() !== year ||
          checkDate.getMonth() !== month - 1 ||
          checkDate.getDate() !== day ||
          checkDate.getHours() !== hour ||
          checkDate.getMinutes() !== minute ||
          checkDate.getSeconds() !== second) {
        return {
          success: false,
          error: '無効な日付または時刻が指定されました'
        };
      }

      // TimeProviderService経由で時刻を設定
      this.timeProviderService.setSimulatedTime(targetDate);

      // 時間進行を開始（デフォルトで有効、明示的に無効にされた場合のみ停止）
      if (request.enableProgression !== false) {
        this.timeProviderService.startTimeProgression();
      } else {
        this.timeProviderService.stopTimeProgression();
      }

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
   * 時刻設定をリセットして実時刻に戻す
   */
  resetTime(): ApiResponse {
    try {
      // 時間進行を停止
      this.timeProviderService.stopTimeProgression();
      
      // シミュレーションモードを無効化（実時刻に戻す）
      this.timeProviderService.disableSimulationMode();
      
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
  getCurrentTime(): { year: number; month: number; day: number; hour: number; minute: number; second: number; timezone: string } {
    const currentTime = this.timeProviderService.now();
    return {
      year: currentTime.getUTCFullYear(),
      month: currentTime.getUTCMonth() + 1,
      day: currentTime.getUTCDate(),
      hour: currentTime.getUTCHours(),
      minute: currentTime.getUTCMinutes(),
      second: currentTime.getUTCSeconds(),
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
   * TimeProviderServiceインスタンスを取得
   */
  getTimeProviderService(): TimeProviderService {
    return this.timeProviderService;
  }

  /**
   * タイムゾーン表示を計算（パブリック版）
   */
  calculateTimezoneDisplaysPublic(baseDate: Date): TimezoneDisplay[] {
    return this.calculateTimezoneDisplays(baseDate);
  }


  /**
   * 入力検証
   */
  private validateTimeRequest(request: TimeSetRequest): string | null {
    // 数値変換（文字列として受信される可能性があるため）
    const year = parseInt(String(request.year), 10);
    const month = parseInt(String(request.month), 10);
    const day = parseInt(String(request.day), 10);
    const hour = parseInt(String(request.hour), 10);
    const minute = parseInt(String(request.minute), 10);
    const second = parseInt(String(request.second || 0), 10);

    // 変換失敗チェック
    if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hour) || isNaN(minute) || isNaN(second)) {
      return '数値形式が正しくありません';
    }

    // 年の検証
    if (year < 2020 || year > 2030) {
      return '年は2020-2030の範囲で指定してください';
    }

    // 月の検証
    if (month < 1 || month > 12) {
      return '月は1-12の範囲で指定してください';
    }

    // 日の検証
    if (day < 1 || day > 31) {
      return '日は1-31の範囲で指定してください';
    }

    // 時間の検証
    if (hour < 0 || hour > 23) {
      return '無効な時刻が指定されました（時間は0-23）';
    }

    // 分の検証
    if (minute < 0 || minute > 59) {
      return '無効な時刻が指定されました（分は0-59）';
    }

    // 秒の検証
    if (second < 0 || second > 59) {
      return '無効な時刻が指定されました（秒は0-59）';
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