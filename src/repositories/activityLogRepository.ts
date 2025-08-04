/**
 * 新活動記録システム用Repositoryインターフェース
 * 自然言語ログ方式に対応
 */

import { Database } from 'sqlite3';
import {
  ActivityLog,
  CreateActivityLogRequest,
  AnalysisCache,
  CreateAnalysisCacheRequest,
  DailyAnalysisResult,
  BusinessDateInfo
} from '../types/activityLog';
import { TimezoneChange } from './interfaces';

/**
 * 活動ログ管理用Repositoryインターフェース
 */
export interface IActivityLogRepository {
  // === 活動ログ管理 ===
  
  /**
   * 新しい活動ログを保存
   * @param request 活動ログ作成リクエスト
   * @returns 作成されたActivityLog
   */
  saveLog(request: CreateActivityLogRequest): Promise<ActivityLog>;

  /**
   * 指定ユーザーの指定業務日のログを取得
   * @param userId ユーザーID
   * @param businessDate 業務日（YYYY-MM-DD）
   * @param includeDeleted 削除済みログも含めるか（デフォルト: false）
   * @returns ActivityLog配列（入力時刻順）
   */
  getLogsByDate(userId: string, businessDate: string, includeDeleted?: boolean): Promise<ActivityLog[]>;

  /**
   * 指定ユーザーの指定期間のログを取得
   * @param userId ユーザーID  
   * @param startDate 開始日（YYYY-MM-DD、含む）
   * @param endDate 終了日（YYYY-MM-DD、含む）
   * @param includeDeleted 削除済みログも含めるか（デフォルト: false）
   * @returns ActivityLog配列（日付・入力時刻順）
   */
  getLogsByDateRange(userId: string, startDate: string, endDate: string, includeDeleted?: boolean): Promise<ActivityLog[]>;

  /**
   * ログIDで特定のログを取得
   * @param logId ログID
   * @returns ActivityLog（見つからない場合null）
   */
  getLogById(logId: string): Promise<ActivityLog | null>;

  /**
   * 指定ログを更新
   * @param logId ログID
   * @param newContent 新しい内容
   * @returns 更新されたActivityLog
   */
  updateLog(logId: string, newContent: string): Promise<ActivityLog>;

  /**
   * 指定ログを論理削除
   * @param logId ログID
   * @returns 削除されたActivityLog
   */
  deleteLog(logId: string): Promise<ActivityLog>;



  // === 分析キャッシュ管理 ===

  /**
   * 分析結果キャッシュを保存
   * @param request キャッシュ作成リクエスト
   * @returns 作成されたAnalysisCache
   */
  saveAnalysisCache(request: CreateAnalysisCacheRequest): Promise<AnalysisCache>;

  /**
   * 分析結果キャッシュを取得
   * @param userId ユーザーID
   * @param businessDate 業務日（YYYY-MM-DD）
   * @returns AnalysisCache（見つからない場合null）
   */
  getAnalysisCache(userId: string, businessDate: string): Promise<AnalysisCache | null>;

  /**
   * 分析結果キャッシュを更新
   * @param userId ユーザーID
   * @param businessDate 業務日（YYYY-MM-DD）
   * @param analysisResult 新しい分析結果
   * @param logCount 対象ログ数
   * @returns 更新されたAnalysisCache
   */
  updateAnalysisCache(userId: string, businessDate: string, analysisResult: DailyAnalysisResult, logCount: number): Promise<AnalysisCache>;

  /**
   * 分析結果キャッシュを削除（キャッシュ無効化）
   * @param userId ユーザーID
   * @param businessDate 業務日（YYYY-MM-DD）
   * @returns 削除されたかどうか
   */
  deleteAnalysisCache(userId: string, businessDate: string): Promise<boolean>;

  /**
   * キャッシュの有効性を確認
   * @param userId ユーザーID
   * @param businessDate 業務日（YYYY-MM-DD）
   * @param currentLogCount 現在のログ数
   * @returns キャッシュが有効かどうか
   */
  isCacheValid(userId: string, businessDate: string, currentLogCount: number): Promise<boolean>;

  // === 統計・管理機能 ===

  /**
   * 指定ユーザーの総ログ数を取得
   * @param userId ユーザーID
   * @param includeDeleted 削除済みログも含めるか
   * @returns ログ数
   */
  getLogCount(userId: string, includeDeleted?: boolean): Promise<number>;

  /**
   * 指定業務日のログ数を取得
   * @param userId ユーザーID
   * @param businessDate 業務日（YYYY-MM-DD）
   * @param includeDeleted 削除済みログも含めるか
   * @returns ログ数
   */
  getLogCountByDate(userId: string, businessDate: string, includeDeleted?: boolean): Promise<number>;

  /**
   * 最新のログを取得
   * @param userId ユーザーID
   * @param limit 取得件数（デフォルト: 1）
   * @returns ActivityLog配列（新しい順）
   */
  getLatestLogs(userId: string, limit?: number): Promise<ActivityLog[]>;

  /**
   * 古いキャッシュを削除（クリーンアップ用）
   * @param olderThanDays 指定日数より古いキャッシュを削除
   * @returns 削除されたキャッシュ数
   */
  cleanupOldCaches(olderThanDays: number): Promise<number>;

  // === ユーティリティ ===

  /**
   * 業務日情報を計算
   * @param date 対象日時（ISO 8601形式）
   * @param timezone タイムゾーン
   * @returns BusinessDateInfo
   */
  calculateBusinessDate(date: string, timezone: string): BusinessDateInfo;

  /**
   * データベース接続状態を確認
   * @returns 接続状態
   */
  isConnected(): Promise<boolean>;

  /**
   * トランザクション実行
   * @param operation トランザクション内で実行する処理
   * @returns 処理結果
   */
  withTransaction<T>(operation: () => Promise<T>): Promise<T>;


  // === ユーザータイムゾーン管理 ===

  /**
   * ユーザーのタイムゾーン設定を保存
   * @param userId ユーザーID
   * @param timezone IANA タイムゾーン名
   */
  saveUserTimezone(userId: string, timezone: string): Promise<void>;

  /**
   * ユーザーのタイムゾーン設定を取得
   * @param userId ユーザーID
   * @returns タイムゾーン名（設定がない場合はnull）
   */
  getUserTimezone(userId: string): Promise<string | null>;

  /**
   * ユーザーのタイムゾーン変更履歴を取得
   * @param since 指定時刻以降の変更のみ取得（オプション）
   * @returns タイムゾーン変更履歴配列
   */
  getUserTimezoneChanges(since?: Date): Promise<TimezoneChange[]>;

  // === システム管理 ===

  /**
   * 全ユーザー情報を取得
   * @returns ユーザー情報配列
   */
  getAllUsers(): Promise<Array<{
    userId: string;
    username?: string;
    timezone: string;
    registrationDate: string;
    lastSeenAt: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  }>>;

  /**
   * データベースインスタンスを取得
   * @returns SQLiteデータベースインスタンス
   */
  getDatabase(): Database;

  /**
   * スケジューラー用の全ユーザーのタイムゾーン情報を取得
   * @returns ユーザータイムゾーン情報配列
   */
  getAllUserTimezonesForScheduler(): Promise<Array<{
    userId: string;
    timezone: string;
  }>>;

}

/**
 * Repository作成ファクトリーインターフェース
 */
export interface IActivityLogRepositoryFactory {
  /**
   * Repositoryインスタンスを作成
   * @param databasePath データベースファイルパス
   * @returns IActivityLogRepository実装
   */
  create(databasePath: string): Promise<IActivityLogRepository>;

  /**
   * 既存のデータベース接続からRepositoryを作成
   * @param connection 既存のデータベース接続
   * @returns IActivityLogRepository実装
   */
  createFromConnection(connection: Database): IActivityLogRepository;
}

