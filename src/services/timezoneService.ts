/**
 * タイムゾーン管理サービス（Cookieベース）
 * 
 * Web管理画面用のタイムゾーン表示設定を管理
 * Cookieベースの実装により、DBアクセスは不要
 */

import { ITimezoneService } from './interfaces/ITimezoneService';

export class TimezoneService implements ITimezoneService {
  constructor() {
    // Cookieベースなので設定は不要
  }

  /**
   * ユーザーのタイムゾーンを取得（継承用メソッド）
   */
  async getUserTimezone(userId: string): Promise<string> {
    // 現在はメイン機能で使用されていないため、デフォルト値を返す
    return 'Asia/Tokyo';
  }

  /**
   * システムタイムゾーンを取得
   */
  getSystemTimezone(): string {
    return process.env.TZ || 'Asia/Tokyo';
  }

  /**
   * Web管理画面表示用タイムゾーンを取得（Cookieベース）
   * 優先順：1. Cookie値 → 2. 環境変数 → 3. システムデフォルト
   */
  getAdminDisplayTimezone(cookieTimezone?: string): string {
    // 1. Cookie設定が優先
    if (cookieTimezone && this.validateTimezone(cookieTimezone)) {
      console.log(`[TimezoneService] Cookieタイムゾーンを使用: ${cookieTimezone}`);
      return cookieTimezone;
    }

    // 2. 環境変数設定
    const adminTimezone = process.env.ADMIN_DISPLAY_TIMEZONE;
    if (adminTimezone && this.validateTimezone(adminTimezone)) {
      console.log(`[TimezoneService] 環境変数タイムゾーンを使用: ${adminTimezone}`);
      return adminTimezone;
    }

    // 3. システムデフォルト
    const systemTimezone = this.getSystemTimezone();
    console.log(`[TimezoneService] システムデフォルトを使用: ${systemTimezone}`);
    return systemTimezone;
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