/**
 * IActivityLogRepository専用実装
 * 活動ログの中核機能のみを責務とする
 * 
 * 分離対象:
 * - 活動ログCRUD操作
 * - 分析キャッシュ管理
 * - 業務日時処理
 * - タイムゾーン管理（ログ関連のみ）
 */

import { DatabaseConnection } from '../base/DatabaseConnection';
import { IActivityLogRepository } from '../activityLogRepository';
import {
  ActivityLog,
  CreateActivityLogRequest,
  AnalysisCache,
  CreateAnalysisCacheRequest,
  BusinessDateInfo,
  DailyAnalysisResult
} from '../../types/activityLog';
import { TimezoneChange, TimezoneNotification, UserTimezone } from '../interfaces';
import { AppError, ErrorType } from '../../utils/errorHandler';

/**
 * 活動ログ専用SQLiteリポジトリ
 * 単一責務: 活動ログの管理とタイムゾーン処理
 */
export class SqliteActivityLogRepository implements IActivityLogRepository {
  private db: DatabaseConnection;

  constructor(databasePath: string) {
    this.db = DatabaseConnection.getInstance(databasePath);
  }

  /**
   * データベース初期化
   */
  async ensureSchema(): Promise<void> {
    // 活動ログテーブルは既にメインスキーマで作成済み
    // 必要に応じて活動ログ専用のインデックス作成などを行う
    await this.db.initializeDatabase();
  }

  // =============================================================================
  // 活動ログ管理
  // =============================================================================

  /**
   * 新しい活動ログを保存
   */
  async saveLog(request: CreateActivityLogRequest): Promise<ActivityLog> {
    return new Promise((resolve, reject) => {
      const db = this.db.getDatabase();
      
      const sql = `
        INSERT INTO activity_logs (
          user_id, content, business_date, input_timestamp, updated_at,
          start_time, end_time, total_minutes, confidence, analysis_method, 
          categories, analysis_warnings, log_type, match_status, 
          matched_log_id, activity_key, similarity_score,
          is_reminder_reply, time_range_start, time_range_end, context_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const values = [
        request.userId,
        request.content,
        request.businessDate,
        request.inputTimestamp || new Date().toISOString(),
        new Date().toISOString(),
        request.startTime || null,
        request.endTime || null,
        request.totalMinutes || null,
        request.confidence || null,
        request.analysisMethod || null,
        request.categories || null,
        request.analysisWarnings || null,
        request.logType || null,
        request.matchStatus || null,
        request.matchedLogId || null,
        request.activityKey || null,
        request.similarityScore || null,
        request.isReminderReply || false,
        request.timeRangeStart || null,
        request.timeRangeEnd || null,
        request.contextType || 'NORMAL'
      ];

      db.run(sql, values, function(err: any) {
        if (err) {
          reject(new AppError(`活動ログ保存エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        // 作成されたログを取得して返す
        const selectSql = 'SELECT * FROM activity_logs WHERE id = ?';
        db.get(selectSql, [(this as any).lastID], (selectErr: any, row: any) => {
          if (selectErr) {
            reject(new AppError(`保存後ログ取得エラー: ${selectErr.message}`, ErrorType.DATABASE, { error: selectErr }));
            return;
          }

          resolve((this as any).mapRowToActivityLog(row));
        });
      });
    });
  }

  /**
   * 指定ユーザーの指定業務日のログを取得
   */
  async getLogsByDate(userId: string, businessDate: string, includeDeleted = false): Promise<ActivityLog[]> {
    return new Promise((resolve, reject) => {
      const db = this.db.getDatabase();
      
      let sql = `
        SELECT * FROM activity_logs 
        WHERE user_id = ? AND business_date = ?
      `;
      
      if (!includeDeleted) {
        sql += ' AND deleted_at IS NULL';
      }
      
      sql += ' ORDER BY input_timestamp ASC';

      db.all(sql, [userId, businessDate], (err, rows: any[]) => {
        if (err) {
          reject(new AppError(`日別ログ取得エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        resolve(rows.map(row => (this as any).mapRowToActivityLog(row)));
      });
    });
  }

  /**
   * 指定ユーザーの指定期間のログを取得
   */
  async getLogsByDateRange(userId: string, startDate: string, endDate: string, includeDeleted = false): Promise<ActivityLog[]> {
    return new Promise((resolve, reject) => {
      const db = this.db.getDatabase();
      
      let sql = `
        SELECT * FROM activity_logs 
        WHERE user_id = ? AND business_date >= ? AND business_date <= ?
      `;
      
      if (!includeDeleted) {
        sql += ' AND deleted_at IS NULL';
      }
      
      sql += ' ORDER BY business_date ASC, input_timestamp ASC';

      db.all(sql, [userId, startDate, endDate], (err, rows: any[]) => {
        if (err) {
          reject(new AppError(`期間別ログ取得エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        resolve(rows.map(row => (this as any).mapRowToActivityLog(row)));
      });
    });
  }

  /**
   * ログIDで特定のログを取得
   */
  async getLogById(id: string): Promise<ActivityLog | null> {
    return new Promise((resolve, reject) => {
      const db = this.db.getDatabase();
      
      const sql = 'SELECT * FROM activity_logs WHERE id = ? AND deleted_at IS NULL';
      
      db.get(sql, [id], (err, row: any) => {
        if (err) {
          reject(new AppError(`ログ取得エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        resolve(row ? (this as any).mapRowToActivityLog(row) : null);
      });
    });
  }

  /**
   * 指定ログを更新（インターフェース準拠）
   */
  async updateLog(logId: string, newContent: string): Promise<ActivityLog> {
    return new Promise((resolve, reject) => {
      const db = this.db.getDatabase();
      
      const sql = `UPDATE activity_logs SET content = ?, updated_at = ? WHERE id = ?`;
      const now = new Date().toISOString();

      db.run(sql, [newContent, now, logId], function(err) {
        if (err) {
          reject(new AppError(`ログ更新エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        // 更新されたログを取得して返す
        const selectSql = 'SELECT * FROM activity_logs WHERE id = ?';
        db.get(selectSql, [logId], (selectErr, row: any) => {
          if (selectErr) {
            reject(new AppError(`更新後ログ取得エラー: ${selectErr.message}`, ErrorType.DATABASE, { error: selectErr }));
            return;
          }

          if (!row) {
            reject(new AppError(`更新対象ログが見つかりません: ${logId}`, ErrorType.DATABASE, { logId }));
            return;
          }

          resolve((this as any).mapRowToActivityLog(row));
        });
      });
    });
  }

  /**
   * ログ更新（内部用、部分更新対応）
   */
  async updateLogFields(id: string, updates: Partial<CreateActivityLogRequest>): Promise<void> {
    return new Promise((resolve, reject) => {
      const db = this.db.getDatabase();
      
      const setClause: string[] = [];
      const values: any[] = [];

      // 更新可能なフィールドのみを処理
      if (updates.content !== undefined) {
        setClause.push('content = ?');
        values.push(updates.content);
      }
      if (updates.startTime !== undefined) {
        setClause.push('start_time = ?');
        values.push(updates.startTime);
      }
      if (updates.endTime !== undefined) {
        setClause.push('end_time = ?');
        values.push(updates.endTime);
      }
      if (updates.totalMinutes !== undefined) {
        setClause.push('total_minutes = ?');
        values.push(updates.totalMinutes);
      }
      if (updates.confidence !== undefined) {
        setClause.push('confidence = ?');
        values.push(updates.confidence);
      }
      if (updates.analysisMethod !== undefined) {
        setClause.push('analysis_method = ?');
        values.push(updates.analysisMethod);
      }
      if (updates.categories !== undefined) {
        setClause.push('categories = ?');
        values.push(updates.categories);
      }
      if (updates.analysisWarnings !== undefined) {
        setClause.push('analysis_warnings = ?');
        values.push(updates.analysisWarnings);
      }

      setClause.push('updated_at = ?');
      values.push(new Date().toISOString());
      values.push(id);

      const sql = `UPDATE activity_logs SET ${setClause.join(', ')} WHERE id = ?`;

      db.run(sql, values, function(err: any) {
        if (err) {
          reject(new AppError(`ログ更新エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        resolve();
      });
    });
  }

  /**
   * 指定ログを論理削除（インターフェース準拠）
   */
  async deleteLog(logId: string): Promise<ActivityLog> {
    return new Promise((resolve, reject) => {
      const db = this.db.getDatabase();
      
      // まず削除前のログを取得
      const selectSql = 'SELECT * FROM activity_logs WHERE id = ? AND deleted_at IS NULL';
      db.get(selectSql, [logId], (selectErr, row: any) => {
        if (selectErr) {
          reject(new AppError(`削除前ログ取得エラー: ${selectErr.message}`, ErrorType.DATABASE, { error: selectErr }));
          return;
        }

        if (!row) {
          reject(new AppError(`削除対象ログが見つかりません: ${logId}`, ErrorType.DATABASE, { logId }));
          return;
        }

        const now = new Date().toISOString();
        const sql = 'UPDATE activity_logs SET deleted_at = ?, updated_at = ? WHERE id = ?';

        db.run(sql, [now, now, logId], function(err) {
          if (err) {
            reject(new AppError(`ログ削除エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
            return;
          }

          // 削除されたログを返す（isDeletedフラグを更新）
          const deletedLog = (this as any).mapRowToActivityLog(row);
          deletedLog.isDeleted = true;
          deletedLog.updatedAt = now;
          resolve(deletedLog);
        });
      });
    });
  }

  // =============================================================================
  // 分析キャッシュ管理
  // =============================================================================

  /**
   * 分析キャッシュを保存
   */
  async saveAnalysisCache(request: CreateAnalysisCacheRequest): Promise<AnalysisCache> {
    return new Promise((resolve, reject) => {
      const db = this.db.getDatabase();
      
      const sql = `
        INSERT OR REPLACE INTO analysis_cache (
          user_id, business_date, analysis_result, log_count, generated_at
        ) VALUES (?, ?, ?, ?, ?)
      `;

      const now = new Date().toISOString();
      const values = [
        request.userId,
        request.businessDate,
        JSON.stringify(request.analysisResult),
        request.logCount,
        now
      ];

      db.run(sql, values, function(err: any) {
        if (err) {
          reject(new AppError(`分析キャッシュ保存エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        const analysisCache: AnalysisCache = {
          id: this.lastID.toString(),
          userId: request.userId,
          businessDate: request.businessDate,
          analysisResult: request.analysisResult,
          logCount: request.logCount,
          generatedAt: now
        };

        resolve(analysisCache);
      });
    });
  }

  /**
   * 分析キャッシュを取得
   */
  async getAnalysisCache(userId: string, businessDate: string): Promise<AnalysisCache | null> {
    return new Promise((resolve, reject) => {
      const db = this.db.getDatabase();
      
      const sql = `
        SELECT * FROM analysis_cache 
        WHERE user_id = ? AND business_date = ?
      `;

      db.get(sql, [userId, businessDate], (err, row: any) => {
        if (err) {
          reject(new AppError(`分析キャッシュ取得エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        if (!row) {
          resolve(null);
          return;
        }

        const cache: AnalysisCache = {
          id: row.id.toString(),
          userId: row.user_id,
          businessDate: row.business_date,
          analysisResult: JSON.parse(row.analysis_result),
          logCount: row.log_count,
          generatedAt: row.generated_at
        };

        resolve(cache);
      });
    });
  }

  /**
   * 古い分析キャッシュを削除
   */
  async clearExpiredCache(): Promise<void> {
    return new Promise((resolve, reject) => {
      const db = this.db.getDatabase();
      
      // 7日以上前のキャッシュを削除
      const sql = `DELETE FROM analysis_cache WHERE generated_at <= datetime('now', '-7 days')`;

      db.run(sql, [], function(err) {
        if (err) {
          reject(new AppError(`期限切れキャッシュ削除エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        resolve();
      });
    });
  }

  // =============================================================================
  // 不足しているIActivityLogRepositoryメソッド
  // =============================================================================

  /**
   * 指定ログを物理削除（管理者用）
   */
  async permanentDeleteLog(logId: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const db = this.db.getDatabase();
      
      const sql = 'DELETE FROM activity_logs WHERE id = ?';

      db.run(sql, [logId], function(err) {
        if (err) {
          reject(new AppError(`ログ物理削除エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        resolve((this as any).changes > 0);
      });
    });
  }

  /**
   * 削除済みログを復元
   */
  async restoreLog(logId: string): Promise<ActivityLog> {
    return new Promise((resolve, reject) => {
      const db = this.db.getDatabase();
      
      // まず削除済みログを取得
      const selectSql = 'SELECT * FROM activity_logs WHERE id = ? AND deleted_at IS NOT NULL';
      db.get(selectSql, [logId], (selectErr: any, row: any) => {
        if (selectErr) {
          reject(new AppError(`復元前ログ取得エラー: ${selectErr.message}`, ErrorType.DATABASE, { error: selectErr }));
          return;
        }

        if (!row) {
          reject(new AppError(`復元対象ログが見つかりません: ${logId}`, ErrorType.DATABASE, { logId }));
          return;
        }

        const now = new Date().toISOString();
        const sql = 'UPDATE activity_logs SET deleted_at = NULL, updated_at = ? WHERE id = ?';

        db.run(sql, [now, logId], function(err: any) {
          if (err) {
            reject(new AppError(`ログ復元エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
            return;
          }

          // 復元されたログを返す
          const restoredLog = (this as any).mapRowToActivityLog(row);
          restoredLog.isDeleted = false;
          restoredLog.updatedAt = now;
          resolve(restoredLog);
        });
      });
    });
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
    return this.saveAnalysisCache(request);
  }

  /**
   * 分析結果キャッシュを削除（キャッシュ無効化）
   */
  async deleteAnalysisCache(userId: string, businessDate: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const db = this.db.getDatabase();
      
      const sql = 'DELETE FROM analysis_cache WHERE user_id = ? AND business_date = ?';

      db.run(sql, [userId, businessDate], function(err: any) {
        if (err) {
          reject(new AppError(`分析キャッシュ削除エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        resolve((this as any).changes > 0);
      });
    });
  }

  /**
   * キャッシュの有効性を確認
   */
  async isCacheValid(userId: string, businessDate: string, currentLogCount: number): Promise<boolean> {
    const cache = await this.getAnalysisCache(userId, businessDate);
    return cache !== null && cache.logCount === currentLogCount;
  }

  /**
   * 指定ユーザーの総ログ数を取得
   */
  async getLogCount(userId: string, includeDeleted = false): Promise<number> {
    return new Promise((resolve, reject) => {
      const db = this.db.getDatabase();
      
      let sql = 'SELECT COUNT(*) as count FROM activity_logs WHERE user_id = ?';
      if (!includeDeleted) {
        sql += ' AND deleted_at IS NULL';
      }

      db.get(sql, [userId], (err: any, row: any) => {
        if (err) {
          reject(new AppError(`ログ数取得エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        resolve(row.count || 0);
      });
    });
  }

  /**
   * 指定業務日のログ数を取得
   */
  async getLogCountByDate(userId: string, businessDate: string, includeDeleted = false): Promise<number> {
    return new Promise((resolve, reject) => {
      const db = this.db.getDatabase();
      
      let sql = 'SELECT COUNT(*) as count FROM activity_logs WHERE user_id = ? AND business_date = ?';
      if (!includeDeleted) {
        sql += ' AND deleted_at IS NULL';
      }

      db.get(sql, [userId, businessDate], (err: any, row: any) => {
        if (err) {
          reject(new AppError(`日別ログ数取得エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        resolve(row.count || 0);
      });
    });
  }

  // =============================================================================
  // 業務日時処理
  // =============================================================================

  /**
   * ユーザーの業務日時情報を取得
   */
  async getBusinessDateInfo(userId: string, timezone: string): Promise<BusinessDateInfo> {
    return new Promise((resolve, reject) => {
      try {
        // タイムゾーンに基づいた現在の業務日を計算
        const now = new Date();
        const formatter = new Intl.DateTimeFormat('ja-JP', {
          timeZone: timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
        
        const parts = formatter.formatToParts(now);
        const year = parts.find(p => p.type === 'year')?.value;
        const month = parts.find(p => p.type === 'month')?.value;
        const day = parts.find(p => p.type === 'day')?.value;
        const currentBusinessDate = `${year}-${month}-${day}`;

        // 業務日の開始時刻（5am）と終了時刻（翌日4:59am）を計算
        const startTime = new Date(currentBusinessDate + 'T05:00:00.000Z').toISOString();
        const endDate = new Date(currentBusinessDate);
        endDate.setDate(endDate.getDate() + 1);
        const endTime = new Date(endDate.toISOString().substring(0, 10) + 'T04:59:59.999Z').toISOString();

        const businessDateInfo: BusinessDateInfo = {
          businessDate: currentBusinessDate,
          startTime,
          endTime,
          timezone
        };

        resolve(businessDateInfo);
      } catch (error) {
        reject(new AppError(`業務日時情報取得エラー: ${error}`, ErrorType.DATABASE, { error, userId, timezone }));
      }
    });
  }

  // =============================================================================
  // タイムゾーン管理（活動ログ関連のみ）
  // =============================================================================

  /**
   * ユーザーのタイムゾーンを取得
   */
  async getUserTimezone(userId: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const db = this.db.getDatabase();
      
      const sql = 'SELECT timezone FROM users WHERE user_id = ?';
      
      db.get(sql, [userId], (err, row: any) => {
        if (err) {
          reject(new AppError(`タイムゾーン取得エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        resolve(row ? row.timezone : null);
      });
    });
  }

  /**
   * ユーザーのタイムゾーンを保存
   */
  async saveUserTimezone(userId: string, timezone: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const db = this.db.getDatabase();
      
      const sql = `
        INSERT OR REPLACE INTO users (user_id, timezone, updated_at)
        VALUES (?, ?, ?)
      `;

      db.run(sql, [userId, timezone, new Date().toISOString()], function(err) {
        if (err) {
          reject(new AppError(`タイムゾーン保存エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        resolve();
      });
    });
  }

  /**
   * スケジューラー用の全ユーザータイムゾーンを取得
   */
  async getAllUserTimezonesForScheduler(): Promise<UserTimezone[]> {
    return new Promise((resolve, reject) => {
      const db = this.db.getDatabase();
      
      const sql = 'SELECT user_id, timezone FROM users WHERE timezone IS NOT NULL';
      
      db.all(sql, [], (err, rows: any[]) => {
        if (err) {
          reject(new AppError(`スケジューラー用タイムゾーン取得エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        const timezones: UserTimezone[] = rows.map(row => ({
          userId: row.user_id,
          timezone: row.timezone
        }));

        resolve(timezones);
      });
    });
  }

  /**
   * タイムゾーン変更履歴を取得
   */
  async getUserTimezoneChanges(since?: Date): Promise<TimezoneChange[]> {
    return new Promise((resolve, reject) => {
      const db = this.db.getDatabase();
      
      let sql = 'SELECT * FROM timezone_changes';
      const params: any[] = [];
      
      if (since) {
        sql += ' WHERE updated_at > ?';
        params.push(since.toISOString());
      }
      
      sql += ' ORDER BY updated_at DESC';

      db.all(sql, params, (err, rows: any[]) => {
        if (err) {
          reject(new AppError(`タイムゾーン変更履歴取得エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        const changes: TimezoneChange[] = rows.map(row => ({
          user_id: row.user_id,
          old_timezone: row.old_timezone,
          new_timezone: row.new_timezone,
          updated_at: row.updated_at
        }));

        resolve(changes);
      });
    });
  }

  /**
   * 未処理のタイムゾーン変更通知を取得
   */
  async getUnprocessedNotifications(): Promise<TimezoneNotification[]> {
    return new Promise((resolve, reject) => {
      const db = this.db.getDatabase();
      
      const sql = `
        SELECT * FROM timezone_notifications 
        WHERE processed = FALSE 
        ORDER BY changed_at ASC
      `;

      db.all(sql, [], (err, rows: any[]) => {
        if (err) {
          reject(new AppError(`未処理通知取得エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        const notifications: TimezoneNotification[] = rows.map(row => ({
          id: row.id.toString(),
          user_id: row.user_id,
          old_timezone: row.old_timezone,
          new_timezone: row.new_timezone,
          changed_at: row.changed_at,
          processed: row.processed === 1
        }));

        resolve(notifications);
      });
    });
  }

  /**
   * 通知を処理済みにマーク
   */
  async markNotificationAsProcessed(notificationId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const db = this.db.getDatabase();
      
      const sql = 'UPDATE timezone_notifications SET processed = TRUE WHERE id = ?';

      db.run(sql, [notificationId], function(err) {
        if (err) {
          reject(new AppError(`通知処理済みマークエラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        resolve();
      });
    });
  }

  // =============================================================================
  // 追加の不足メソッド
  // =============================================================================

  /**
   * 最新のログを取得
   */
  async getLatestLogs(userId: string, limit = 1): Promise<ActivityLog[]> {
    return new Promise((resolve, reject) => {
      const db = this.db.getDatabase();
      
      const sql = `
        SELECT * FROM activity_logs 
        WHERE user_id = ? AND deleted_at IS NULL
        ORDER BY input_timestamp DESC 
        LIMIT ?
      `;

      db.all(sql, [userId, limit], (err: any, rows: any[]) => {
        if (err) {
          reject(new AppError(`最新ログ取得エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        resolve(rows.map(row => (this as any).mapRowToActivityLog(row)));
      });
    });
  }

  /**
   * 古いキャッシュを削除（クリーンアップ用）
   */
  async cleanupOldCaches(olderThanDays: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const db = this.db.getDatabase();
      
      const sql = `DELETE FROM analysis_cache WHERE generated_at <= datetime('now', '-${olderThanDays} days')`;

      db.run(sql, [], function(err) {
        if (err) {
          reject(new AppError(`古いキャッシュ削除エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        resolve((this as any).changes);
      });
    });
  }

  /**
   * 業務日情報を計算
   */
  calculateBusinessDate(date: string, timezone: string): BusinessDateInfo {
    try {
      const inputDate = new Date(date);
      const formatter = new Intl.DateTimeFormat('ja-JP', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      
      const parts = formatter.formatToParts(inputDate);
      const year = parts.find(p => p.type === 'year')?.value;
      const month = parts.find(p => p.type === 'month')?.value;
      const day = parts.find(p => p.type === 'day')?.value;
      const businessDate = `${year}-${month}-${day}`;

      // 業務日の開始時刻（5am）と終了時刻（翌日4:59am）を計算
      const startTime = new Date(businessDate + 'T05:00:00.000Z').toISOString();
      const endDate = new Date(businessDate);
      endDate.setDate(endDate.getDate() + 1);
      const endTime = new Date(endDate.toISOString().substring(0, 10) + 'T04:59:59.999Z').toISOString();

      return {
        businessDate,
        startTime,
        endTime,
        timezone
      };
    } catch (error) {
      throw new AppError(`業務日計算エラー: ${error}`, ErrorType.DATABASE, { error, date, timezone });
    }
  }

  /**
   * データベース接続状態を確認
   */
  async isConnected(): Promise<boolean> {
    try {
      const db = this.db.getDatabase();
      return new Promise((resolve) => {
        db.get('SELECT 1', [], (err) => {
          resolve(!err);
        });
      });
    } catch {
      return false;
    }
  }

  /**
   * トランザクション実行
   */
  async withTransaction<T>(operation: () => Promise<T>): Promise<T> {
    const db = this.db.getDatabase();
    
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('BEGIN TRANSACTION', async (err) => {
          if (err) {
            reject(new AppError(`トランザクション開始エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
            return;
          }

          try {
            const result = await operation();
            db.run('COMMIT', (commitErr) => {
              if (commitErr) {
                reject(new AppError(`トランザクションコミットエラー: ${commitErr.message}`, ErrorType.DATABASE, { error: commitErr }));
                return;
              }
              resolve(result);
            });
          } catch (operationErr) {
            db.run('ROLLBACK', (rollbackErr) => {
              if (rollbackErr) {
                reject(new AppError(`トランザクションロールバックエラー: ${rollbackErr.message}`, ErrorType.DATABASE, { error: rollbackErr }));
                return;
              }
              reject(operationErr);
            });
          }
        });
      });
    });
  }

  /**
   * ログのマッチング情報を更新
   */
  async updateLogMatching(logId: string, matchInfo: {
    matchStatus?: string;
    matchedLogId?: string;
    similarityScore?: number;
  }): Promise<void> {
    return new Promise((resolve, reject) => {
      const db = this.db.getDatabase();
      
      const setClause: string[] = [];
      const values: any[] = [];

      if (matchInfo.matchStatus !== undefined) {
        setClause.push('match_status = ?');
        values.push(matchInfo.matchStatus);
      }
      if (matchInfo.matchedLogId !== undefined) {
        setClause.push('matched_log_id = ?');
        values.push(matchInfo.matchedLogId);
      }
      if (matchInfo.similarityScore !== undefined) {
        setClause.push('similarity_score = ?');
        values.push(matchInfo.similarityScore);
      }

      setClause.push('updated_at = ?');
      values.push(new Date().toISOString());
      values.push(logId);

      const sql = `UPDATE activity_logs SET ${setClause.join(', ')} WHERE id = ?`;

      db.run(sql, values, function(err: any) {
        if (err) {
          reject(new AppError(`ログマッチング更新エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        resolve();
      });
    });
  }

  /**
   * 未マッチのログを取得
   */
  async getUnmatchedLogs(userId: string, logType: string, businessDate?: string): Promise<ActivityLog[]> {
    return new Promise((resolve, reject) => {
      const db = this.db.getDatabase();
      
      let sql = `
        SELECT * FROM activity_logs 
        WHERE user_id = ? AND log_type = ? AND match_status = 'unmatched' AND deleted_at IS NULL
      `;
      const params = [userId, logType];

      if (businessDate) {
        sql += ' AND business_date = ?';
        params.push(businessDate);
      }

      sql += ' ORDER BY input_timestamp ASC';

      db.all(sql, params, (err: any, rows: any[]) => {
        if (err) {
          reject(new AppError(`未マッチログ取得エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        resolve(rows.map(row => (this as any).mapRowToActivityLog(row)));
      });
    });
  }

  /**
   * マッチング済みログペアを取得
   */
  async getMatchedLogPairs(userId: string, businessDate?: string): Promise<{ startLog: ActivityLog; endLog: ActivityLog }[]> {
    return new Promise((resolve, reject) => {
      const db = this.db.getDatabase();
      
      let sql = `
        SELECT 
          start_log.*,
          end_log.id as end_id, end_log.user_id as end_user_id, end_log.content as end_content,
          end_log.input_timestamp as end_input_timestamp, end_log.business_date as end_business_date,
          end_log.is_deleted as end_is_deleted, end_log.created_at as end_created_at, 
          end_log.updated_at as end_updated_at, end_log.start_time as end_start_time,
          end_log.end_time as end_end_time, end_log.total_minutes as end_total_minutes,
          end_log.confidence as end_confidence, end_log.analysis_method as end_analysis_method,
          end_log.categories as end_categories, end_log.analysis_warnings as end_analysis_warnings,
          end_log.log_type as end_log_type, end_log.match_status as end_match_status,
          end_log.matched_log_id as end_matched_log_id, end_log.activity_key as end_activity_key,
          end_log.similarity_score as end_similarity_score, end_log.is_reminder_reply as end_is_reminder_reply,
          end_log.time_range_start as end_time_range_start, end_log.time_range_end as end_time_range_end,
          end_log.context_type as end_context_type
        FROM activity_logs start_log
        JOIN activity_logs end_log ON start_log.matched_log_id = end_log.id
        WHERE start_log.user_id = ? AND start_log.log_type = 'start_only' 
          AND start_log.match_status = 'matched' AND start_log.deleted_at IS NULL
          AND end_log.deleted_at IS NULL
      `;
      const params = [userId];

      if (businessDate) {
        sql += ' AND start_log.business_date = ?';
        params.push(businessDate);
      }

      sql += ' ORDER BY start_log.input_timestamp ASC';

      db.all(sql, params, (err: any, rows: any[]) => {
        if (err) {
          reject(new AppError(`マッチングペア取得エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        const pairs = rows.map(row => {
          const startLog = (this as any).mapRowToActivityLog(row);
          const endLog = (this as any).mapRowToActivityLog({
            id: row.end_id,
            user_id: row.end_user_id,
            content: row.end_content,
            input_timestamp: row.end_input_timestamp,
            business_date: row.end_business_date,
            deleted_at: row.end_is_deleted ? new Date().toISOString() : null,
            created_at: row.end_created_at,
            updated_at: row.end_updated_at,
            start_time: row.end_start_time,
            end_time: row.end_end_time,
            total_minutes: row.end_total_minutes,
            confidence: row.end_confidence,
            analysis_method: row.end_analysis_method,
            categories: row.end_categories,
            analysis_warnings: row.end_analysis_warnings,
            log_type: row.end_log_type,
            match_status: row.end_match_status,
            matched_log_id: row.end_matched_log_id,
            activity_key: row.end_activity_key,
            similarity_score: row.end_similarity_score,
            is_reminder_reply: row.end_is_reminder_reply,
            time_range_start: row.end_time_range_start,
            time_range_end: row.end_time_range_end,
            context_type: row.end_context_type
          });

          return { startLog, endLog };
        });

        resolve(pairs);
      });
    });
  }

  /**
   * 全ユーザー情報を取得
   */
  async getAllUsers(): Promise<Array<{
    userId: string;
    username?: string;
    timezone: string;
    registrationDate: string;
    lastSeenAt: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  }>> {
    return new Promise((resolve, reject) => {
      const db = this.db.getDatabase();
      
      const sql = `
        SELECT user_id, username, timezone, registration_date, last_seen_at, 
               is_active, created_at, updated_at
        FROM users 
        ORDER BY created_at DESC
      `;

      db.all(sql, [], (err: any, rows: any[]) => {
        if (err) {
          reject(new AppError(`全ユーザー取得エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        const users = rows.map(row => ({
          userId: row.user_id,
          username: row.username || undefined,
          timezone: row.timezone || 'Asia/Tokyo',
          registrationDate: row.registration_date || row.created_at,
          lastSeenAt: row.last_seen_at || row.updated_at,
          isActive: row.is_active === 1,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }));

        resolve(users);
      });
    });
  }

  /**
   * データベースインスタンスを取得
   */
  getDatabase() {
    return this.db.getDatabase();
  }

  // =============================================================================
  // ユーティリティメソッド
  // =============================================================================

  /**
   * データベース行をActivityLogオブジェクトにマッピング
   */
  private mapRowToActivityLog(row: any): ActivityLog {
    return {
      id: row.id.toString(),
      userId: row.user_id,
      content: row.content,
      inputTimestamp: row.input_timestamp,
      businessDate: row.business_date,
      isDeleted: row.deleted_at !== null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      
      // リアルタイム分析結果
      startTime: row.start_time,
      endTime: row.end_time,
      totalMinutes: row.total_minutes,
      confidence: row.confidence,
      analysisMethod: row.analysis_method,
      categories: row.categories,
      analysisWarnings: row.analysis_warnings,

      // 開始・終了ログマッチング機能
      logType: row.log_type,
      matchStatus: row.match_status,
      matchedLogId: row.matched_log_id,
      activityKey: row.activity_key,
      similarityScore: row.similarity_score,

      // リマインダーReply機能
      isReminderReply: row.is_reminder_reply === 1,
      timeRangeStart: row.time_range_start,
      timeRangeEnd: row.time_range_end,
      contextType: row.context_type || 'NORMAL'
    };
  }
}