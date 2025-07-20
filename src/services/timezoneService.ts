/**
 * タイムゾーンサービス実装
 * ユーザー個別タイムゾーン管理とシステムデフォルト管理を提供
 */

import { ITimezoneService } from './interfaces/ITimezoneService';
import { IConfigService } from '../interfaces/dependencies';
import { IActivityLogRepository } from '../repositories/activityLogRepository';

export class TimezoneService implements ITimezoneService {
  constructor(
    private configService: IConfigService,
    private repository: IActivityLogRepository
  ) {}

  /**
   * ユーザーのタイムゾーンを取得
   * 優先順位: ユーザー設定 > システムデフォルト
   */
  async getUserTimezone(userId: string): Promise<string> {
    try {
      // 1. データベースからユーザー設定取得
      // SqliteActivityLogRepositoryには getUserTimezone メソッドが存在するため型チェック
      if (this.repository && 'getUserTimezone' in this.repository) {
        const repositoryWithTimezone = this.repository as any;
        const userTimezone = await repositoryWithTimezone.getUserTimezone(userId);
        if (userTimezone) {
          return userTimezone;
        }
      }

      // 2. システムデフォルト
      return this.getSystemTimezone();

    } catch (error) {
      console.warn(`ユーザータイムゾーン取得エラー (${userId}):`, error);
      return this.getSystemTimezone();
    }
  }

  /**
   * システムデフォルトタイムゾーンを取得
   */
  getSystemTimezone(): string {
    return this.configService.getDefaultTimezone();
  }

  /**
   * Web管理画面表示用タイムゾーンを取得
   * セッションまたはデフォルト設定を返す
   */
  getAdminDisplayTimezone(sessionTimezone?: string): string {
    // 1. セッション設定が優先
    if (sessionTimezone && this.validateTimezone(sessionTimezone)) {
      return sessionTimezone;
    }

    // 2. 環境変数設定
    const adminTimezone = process.env.ADMIN_DISPLAY_TIMEZONE;
    if (adminTimezone && this.validateTimezone(adminTimezone)) {
      return adminTimezone;
    }

    // 3. システムデフォルト
    return this.getSystemTimezone();
  }

  /**
   * サポートされるタイムゾーン一覧を取得（3種類のみ）
   */
  getSupportedTimezones(): string[] {
    return [
      'Asia/Tokyo',
      'Asia/Kolkata', 
      'UTC'
    ];
  }

  /**
   * タイムゾーンの妥当性を検証
   */
  validateTimezone(timezone: string): boolean {
    try {
      new Date().toLocaleString('en-US', { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  }
}