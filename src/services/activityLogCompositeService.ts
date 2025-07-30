/**
 * ActivityLogCompositeService
 * 分割されたサービス群を統合するコンポジットサービス - 単一責任原則によるリファクタリング完了
 */

import { ActivityLogCrudService } from './activityLogCrudService';
import { ActivityLogQueryService } from './activityLogQueryService';
import { ActivityLogFormattingService } from './activityLogFormattingService';
import { BusinessDateCalculatorService } from './businessDateCalculatorService';
import { 
  ActivityLog, 
  BusinessDateInfo, 
  EditLogRequest, 
  DeleteLogRequest
} from '../types/activityLog';
import { ActivityAnalysisResult } from '../types/activityAnalysis';

/**
 * 活動ログコンポジットサービス
 * 分割された専門サービスを統合し、元のactivityLogServiceと同じインターフェースを提供
 */
export class ActivityLogCompositeService {
  constructor(
    private crudService: ActivityLogCrudService,
    private queryService: ActivityLogQueryService,
    private formattingService: ActivityLogFormattingService,
    private dateCalculatorService: BusinessDateCalculatorService
  ) {}

  /**
   * 活動を記録
   * @param userId ユーザーID
   * @param content 活動内容
   * @param timezone ユーザーのタイムゾーン
   * @param inputTime 入力時刻（省略時は現在時刻）
   * @param aiAnalysis AI分析結果（省略可能）
   * @returns 保存された活動ログ
   */
  async recordActivity(
    userId: string, 
    content: string, 
    timezone: string, 
    inputTime?: string,
    aiAnalysis?: ActivityAnalysisResult
  ): Promise<ActivityLog> {
    return this.crudService.recordActivity(userId, content, timezone, inputTime, aiAnalysis);
  }

  /**
   * ログを編集
   * @param request 編集リクエスト
   * @returns 更新されたログ
   */
  async editLog(request: EditLogRequest): Promise<ActivityLog> {
    return this.crudService.editLog(request);
  }

  /**
   * ログを削除
   * @param request 削除リクエスト
   * @returns 削除されたログ
   */
  async deleteLog(request: DeleteLogRequest): Promise<ActivityLog> {
    return this.crudService.deleteLog(request);
  }

  /**
   * 指定日の活動ログを取得
   * @param userId ユーザーID
   * @param businessDate 業務日（省略時は今日）
   * @param timezone ユーザーのタイムゾーン
   * @returns ActivityLog配列
   */
  async getLogsForDate(userId: string, businessDate: string | undefined, timezone: string): Promise<ActivityLog[]> {
    return this.queryService.getLogsForDate(userId, businessDate, timezone);
  }

  /**
   * 最新のログを取得
   * @param userId ユーザーID
   * @param count 取得件数（デフォルト: 5）
   * @returns ActivityLog配列
   */
  async getLatestLogs(userId: string, count = 5): Promise<ActivityLog[]> {
    return this.queryService.getLatestLogs(userId, count);
  }

  /**
   * ログを検索
   * @param userId ユーザーID
   * @param query 検索クエリ
   * @param timezone ユーザーのタイムゾーン
   * @param limit 取得件数制限（デフォルト: 20）
   * @returns 検索結果のActivityLog配列
   */
  async searchLogs(userId: string, query: string, timezone: string, limit = 20): Promise<ActivityLog[]> {
    return this.queryService.searchLogs(userId, query, timezone, limit);
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
    return this.queryService.getStatistics(userId);
  }

  /**
   * Discord用の編集ログ一覧文字列を生成
   * @param logs ActivityLog配列
   * @param timezone ユーザーのタイムゾーン
   * @returns フォーマットされた文字列
   */
  formatLogsForEdit(logs: ActivityLog[], timezone: string): string {
    return this.formattingService.formatLogsForEdit(logs, timezone);
  }

  /**
   * Discord用の検索結果文字列を生成
   * @param logs 検索結果のActivityLog配列
   * @param query 検索クエリ
   * @param timezone ユーザーのタイムゾーン
   * @returns フォーマットされた文字列
   */
  formatSearchResults(logs: ActivityLog[], query: string, timezone: string): string {
    return this.formattingService.formatSearchResults(logs, query, timezone);
  }

  /**
   * ビジネス日付情報を計算
   * @param timezone ユーザーのタイムゾーン
   * @param targetDate 対象日時（省略時は現在時刻）
   * @returns ビジネス日付情報
   */
  calculateBusinessDate(timezone: string, targetDate?: string): BusinessDateInfo {
    return this.dateCalculatorService.calculateBusinessDate(timezone, targetDate);
  }

  /**
   * 現在のビジネス日付を取得
   * @param timezone ユーザーのタイムゾーン（省略時はデフォルト）
   * @returns ビジネス日付文字列（YYYY-MM-DD）
   */
  getCurrentBusinessDate(timezone = 'Asia/Tokyo'): string {
    return this.dateCalculatorService.getCurrentBusinessDate(timezone);
  }

  /**
   * 指定日が今日かどうか判定
   * @param targetDate 対象日（YYYY-MM-DD形式）
   * @param timezone ユーザーのタイムゾーン
   * @returns 今日かどうか
   */
  isToday(targetDate: string, timezone: string): boolean {
    return this.dateCalculatorService.isToday(targetDate, timezone);
  }

}