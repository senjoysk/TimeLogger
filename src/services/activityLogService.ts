/**
 * 活動ログサービス（リファクタリング後）
 * 分割された専門サービスを統合したコンポジットサービス実装
 */

import { IActivityLogRepository } from '../repositories/activityLogRepository';
import { ActivityAnalysisResult } from '../types/activityAnalysis';
import {
  ActivityLog,
  EditLogRequest,
  DeleteLogRequest,
  BusinessDateInfo
} from '../types/activityLog';
import { IGeminiService } from './interfaces/IGeminiService';
import { ITimezoneService } from './interfaces/ITimezoneService';

// 分割された専門サービス群をインポート
import { ActivityLogCompositeService } from './activityLogCompositeService';
import { ActivityLogCrudService } from './activityLogCrudService';
import { ActivityLogQueryService } from './activityLogQueryService';
import { ActivityLogFormattingService } from './activityLogFormattingService';
import { BusinessDateCalculatorService } from './businessDateCalculatorService';
import { ActivityLogMatchingCoordinatorService } from './activityLogMatchingCoordinatorService';
import { ActivityLogMatchingService, IActivityLogMatchingService } from './activityLogMatchingService';

/**
 * 活動ログサービスインターフェース（後方互換性維持）
 */
export interface IActivityLogService {
  /**
   * 新しい活動を記録
   */
  recordActivity(userId: string, content: string, timezone: string, inputTime?: string, aiAnalysis?: ActivityAnalysisResult): Promise<ActivityLog>;

  /**
   * 指定日の活動ログを取得
   */
  getLogsForDate(userId: string, businessDate: string | undefined, timezone: string): Promise<ActivityLog[]>;

  /**
   * ログを編集
   */
  editLog(request: EditLogRequest): Promise<ActivityLog>;

  /**
   * ログを削除
   */
  deleteLog(request: DeleteLogRequest): Promise<ActivityLog>;

  /**
   * 最新のログを取得
   */
  getLatestLogs(userId: string, count?: number): Promise<ActivityLog[]>;

  /**
   * 編集用のログ一覧を取得
   */
  getLogsForEdit(userId: string, timezone: string): Promise<ActivityLog[]>;

  /**
   * ログを検索
   */
  searchLogs(userId: string, query: string, timezone: string, limit?: number): Promise<ActivityLog[]>;

  /**
   * 統計情報を取得
   */
  getStatistics(userId: string): Promise<{
    totalLogs: number;
    todayLogs: number;
    weekLogs: number;
    averageLogsPerDay: number;
  }>;

  /**
   * マッチングされていない開始・終了ログを取得
   */
  getUnmatchedLogs(userId: string, timezone: string): Promise<ActivityLog[]>;

  /**
   * 手動でログをマッチングする
   */
  manualMatchLogs(startLogId: string, endLogId: string, userId: string): Promise<{ startLog: ActivityLog; endLog: ActivityLog }>;

  /**
   * 編集用フォーマット
   */
  formatLogsForEdit(logs: ActivityLog[], timezone: string): string;

  /**
   * 検索結果フォーマット
   */
  formatSearchResults(logs: ActivityLog[], query: string, timezone: string): string;

  /**
   * 業務日情報を計算
   */
  calculateBusinessDate(timezone: string, targetDate?: string): BusinessDateInfo;
}

/**
 * ActivityLogServiceの実装（リファクタリング後）
 * 分割された専門サービスを統合したコンポジットサービスをラップ
 */
export class ActivityLogService implements IActivityLogService {
  private compositeService: ActivityLogCompositeService;

  constructor(
    repository: IActivityLogRepository,
    geminiService: IGeminiService,
    timezoneService?: ITimezoneService
  ) {
    // 専門サービス群を初期化
    const crudService = new ActivityLogCrudService(repository, geminiService, timezoneService!);
    const queryService = new ActivityLogQueryService(repository, timezoneService!);
    const formattingService = new ActivityLogFormattingService();
    const dateCalculatorService = new BusinessDateCalculatorService(repository);
    
    // マッチングサービスを初期化
    const defaultStrategy = {
      maxDurationHours: 24,
      maxGapDays: 2,
      minSimilarityScore: 0.6,
      keywordWeight: 0.4,
      semanticWeight: 0.6,
      timeProximityWeight: 0.3,
      contentSimilarityWeight: 0.7
    };
    const matchingService = new ActivityLogMatchingService(defaultStrategy, geminiService);
    const matchingCoordinatorService = new ActivityLogMatchingCoordinatorService(repository, matchingService);

    // コンポジットサービスを初期化
    this.compositeService = new ActivityLogCompositeService(
      crudService,
      queryService,
      formattingService,
      dateCalculatorService,
      matchingCoordinatorService
    );
  }

  /**
   * 新しい活動を記録
   */
  async recordActivity(
    userId: string, 
    content: string, 
    timezone: string, 
    inputTime?: string,
    aiAnalysis?: ActivityAnalysisResult
  ): Promise<ActivityLog> {
    return this.compositeService.recordActivity(userId, content, timezone, inputTime, aiAnalysis);
  }

  /**
   * 指定日の活動ログを取得
   */
  async getLogsForDate(userId: string, businessDate: string | undefined, timezone: string): Promise<ActivityLog[]> {
    return this.compositeService.getLogsForDate(userId, businessDate, timezone);
  }

  /**
   * ログを編集
   */
  async editLog(request: EditLogRequest): Promise<ActivityLog> {
    return this.compositeService.editLog(request);
  }

  /**
   * ログを削除
   */
  async deleteLog(request: DeleteLogRequest): Promise<ActivityLog> {
    return this.compositeService.deleteLog(request);
  }

  /**
   * 最新のログを取得
   */
  async getLatestLogs(userId: string, count = 5): Promise<ActivityLog[]> {
    return this.compositeService.getLatestLogs(userId, count);
  }

  /**
   * 編集用のログ一覧を取得
   */
  async getLogsForEdit(userId: string, timezone: string): Promise<ActivityLog[]> {
    const businessDate = this.compositeService.getCurrentBusinessDate(timezone);
    const logs = await this.compositeService.getLogsForDate(userId, businessDate, timezone);
    
    // 入力時刻順でソート（編集しやすいように）
    return logs.sort((a, b) => new Date(a.inputTimestamp).getTime() - new Date(b.inputTimestamp).getTime());
  }

  /**
   * ログを検索
   */
  async searchLogs(userId: string, query: string, timezone: string, limit = 20): Promise<ActivityLog[]> {
    return this.compositeService.searchLogs(userId, query, timezone, limit);
  }

  /**
   * 統計情報を取得
   */
  async getStatistics(userId: string): Promise<{
    totalLogs: number;
    todayLogs: number;
    weekLogs: number;
    averageLogsPerDay: number;
  }> {
    return this.compositeService.getStatistics(userId);
  }

  /**
   * マッチングされていない開始・終了ログを取得
   */
  async getUnmatchedLogs(userId: string, timezone: string): Promise<ActivityLog[]> {
    return this.compositeService.getUnmatchedLogs(userId, timezone);
  }

  /**
   * 手動でログをマッチングする
   */
  async manualMatchLogs(startLogId: string, endLogId: string, userId: string): Promise<{ startLog: ActivityLog; endLog: ActivityLog }> {
    return this.compositeService.manualMatchLogs(startLogId, endLogId, userId);
  }

  /**
   * 編集用フォーマット
   */
  formatLogsForEdit(logs: ActivityLog[], timezone: string): string {
    return this.compositeService.formatLogsForEdit(logs, timezone);
  }

  /**
   * 検索結果フォーマット
   */
  formatSearchResults(logs: ActivityLog[], query: string, timezone: string): string {
    return this.compositeService.formatSearchResults(logs, query, timezone);
  }

  /**
   * 業務日情報を計算
   */
  calculateBusinessDate(timezone: string, targetDate?: string): BusinessDateInfo {
    return this.compositeService.calculateBusinessDate(timezone, targetDate);
  }

  /**
   * 現在のビジネス日付を取得
   */
  getCurrentBusinessDate(timezone = 'Asia/Tokyo'): string {
    return this.compositeService.getCurrentBusinessDate(timezone);
  }

  /**
   * 指定日が今日かどうか判定
   */
  isToday(targetDate: string, timezone: string): boolean {
    return this.compositeService.isToday(targetDate, timezone);
  }

  /**
   * 自動マッチング処理を実行
   */
  async performAutomaticMatching(log: ActivityLog, userId: string): Promise<void> {
    return this.compositeService.performAutomaticMatching(log, userId);
  }
}