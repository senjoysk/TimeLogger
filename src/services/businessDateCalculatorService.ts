/**
 * BusinessDateCalculatorService
 * ビジネス日付計算専門サービス - 単一責任原則によるリファクタリング完了
 */

import { IActivityLogRepository } from '../repositories/activityLogRepository';
import { BusinessDateInfo, ActivityLogError } from '../types/activityLog';

/**
 * ビジネス日付計算専門サービス
 * 単一責任原則に従い、日付計算機能のみを担当
 */
export class BusinessDateCalculatorService {
  constructor(
    private repository: IActivityLogRepository
  ) {}

  /**
   * ビジネス日付情報を計算
   * @param timezone ユーザーのタイムゾーン
   * @param targetDate 対象日時（省略時は現在時刻）
   * @returns ビジネス日付情報
   */
  calculateBusinessDate(timezone: string, targetDate?: string): BusinessDateInfo {
    try {
      const inputDate = targetDate ? new Date(targetDate) : new Date();
      return this.repository.calculateBusinessDate(inputDate.toISOString(), timezone);
    } catch (error) {
      throw error instanceof ActivityLogError ? error :
        new ActivityLogError('ビジネス日付の計算に失敗しました', 'CALC_BUSINESS_DATE_ERROR', { error });
    }
  }

  /**
   * 現在のビジネス日付を取得
   * @param timezone ユーザーのタイムゾーン（省略時はデフォルト）
   * @returns ビジネス日付文字列（YYYY-MM-DD）
   */
  getCurrentBusinessDate(timezone = 'Asia/Tokyo'): string {
    try {
      const businessDateInfo = this.calculateBusinessDate(timezone);
      return businessDateInfo.businessDate;
    } catch (error) {
      throw error instanceof ActivityLogError ? error :
        new ActivityLogError('現在のビジネス日付の取得に失敗しました', 'GET_CURRENT_BUSINESS_DATE_ERROR', { error });
    }
  }

  /**
   * 指定日が今日かどうか判定
   * @param targetDate 対象日（YYYY-MM-DD形式）
   * @param timezone ユーザーのタイムゾーン
   * @returns 今日かどうか
   */
  isToday(targetDate: string, timezone: string): boolean {
    try {
      const currentBusinessDate = this.getCurrentBusinessDate(timezone);
      return targetDate === currentBusinessDate;
    } catch (error) {
      throw error instanceof ActivityLogError ? error :
        new ActivityLogError('日付比較に失敗しました', 'DATE_COMPARISON_ERROR', { error });
    }
  }
}