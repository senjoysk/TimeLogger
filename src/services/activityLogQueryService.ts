/**
 * ActivityLogQueryService
 * データ取得・検索専門サービス
 */

import { format } from 'date-fns-tz';
import { IActivityLogRepository } from '../repositories/activityLogRepository';
import { ITimezoneService } from './interfaces/ITimezoneService';
import { ActivityLog, ActivityLogError } from '../types/activityLog';

/**
 * 活動ログクエリ専門サービス
 * 単一責任原則に従い、データ取得・検索機能のみを担当
 */
export class ActivityLogQueryService {
  constructor(
    private repository: IActivityLogRepository,
    private timezoneService: ITimezoneService
  ) {}

  /**
   * 指定日の活動ログを取得
   * @param userId ユーザーID
   * @param businessDate 業務日（YYYY-MM-DD、省略時は今日）
   * @param timezone ユーザーのタイムゾーン
   * @returns ActivityLog配列
   */
  async getLogsForDate(
    userId: string, 
    businessDate: string | undefined, 
    timezone: string
  ): Promise<ActivityLog[]> {
    try {
      // 業務日が指定されていない場合は今日を使用
      const targetDate = businessDate || this.calculateBusinessDate(timezone).businessDate;

      return await this.repository.getLogsByDate(userId, targetDate, false);
    } catch (error) {
      throw error instanceof ActivityLogError ? error :
        new ActivityLogError('ログ取得に失敗しました', 'GET_LOGS_ERROR', { error });
    }
  }

  /**
   * 最新のログを取得
   * @param userId ユーザーID
   * @param count 取得件数（デフォルト: 5）
   * @returns ActivityLog配列
   */
  async getLatestLogs(userId: string, count = 5): Promise<ActivityLog[]> {
    try {
      return await this.repository.getLatestLogs(userId, count);
    } catch (error) {
      throw error instanceof ActivityLogError ? error :
        new ActivityLogError('最新ログの取得に失敗しました', 'GET_LATEST_LOGS_ERROR', { error });
    }
  }

  /**
   * ログを検索
   * @param userId ユーザーID
   * @param query 検索クエリ
   * @param timezone ユーザーのタイムゾーン
   * @param limit 取得件数制限（デフォルト: 20）
   * @returns 検索結果のActivityLog配列
   */
  async searchLogs(
    userId: string, 
    query: string, 
    timezone: string, 
    limit = 20
  ): Promise<ActivityLog[]> {
    try {
      // 入力バリデーション
      if (!query || query.trim().length === 0) {
        throw new ActivityLogError('検索クエリが空です', 'EMPTY_QUERY');
      }

      // 過去30日のログから検索
      const endDate = this.calculateBusinessDate(timezone).businessDate;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      const startDateStr = format(startDate, 'yyyy-MM-dd');
      
      const allLogs = await this.repository.getLogsByDateRange(userId, startDateStr, endDate);
      
      // 簡易的な部分一致検索
      const queryLower = query.toLowerCase();
      const matchedLogs = allLogs
        .filter(log => log.content.toLowerCase().includes(queryLower))
        .slice(0, limit);

      return matchedLogs;
    } catch (error) {
      throw error instanceof ActivityLogError ? error :
        new ActivityLogError('ログ検索に失敗しました', 'SEARCH_LOGS_ERROR', { error });
    }
  }

  /**
   * 統計情報を取得
   * @param userId ユーザーID
   * @returns 統計情報オブジェクト
   */
  async getStatistics(userId: string): Promise<{
    totalLogs: number;
    todayLogs: number;
    weekLogs: number;
    averageLogsPerDay: number;
  }> {
    try {
      const totalLogs = await this.repository.getLogCount(userId);
      
      // 今日のログ数
      const today = this.calculateBusinessDate(this.getDefaultTimezone());
      const todayLogs = await this.repository.getLogCountByDate(userId, today.businessDate);
      
      // 過去7日のログ数（簡易計算）
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);
      const weekStartStr = format(weekStart, 'yyyy-MM-dd');
      
      const weekLogsData = await this.repository.getLogsByDateRange(userId, weekStartStr, today.businessDate);
      const weekLogs = weekLogsData.length;
      
      // 1日平均ログ数
      const averageLogsPerDay = totalLogs > 0 ? Math.round((totalLogs / 30) * 10) / 10 : 0; // 30日平均

      return {
        totalLogs,
        todayLogs,
        weekLogs,
        averageLogsPerDay,
      };
    } catch (error) {
      throw error instanceof ActivityLogError ? error :
        new ActivityLogError('統計情報の取得に失敗しました', 'GET_STATISTICS_ERROR', { error });
    }
  }

  /**
   * 業務日情報を計算
   * @param timezone タイムゾーン
   * @param targetDate 対象日（省略時は現在時刻）
   * @returns 業務日情報
   */
  private calculateBusinessDate(timezone: string, targetDate?: string) {
    try {
      const inputDate = targetDate ? new Date(targetDate) : new Date();
      return this.repository.calculateBusinessDate(inputDate.toISOString(), timezone);
    } catch (error) {
      throw new ActivityLogError('業務日の計算に失敗しました', 'CALC_BUSINESS_DATE_ERROR', { error });
    }
  }

  /**
   * デフォルトタイムゾーンを取得
   * @returns デフォルトタイムゾーン
   */
  private getDefaultTimezone(): string {
    return 'Asia/Tokyo';
  }
}