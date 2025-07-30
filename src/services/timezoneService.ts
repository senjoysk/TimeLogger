/**
 * タイムゾーン管理サービス
 * 
 * ユーザーのタイムゾーン設定を管理（データベース + Cookieベース）
 */

import { ITimezoneService } from './interfaces/ITimezoneService';
import { IActivityLogRepository } from '../repositories/activityLogRepository';
import { logger } from '../utils/logger';

export class TimezoneService implements ITimezoneService {
  constructor(private repository?: IActivityLogRepository) {
    // リポジトリが注入された場合はデータベースからタイムゾーンを取得可能
  }

  /**
   * ユーザーのタイムゾーンを取得
   */
  async getUserTimezone(userId: string): Promise<string> {
    // リポジトリが利用可能な場合はデータベースから取得
    if (this.repository) {
      try {
        const dbTimezone = await this.repository.getUserTimezone(userId);
        if (dbTimezone) {
          logger.debug('TIMEZONE_SERVICE', `ユーザー${userId}のDBタイムゾーン: ${dbTimezone}`);
          return dbTimezone;
        }
      } catch (error) {
        logger.warn('TIMEZONE_SERVICE', `DB取得エラー: ${error}`);
      }
    }
    
    // デフォルト値を返す
    logger.debug('TIMEZONE_SERVICE', 'デフォルトタイムゾーンを使用: Asia/Tokyo');
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
      logger.debug('TIMEZONE_SERVICE', `Cookieタイムゾーンを使用: ${cookieTimezone}`);
      return cookieTimezone;
    }

    // 2. 環境変数設定
    const adminTimezone = process.env.ADMIN_DISPLAY_TIMEZONE;
    if (adminTimezone && this.validateTimezone(adminTimezone)) {
      logger.debug('TIMEZONE_SERVICE', `環境変数タイムゾーンを使用: ${adminTimezone}`);
      return adminTimezone;
    }

    // 3. システムデフォルト
    const systemTimezone = this.getSystemTimezone();
    logger.debug('TIMEZONE_SERVICE', `システムデフォルトを使用: ${systemTimezone}`);
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