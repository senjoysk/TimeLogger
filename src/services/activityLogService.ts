/**
 * 活動ログサービス
 * 自然言語ログ方式の活動記録管理
 */

import { v4 as uuidv4 } from 'uuid';
import { toZonedTime, format } from 'date-fns-tz';
import { IActivityLogRepository } from '../repositories/activityLogRepository';
import {
  ActivityLog,
  CreateActivityLogRequest,
  EditLogRequest,
  DeleteLogRequest,
  BusinessDateInfo,
  ActivityLogError
} from '../types/activityLog';

/**
 * 活動ログサービスインターフェース
 */
export interface IActivityLogService {
  /**
   * 新しい活動を記録
   * @param userId ユーザーID
   * @param content 活動内容（自然言語）
   * @param timezone ユーザーのタイムゾーン
   * @param inputTime 記録時刻（省略時は現在時刻）
   * @returns 作成されたActivityLog
   */
  recordActivity(userId: string, content: string, timezone: string, inputTime?: string): Promise<ActivityLog>;

  /**
   * 指定日の活動ログを取得
   * @param userId ユーザーID
   * @param businessDate 業務日（YYYY-MM-DD、省略時は今日）
   * @param timezone ユーザーのタイムゾーン
   * @returns ActivityLog配列
   */
  getLogsForDate(userId: string, businessDate: string | undefined, timezone: string): Promise<ActivityLog[]>;

  /**
   * 編集用のログ一覧を取得
   * @param userId ユーザーID
   * @param timezone ユーザーのタイムゾーン
   * @returns 今日のActivityLog配列（編集用フォーマット）
   */
  getLogsForEdit(userId: string, timezone: string): Promise<ActivityLog[]>;

  /**
   * ログを編集
   * @param request 編集リクエスト
   * @returns 更新されたActivityLog
   */
  editLog(request: EditLogRequest): Promise<ActivityLog>;

  /**
   * ログを削除
   * @param request 削除リクエスト
   * @returns 削除されたActivityLog
   */
  deleteLog(request: DeleteLogRequest): Promise<ActivityLog>;

  /**
   * 最新のログを取得
   * @param userId ユーザーID
   * @param count 取得件数
   * @returns ActivityLog配列
   */
  getLatestLogs(userId: string, count?: number): Promise<ActivityLog[]>;

  /**
   * ログを検索
   * @param userId ユーザーID
   * @param query 検索クエリ
   * @param timezone ユーザーのタイムゾーン
   * @param limit 取得件数制限
   * @returns 検索結果のActivityLog配列
   */
  searchLogs(userId: string, query: string, timezone: string, limit?: number): Promise<ActivityLog[]>;

  /**
   * 統計情報を取得
   * @param userId ユーザーID
   * @returns 統計情報オブジェクト
   */
  getStatistics(userId: string): Promise<{
    totalLogs: number;
    todayLogs: number;
    weekLogs: number;
    averageLogsPerDay: number;
  }>;

  /**
   * 編集用フォーマット
   * @param logs ActivityLog配列
   * @param timezone ユーザーのタイムゾーン
   * @returns フォーマット済み文字列
   */
  formatLogsForEdit(logs: ActivityLog[], timezone: string): string;

  /**
   * 検索結果フォーマット
   * @param logs 検索結果のActivityLog配列
   * @param query 検索クエリ
   * @param timezone ユーザーのタイムゾーン
   * @returns フォーマット済み文字列
   */
  formatSearchResults(logs: ActivityLog[], query: string, timezone: string): string;

  /**
   * 業務日情報を計算
   * @param timezone ユーザーのタイムゾーン
   * @param targetDate 対象日時（省略時は現在時刻）
   * @returns BusinessDateInfo
   */
  calculateBusinessDate(timezone: string, targetDate?: string): BusinessDateInfo;
}

/**
 * ActivityLogServiceの実装
 */
export class ActivityLogService implements IActivityLogService {
  constructor(
    private repository: IActivityLogRepository
  ) {}

  /**
   * 新しい活動を記録
   */
  async recordActivity(userId: string, content: string, timezone: string, inputTime?: string): Promise<ActivityLog> {
    try {
      // 入力内容の検証
      if (!content || content.trim().length === 0) {
        throw new ActivityLogError('活動内容が空です', 'EMPTY_CONTENT');
      }

      if (content.length > 2000) {
        throw new ActivityLogError('活動内容が長すぎます（2000文字以内）', 'CONTENT_TOO_LONG');
      }

      // 入力時刻を設定（指定がない場合は現在時刻）
      const inputTimestamp = inputTime || new Date().toISOString();
      
      // 業務日を計算
      const businessDateInfo = this.calculateBusinessDate(timezone, inputTimestamp);

      // ログ作成リクエストを構築
      const request: CreateActivityLogRequest = {
        userId,
        content: content.trim(),
        inputTimestamp,
        businessDate: businessDateInfo.businessDate
      };

      // リポジトリ経由で保存
      const savedLog = await this.repository.saveLog(request);

      console.log(`📝 活動記録を保存: [${businessDateInfo.businessDate}] ${content.substring(0, 50)}...`);
      
      return savedLog;
    } catch (error) {
      console.error('❌ 活動記録エラー:', error);
      throw error instanceof ActivityLogError ? error : 
        new ActivityLogError('活動記録の保存に失敗しました', 'RECORD_ACTIVITY_ERROR', { error });
    }
  }

  /**
   * 指定日の活動ログを取得
   */
  async getLogsForDate(userId: string, businessDate: string | undefined, timezone: string): Promise<ActivityLog[]> {
    try {
      // 業務日が指定されていない場合は今日を使用
      const targetDate = businessDate || this.calculateBusinessDate(timezone).businessDate;
      
      const logs = await this.repository.getLogsByDate(userId, targetDate);
      
      console.log(`📋 活動ログを取得: [${targetDate}] ${logs.length}件`);
      
      return logs;
    } catch (error) {
      console.error('❌ ログ取得エラー:', error);
      throw error instanceof ActivityLogError ? error :
        new ActivityLogError('活動ログの取得に失敗しました', 'GET_LOGS_ERROR', { error });
    }
  }

  /**
   * 編集用のログ一覧を取得
   */
  async getLogsForEdit(userId: string, timezone: string): Promise<ActivityLog[]> {
    try {
      const businessDate = this.calculateBusinessDate(timezone).businessDate;
      const logs = await this.repository.getLogsByDate(userId, businessDate);
      
      // 入力時刻順でソート（編集しやすいように）
      logs.sort((a, b) => new Date(a.inputTimestamp).getTime() - new Date(b.inputTimestamp).getTime());
      
      console.log(`✏️ 編集用ログを取得: [${businessDate}] ${logs.length}件`);
      
      return logs;
    } catch (error) {
      console.error('❌ 編集用ログ取得エラー:', error);
      throw error instanceof ActivityLogError ? error :
        new ActivityLogError('編集用ログの取得に失敗しました', 'GET_EDIT_LOGS_ERROR', { error });
    }
  }

  /**
   * ログを編集
   */
  async editLog(request: EditLogRequest): Promise<ActivityLog> {
    try {
      // 入力内容の検証
      if (!request.newContent || request.newContent.trim().length === 0) {
        throw new ActivityLogError('新しい内容が空です', 'EMPTY_NEW_CONTENT');
      }

      if (request.newContent.length > 2000) {
        throw new ActivityLogError('新しい内容が長すぎます（2000文字以内）', 'NEW_CONTENT_TOO_LONG');
      }

      // ログの存在確認
      const existingLog = await this.repository.getLogById(request.logId);
      if (!existingLog) {
        throw new ActivityLogError('指定されたログが見つかりません', 'LOG_NOT_FOUND', { logId: request.logId });
      }

      // 削除済みログは編集不可
      if (existingLog.isDeleted) {
        throw new ActivityLogError('削除済みのログは編集できません', 'DELETED_LOG_EDIT', { logId: request.logId });
      }

      // ログを更新
      const updatedLog = await this.repository.updateLog(request.logId, request.newContent.trim());

      console.log(`✏️ ログを編集: ${request.logId} -> ${request.newContent.substring(0, 50)}...`);
      
      return updatedLog;
    } catch (error) {
      console.error('❌ ログ編集エラー:', error);
      throw error instanceof ActivityLogError ? error :
        new ActivityLogError('ログの編集に失敗しました', 'EDIT_LOG_ERROR', { error, request });
    }
  }

  /**
   * ログを削除
   */
  async deleteLog(request: DeleteLogRequest): Promise<ActivityLog> {
    try {
      // ログの存在確認
      const existingLog = await this.repository.getLogById(request.logId);
      if (!existingLog) {
        throw new ActivityLogError('指定されたログが見つかりません', 'LOG_NOT_FOUND', { logId: request.logId });
      }

      // 既に削除済みの場合はエラー
      if (existingLog.isDeleted) {
        throw new ActivityLogError('既に削除済みのログです', 'ALREADY_DELETED', { logId: request.logId });
      }

      // ログを論理削除
      const deletedLog = await this.repository.deleteLog(request.logId);

      console.log(`🗑️ ログを削除: ${request.logId} -> ${existingLog.content.substring(0, 50)}...`);
      
      return deletedLog;
    } catch (error) {
      console.error('❌ ログ削除エラー:', error);
      throw error instanceof ActivityLogError ? error :
        new ActivityLogError('ログの削除に失敗しました', 'DELETE_LOG_ERROR', { error, request });
    }
  }

  /**
   * 最新のログを取得
   */
  async getLatestLogs(userId: string, count = 5): Promise<ActivityLog[]> {
    try {
      const logs = await this.repository.getLatestLogs(userId, count);
      
      console.log(`📌 最新ログを取得: ${logs.length}件`);
      
      return logs;
    } catch (error) {
      console.error('❌ 最新ログ取得エラー:', error);
      throw error instanceof ActivityLogError ? error :
        new ActivityLogError('最新ログの取得に失敗しました', 'GET_LATEST_LOGS_ERROR', { error });
    }
  }

  /**
   * 業務日情報を計算
   */
  calculateBusinessDate(timezone: string, targetDate?: string): BusinessDateInfo {
    try {
      const inputDate = targetDate ? new Date(targetDate) : new Date();
      return this.repository.calculateBusinessDate(inputDate.toISOString(), timezone);
    } catch (error) {
      console.error('❌ 業務日計算エラー:', error);
      throw error instanceof ActivityLogError ? error :
        new ActivityLogError('業務日の計算に失敗しました', 'CALC_BUSINESS_DATE_ERROR', { error });
    }
  }

  /**
   * 指定ユーザーの統計情報を取得
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
      const today = this.calculateBusinessDate('Asia/Tokyo'); // デフォルトタイムゾーン
      const todayLogs = await this.repository.getLogCountByDate(userId, today.businessDate);
      
      // 過去7日のログ数（簡易計算）
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);
      const weekStartStr = format(weekStart, 'yyyy-MM-dd');
      
      const weekLogs = await this.repository.getLogsByDateRange(userId, weekStartStr, today.businessDate);
      
      // 1日平均ログ数
      const averageLogsPerDay = totalLogs > 0 ? Math.round((totalLogs / 30) * 10) / 10 : 0; // 30日平均
      
      console.log(`📊 統計情報: 総計${totalLogs}件, 今日${todayLogs}件, 週間${weekLogs.length}件`);
      
      return {
        totalLogs,
        todayLogs,
        weekLogs: weekLogs.length,
        averageLogsPerDay
      };
    } catch (error) {
      console.error('❌ 統計情報取得エラー:', error);
      throw error instanceof ActivityLogError ? error :
        new ActivityLogError('統計情報の取得に失敗しました', 'GET_STATISTICS_ERROR', { error });
    }
  }

  /**
   * ログの内容を検索
   */
  async searchLogs(userId: string, query: string, timezone: string, limit = 20): Promise<ActivityLog[]> {
    try {
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
      
      console.log(`🔍 ログ検索: "${query}" -> ${matchedLogs.length}件ヒット`);
      
      return matchedLogs;
    } catch (error) {
      console.error('❌ ログ検索エラー:', error);
      throw error instanceof ActivityLogError ? error :
        new ActivityLogError('ログの検索に失敗しました', 'SEARCH_LOGS_ERROR', { error });
    }
  }

  /**
   * Discord用の編集リスト文字列を生成
   */
  formatLogsForEdit(logs: ActivityLog[], timezone: string): string {
    if (logs.length === 0) {
      return '📝 今日の活動ログはまだありません。';
    }

    const formatted = logs.map((log, index) => {
      const inputTime = new Date(log.inputTimestamp);
      const localTime = toZonedTime(inputTime, timezone);
      const timeStr = format(localTime, 'HH:mm', { timeZone: timezone });
      
      // 内容を50文字で切り詰め
      const contentPreview = log.content.length > 50 
        ? log.content.substring(0, 47) + '...'
        : log.content;
      
      return `${index + 1}. [${timeStr}] ${contentPreview}`;
    }).join('\n');

    return `📝 **今日の活動ログ一覧:**\n\n${formatted}\n\n**使用方法:**\n\`!edit <番号> <新しい内容>\` - ログを編集\n\`!edit delete <番号>\` - ログを削除`;
  }

  /**
   * Discord用の検索結果文字列を生成
   */
  formatSearchResults(logs: ActivityLog[], query: string, timezone: string): string {
    if (logs.length === 0) {
      return `🔍 「${query}」に一致するログが見つかりませんでした。`;
    }

    const formatted = logs.slice(0, 10).map((log) => {
      const inputTime = new Date(log.inputTimestamp);
      const localTime = toZonedTime(inputTime, timezone);
      const timeStr = format(localTime, 'MM/dd HH:mm', { timeZone: timezone });
      
      // 内容を80文字で切り詰め
      const contentPreview = log.content.length > 80 
        ? log.content.substring(0, 77) + '...'
        : log.content;
      
      return `• [${timeStr}] ${contentPreview}`;
    }).join('\n');

    const moreText = logs.length > 10 ? `\n\n他 ${logs.length - 10} 件の結果があります。` : '';

    return `🔍 **「${query}」の検索結果:** ${logs.length}件\n\n${formatted}${moreText}`;
  }
}