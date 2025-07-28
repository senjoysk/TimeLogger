/**
 * SQLite実装による活動ログRepository
 * 自然言語ログ方式に対応
 * 
 * @SRP-EXCEPTION: 統合リポジトリとして複数インターフェース実装が必要
 * @SRP-REASON: 既存システムとの互換性維持のため段階的分割中
 */

import { CostAlert } from '../types/costAlert';
import { TodoSourceType } from '../types/todo';

import { Database } from 'sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { toZonedTime, format } from 'date-fns-tz';
import { MigrationManager } from '../database/migrationManager';
import { DatabaseInitializer } from '../database/databaseInitializer';
import {
  QueryParams,
  QueryParam,
  SqliteRunResult,
  SqliteBoolean,
  ActivityLogRow,
  AnalysisCacheRow,
  ApiCostRow,
  UserTimezoneRow,
  TodoTaskRow,
  MessageClassificationHistoryRow,
  UserRegistrationRow,
  NotificationRow,
  UserSettingRow,
  ApiStatsRow,
  UserTimezoneStatsRow,
  TimezoneChangeRow,
  UserStatsAggregateRow,
  NotificationDataRow,
  CountRow,
  DailyStatsRow,
  HourlyStatsRow,
  DateLogStatsRow,
  MatchedLogPairRow,
  ActivityPromptSettingRow,
  TodoStatsRow,
  ClassificationAccuracyRow,
  DatabaseQueryResult,
  DatabaseQueryResults,
  sqliteBooleanToBoolean,
  booleanToSqliteBoolean
} from '../types/database';
import {
  IActivityLogRepository,
  LogSearchCriteria
} from './activityLogRepository';
import { IApiCostRepository, ITodoRepository, IMessageClassificationRepository, IUserRepository, IActivityPromptRepository, UserInfo, UserStats, TimezoneChange, TimezoneNotification } from './interfaces';
import {
  ActivityLog,
  CreateActivityLogRequest,
  AnalysisCache,
  CreateAnalysisCacheRequest,
  DailyAnalysisResult,
  BusinessDateInfo,
  ActivityLogError,
  LogType,
  MatchStatus
} from '../types/activityLog';
import {
  Todo,
  CreateTodoRequest,
  UpdateTodoRequest,
  GetTodosOptions,
  TodoStats,
  TodoStatus,
  MessageClassificationHistory,
  MessageClassification,
  TodoError
} from '../types/todo';
import { ActivityPromptSettings, CreateActivityPromptSettingsRequest, UpdateActivityPromptSettingsRequest } from '../types/activityPrompt';
import * as fs from 'fs';
import * as path from 'path';
import { ITimezoneService } from '../services/interfaces/ITimezoneService';

/**
 * SQLite実装クラス
 * 活動ログ、APIコストモニタリング、TODO管理、メッセージ分類の統合実装
 */
export class SqliteActivityLogRepository implements IActivityLogRepository, IApiCostRepository, ITodoRepository, IMessageClassificationRepository, IUserRepository, IActivityPromptRepository {
  private db: Database;
  private connected: boolean = false;
  private migrationManager: MigrationManager;
  private timezoneService?: ITimezoneService;

  constructor(databasePath: string, timezoneService?: ITimezoneService) {
    this.timezoneService = timezoneService;
    // データベースディレクトリの作成
    const dir = path.dirname(databasePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(databasePath);
    this.migrationManager = new MigrationManager(this.db, databasePath);
    // 初期化は非同期で行うため、ここでは実行しない
  }

  /**
   * デフォルトタイムゾーンを取得
   * TimezoneServiceが利用可能な場合はそれを使用し、そうでなければAsia/Tokyoにフォールバック
   */
  private getDefaultTimezone(): string {
    return this.timezoneService?.getSystemTimezone() || 'Asia/Tokyo';
  }

  /**
   * スキーマを強制的に初期化（テスト環境用）
   * 既存のinitializeDatabase()とは別の軽量版
   */
  public async ensureSchema(): Promise<void> {
    try {
      // newSchema.sqlから直接スキーマを読み込み適用
      let schemaPath = path.join(__dirname, '../database/newSchema.sql');
      
      // 別のパスも試す
      if (!fs.existsSync(schemaPath)) {
        schemaPath = path.join(__dirname, '../../src/database/newSchema.sql');
      }
      
      if (!fs.existsSync(schemaPath)) {
        throw new Error(`スキーマファイルが見つかりません: ${schemaPath}`);
      }
      
      const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
      const statements = schemaContent
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0);
      
      for (const statement of statements) {
        try {
          await this.runQuery(statement);
        } catch (error) {
          // テーブルが既に存在する場合などのエラーは無視
          console.log(`スキーマ適用をスキップ: ${statement.substring(0, 50)}...`);
        }
      }
      
      this.connected = true;
      console.log('✅ スキーマの強制初期化が完了しました');
    } catch (error) {
      console.error('❌ スキーマ強制初期化エラー:', error);
      throw new ActivityLogError('スキーマの初期化に失敗しました', 'SCHEMA_INIT_ERROR', { error });
    }
  }

  /**
   * テスト環境でuser_settingsテーブルにPhase 3の拡張カラムを追加
   */
  private async ensureUserSettingsColumns(): Promise<void> {
    try {
      // user_settingsテーブルが存在するか確認
      const tableExists = await this.runQuery(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='user_settings'"
      );
      
      if (!tableExists) {
        console.log('⚠️ user_settingsテーブルが存在しません');
        return;
      }
      
      // 各カラムを安全に追加（既に存在する場合はエラーを無視）
      const columnsToAdd = [
        'ALTER TABLE user_settings ADD COLUMN username TEXT',
        'ALTER TABLE user_settings ADD COLUMN first_seen TEXT',
        'ALTER TABLE user_settings ADD COLUMN last_seen TEXT',
        'ALTER TABLE user_settings ADD COLUMN is_active BOOLEAN DEFAULT TRUE',
        // 活動促し通知機能のカラム（マイグレーション005の内容）
        'ALTER TABLE user_settings ADD COLUMN prompt_enabled BOOLEAN DEFAULT FALSE',
        'ALTER TABLE user_settings ADD COLUMN prompt_start_hour INTEGER DEFAULT 8',
        'ALTER TABLE user_settings ADD COLUMN prompt_start_minute INTEGER DEFAULT 30',
        'ALTER TABLE user_settings ADD COLUMN prompt_end_hour INTEGER DEFAULT 18',
        'ALTER TABLE user_settings ADD COLUMN prompt_end_minute INTEGER DEFAULT 0'
      ];
      
      for (const sql of columnsToAdd) {
        try {
          await this.runQuery(sql);
          console.log(`✅ テスト環境: ${sql}`);
        } catch (error) {
          // カラムが既に存在する場合のエラーは無視
          console.log(`⚠️ テスト環境: ${sql} - スキップ (既に存在)`);
        }
      }
    } catch (error) {
      console.error('❌ テスト環境でのuser_settingsカラム追加エラー:', error);
    }
  }

  /**
   * データベースの初期化（テーブル作成）
   * 全環境で統一されたマイグレーション方式を使用
   */
  public async initializeDatabase(): Promise<void> {
    try {
      console.log('🚀 統一データベース初期化を開始します...');
      console.log(`  環境: NODE_ENV=${process.env.NODE_ENV}`);
      
      const initializer = new DatabaseInitializer(this.db);
      
      // 初期化実行
      const result = await initializer.initialize();
      
      console.log(`✅ データベース初期化完了:`, {
        新規DB: result.isNewDatabase,
        方式: result.method,
        作成テーブル数: result.tablesCreated,
        適用マイグレーション数: result.migrationsApplied
      });
      
      this.connected = true;
    } catch (error) {
      console.error('❌ データベース初期化エラー:', error);
      throw new ActivityLogError('データベースの初期化に失敗しました', 'DB_INIT_ERROR', { error });
    }
  }


  // === 活動ログ管理 ===

  /**
   * 新しい活動ログを保存
   */
  async saveLog(request: CreateActivityLogRequest): Promise<ActivityLog> {
    try {
      const id = uuidv4();
      const now = new Date().toISOString();

      const log: ActivityLog = {
        id,
        userId: request.userId,
        content: request.content,
        inputTimestamp: request.inputTimestamp,
        businessDate: request.businessDate,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
        // リアルタイム分析結果（存在する場合）
        startTime: request.startTime,
        endTime: request.endTime,
        totalMinutes: request.totalMinutes,
        confidence: request.confidence,
        analysisMethod: request.analysisMethod,
        categories: request.categories,
        analysisWarnings: request.analysisWarnings,
        // 開始・終了ログマッチング機能（存在する場合）
        logType: request.logType || 'complete',
        matchStatus: request.matchStatus || 'unmatched',
        matchedLogId: request.matchedLogId,
        activityKey: request.activityKey,
        similarityScore: request.similarityScore
      };

      const sql = `
        INSERT INTO activity_logs (
          id, user_id, content, input_timestamp, business_date, 
          is_deleted, created_at, updated_at,
          start_time, end_time, total_minutes, confidence, 
          analysis_method, categories, analysis_warnings,
          log_type, match_status, matched_log_id, activity_key, similarity_score,
          is_reminder_reply, time_range_start, time_range_end, context_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await this.runQuery(sql, [
        log.id,
        log.userId,
        log.content,
        log.inputTimestamp,
        log.businessDate,
        log.isDeleted ? 1 : 0,
        log.createdAt,
        log.updatedAt,
        log.startTime || null,
        log.endTime || null,
        log.totalMinutes || null,
        log.confidence || null,
        log.analysisMethod || null,
        log.categories || null,
        log.analysisWarnings || null,
        log.logType || 'complete',
        log.matchStatus || 'unmatched',
        log.matchedLogId || null,
        log.activityKey || null,
        log.similarityScore || null,
        log.isReminderReply ? 1 : 0,
        log.timeRangeStart || null,
        log.timeRangeEnd || null,
        log.contextType || 'NORMAL'
      ]);

      console.log(`✅ 活動ログを保存しました: ${log.id}`);
      
      // キャッシュ無効化（バッチ処理）
      this.scheduleAnalysisCacheInvalidation(request.userId, request.businessDate);
      
      return log;
    } catch (error) {
      console.error('❌ 活動ログ保存エラー:', error);
      throw new ActivityLogError('活動ログの保存に失敗しました', 'SAVE_LOG_ERROR', { error, request });
    }
  }

  /**
   * 指定ユーザーの指定業務日のログを取得
   */
  async getLogsByDate(userId: string, businessDate: string, includeDeleted = false): Promise<ActivityLog[]> {
    try {
      const sql = `
        SELECT * FROM activity_logs 
        WHERE user_id = ? AND business_date = ? 
        ${includeDeleted ? '' : 'AND is_deleted = 0'}
        ORDER BY input_timestamp ASC
      `;

      const rows = await this.allQuery<ActivityLogRow>(sql, [userId, businessDate]);
      return rows.map(this.mapRowToActivityLog);
    } catch (error) {
      console.error('❌ ログ取得エラー:', error);
      throw new ActivityLogError('ログの取得に失敗しました', 'GET_LOGS_ERROR', { error, userId, businessDate });
    }
  }

  /**
   * 指定ユーザーの指定期間のログを取得
   */
  async getLogsByDateRange(userId: string, startDate: string, endDate: string, includeDeleted = false): Promise<ActivityLog[]> {
    try {
      const sql = `
        SELECT * FROM activity_logs 
        WHERE user_id = ? AND business_date BETWEEN ? AND ?
        ${includeDeleted ? '' : 'AND is_deleted = 0'}
        ORDER BY business_date ASC, input_timestamp ASC
      `;

      const rows = await this.allQuery<ActivityLogRow>(sql, [userId, startDate, endDate]);
      return rows.map(this.mapRowToActivityLog);
    } catch (error) {
      console.error('❌ 期間ログ取得エラー:', error);
      throw new ActivityLogError('期間ログの取得に失敗しました', 'GET_RANGE_LOGS_ERROR', { error, userId, startDate, endDate });
    }
  }

  /**
   * ログIDで特定のログを取得
   */
  async getLogById(logId: string): Promise<ActivityLog | null> {
    try {
      const sql = 'SELECT * FROM activity_logs WHERE id = ?';
      const row = await this.getQuery(sql, [logId]) as ActivityLogRow | undefined;
      
      return row ? this.mapRowToActivityLog(row) : null;
    } catch (error) {
      console.error('❌ ログID取得エラー:', error);
      throw new ActivityLogError('ログの取得に失敗しました', 'GET_LOG_BY_ID_ERROR', { error, logId });
    }
  }

  /**
   * 指定ログを更新
   */
  async updateLog(logId: string, newContent: string): Promise<ActivityLog> {
    try {
      const existingLog = await this.getLogById(logId);
      if (!existingLog) {
        throw new ActivityLogError('ログが見つかりません', 'LOG_NOT_FOUND', { logId });
      }

      const now = new Date().toISOString();
      const sql = 'UPDATE activity_logs SET content = ?, updated_at = ? WHERE id = ?';
      
      await this.runQuery(sql, [newContent, now, logId]);

      // キャッシュ無効化（バッチ処理）
      this.scheduleAnalysisCacheInvalidation(existingLog.userId, existingLog.businessDate);

      console.log(`✅ ログを更新しました: ${logId}`);
      
      // 更新後のログを返す
      const updatedLog = await this.getLogById(logId);
      return updatedLog!;
    } catch (error) {
      console.error('❌ ログ更新エラー:', error);
      throw new ActivityLogError('ログの更新に失敗しました', 'UPDATE_LOG_ERROR', { error, logId, newContent });
    }
  }

  /**
   * 指定ログを論理削除
   */
  async deleteLog(logId: string): Promise<ActivityLog> {
    try {
      const existingLog = await this.getLogById(logId);
      if (!existingLog) {
        throw new ActivityLogError('ログが見つかりません', 'LOG_NOT_FOUND', { logId });
      }

      const now = new Date().toISOString();
      const sql = 'UPDATE activity_logs SET is_deleted = 1, updated_at = ? WHERE id = ?';
      
      await this.runQuery(sql, [now, logId]);

      // キャッシュ無効化（バッチ処理）
      this.scheduleAnalysisCacheInvalidation(existingLog.userId, existingLog.businessDate);

      console.log(`✅ ログを削除しました: ${logId}`);
      
      // 削除後のログを返す
      const deletedLog = await this.getLogById(logId);
      return deletedLog!;
    } catch (error) {
      console.error('❌ ログ削除エラー:', error);
      throw new ActivityLogError('ログの削除に失敗しました', 'DELETE_LOG_ERROR', { error, logId });
    }
  }

  /**
   * 指定ログを物理削除（管理者用）
   */
  async permanentDeleteLog(logId: string): Promise<boolean> {
    try {
      const existingLog = await this.getLogById(logId);
      if (!existingLog) {
        return false;
      }

      const sql = 'DELETE FROM activity_logs WHERE id = ?';
      const result = await this.runQuery(sql, [logId]);
      
      // キャッシュ無効化
      await this.deleteAnalysisCache(existingLog.userId, existingLog.businessDate);

      console.log(`✅ ログを物理削除しました: ${logId}`);
      return true;
    } catch (error) {
      console.error('❌ ログ物理削除エラー:', error);
      throw new ActivityLogError('ログの物理削除に失敗しました', 'PERMANENT_DELETE_ERROR', { error, logId });
    }
  }

  /**
   * 削除済みログを復元
   */
  async restoreLog(logId: string): Promise<ActivityLog> {
    try {
      const existingLog = await this.getLogById(logId);
      if (!existingLog) {
        throw new ActivityLogError('ログが見つかりません', 'LOG_NOT_FOUND', { logId });
      }

      const now = new Date().toISOString();
      const sql = 'UPDATE activity_logs SET is_deleted = 0, updated_at = ? WHERE id = ?';
      
      await this.runQuery(sql, [now, logId]);

      // キャッシュ無効化
      await this.deleteAnalysisCache(existingLog.userId, existingLog.businessDate);

      console.log(`✅ ログを復元しました: ${logId}`);
      
      // 復元後のログを返す
      const restoredLog = await this.getLogById(logId);
      return restoredLog!;
    } catch (error) {
      console.error('❌ ログ復元エラー:', error);
      throw new ActivityLogError('ログの復元に失敗しました', 'RESTORE_LOG_ERROR', { error, logId });
    }
  }

  // === 分析キャッシュ管理 ===

  /**
   * 分析結果キャッシュを保存
   */
  async saveAnalysisCache(request: CreateAnalysisCacheRequest): Promise<AnalysisCache> {
    try {
      const id = uuidv4();
      const now = new Date().toISOString();

      const cache: AnalysisCache = {
        id,
        userId: request.userId,
        businessDate: request.businessDate,
        analysisResult: request.analysisResult,
        logCount: request.logCount,
        generatedAt: now
      };

      const sql = `
        INSERT OR REPLACE INTO daily_analysis_cache (
          id, user_id, business_date, analysis_result, log_count, generated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `;

      await this.runQuery(sql, [
        cache.id,
        cache.userId,
        cache.businessDate,
        JSON.stringify(cache.analysisResult),
        cache.logCount,
        cache.generatedAt
      ]);

      console.log(`✅ 分析キャッシュを保存しました: ${cache.businessDate}`);
      return cache;
    } catch (error) {
      console.error('❌ キャッシュ保存エラー:', error);
      throw new ActivityLogError('キャッシュの保存に失敗しました', 'SAVE_CACHE_ERROR', { error, request });
    }
  }

  /**
   * 分析結果キャッシュを取得
   */
  async getAnalysisCache(userId: string, businessDate: string): Promise<AnalysisCache | null> {
    try {
      const sql = 'SELECT * FROM daily_analysis_cache WHERE user_id = ? AND business_date = ?';
      const row = await this.getQuery(sql, [userId, businessDate]) as AnalysisCacheRow | undefined;
      
      if (!row) return null;

      return {
        id: row.id,
        userId: row.user_id,
        businessDate: row.business_date,
        analysisResult: JSON.parse(row.analysis_result as string),
        logCount: row.log_count,
        generatedAt: row.generated_at
      };
    } catch (error) {
      console.error('❌ キャッシュ取得エラー:', error);
      throw new ActivityLogError('キャッシュの取得に失敗しました', 'GET_CACHE_ERROR', { error, userId, businessDate });
    }
  }

  /**
   * 分析結果キャッシュを更新
   */
  async updateAnalysisCache(userId: string, businessDate: string, analysisResult: DailyAnalysisResult, logCount: number): Promise<AnalysisCache> {
    const request: CreateAnalysisCacheRequest = {
      userId,
      businessDate,
      analysisResult,
      logCount
    };
    return await this.saveAnalysisCache(request);
  }

  /**
   * 分析結果キャッシュを削除（キャッシュ無効化）
   */
  async deleteAnalysisCache(userId: string, businessDate: string): Promise<boolean> {
    try {
      const sql = 'DELETE FROM daily_analysis_cache WHERE user_id = ? AND business_date = ?';
      await this.runQuery(sql, [userId, businessDate]);
      // テスト環境以外でのみログ出力
      if (process.env.NODE_ENV !== 'test') {
        console.log(`🗑️ キャッシュを無効化しました: ${businessDate}`);
      }
      return true;
    } catch (error) {
      console.error('❌ キャッシュ削除エラー:', error);
      return false;
    }
  }

  /**
   * キャッシュの有効性を確認
   */
  async isCacheValid(userId: string, businessDate: string, currentLogCount: number): Promise<boolean> {
    try {
      const cache = await this.getAnalysisCache(userId, businessDate);
      if (!cache) return false;

      // ログ数が一致しているかチェック
      if (cache.logCount !== currentLogCount) {
        console.log(`🔄 キャッシュ無効: ログ数不一致 (キャッシュ: ${cache.logCount}, 現在: ${currentLogCount})`);
        return false;
      }

      // 生成時刻が1時間以内かチェック
      const cacheTime = new Date(cache.generatedAt).getTime();
      const now = new Date().getTime();
      const oneHour = 60 * 60 * 1000;
      
      if (now - cacheTime > oneHour) {
        console.log(`🔄 キャッシュ無効: 古いキャッシュ (${Math.round((now - cacheTime) / 1000 / 60)}分前)`);
        return false;
      }

      return true;
    } catch (error) {
      console.error('❌ キャッシュ有効性確認エラー:', error);
      return false;
    }
  }

  // === 統計・管理機能 ===

  /**
   * 指定ユーザーの総ログ数を取得
   */
  async getLogCount(userId: string, includeDeleted = false): Promise<number> {
    try {
      const sql = `
        SELECT COUNT(*) as count FROM activity_logs 
        WHERE user_id = ? ${includeDeleted ? '' : 'AND is_deleted = 0'}
      `;
      const row = await this.getQuery(sql, [userId]) as { count: number } | undefined;
      return row?.count ?? 0;
    } catch (error) {
      console.error('❌ ログ数取得エラー:', error);
      throw new ActivityLogError('ログ数の取得に失敗しました', 'GET_LOG_COUNT_ERROR', { error, userId });
    }
  }

  /**
   * 指定業務日のログ数を取得
   */
  async getLogCountByDate(userId: string, businessDate: string, includeDeleted = false): Promise<number> {
    try {
      const sql = `
        SELECT COUNT(*) as count FROM activity_logs 
        WHERE user_id = ? AND business_date = ? ${includeDeleted ? '' : 'AND is_deleted = 0'}
      `;
      const row = await this.getQuery(sql, [userId, businessDate]) as { count: number } | undefined;
      return row?.count ?? 0;
    } catch (error) {
      console.error('❌ 日別ログ数取得エラー:', error);
      throw new ActivityLogError('日別ログ数の取得に失敗しました', 'GET_DATE_LOG_COUNT_ERROR', { error, userId, businessDate });
    }
  }

  /**
   * 最新のログを取得
   */
  async getLatestLogs(userId: string, limit = 1): Promise<ActivityLog[]> {
    try {
      const sql = `
        SELECT * FROM activity_logs 
        WHERE user_id = ? AND is_deleted = 0
        ORDER BY input_timestamp DESC 
        LIMIT ?
      `;
      const rows = await this.allQuery<ActivityLogRow>(sql, [userId, limit]);
      return rows.map(this.mapRowToActivityLog);
    } catch (error) {
      console.error('❌ 最新ログ取得エラー:', error);
      throw new ActivityLogError('最新ログの取得に失敗しました', 'GET_LATEST_LOGS_ERROR', { error, userId, limit });
    }
  }

  /**
   * 古いキャッシュを削除（クリーンアップ用）
   */
  async cleanupOldCaches(olderThanDays: number): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
      const cutoffIso = cutoffDate.toISOString();

      const countSql = 'SELECT COUNT(*) as count FROM daily_analysis_cache WHERE generated_at < ?';
      const countRow = await this.getQuery(countSql, [cutoffIso]) as { count: number } | undefined;
      const deleteCount = countRow?.count ?? 0;

      const deleteSql = 'DELETE FROM daily_analysis_cache WHERE generated_at < ?';
      await this.runQuery(deleteSql, [cutoffIso]);

      console.log(`🧹 古いキャッシュを${deleteCount}件削除しました`);
      return deleteCount;
    } catch (error) {
      console.error('❌ キャッシュクリーンアップエラー:', error);
      throw new ActivityLogError('キャッシュクリーンアップに失敗しました', 'CLEANUP_CACHE_ERROR', { error, olderThanDays });
    }
  }

  // === ユーティリティ ===

  /**
   * 業務日情報を計算
   */
  calculateBusinessDate(date: string, timezone: string): BusinessDateInfo {
    try {
      const inputDate = new Date(date);
      const zonedDate = toZonedTime(inputDate, timezone);

      // 5:00am基準で業務日を計算
      let businessDate = new Date(zonedDate);
      if (zonedDate.getHours() < 5) {
        businessDate.setDate(businessDate.getDate() - 1);
      }

      const businessDateStr = format(businessDate, 'yyyy-MM-dd', { timeZone: timezone });

      // 業務日の開始と終了時刻（UTC）
      const startTime = new Date(businessDate);
      startTime.setHours(5, 0, 0, 0);
      const startTimeUtc = new Date(startTime.toLocaleString('en-US', { timeZone: 'UTC' }));

      const endTime = new Date(startTime);
      endTime.setDate(endTime.getDate() + 1);
      endTime.setMinutes(endTime.getMinutes() - 1); // 4:59am
      const endTimeUtc = new Date(endTime.toLocaleString('en-US', { timeZone: 'UTC' }));

      return {
        businessDate: businessDateStr,
        startTime: startTimeUtc.toISOString(),
        endTime: endTimeUtc.toISOString(),
        timezone
      };
    } catch (error) {
      console.error('❌ 業務日計算エラー:', error);
      throw new ActivityLogError('業務日の計算に失敗しました', 'CALC_BUSINESS_DATE_ERROR', { error, date, timezone });
    }
  }

  /**
   * データベース接続状態を確認
   */
  async isConnected(): Promise<boolean> {
    return this.connected;
  }

  /**
   * トランザクション実行
   */
  async withTransaction<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');
        
        operation()
          .then((result) => {
            this.db.run('COMMIT', (err) => {
              if (err) {
                reject(new ActivityLogError('トランザクションコミットに失敗しました', 'TRANSACTION_COMMIT_ERROR', { err }));
              } else {
                resolve(result);
              }
            });
          })
          .catch((error) => {
            this.db.run('ROLLBACK', () => {
              reject(new ActivityLogError('トランザクション実行に失敗しました', 'TRANSACTION_ERROR', { error }));
            });
          });
      });
    });
  }

  // === 内部ヘルパーメソッド ===

  /**
   * SQLクエリ実行（更新系）
   */
  private runQuery(sql: string, params: QueryParams = []): Promise<SqliteRunResult> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this);
        }
      });
    });
  }

  /**
   * SQLクエリ実行（単一行取得）
   */
  private getQuery<T = unknown>(sql: string, params: QueryParams = []): Promise<DatabaseQueryResult<T>> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row as T | null);
        }
      });
    });
  }

  /**
   * SQLクエリ実行（複数行取得）
   */
  private allQuery<T = unknown>(sql: string, params: QueryParams = []): Promise<DatabaseQueryResults<T>> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows as T[]);
        }
      });
    });
  }

  /**
   * データベース行をActivityLogオブジェクトにマッピング
   */
  private mapRowToActivityLog(row: ActivityLogRow): ActivityLog {
    const log: ActivityLog = {
      id: row.id,
      userId: row.user_id,
      content: row.content,
      inputTimestamp: row.input_timestamp,
      businessDate: row.business_date,
      isDeleted: sqliteBooleanToBoolean(row.is_deleted as SqliteBoolean),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };

    // リアルタイム分析結果フィールドをマッピング（存在する場合のみ）
    if (row.start_time !== undefined) log.startTime = row.start_time;
    if (row.end_time !== undefined) log.endTime = row.end_time;
    if (row.total_minutes !== undefined) log.totalMinutes = row.total_minutes;
    if (row.confidence !== undefined) log.confidence = row.confidence;
    if (row.analysis_method !== undefined) log.analysisMethod = row.analysis_method;
    if (row.categories !== undefined) log.categories = row.categories;
    if (row.analysis_warnings !== undefined) log.analysisWarnings = row.analysis_warnings;

    // 開始・終了ログマッチング関連フィールドをマッピング（存在する場合のみ）
    if (row.log_type !== undefined) log.logType = row.log_type as LogType;
    if (row.match_status !== undefined) log.matchStatus = row.match_status as MatchStatus;
    if (row.matched_log_id !== undefined) log.matchedLogId = row.matched_log_id;
    if (row.activity_key !== undefined) log.activityKey = row.activity_key;
    if (row.similarity_score !== undefined) log.similarityScore = row.similarity_score;

    // リマインダーReply機能関連フィールドをマッピング（存在する場合のみ）
    if (row.is_reminder_reply !== undefined) log.isReminderReply = sqliteBooleanToBoolean(row.is_reminder_reply as SqliteBoolean);
    if (row.time_range_start !== undefined) log.timeRangeStart = row.time_range_start;
    if (row.time_range_end !== undefined) log.timeRangeEnd = row.time_range_end;
    if (row.context_type !== undefined) log.contextType = row.context_type as 'REMINDER_REPLY' | 'POST_REMINDER' | 'NORMAL';

    return log;
  }

  /**
   * SQL文を適切に分割（TRIGGER、VIEWなどの複数行文に対応）
   */
  private splitSqlStatements(schema: string): string[] {
    const statements: string[] = [];
    
    // セミコロンで分割してから、TRIGGERとVIEWの特別処理
    const rawStatements = schema.split(';');
    let i = 0;
    
    while (i < rawStatements.length) {
      let statement = rawStatements[i].trim();
      
      // 空文またはコメントのみの文はスキップ
      if (!statement || statement.split('\n').every(line => 
        line.trim() === '' || line.trim().startsWith('--')
      )) {
        i++;
        continue;
      }
      
      // TRIGGERの特別処理
      if (statement.toUpperCase().includes('CREATE TRIGGER')) {
        // TRIGGERの場合は次の文（END;）まで結合
        if (i + 1 < rawStatements.length) {
          const nextStatement = rawStatements[i + 1].trim();
          if (nextStatement.toUpperCase().includes('END')) {
            statement = statement + ';\n' + nextStatement;
            i++; // 次の文もスキップ
          }
        }
      }
      
      statements.push(statement);
      i++;
    }
    
    return statements.filter(stmt => stmt.length > 0);
  }

  // === APIコスト監視機能（IApiCostRepository実装） ===

  /**
   * API呼び出しを記録
   */
  async recordApiCall(operation: string, inputTokens: number, outputTokens: number): Promise<void> {
    try {
      const id = uuidv4();
      const now = new Date().toISOString();
      
      // Gemini 1.5 Flash料金計算（参考: https://ai.google.dev/pricing）
      const inputCostPer1k = 0.075 / 1000;  // $0.075 per 1K input tokens
      const outputCostPer1k = 0.30 / 1000;  // $0.30 per 1K output tokens
      
      const inputCost = (inputTokens / 1000) * inputCostPer1k;
      const outputCost = (outputTokens / 1000) * outputCostPer1k;
      const totalCost = inputCost + outputCost;

      // api_costs テーブルが存在しない場合は作成
      await this.ensureApiCostsTable();

      const sql = `
        INSERT INTO api_costs (
          id, operation, input_tokens, output_tokens, 
          estimated_cost, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?)
      `;

      await this.runQuery(sql, [
        id,
        operation,
        inputTokens,
        outputTokens,
        totalCost,
        now
      ]);

      if (process.env.NODE_ENV === 'test') {
        console.log(`📊 API呼び出しを記録: ${operation} (入力: ${inputTokens}, 出力: ${outputTokens}, コスト: $${totalCost.toFixed(4)}), timestamp: ${now}`);
      }
    } catch (error) {
      console.error('❌ API呼び出し記録エラー:', error);
      // エラー時も処理を継続（コスト記録失敗で本来の機能を止めない）
    }
  }

  /**
   * 今日の統計を取得
   */
  async getTodayStats(timezone?: string): Promise<{
    totalCalls: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    estimatedCost: number;
    operationBreakdown: Record<string, { calls: number; inputTokens: number; outputTokens: number; cost: number }>;
  }> {
    try {
      await this.ensureApiCostsTable();

      // デバッグ用: 全レコードを取得
      if (process.env.NODE_ENV === 'test') {
        const allRecords = await this.allQuery<ApiCostRow>('SELECT * FROM api_costs ORDER BY timestamp DESC');
        console.log(`🔍 getTodayStats - 全レコード数: ${allRecords.length}`);
        if (allRecords.length > 0) {
          console.log(`🔍 最新レコード: ${JSON.stringify(allRecords[0])}`);
        }
      }

      const sql = `
        SELECT 
          operation,
          COUNT(*) as calls,
          SUM(input_tokens) as total_input_tokens,
          SUM(output_tokens) as total_output_tokens,
          SUM(estimated_cost) as total_cost
        FROM api_costs 
        GROUP BY operation
      `;

      const rows = await this.allQuery<ApiStatsRow>(sql);
      
      // デバッグ情報（テスト時のみ）
      if (process.env.NODE_ENV === 'test') {
        console.log(`🔍 getTodayStats デバッグ: rows=${rows.length}`);
      }

      let totalCalls = 0;
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let estimatedCost = 0;
      const operationBreakdown: Record<string, any> = {};

      rows.forEach(row => {
        totalCalls += row.calls;
        totalInputTokens += row.total_input_tokens;
        totalOutputTokens += row.total_output_tokens;
        estimatedCost += row.total_cost;

        operationBreakdown[row.operation] = {
          calls: row.calls,
          inputTokens: row.total_input_tokens,
          outputTokens: row.total_output_tokens,
          cost: row.total_cost
        };
      });

      return {
        totalCalls,
        totalInputTokens,
        totalOutputTokens,
        estimatedCost,
        operationBreakdown
      };
    } catch (error) {
      console.error('❌ 今日の統計取得エラー:', error);
      // エラー時はデフォルト値を返す
      return {
        totalCalls: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        estimatedCost: 0,
        operationBreakdown: {}
      };
    }
  }

  /**
   * コスト警告をチェック
   */
  async checkCostAlerts(timezone?: string): Promise<CostAlert | null> {
    try {
      const resolvedTimezone = timezone || this.getDefaultTimezone();
      const stats = await this.getTodayStats(resolvedTimezone);
      
      // 警告しきい値（設定可能にすべきだが、現在は固定値）
      const warningCost = 1.0;  // $1.00
      const criticalCost = 5.0; // $5.00
      
      if (stats.estimatedCost >= criticalCost) {
        return {
          message: `本日のAPI使用料が$${stats.estimatedCost.toFixed(2)}に達しました（危険レベル）`,
          level: 'critical'
        };
      } else if (stats.estimatedCost >= warningCost) {
        return {
          message: `本日のAPI使用料が$${stats.estimatedCost.toFixed(2)}に達しました（警告レベル）`,
          level: 'warning'
        };
      }
      
      return null;
    } catch (error) {
      console.error('❌ コスト警告チェックエラー:', error);
      return null;
    }
  }

  /**
   * 日次レポートを生成
   */
  async generateDailyReport(timezone: string): Promise<string> {
    try {
      const stats = await this.getTodayStats(timezone);
      
      const now = new Date();
      const zonedNow = toZonedTime(now, timezone);
      const dateStr = format(zonedNow, 'yyyy年MM月dd日', { timeZone: timezone });
      
      let report = `📊 **API使用量レポート - ${dateStr}**\n\n`;
      
      report += `**📈 本日の合計**\n`;
      report += `• 呼び出し回数: ${stats.totalCalls}回\n`;
      report += `• 入力トークン: ${stats.totalInputTokens.toLocaleString()}\n`;
      report += `• 出力トークン: ${stats.totalOutputTokens.toLocaleString()}\n`;
      report += `• 推定費用: $${stats.estimatedCost.toFixed(4)}\n\n`;
      
      if (Object.keys(stats.operationBreakdown).length > 0) {
        report += `**🔍 操作別内訳**\n`;
        Object.entries(stats.operationBreakdown)
          .sort(([,a], [,b]) => b.cost - a.cost)
          .forEach(([operation, data]) => {
            report += `• **${operation}**: ${data.calls}回, $${data.cost.toFixed(4)}\n`;
          });
        report += `\n`;
      }
      
      // 使用量に応じたコメント
      if (stats.estimatedCost >= 5.0) {
        report += `🚨 **注意**: 本日の使用量が高額になっています。`;
      } else if (stats.estimatedCost >= 1.0) {
        report += `⚠️ **警告**: 本日の使用量が増加しています。`;
      } else {
        report += `✅ **良好**: 本日の使用量は適正範囲内です。`;
      }
      
      return report;
    } catch (error) {
      console.error('❌ 日次レポート生成エラー:', error);
      return '❌ レポートの生成中にエラーが発生しました。';
    }
  }

  /**
   * API費用テーブルが存在することを確認（なければ作成）
   */
  private async ensureApiCostsTable(): Promise<void> {
    try {
      const createTableSql = `
        CREATE TABLE IF NOT EXISTS api_costs (
          id TEXT PRIMARY KEY,
          operation TEXT NOT NULL,
          input_tokens INTEGER DEFAULT 0,
          output_tokens INTEGER DEFAULT 0,
          estimated_cost REAL DEFAULT 0.0,
          timestamp TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
          user_id TEXT,
          business_date TEXT
        )
      `;
      
      await this.runQuery(createTableSql);
      
      // インデックスの作成
      const createIndexSql = `
        CREATE INDEX IF NOT EXISTS idx_api_costs_timestamp 
        ON api_costs(timestamp)
      `;
      
      await this.runQuery(createIndexSql);
      
    } catch (error) {
      console.error('❌ API費用テーブル作成エラー:', error);
      throw error;
    }
  }

  // === ユーザー設定管理 ===

  /**
   * ユーザーのタイムゾーン設定を保存
   * @param userId ユーザーID
   * @param timezone IANA タイムゾーン名
   */
  async saveUserTimezone(userId: string, timezone: string): Promise<void> {
    try {
      const now = new Date().toISOString();
      
      // 既存ユーザーかチェック
      const existingUser = await this.getQuery<UserRegistrationRow>(
        'SELECT * FROM user_settings WHERE user_id = ?',
        [userId]
      );
      
      if (existingUser) {
        // 既存ユーザーの場合はタイムゾーンのみ更新
        const sql = `
          UPDATE user_settings 
          SET timezone = ?, updated_at = ?
          WHERE user_id = ?
        `;
        await this.runQuery(sql, [timezone, now, userId]);
      } else {
        // 新規ユーザーの場合はfirst_seen, last_seenも設定
        const sql = `
          INSERT INTO user_settings (user_id, timezone, first_seen, last_seen, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        await this.runQuery(sql, [userId, timezone, now, now, true, now, now]);
      }
      
      console.log(`✅ ユーザータイムゾーン設定保存: ${userId} -> ${timezone}`);
    } catch (error) {
      console.error('❌ ユーザータイムゾーン設定保存エラー:', error);
      throw new ActivityLogError('ユーザータイムゾーン設定の保存に失敗しました', 'SAVE_USER_TIMEZONE_ERROR', { error, userId, timezone });
    }
  }

  /**
   * ユーザーのタイムゾーン設定を取得
   * @param userId ユーザーID
   * @returns タイムゾーン名（設定がない場合はnull）
   */
  async getUserTimezone(userId: string): Promise<string | null> {
    try {
      const sql = `
        SELECT timezone 
        FROM user_settings 
        WHERE user_id = ?
      `;
      
      const row = await this.getQuery<UserTimezoneRow>(sql, [userId]);
      
      if (row && row.timezone) {
        console.log(`📍 ユーザータイムゾーン取得: ${userId} -> ${row.timezone}`);
        return row.timezone;
      }
      
      console.log(`📍 ユーザータイムゾーン未設定: ${userId}`);
      return null;
    } catch (error) {
      console.error('❌ ユーザータイムゾーン取得エラー:', error);
      throw new ActivityLogError('ユーザータイムゾーン設定の取得に失敗しました', 'GET_USER_TIMEZONE_ERROR', { error, userId });
    }
  }

  /**
   * 全ユーザーのタイムゾーン設定を取得
   * @returns ユーザーIDとタイムゾーンのマップ
   */
  async getAllUserTimezones(): Promise<{ [userId: string]: string }> {
    try {
      const sql = `
        SELECT user_id, timezone 
        FROM user_settings
      `;
      
      const rows = await this.allQuery<UserTimezoneStatsRow>(sql);
      const timezones: { [userId: string]: string } = {};
      
      for (const row of rows) {
        timezones[row.user_id] = row.timezone;
      }
      
      console.log(`📍 全ユーザータイムゾーン取得: ${Object.keys(timezones).length}件`);
      return timezones;
    } catch (error) {
      console.error('❌ 全ユーザータイムゾーン取得エラー:', error);
      throw new ActivityLogError('全ユーザータイムゾーン設定の取得に失敗しました', 'GET_ALL_USER_TIMEZONES_ERROR', { error });
    }
  }

  // ================================================================
  // TimezoneChangeMonitor用メソッド（日次レポート送信機能）
  // ================================================================

  /**
   * 指定時刻以降のタイムゾーン変更を取得
   */
  async getUserTimezoneChanges(since?: Date): Promise<TimezoneChange[]> {
    try {
      let sql = `
        SELECT user_id, old_timezone, new_timezone, changed_at
        FROM timezone_change_notifications
        WHERE processed = 0
      `;
      
      const params: QueryParams = [];
      if (since) {
        sql += ` AND changed_at > ?`;
        params.push(since.toISOString());
      }
      
      sql += ` ORDER BY changed_at ASC`;
      
      const rows = await this.allQuery<TimezoneChangeRow>(sql, params);
      
      console.log(`📍 タイムゾーン変更取得: ${rows.length}件 (since: ${since?.toISOString() || 'all'})`);
      return rows.map(row => ({
        user_id: row.user_id,
        old_timezone: row.old_timezone,
        new_timezone: row.new_timezone,
        updated_at: row.changed_at
      }));
    } catch (error) {
      console.error('❌ タイムゾーン変更取得エラー:', error);
      throw new ActivityLogError('タイムゾーン変更の取得に失敗しました', 'GET_USER_TIMEZONE_CHANGES_ERROR', { since, error });
    }
  }

  /**
   * 未処理の通知を取得
   */
  async getUnprocessedNotifications(): Promise<TimezoneNotification[]> {
    try {
      const sql = `
        SELECT id, user_id, old_timezone, new_timezone, changed_at, processed
        FROM timezone_change_notifications
        WHERE processed = 0
        ORDER BY changed_at ASC
      `;
      
      const rows = await this.allQuery<{
        id: string;
        user_id: string;
        old_timezone: string | null;
        new_timezone: string;
        changed_at: string;
        processed: number;
      }>(sql);
      
      console.log(`📍 未処理通知取得: ${rows.length}件`);
      return rows.map(row => ({
        id: row.id,
        user_id: row.user_id,
        old_timezone: row.old_timezone,
        new_timezone: row.new_timezone,
        changed_at: row.changed_at,
        processed: sqliteBooleanToBoolean(row.processed as SqliteBoolean)
      }));
    } catch (error) {
      console.error('❌ 未処理通知取得エラー:', error);
      throw new ActivityLogError('未処理通知の取得に失敗しました', 'GET_UNPROCESSED_NOTIFICATIONS_ERROR', { error });
    }
  }

  /**
   * 通知を処理済みとしてマーク
   */
  async markNotificationAsProcessed(notificationId: string): Promise<void> {
    try {
      const sql = `
        UPDATE timezone_change_notifications
        SET processed = 1, processed_at = datetime('now', 'utc')
        WHERE id = ?
      `;
      
      await this.runQuery(sql, [notificationId]);
      
      console.log(`📍 通知を処理済みマーク: ${notificationId}`);
    } catch (error) {
      console.error('❌ 通知処理済みマークエラー:', error);
      throw new ActivityLogError('通知の処理済みマークに失敗しました', 'MARK_NOTIFICATION_PROCESSED_ERROR', { notificationId, error });
    }
  }

  // === 統合サービス対応メソッド ===

  /**
   * 活動レコードを取得（相関分析用）
   */
  async getActivityRecords(userId: string, timezone: string, businessDate?: string): Promise<ActivityLog[]> {
    try {
      let sql = `
        SELECT * FROM activity_logs 
        WHERE user_id = ? AND is_deleted = 0
      `;
      const params: QueryParams = [userId];

      if (businessDate) {
        sql += ` AND business_date = ?`;
        params.push(businessDate);
      }

      sql += ` ORDER BY input_timestamp DESC`;

      const rows = await this.allQuery<ActivityLogRow>(sql, params);
      return rows.map(this.mapRowToActivityLog);
    } catch (error) {
      console.error('❌ 活動レコード取得エラー:', error);
      throw new ActivityLogError('活動レコードの取得に失敗しました', 'GET_ACTIVITY_RECORDS_ERROR', { error, userId, businessDate });
    }
  }


  // === 開始・終了ログマッチング関連メソッド ===

  /**
   * ログのマッチング情報を更新
   * @param logId ログID
   * @param matchInfo マッチング情報
   */
  async updateLogMatching(logId: string, matchInfo: {
    matchStatus?: string;
    matchedLogId?: string;
    similarityScore?: number;
  }): Promise<void> {
    try {
      const setParts: string[] = [];
      const params: QueryParams = [];

      if (matchInfo.matchStatus !== undefined) {
        setParts.push('match_status = ?');
        params.push(matchInfo.matchStatus);
      }

      if (matchInfo.matchedLogId !== undefined) {
        setParts.push('matched_log_id = ?');
        params.push(matchInfo.matchedLogId);
      }

      if (matchInfo.similarityScore !== undefined) {
        setParts.push('similarity_score = ?');
        params.push(matchInfo.similarityScore);
      }

      if (setParts.length === 0) {
        return; // 更新するものがない
      }

      setParts.push('updated_at = ?');
      params.push(new Date().toISOString());
      params.push(logId);

      const sql = `UPDATE activity_logs SET ${setParts.join(', ')} WHERE id = ?`;
      await this.runQuery(sql, params);

      console.log(`✅ ログマッチング情報を更新しました: ${logId}`);
    } catch (error) {
      console.error('❌ ログマッチング情報更新エラー:', error);
      throw new ActivityLogError('ログマッチング情報の更新に失敗しました', 'UPDATE_LOG_MATCHING_ERROR', { error, logId, matchInfo });
    }
  }

  /**
   * 未マッチのログを取得（指定されたログタイプ）
   * @param userId ユーザーID
   * @param logType ログタイプ
   * @param businessDate 業務日（オプション）
   * @returns 未マッチログ配列
   */
  async getUnmatchedLogs(userId: string, logType: string, businessDate?: string): Promise<ActivityLog[]> {
    try {
      let sql = `
        SELECT * FROM activity_logs 
        WHERE user_id = ? 
          AND log_type = ? 
          AND match_status = 'unmatched'
          AND is_deleted = 0
      `;
      const params = [userId, logType];

      if (businessDate) {
        sql += ' AND business_date = ?';
        params.push(businessDate);
      }

      sql += ' ORDER BY input_timestamp ASC';

      const rows = await this.allQuery<ActivityLogRow>(sql, params);
      return rows.map(this.mapRowToActivityLog);
    } catch (error) {
      console.error('❌ 未マッチログ取得エラー:', error);
      throw new ActivityLogError('未マッチログの取得に失敗しました', 'GET_UNMATCHED_LOGS_ERROR', { error, userId, logType, businessDate });
    }
  }

  /**
   * マッチング済みログペアを取得
   * @param userId ユーザーID
   * @param businessDate 業務日（オプション）
   * @returns マッチング済みログペア配列
   */
  async getMatchedLogPairs(userId: string, businessDate?: string): Promise<{ startLog: ActivityLog; endLog: ActivityLog }[]> {
    try {
      let sql = `
        SELECT 
          start_log.*,
          end_log.id as end_id,
          end_log.content as end_content,
          end_log.input_timestamp as end_input_timestamp,
          end_log.log_type as end_log_type,
          end_log.activity_key as end_activity_key
        FROM activity_logs start_log
        JOIN activity_logs end_log ON start_log.matched_log_id = end_log.id
        WHERE start_log.user_id = ?
          AND start_log.log_type = 'start_only'
          AND start_log.match_status = 'matched'
          AND start_log.is_deleted = 0
          AND end_log.is_deleted = 0
      `;
      const params = [userId];

      if (businessDate) {
        sql += ' AND start_log.business_date = ?';
        params.push(businessDate);
      }

      sql += ' ORDER BY start_log.input_timestamp ASC';

      const rows = await this.allQuery<MatchedLogPairRow>(sql, params);
      
      return rows.map(row => {
        const startLog = this.mapRowToActivityLog(row);
        const endLog: ActivityLog = {
          id: row.end_id,
          userId: row.user_id,
          content: row.end_content,
          inputTimestamp: row.end_input_timestamp,
          businessDate: row.business_date,
          isDeleted: false,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          logType: row.end_log_type as LogType,
          matchStatus: 'matched',
          matchedLogId: startLog.id
        };

        return { startLog, endLog };
      });
    } catch (error) {
      console.error('❌ マッチング済みログペア取得エラー:', error);
      throw new ActivityLogError('マッチング済みログペアの取得に失敗しました', 'GET_MATCHED_LOG_PAIRS_ERROR', { error, userId, businessDate });
    }
  }

  // ================================================================
  // TODO管理機能の実装
  // ================================================================

  /**
   * TODOを作成
   */
  async createTodo(request: CreateTodoRequest): Promise<Todo> {
    const todo: Todo = {
      id: uuidv4(),
      userId: request.userId,
      content: request.content,
      status: 'pending',
      priority: request.priority || 0,
      dueDate: request.dueDate,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sourceType: request.sourceType || 'manual',
      relatedActivityId: request.relatedActivityId,
      aiConfidence: request.aiConfidence,
    };

    const sql = `
      INSERT INTO todo_tasks (
        id, user_id, content, status, priority, due_date, 
        created_at, updated_at, source_type, related_activity_id, ai_confidence, is_deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    try {
      await this.runQuery(sql, [
        todo.id,
        todo.userId,
        todo.content,
        todo.status,
        todo.priority,
        todo.dueDate,
        todo.createdAt,
        todo.updatedAt,
        todo.sourceType,
        todo.relatedActivityId,
        todo.aiConfidence,
        false,  // is_deleted
      ]);
      return todo;
    } catch (error) {
      throw new TodoError('TODOの作成に失敗しました', 'CREATE_TODO_ERROR', { error, request });
    }
  }

  /**
   * IDでTODOを取得
   */
  async getTodoById(id: string): Promise<Todo | null> {
    const sql = 'SELECT * FROM todo_tasks WHERE id = ?';
    
    try {
      const row = await this.getQuery<TodoTaskRow>(sql, [id]);
      return row ? this.mapRowToTodo(row) : null;
    } catch (error) {
      throw new TodoError('TODO取得に失敗しました', 'GET_TODO_ERROR', { error, id });
    }
  }

  /**
   * ユーザーIDでTODO一覧を取得
   */
  async getTodosByUserId(userId: string, options?: GetTodosOptions): Promise<Todo[]> {
    let sql = 'SELECT * FROM todo_tasks WHERE user_id = ? AND is_deleted = 0';
    const params: QueryParams = [userId];

    if (options?.status) {
      sql += ' AND status = ?';
      params.push(options.status);
    }

    if (options?.orderBy === 'priority') {
      sql += ' ORDER BY priority DESC, created_at ASC';
    } else if (options?.orderBy === 'created') {
      sql += ' ORDER BY created_at DESC';
    } else if (options?.orderBy === 'due_date') {
      sql += ' ORDER BY due_date ASC NULLS LAST';
    }

    if (options?.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
      
      if (options?.offset) {
        sql += ' OFFSET ?';
        params.push(options.offset);
      }
    }

    try {
      const rows = await this.allQuery<TodoTaskRow>(sql, params);
      return rows.map(row => this.mapRowToTodo(row));
    } catch (error) {
      throw new TodoError('TODO一覧取得に失敗しました', 'GET_TODOS_ERROR', { error, userId, options });
    }
  }

  /**
   * TODOを更新
   */
  async updateTodo(id: string, update: UpdateTodoRequest): Promise<void> {
    const updateFields: string[] = [];
    const params: (string | number | boolean)[] = [];

    if (update.content !== undefined) {
      updateFields.push('content = ?');
      params.push(update.content);
    }
    if (update.priority !== undefined) {
      updateFields.push('priority = ?');
      params.push(update.priority);
    }
    if (update.dueDate !== undefined) {
      updateFields.push('due_date = ?');
      params.push(update.dueDate);
    }
    if (update.status !== undefined) {
      updateFields.push('status = ?');
      params.push(update.status);
    }

    if (updateFields.length === 0) {
      return; // 更新する項目がない
    }

    updateFields.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);

    const sql = `UPDATE todo_tasks SET ${updateFields.join(', ')} WHERE id = ?`;

    try {
      await this.runQuery(sql, params);
    } catch (error) {
      throw new TodoError('TODO更新に失敗しました', 'UPDATE_TODO_ERROR', { error, id, update });
    }
  }

  /**
   * TODOステータスを更新
   */
  async updateTodoStatus(id: string, status: TodoStatus): Promise<void> {
    const updateFields = ['status = ?', 'updated_at = ?'];
    const params = [status, new Date().toISOString()];

    if (status === 'completed') {
      updateFields.push('completed_at = ?');
      params.push(new Date().toISOString());
    }

    params.push(id);
    const sql = `UPDATE todo_tasks SET ${updateFields.join(', ')} WHERE id = ?`;

    try {
      await this.runQuery(sql, params);
    } catch (error) {
      throw new TodoError('TODOステータス更新に失敗しました', 'UPDATE_TODO_STATUS_ERROR', { error, id, status });
    }
  }

  /**
   * TODOを削除
   */
  async deleteTodo(id: string): Promise<void> {
    const sql = 'DELETE FROM todo_tasks WHERE id = ?';
    
    try {
      await this.runQuery(sql, [id]);
    } catch (error) {
      throw new TodoError('TODO削除に失敗しました', 'DELETE_TODO_ERROR', { error, id });
    }
  }

  /**
   * キーワードでTODOを検索
   */
  async searchTodos(userId: string, keyword: string): Promise<Todo[]> {
    const sql = 'SELECT * FROM todo_tasks WHERE user_id = ? AND content LIKE ? ORDER BY created_at DESC';
    const searchPattern = `%${keyword}%`;
    
    try {
      const rows = await this.allQuery<TodoTaskRow>(sql, [userId, searchPattern]);
      return rows.map(row => this.mapRowToTodo(row));
    } catch (error) {
      throw new TodoError('TODO検索に失敗しました', 'SEARCH_TODOS_ERROR', { error, userId, keyword });
    }
  }

  /**
   * TODO統計を取得
   */
  async getTodoStats(userId: string): Promise<TodoStats> {
    const sql = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
        SUM(CASE WHEN status = 'completed' AND date(completed_at) = date('now', 'localtime') THEN 1 ELSE 0 END) as today_completed,
        SUM(CASE WHEN status = 'completed' AND date(completed_at) >= date('now', 'localtime', '-7 days') THEN 1 ELSE 0 END) as week_completed
      FROM todo_tasks 
      WHERE user_id = ?
    `;
    
    try {
      const row = await this.getQuery<TodoStatsRow>(sql, [userId]);
      return {
        total: row?.total || 0,
        pending: row?.pending || 0,
        inProgress: row?.in_progress || 0,
        completed: row?.completed || 0,
        cancelled: row?.cancelled || 0,
        overdue: 0, // 現在は未実装
        todayCompleted: row?.today_completed || 0,
        weekCompleted: row?.week_completed || 0,
      };
    } catch (error) {
      throw new TodoError('TODO統計取得に失敗しました', 'GET_TODO_STATS_ERROR', { error, userId });
    }
  }

  /**
   * 期日があるTODOを取得
   */
  async getTodosWithDueDate(userId: string, beforeDate?: string): Promise<Todo[]> {
    let sql = 'SELECT * FROM todo_tasks WHERE user_id = ? AND due_date IS NOT NULL';
    const params: QueryParams = [userId];

    if (beforeDate) {
      sql += ' AND due_date <= ?';
      params.push(beforeDate);
    }

    sql += ' ORDER BY due_date ASC';

    try {
      const rows = await this.allQuery<TodoTaskRow>(sql, params);
      return rows.map(row => this.mapRowToTodo(row));
    } catch (error) {
      throw new TodoError('期日付きTODO取得に失敗しました', 'GET_TODOS_WITH_DUE_DATE_ERROR', { error, userId, beforeDate });
    }
  }

  /**
   * 活動IDに関連するTODOを取得
   */
  async getTodosByActivityId(activityId: string): Promise<Todo[]> {
    const sql = 'SELECT * FROM todo_tasks WHERE related_activity_id = ? ORDER BY created_at DESC';
    
    try {
      const rows = await this.allQuery<TodoTaskRow>(sql, [activityId]);
      return rows.map(row => this.mapRowToTodo(row));
    } catch (error) {
      throw new TodoError('活動関連TODO取得に失敗しました', 'GET_TODOS_BY_ACTIVITY_ERROR', { error, activityId });
    }
  }

  // ================================================================
  // メッセージ分類機能の実装
  // ================================================================

  /**
   * 分類履歴を記録
   */
  async recordClassification(
    userId: string,
    messageContent: string,
    aiClassification: MessageClassification,
    aiConfidence: number,
    userClassification?: MessageClassification,
    feedback?: string
  ): Promise<MessageClassificationHistory> {
    const record: MessageClassificationHistory = {
      id: uuidv4(),
      userId,
      messageContent,
      aiClassification,
      aiConfidence,
      userClassification,
      classifiedAt: new Date().toISOString(),
      feedback,
      isCorrect: userClassification ? aiClassification === userClassification : undefined,
    };

    const sql = `
      INSERT INTO message_classifications (
        id, user_id, message_content, ai_classification, ai_confidence,
        user_classification, classified_at, feedback, is_correct
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    try {
      await this.runQuery(sql, [
        record.id,
        record.userId,
        record.messageContent,
        record.aiClassification,
        record.aiConfidence,
        record.userClassification,
        record.classifiedAt,
        record.feedback,
        record.isCorrect,
      ]);
      return record;
    } catch (error) {
      throw new TodoError('分類履歴記録に失敗しました', 'RECORD_CLASSIFICATION_ERROR', { error, userId });
    }
  }

  /**
   * 分類フィードバックを更新
   */
  async updateClassificationFeedback(
    id: string,
    userClassification: MessageClassification,
    feedback?: string
  ): Promise<void> {
    const sql = `
      UPDATE message_classifications 
      SET user_classification = ?, feedback = ?, is_correct = (ai_classification = ?)
      WHERE id = ?
    `;

    try {
      await this.runQuery(sql, [userClassification, feedback, userClassification, id]);
    } catch (error) {
      throw new TodoError('分類フィードバック更新に失敗しました', 'UPDATE_CLASSIFICATION_FEEDBACK_ERROR', { error, id });
    }
  }

  /**
   * 分類精度統計を取得
   */
  async getClassificationAccuracy(userId?: string): Promise<{
    classification: MessageClassification;
    totalCount: number;
    correctCount: number;
    accuracy: number;
    avgConfidence: number;
  }[]> {
    let sql = `
      SELECT 
        ai_classification as classification,
        COUNT(*) as total_count,
        SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct_count,
        CAST(SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS REAL) / COUNT(*) as accuracy,
        AVG(ai_confidence) as avg_confidence
      FROM message_classifications
      WHERE user_classification IS NOT NULL
    `;
    const params: (string | number | boolean)[] = [];

    if (userId) {
      sql += ' AND user_id = ?';
      params.push(userId);
    }

    sql += ' GROUP BY ai_classification';

    try {
      const rows = await this.allQuery<ClassificationAccuracyRow>(sql, params);
      return rows.map(row => ({
        classification: row.classification as MessageClassification,
        totalCount: row.total_count,
        correctCount: row.correct_count,
        accuracy: row.accuracy,
        avgConfidence: row.avg_confidence,
      }));
    } catch (error) {
      throw new TodoError('分類精度統計取得に失敗しました', 'GET_CLASSIFICATION_ACCURACY_ERROR', { error, userId });
    }
  }

  /**
   * 分類履歴を取得
   */
  async getClassificationHistory(userId: string, limit?: number): Promise<MessageClassificationHistory[]> {
    let sql = 'SELECT * FROM message_classifications WHERE user_id = ? ORDER BY classified_at DESC';
    const params: QueryParams = [userId];

    if (limit) {
      sql += ' LIMIT ?';
      params.push(limit);
    }

    try {
      const rows = await this.allQuery<MessageClassificationHistoryRow>(sql, params);
      return rows.map(row => this.mapRowToClassificationHistory(row));
    } catch (error) {
      throw new TodoError('分類履歴取得に失敗しました', 'GET_CLASSIFICATION_HISTORY_ERROR', { error, userId });
    }
  }

  // ================================================================
  // ヘルパーメソッド
  // ================================================================

  /**
   * データベース行をTodoオブジェクトにマッピング
   */
  private mapRowToTodo(row: TodoTaskRow): Todo {
    return {
      id: row.id,
      userId: row.user_id,
      content: row.content, // データベーススキーマに合わせてcontentを使用
      status: row.status as TodoStatus,
      priority: typeof row.priority === 'string' ? parseInt(row.priority, 10) : row.priority,
      dueDate: row.due_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
      relatedActivityId: row.related_activity_id, // 関連する活動ログIDをマッピング
      sourceType: 'manual' as TodoSourceType // デフォルト値
    };
  }

  /**
   * データベース行をMessageClassificationHistoryオブジェクトにマッピング
   */
  private mapRowToClassificationHistory(row: MessageClassificationHistoryRow): MessageClassificationHistory {
    return {
      id: row.id,
      userId: row.user_id,
      messageContent: row.message_content,
      aiClassification: row.classification_type as MessageClassification,
      aiConfidence: row.confidence_score,
      classifiedAt: row.processed_at
    };
  }

  // ================================================================
  // パフォーマンス最適化メソッド
  // ================================================================

  /**
   * 日付範囲でTODOを取得（メモリ内フィルタリングの代替）
   */
  async getTodosByDateRange(userId: string, startDate: string, endDate: string): Promise<Todo[]> {
    const sql = `
      SELECT * FROM todo_tasks 
      WHERE user_id = ? AND is_deleted = 0
      AND (
        (created_at >= ? AND created_at <= ?) OR 
        (completed_at >= ? AND completed_at <= ?)
      )
      ORDER BY created_at DESC
    `;

    try {
      const rows = await this.allQuery<TodoTaskRow>(sql, [
        userId,
        startDate + 'T00:00:00Z',
        endDate + 'T23:59:59Z',
        startDate + 'T00:00:00Z',
        endDate + 'T23:59:59Z'
      ]);
      return rows.map(row => this.mapRowToTodo(row));
    } catch (error) {
      console.error('❌ 日付範囲TODO取得エラー:', error);
      throw new TodoError('日付範囲TODO取得に失敗しました', 'GET_TODOS_BY_DATE_RANGE_ERROR', { error, userId, startDate, endDate });
    }
  }

  /**
   * ステータス指定でTODOを最適化取得（メモリ内フィルタリングの代替）
   */
  async getTodosByStatusOptimized(userId: string, statuses: TodoStatus[]): Promise<Todo[]> {
    if (statuses.length === 0) {
      return [];
    }

    const placeholders = statuses.map(() => '?').join(',');
    const sql = `
      SELECT * FROM todo_tasks 
      WHERE user_id = ? AND is_deleted = 0 AND status IN (${placeholders})
      ORDER BY priority DESC, created_at ASC
    `;

    try {
      const rows = await this.allQuery<TodoTaskRow>(sql, [userId, ...statuses]);
      return rows.map(row => this.mapRowToTodo(row));
    } catch (error) {
      console.error('❌ ステータス最適化TODO取得エラー:', error);
      throw new TodoError('ステータス最適化TODO取得に失敗しました', 'GET_TODOS_BY_STATUS_OPTIMIZED_ERROR', { error, userId, statuses });
    }
  }

  // ================================================================
  // バッチキャッシュ無効化システム
  // ================================================================

  private cacheInvalidationBatch = new Set<string>();
  private cacheInvalidationTimer?: NodeJS.Timeout;

  /**
   * 分析キャッシュの無効化をバッチで実行するようスケジューリング
   */
  private scheduleAnalysisCacheInvalidation(userId: string, businessDate: string): void {
    const cacheKey = `${userId}:${businessDate}`;
    this.cacheInvalidationBatch.add(cacheKey);
    
    if (this.cacheInvalidationTimer) {
      clearTimeout(this.cacheInvalidationTimer);
    }
    
    this.cacheInvalidationTimer = setTimeout(async () => {
      await this.flushCacheInvalidationBatch();
    }, 100); // 100ms遅延でバッチ処理
  }

  /**
   * 蓄積されたキャッシュ無効化を一括実行
   */
  private async flushCacheInvalidationBatch(): Promise<void> {
    if (this.cacheInvalidationBatch.size === 0) return;
    
    // テスト環境以外でのみログ出力
    if (process.env.NODE_ENV !== 'test') {
      console.log(`🧹 バッチキャッシュ無効化: ${this.cacheInvalidationBatch.size}件`);
    }
    
    const deletions = Array.from(this.cacheInvalidationBatch).map(cacheKey => {
      const [userId, businessDate] = cacheKey.split(':');
      return this.deleteAnalysisCache(userId, businessDate);
    });
    
    try {
      await Promise.all(deletions);
      if (process.env.NODE_ENV !== 'test') {
        console.log(`✅ バッチキャッシュ無効化完了: ${this.cacheInvalidationBatch.size}件`);
      }
    } catch (error) {
      console.error('❌ バッチキャッシュ無効化エラー:', error);
    } finally {
      this.cacheInvalidationBatch.clear();
    }
  }

  /**
   * 統一データベースが既に準備済みかチェック
   * 必要なテーブルが存在するかを確認
   */
  private async checkUnifiedDatabaseReady(): Promise<boolean> {
    try {
      const requiredTables = ['activity_logs', 'user_settings', 'api_costs', 'todo_tasks'];
      
      for (const tableName of requiredTables) {
        const rows = await this.allQuery(
          "SELECT name FROM sqlite_master WHERE type='table' AND name=?", 
          [tableName]
        ) as Record<string, unknown>[];
        
        if (rows.length === 0) {
          console.log(`🔍 テーブル ${tableName} が存在しません - 統一DBは未準備`);
          return false;
        }
      }
      
      console.log('✅ 全ての必要テーブルが存在 - 統一DBは準備済み');
      return true;
    } catch (error) {
      console.error('❌ 統一DB状態チェックエラー:', error);
      return false;
    }
  }

  /**
   * 新しく追加されたテーブルの存在を確認し、必要に応じて作成
   * 注意: web_admin_preferences テーブルはCookieベース実装により廃止済み
   */
  private async ensureNewTablesExist(): Promise<void> {
    // 現在は新しいテーブルの作成は不要
    // 将来的に新しいテーブルが必要になった場合はここに追加
    console.log('✅ 新テーブル確認完了（現在は追加テーブルなし）');
  }

  /**
   * データベース接続を閉じる
   */
  async close(): Promise<void> {
    // バッチキャッシュ無効化タイマーをクリア
    if (this.cacheInvalidationTimer) {
      clearTimeout(this.cacheInvalidationTimer);
      this.cacheInvalidationTimer = undefined;
    }

    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          reject(err);
        } else {
          this.connected = false;
          console.log('✅ データベース接続を閉じました');
          resolve();
        }
      });
    });
  }

  // ================================================================
  // IUserRepository Implementation (マルチユーザー対応)
  // ================================================================

  /**
   * ユーザーが存在するかチェック
   */
  async userExists(userId: string): Promise<boolean> {
    try {
      const result = await this.allQuery(
        'SELECT user_id FROM user_settings WHERE user_id = ?',
        [userId]
      );
      return result.length > 0;
    } catch (error) {
      console.error('❌ ユーザー存在確認エラー:', error);
      return false;
    }
  }

  /**
   * 新規ユーザーを登録
   */
  async registerUser(userId: string, username: string): Promise<void> {
    try {
      const now = new Date().toISOString();
      
      // user_settingsテーブルの確認・作成
      await this.ensureUserSettingsTable();
      
      // user_settingsに登録
      await this.runQuery(`
        INSERT INTO user_settings (user_id, username, timezone, first_seen, last_seen, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [userId, username, this.getDefaultTimezone(), now, now, true, now, now]);
      
      console.log(`✅ 新規ユーザー登録完了: ${userId} (${username})`);
    } catch (error) {
      console.error('❌ ユーザー登録エラー:', error);
      throw new ActivityLogError('ユーザー登録に失敗しました', 'USER_REGISTRATION_ERROR', { userId, username, error });
    }
  }

  /**
   * ユーザー情報を取得
   */
  async getUserInfo(userId: string): Promise<UserInfo | null> {
    try {
      const row = await this.getQuery<UserRegistrationRow>(
        'SELECT * FROM user_settings WHERE user_id = ?',
        [userId]
      );
      
      if (!row) {
        return null;
      }
      return {
        userId: row.user_id,
        username: row.username,
        timezone: row.timezone,
        registrationDate: row.first_seen,  // データベーススキーマのfirst_seenをregistrationDateにマッピング
        lastSeenAt: row.last_seen,         // データベーススキーマのlast_seenをlastSeenAtにマッピング
        isActive: sqliteBooleanToBoolean(row.is_active as SqliteBoolean),
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    } catch (error) {
      console.error('❌ ユーザー情報取得エラー:', error);
      throw new ActivityLogError('ユーザー情報の取得に失敗しました', 'USER_INFO_ERROR', { userId, error });
    }
  }

  /**
   * 全ユーザー取得
   */
  async getAllUsers(): Promise<UserInfo[]> {
    try {
      const rows = await this.allQuery<UserRegistrationRow>('SELECT * FROM user_settings ORDER BY created_at DESC');
      
      if (!rows || rows.length === 0) {
        return [];
      }
      
      return rows.map(row => ({
        userId: row.user_id,
        username: row.username || 'Unknown User',
        timezone: row.timezone,
        registrationDate: row.first_seen,  // データベーススキーマのfirst_seenをregistrationDateにマッピング
        lastSeenAt: row.last_seen,         // データベーススキーマのlast_seenをlastSeenAtにマッピング
        isActive: sqliteBooleanToBoolean(row.is_active as SqliteBoolean),
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    } catch (error) {
      console.error('❌ 全ユーザー取得エラー:', error);
      throw new ActivityLogError('全ユーザーの取得に失敗しました', 'GET_ALL_USERS_ERROR', { error });
    }
  }

  /**
   * スケジューラー用の全ユーザータイムゾーン情報を取得
   * DynamicReportScheduler用のシンプルなインターフェース
   */
  async getAllUserTimezonesForScheduler(): Promise<Array<{ userId: string; timezone: string }>> {
    try {
      const rows = await this.allQuery<UserTimezoneStatsRow>(`
        SELECT user_id, timezone 
        FROM user_settings 
        WHERE is_active = 1 
        ORDER BY user_id
      `);
      
      if (!rows || rows.length === 0) {
        return [];
      }
      
      return rows.map(row => ({
        userId: row.user_id,
        timezone: row.timezone || this.getDefaultTimezone()
      }));
    } catch (error) {
      console.error('❌ スケジューラー用タイムゾーン取得エラー:', error);
      throw new ActivityLogError('スケジューラー用タイムゾーンの取得に失敗しました', 'GET_SCHEDULER_TIMEZONES_ERROR', { error });
    }
  }

  /**
   * 基本統計を単一クエリで取得（パフォーマンス最適化）
   */
  private async getBasicUserStats(userId: string): Promise<{
    totalLogs: number;
    thisMonthLogs: number;
    thisWeekLogs: number;
    todayLogs: number;
    avgLogsPerDay: number;
    totalMinutesLogged: number;
  }> {
    const sql = `
      SELECT 
        COUNT(*) as total_logs,
        COUNT(CASE WHEN date(input_timestamp) >= date('now', 'start of month') THEN 1 END) as this_month_logs,
        COUNT(CASE WHEN date(input_timestamp) >= date('now', 'weekday 1', '-7 days') THEN 1 END) as this_week_logs,
        COUNT(CASE WHEN date(input_timestamp) = date('now') THEN 1 END) as today_logs,
        SUM(COALESCE(total_minutes, 0)) as total_minutes,
        CASE 
          WHEN COUNT(*) = 0 THEN 0
          WHEN MIN(date(input_timestamp)) = MAX(date(input_timestamp)) THEN COUNT(*)
          ELSE CAST(COUNT(*) AS REAL) / (julianday(MAX(date(input_timestamp))) - julianday(MIN(date(input_timestamp))) + 1)
        END as avg_logs_per_day
      FROM activity_logs 
      WHERE user_id = ? AND is_deleted = 0
    `;
    
    const result = await this.getQuery<UserStatsAggregateRow>(sql, [userId]);
    
    return {
      totalLogs: result?.total_logs || 0,
      thisMonthLogs: result?.this_month_logs || 0,
      thisWeekLogs: result?.this_week_logs || 0,
      todayLogs: result?.today_logs || 0,
      avgLogsPerDay: result?.avg_logs_per_day || 0,
      totalMinutesLogged: result?.total_minutes || 0
    };
  }

  /**
   * ユーザー統計を取得（最適化版）
   * 8つの並行クエリから3つのシーケンシャルクエリに最適化
   * SQLite同時実行によるデッドロック・タイムアウト問題を解決
   */
  async getUserStats(userId: string): Promise<UserStats> {
    try {
      // Step 1: 基本統計を単一クエリで取得（6つのクエリを1つに統合）
      const basicStats = await this.getBasicUserStats(userId);
      
      // Step 2: 残りの複雑な統計を順次実行（タイムアウト保護付き）
      const [mostActiveHourResult, longestActiveDayResult] = await Promise.allSettled([
        this.withQueryTimeout(this.getMostActiveHour(userId), 5000, null),
        this.withQueryTimeout(this.getLongestActiveDay(userId), 5000, null)
      ]);
      
      return {
        userId,
        totalLogs: basicStats.totalLogs,
        thisMonthLogs: basicStats.thisMonthLogs,
        thisWeekLogs: basicStats.thisWeekLogs,
        todayLogs: basicStats.todayLogs,
        avgLogsPerDay: basicStats.avgLogsPerDay,
        totalMinutesLogged: basicStats.totalMinutesLogged,
        mostActiveHour: mostActiveHourResult.status === 'fulfilled' ? mostActiveHourResult.value : null,
        longestActiveDay: longestActiveDayResult.status === 'fulfilled' ? longestActiveDayResult.value : null
      };
    } catch (error) {
      console.error('❌ ユーザー統計取得エラー:', error);
      throw new ActivityLogError('ユーザー統計の取得に失敗しました', 'USER_STATS_ERROR', { userId, error });
    }
  }

  /**
   * クエリタイムアウト保護付きラッパー
   * SQLiteクエリのハング・デッドロック対策
   */
  private async withQueryTimeout<T>(
    promise: Promise<T>, 
    timeoutMs: number, 
    defaultValue: T
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error('Query timeout')), timeoutMs)
      )
    ]).catch((error) => {
      console.warn(`⚠️ クエリタイムアウト (${timeoutMs}ms):`, error.message);
      return defaultValue;
    });
  }

  /**
   * 最終利用日時を更新
   */
  async updateLastSeen(userId: string): Promise<void> {
    try {
      const now = new Date().toISOString();
      await this.runQuery(
        'UPDATE user_settings SET last_seen = ?, updated_at = ? WHERE user_id = ?',
        [now, now, userId]
      );
    } catch (error) {
      console.error('❌ 最終利用日時更新エラー:', error);
      // このエラーは致命的でないため、例外を投げない
    }
  }

  /**
   * user_settingsテーブルにマルチユーザー対応カラムを追加
   */
  private async ensureUserSettingsTable(): Promise<void> {
    try {
      // 拡張されたuser_settingsテーブルを作成/更新
      await this.runQuery(`
        CREATE TABLE IF NOT EXISTS user_settings (
          user_id TEXT PRIMARY KEY,
          username TEXT,
          timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
          first_seen TEXT,
          last_seen TEXT,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        )
      `);
      
      // 既存テーブルにカラムが存在しない場合は追加
      const alterCommands = [
        "ALTER TABLE user_settings ADD COLUMN username TEXT",
        "ALTER TABLE user_settings ADD COLUMN first_seen TEXT",
        "ALTER TABLE user_settings ADD COLUMN last_seen TEXT", 
        "ALTER TABLE user_settings ADD COLUMN is_active BOOLEAN DEFAULT TRUE"
      ];
      
      for (const command of alterCommands) {
        try {
          await this.runQuery(command);
        } catch (error) {
          // カラムが既に存在する場合はエラーを無視
          if (!String(error).includes('duplicate column name')) {
            console.warn('user_settingsテーブル更新警告:', error);
          }
        }
      }
      
      console.log('✅ user_settingsテーブルのマルチユーザー対応完了');
    } catch (error) {
      console.error('❌ user_settingsテーブル更新エラー:', error);
      throw error;
    }
  }

  // ユーザー統計のヘルパーメソッド

  private async getTotalLogsCount(userId: string): Promise<number> {
    const result = await this.allQuery<CountRow>(
      'SELECT COUNT(*) as count FROM activity_logs WHERE user_id = ? AND is_deleted = 0',
      [userId]
    );
    return result[0]?.count || 0;
  }

  private async getLogsCountByPeriod(userId: string, period: 'month' | 'week' | 'today'): Promise<number> {
    let dateCondition = '';
    const now = new Date();
    const defaultTimezone = this.getDefaultTimezone();
    
    switch (period) {
      case 'today':
        const today = format(now, 'yyyy-MM-dd', { timeZone: defaultTimezone });
        dateCondition = `AND business_date = '${today}'`;
        break;
      case 'week':
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const weekAgoStr = format(weekAgo, 'yyyy-MM-dd', { timeZone: defaultTimezone });
        dateCondition = `AND business_date >= '${weekAgoStr}'`;
        break;
      case 'month':
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const monthAgoStr = format(monthAgo, 'yyyy-MM-dd', { timeZone: defaultTimezone });
        dateCondition = `AND business_date >= '${monthAgoStr}'`;
        break;
    }

    const result = await this.allQuery<CountRow>(
      `SELECT COUNT(*) as count FROM activity_logs WHERE user_id = ? AND is_deleted = 0 ${dateCondition}`,
      [userId]
    );
    return result[0]?.count || 0;
  }

  private async getAverageLogsPerDay(userId: string): Promise<number> {
    const result = await this.allQuery<DailyStatsRow>(`
      SELECT 
        COUNT(DISTINCT business_date) as days,
        COUNT(*) as logs
      FROM activity_logs 
      WHERE user_id = ? AND is_deleted = 0
    `, [userId]);
    
    const row = result[0];
    if (!row || row.days === 0) return 0;
    return row.logs / row.days;
  }

  private async getMostActiveHour(userId: string): Promise<number | null> {
    const result = await this.allQuery<HourlyStatsRow>(`
      SELECT 
        CAST(strftime('%H', input_timestamp) AS INTEGER) as hour,
        COUNT(*) as total
      FROM activity_logs 
      WHERE user_id = ? AND is_deleted = 0
      GROUP BY hour
      ORDER BY total DESC
      LIMIT 1
    `, [userId]);
    
    return result[0]?.hour || null;
  }

  private async getTotalMinutesLogged(userId: string): Promise<number> {
    const result = await this.allQuery<HourlyStatsRow>(`
      SELECT COALESCE(SUM(total_minutes), 0) as total
      FROM activity_logs 
      WHERE user_id = ? AND is_deleted = 0 AND total_minutes IS NOT NULL
    `, [userId]);
    
    return result[0]?.total || 0;
  }

  private async getLongestActiveDay(userId: string): Promise<{ date: string; logCount: number } | null> {
    const result = await this.allQuery<DateLogStatsRow>(`
      SELECT 
        business_date as date,
        COUNT(*) as logCount
      FROM activity_logs 
      WHERE user_id = ? AND is_deleted = 0
      GROUP BY business_date
      ORDER BY logCount DESC
      LIMIT 1
    `, [userId]);
    
    return result[0] ? {
      date: result[0].date,
      logCount: result[0].logCount
    } : null;
  }

  /**
   * データベース接続を取得（他のリポジトリで使用）
   */
  getDatabase(): Database {
    if (!this.connected || !this.db) {
      throw new ActivityLogError('データベースが接続されていません', 'DB_NOT_CONNECTED');
    }
    return this.db;
  }

  /**
   * 基本スキーマから基本テーブルを作成（マイグレーション前の前提条件）
   */
  private async createBasicTablesFromSchema(): Promise<void> {
    try {
      console.log('📋 基本テーブルの作成を開始...');
      
      // 基本テーブル作成SQL（マイグレーション実行の前提となるテーブル）
      const basicTables = [
        // activity_logs テーブル
        `CREATE TABLE IF NOT EXISTS activity_logs (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          content TEXT NOT NULL,
          input_timestamp TEXT NOT NULL,
          business_date TEXT NOT NULL,
          is_deleted BOOLEAN DEFAULT FALSE,
          created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
          start_time TEXT,
          end_time TEXT,
          total_minutes INTEGER,
          confidence REAL,
          analysis_method TEXT,
          categories TEXT,
          analysis_warnings TEXT,
          log_type TEXT DEFAULT 'complete' CHECK (log_type IN ('complete', 'start_only', 'end_only')),
          match_status TEXT DEFAULT 'unmatched' CHECK (match_status IN ('unmatched', 'matched', 'ignored')),
          matched_log_id TEXT,
          activity_key TEXT,
          similarity_score REAL
        )`,
        
        // daily_analysis_cache テーブル
        `CREATE TABLE IF NOT EXISTS daily_analysis_cache (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          business_date TEXT NOT NULL,
          analysis_result TEXT NOT NULL,
          log_count INTEGER NOT NULL,
          generated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
          UNIQUE(user_id, business_date)
        )`,
        
        // user_settings テーブル（基本カラムのみ、追加カラムはマイグレーションで）
        `CREATE TABLE IF NOT EXISTS user_settings (
          user_id TEXT PRIMARY KEY,
          timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
          username TEXT,
          first_seen TEXT,
          last_seen TEXT,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        )`,
        
        // api_costs テーブル（マイグレーション001の前提条件）
        `CREATE TABLE IF NOT EXISTS api_costs (
          id TEXT PRIMARY KEY,
          timestamp TEXT NOT NULL,
          service TEXT NOT NULL,
          operation TEXT NOT NULL,
          cost_usd REAL NOT NULL,
          tokens_input INTEGER,
          tokens_output INTEGER,
          user_id TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        )`
      ];
      
      // 各テーブルを作成
      for (const sql of basicTables) {
        await this.runQuery(sql);
        console.log(`✅ 基本テーブル作成完了`);
      }
      
      console.log('✅ 全ての基本テーブル作成完了');
      
    } catch (error) {
      console.error('❌ 基本テーブル作成失敗:', error);
      throw error;
    }
  }

  // ================================================================
  // IActivityPromptRepository の実装
  // ================================================================

  /**
   * 活動促し通知設定を作成
   */
  async createSettings(request: CreateActivityPromptSettingsRequest): Promise<ActivityPromptSettings> {
    const now = new Date().toISOString();
    
    // 既存ユーザーかチェック
    const existingUser = await this.getQuery<UserRegistrationRow>(
      'SELECT * FROM user_settings WHERE user_id = ?',
      [request.userId]
    );
    
    if (existingUser) {
      // 既存ユーザーの場合は活動促し設定のみ更新
      const sql = `
        UPDATE user_settings 
        SET prompt_enabled = ?, 
            prompt_start_hour = ?, 
            prompt_start_minute = ?, 
            prompt_end_hour = ?, 
            prompt_end_minute = ?,
            timezone = ?,
            updated_at = ?
        WHERE user_id = ?
      `;
      await this.runQuery(sql, [
        request.isEnabled ? 1 : 0,
        request.startHour || 8,
        request.startMinute || 30,
        request.endHour || 18,
        request.endMinute || 0,
        'Asia/Tokyo',
        now,
        request.userId
      ]);
    } else {
      // 新規ユーザーの場合はfirst_seen, last_seenも設定
      const sql = `
        INSERT INTO user_settings (
          user_id, 
          prompt_enabled, 
          prompt_start_hour, 
          prompt_start_minute, 
          prompt_end_hour, 
          prompt_end_minute,
          timezone,
          first_seen,
          last_seen,
          is_active,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await this.runQuery(sql, [
        request.userId,
        request.isEnabled ? 1 : 0,
        request.startHour || 8,
        request.startMinute || 30,
        request.endHour || 18,
        request.endMinute || 0,
        'Asia/Tokyo',
        now,
        now,
        true,
        now,
        now
      ]);
    }

    const settings = await this.getSettings(request.userId);
    if (!settings) {
      throw new Error('Failed to create activity prompt settings');
    }
    return settings;
  }

  /**
   * 活動促し通知設定を取得
   */
  async getSettings(userId: string): Promise<ActivityPromptSettings | null> {
    const sql = `
      SELECT 
        user_id,
        COALESCE(prompt_enabled, 0) as prompt_enabled,
        COALESCE(prompt_start_hour, 8) as prompt_start_hour,
        COALESCE(prompt_start_minute, 30) as prompt_start_minute,
        COALESCE(prompt_end_hour, 18) as prompt_end_hour,
        COALESCE(prompt_end_minute, 0) as prompt_end_minute,
        created_at,
        updated_at
      FROM user_settings 
      WHERE user_id = ?
    `;
    
    const result = await this.allQuery<ActivityPromptSettingRow>(sql, [userId]);
    if (result.length === 0) {
      return null;
    }

    const row = result[0];
    // デバッグログ
    console.log('🔍 getSettings result:', { userId, result, row });
    return {
      userId: row.user_id,
      isEnabled: Boolean(row.prompt_enabled),
      startHour: row.prompt_start_hour,
      startMinute: row.prompt_start_minute,
      endHour: row.prompt_end_hour,
      endMinute: row.prompt_end_minute,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * 活動促し通知設定を更新
   */
  async updateSettings(userId: string, update: UpdateActivityPromptSettingsRequest): Promise<void> {
    const setParts: string[] = [];
    const values: QueryParams = [];

    if (update.isEnabled !== undefined) {
      setParts.push('prompt_enabled = ?');
      values.push(update.isEnabled ? 1 : 0);
    }
    if (update.startHour !== undefined) {
      setParts.push('prompt_start_hour = ?');
      values.push(update.startHour);
    }
    if (update.startMinute !== undefined) {
      setParts.push('prompt_start_minute = ?');
      values.push(update.startMinute);
    }
    if (update.endHour !== undefined) {
      setParts.push('prompt_end_hour = ?');
      values.push(update.endHour);
    }
    if (update.endMinute !== undefined) {
      setParts.push('prompt_end_minute = ?');
      values.push(update.endMinute);
    }

    if (setParts.length === 0) {
      return; // 更新する項目がない
    }

    const sql = `UPDATE user_settings SET ${setParts.join(', ')} WHERE user_id = ?`;
    values.push(userId);

    await this.runQuery(sql, values);
  }

  /**
   * 活動促し通知設定を削除
   */
  async deleteSettings(userId: string): Promise<void> {
    const sql = `
      UPDATE user_settings 
      SET prompt_enabled = 0 
      WHERE user_id = ?
    `;
    await this.runQuery(sql, [userId]);
  }

  /**
   * 有効な活動促し通知設定を取得
   */
  async getEnabledSettings(): Promise<ActivityPromptSettings[]> {
    const sql = `
      SELECT 
        user_id,
        prompt_enabled,
        prompt_start_hour,
        prompt_start_minute,
        prompt_end_hour,
        prompt_end_minute,
        created_at,
        updated_at
      FROM user_settings 
      WHERE prompt_enabled = 1
    `;
    
    const results = await this.allQuery<UserSettingRow>(sql);
    return results.map((row: UserSettingRow) => ({
      userId: row.user_id,
      isEnabled: Boolean(row.prompt_enabled),
      startHour: row.prompt_start_hour,
      startMinute: row.prompt_start_minute,
      endHour: row.prompt_end_hour,
      endMinute: row.prompt_end_minute,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  /**
   * 指定時刻に通知すべきユーザーを取得
   */
  async getUsersToPromptAt(hour: number, minute: number): Promise<string[]> {
    const sql = `
      SELECT user_id 
      FROM user_settings 
      WHERE prompt_enabled = 1 
        AND prompt_start_hour <= ? 
        AND prompt_end_hour >= ?
        AND (
          (prompt_start_minute <= ? AND prompt_end_minute >= ?) OR
          (prompt_start_minute = ? OR prompt_end_minute = ?)
        )
    `;
    
    const results = await this.allQuery<UserSettingRow>(sql, [hour, hour, minute, minute, minute, minute]);
    return results.map((row: UserSettingRow) => row.user_id);
  }

  /**
   * 活動促し通知を有効化
   */
  async enablePrompt(userId: string): Promise<void> {
    const sql = `
      INSERT OR REPLACE INTO user_settings (
        user_id, 
        prompt_enabled, 
        prompt_start_hour, 
        prompt_start_minute, 
        prompt_end_hour, 
        prompt_end_minute,
        timezone
      ) VALUES (
        ?, 1, 
        COALESCE((SELECT prompt_start_hour FROM user_settings WHERE user_id = ?), 8),
        COALESCE((SELECT prompt_start_minute FROM user_settings WHERE user_id = ?), 30),
        COALESCE((SELECT prompt_end_hour FROM user_settings WHERE user_id = ?), 18),
        COALESCE((SELECT prompt_end_minute FROM user_settings WHERE user_id = ?), 0),
        COALESCE((SELECT timezone FROM user_settings WHERE user_id = ?), 'Asia/Tokyo')
      )
    `;
    await this.runQuery(sql, [userId, userId, userId, userId, userId, userId]);
  }

  /**
   * 活動促し通知を無効化
   */
  async disablePrompt(userId: string): Promise<void> {
    const sql = `UPDATE user_settings SET prompt_enabled = 0 WHERE user_id = ?`;
    await this.runQuery(sql, [userId]);
  }

  /**
   * 活動促し通知設定の存在確認
   */
  async settingsExists(userId: string): Promise<boolean> {
    const sql = `SELECT COUNT(*) as count FROM user_settings WHERE user_id = ?`;
    const result = await this.allQuery<CountRow>(sql, [userId]);
    return (result[0]?.count || 0) > 0;
  }

  // ================================================================
}
