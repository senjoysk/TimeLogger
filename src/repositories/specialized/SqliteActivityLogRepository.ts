/**
 * IActivityLogRepository専用実装
 * 活動ログの中核機能のみを責務とする
 * 
 * 分離対象:
 * - 活動ログCRUD操作
 * - 分析キャッシュ管理
 * - 業務日時処理
 * - タイムゾーン管理（ログ関連のみ）
 * 
 * @SRP-EXCEPTION: 統合リポジトリとして複数責務を実装中
 * @SRP-REASON: IActivityLogRepository + 分析キャッシュ + タイムゾーン管理を統合
 *              次回タスクでTDD方式による責務分離リファクタリング実施予定
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
          id, user_id, content, business_date, input_timestamp, updated_at,
          start_time, end_time, total_minutes, confidence, analysis_method, 
          categories, analysis_warnings,
          is_reminder_reply, time_range_start, time_range_end, context_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const logId = 'log-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
      const values = [
        logId,
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
        request.isReminderReply || false,
        request.timeRangeStart || null,
        request.timeRangeEnd || null,
        request.contextType || 'NORMAL'
      ];

      db.run(sql, values, (err: Error | null) => {
        if (err) {
          reject(new AppError(`活動ログ保存エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        // 作成されたログを取得して返す
        const selectSql = 'SELECT * FROM activity_logs WHERE id = ?';
        db.get(selectSql, [logId], (selectErr: Error | null, row: Record<string, unknown>) => {
          if (selectErr) {
            reject(new AppError(`保存後ログ取得エラー: ${selectErr.message}`, ErrorType.DATABASE, { error: selectErr }));
            return;
          }

          resolve(this.mapRowToActivityLog(row));
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
        sql += ' AND is_deleted = FALSE';
      }
      
      sql += ' ORDER BY input_timestamp ASC';

      db.all(sql, [userId, businessDate], (err: Error | null, rows: Record<string, unknown>[]) => {
        if (err) {
          reject(new AppError(`日別ログ取得エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        resolve(rows.map(row => this.mapRowToActivityLog(row)));
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
        sql += ' AND is_deleted = FALSE';
      }
      
      sql += ' ORDER BY business_date ASC, input_timestamp ASC';

      db.all(sql, [userId, startDate, endDate], (err: Error | null, rows: Record<string, unknown>[]) => {
        if (err) {
          reject(new AppError(`期間別ログ取得エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        resolve(rows.map(row => this.mapRowToActivityLog(row)));
      });
    });
  }

  /**
   * ログIDで特定のログを取得
   */
  async getLogById(id: string): Promise<ActivityLog | null> {
    return new Promise((resolve, reject) => {
      const db = this.db.getDatabase();
      
      const sql = 'SELECT * FROM activity_logs WHERE id = ? AND is_deleted = FALSE';
      
      db.get(sql, [id], (err: Error | null, row: Record<string, unknown>) => {
        if (err) {
          reject(new AppError(`ログ取得エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        resolve(row ? this.mapRowToActivityLog(row) : null);
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

      db.run(sql, [newContent, now, logId], (err) => {
        if (err) {
          reject(new AppError(`ログ更新エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        // 更新されたログを取得して返す
        const selectSql = 'SELECT * FROM activity_logs WHERE id = ?';
        db.get(selectSql, [logId], (selectErr: Error | null, row: Record<string, unknown>) => {
          if (selectErr) {
            reject(new AppError(`更新後ログ取得エラー: ${selectErr.message}`, ErrorType.DATABASE, { error: selectErr }));
            return;
          }

          if (!row) {
            reject(new AppError(`更新対象ログが見つかりません: ${logId}`, ErrorType.DATABASE, { logId }));
            return;
          }

          resolve(this.mapRowToActivityLog(row));
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
      const values: unknown[] = [];

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

      db.run(sql, values, function(err: Error | null) {
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
      const selectSql = 'SELECT * FROM activity_logs WHERE id = ? AND is_deleted = FALSE';
      db.get(selectSql, [logId], (selectErr: Error | null, row: Record<string, unknown>) => {
        if (selectErr) {
          reject(new AppError(`削除前ログ取得エラー: ${selectErr.message}`, ErrorType.DATABASE, { error: selectErr }));
          return;
        }

        if (!row) {
          reject(new AppError(`削除対象ログが見つかりません: ${logId}`, ErrorType.DATABASE, { logId }));
          return;
        }

        const now = new Date().toISOString();
        const sql = 'UPDATE activity_logs SET is_deleted = TRUE, updated_at = ? WHERE id = ?';

        db.run(sql, [now, logId], (err) => {
          if (err) {
            reject(new AppError(`ログ削除エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
            return;
          }

          // 削除されたログを返す（isDeletedフラグを更新）
          const deletedLog = this.mapRowToActivityLog(row);
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
        INSERT OR REPLACE INTO daily_analysis_cache (
          id, user_id, business_date, analysis_result, log_count, generated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `;

      const cacheId = 'cache-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
      const now = new Date().toISOString();
      const values = [
        cacheId,
        request.userId,
        request.businessDate,
        JSON.stringify(request.analysisResult),
        request.logCount,
        now
      ];

      db.run(sql, values, function(err: Error | null) {
        if (err) {
          reject(new AppError(`分析キャッシュ保存エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        const analysisCache: AnalysisCache = {
          id: cacheId,
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
        SELECT * FROM daily_analysis_cache 
        WHERE user_id = ? AND business_date = ?
      `;

      db.get(sql, [userId, businessDate], (err: Error | null, row: Record<string, unknown>) => {
        if (err) {
          reject(new AppError(`分析キャッシュ取得エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        if (!row) {
          resolve(null);
          return;
        }

        const cache: AnalysisCache = {
          id: String(row.id),
          userId: String(row.user_id),
          businessDate: String(row.business_date),
          analysisResult: JSON.parse(String(row.analysis_result)),
          logCount: Number(row.log_count),
          generatedAt: String(row.generated_at)
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
      const sql = `DELETE FROM daily_analysis_cache WHERE generated_at <= datetime('now', '-7 days')`;

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

        resolve((this as any).changes > 0); // ALLOW_ANY: sqlite3のRunResultのchangesプロパティアクセスのため
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
      const selectSql = 'SELECT * FROM activity_logs WHERE id = ? AND is_deleted = TRUE';
      db.get(selectSql, [logId], (selectErr: Error | null, row: Record<string, unknown>) => {
        if (selectErr) {
          reject(new AppError(`復元前ログ取得エラー: ${selectErr.message}`, ErrorType.DATABASE, { error: selectErr }));
          return;
        }

        if (!row) {
          reject(new AppError(`復元対象ログが見つかりません: ${logId}`, ErrorType.DATABASE, { logId }));
          return;
        }

        const now = new Date().toISOString();
        const sql = 'UPDATE activity_logs SET is_deleted = FALSE, updated_at = ? WHERE id = ?';

        db.run(sql, [now, logId], (err: Error | null) => {
          if (err) {
            reject(new AppError(`ログ復元エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
            return;
          }

          // 復元されたログを返す
          const restoredLog = this.mapRowToActivityLog(row);
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
      
      const sql = 'DELETE FROM daily_analysis_cache WHERE user_id = ? AND business_date = ?';

      db.run(sql, [userId, businessDate], function(err: Error | null) {
        if (err) {
          reject(new AppError(`分析キャッシュ削除エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        resolve((this as any).changes > 0); // ALLOW_ANY: sqlite3のRunResultのchangesプロパティアクセスのため
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
        sql += ' AND is_deleted = FALSE';
      }

      db.get(sql, [userId], (err: Error | null, row: Record<string, unknown>) => {
        if (err) {
          reject(new AppError(`ログ数取得エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        resolve(Number(row?.count) || 0);
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
        sql += ' AND is_deleted = FALSE';
      }

      db.get(sql, [userId, businessDate], (err: Error | null, row: Record<string, unknown>) => {
        if (err) {
          reject(new AppError(`日別ログ数取得エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        resolve(Number(row?.count) || 0);
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
      
      const sql = 'SELECT timezone FROM user_settings WHERE user_id = ?';
      
      db.get(sql, [userId], (err: Error | null, row: Record<string, unknown>) => {
        if (err) {
          reject(new AppError(`タイムゾーン取得エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        resolve(row ? String(row.timezone) : null);
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
        INSERT OR REPLACE INTO user_settings (user_id, timezone, updated_at)
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
      
      const sql = 'SELECT user_id, timezone FROM user_settings WHERE timezone IS NOT NULL';
      
      db.all(sql, [], (err: Error | null, rows: Record<string, unknown>[]) => {
        if (err) {
          reject(new AppError(`スケジューラー用タイムゾーン取得エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        const timezones: UserTimezone[] = rows.map(row => ({
          userId: String(row.user_id),
          timezone: String(row.timezone)
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
      
      let sql = 'SELECT * FROM timezone_change_notifications';
      const params: unknown[] = [];
      
      if (since) {
        sql += ' WHERE changed_at > ?';
        params.push(since.toISOString());
      }
      
      sql += ' ORDER BY changed_at DESC';

      db.all(sql, params, (err: Error | null, rows: Record<string, unknown>[]) => {
        if (err) {
          reject(new AppError(`タイムゾーン変更履歴取得エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        const changes: TimezoneChange[] = rows.map(row => ({
          user_id: String(row.user_id),
          old_timezone: String(row.old_timezone),
          new_timezone: String(row.new_timezone),
          updated_at: String(row.changed_at)
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
        SELECT * FROM timezone_change_notifications 
        WHERE processed = FALSE 
        ORDER BY changed_at ASC
      `;

      db.all(sql, [], (err: Error | null, rows: Record<string, unknown>[]) => {
        if (err) {
          reject(new AppError(`未処理通知取得エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        const notifications: TimezoneNotification[] = rows.map(row => ({
          id: String(row.id),
          user_id: String(row.user_id),
          old_timezone: String(row.old_timezone),
          new_timezone: String(row.new_timezone),
          changed_at: String(row.changed_at),
          processed: Boolean(row.processed)
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
      
      const sql = 'UPDATE timezone_change_notifications SET processed = TRUE WHERE id = ?';

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
        WHERE user_id = ? AND is_deleted = FALSE
        ORDER BY input_timestamp DESC 
        LIMIT ?
      `;

      db.all(sql, [userId, limit], (err: Error | null, rows: Record<string, unknown>[]) => {
        if (err) {
          reject(new AppError(`最新ログ取得エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        resolve(rows.map(row => this.mapRowToActivityLog(row)));
      });
    });
  }

  /**
   * 古いキャッシュを削除（クリーンアップ用）
   */
  async cleanupOldCaches(olderThanDays: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const db = this.db.getDatabase();
      
      const sql = `DELETE FROM daily_analysis_cache WHERE generated_at <= datetime('now', '-${olderThanDays} days')`;

      db.run(sql, [], function(err) {
        if (err) {
          reject(new AppError(`古いキャッシュ削除エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        resolve((this as any).changes); // ALLOW_ANY: sqlite3のRunResultのchangesプロパティアクセスのため
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
        SELECT user_id, username, timezone, first_seen as registration_date, last_seen, 
               is_active, created_at, updated_at
        FROM user_settings 
        ORDER BY created_at DESC
      `;

      db.all(sql, [], (err: Error | null, rows: Record<string, unknown>[]) => {
        if (err) {
          reject(new AppError(`全ユーザー取得エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        const users = rows.map(row => ({
          userId: String(row.user_id),
          username: row.username ? String(row.username) : undefined,
          timezone: String(row.timezone || 'Asia/Tokyo'),
          registrationDate: String(row.registration_date || row.created_at),
          lastSeenAt: String(row.last_seen || row.updated_at),
          isActive: Boolean(row.is_active),
          createdAt: String(row.created_at),
          updatedAt: String(row.updated_at)
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
  private mapRowToActivityLog(row: Record<string, unknown>): ActivityLog {
    return {
      id: String(row.id),
      userId: String(row.user_id),
      content: String(row.content),
      inputTimestamp: String(row.input_timestamp),
      businessDate: String(row.business_date),
      isDeleted: Boolean(row.is_deleted),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      
      // リアルタイム分析結果
      startTime: row.start_time ? String(row.start_time) : undefined,
      endTime: row.end_time ? String(row.end_time) : undefined,
      totalMinutes: row.total_minutes ? Number(row.total_minutes) : undefined,
      confidence: row.confidence ? Number(row.confidence) : undefined,
      analysisMethod: row.analysis_method ? String(row.analysis_method) : undefined,
      categories: row.categories ? String(row.categories) : undefined,
      analysisWarnings: row.analysis_warnings ? String(row.analysis_warnings) : undefined,

      // リマインダーReply機能
      isReminderReply: Boolean(row.is_reminder_reply),
      timeRangeStart: row.time_range_start ? String(row.time_range_start) : undefined,
      timeRangeEnd: row.time_range_end ? String(row.time_range_end) : undefined,
      contextType: row.context_type ? String(row.context_type) as 'REMINDER_REPLY' | 'POST_REMINDER' | 'NORMAL' : 'NORMAL'
    };
  }
}