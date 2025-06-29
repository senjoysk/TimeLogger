/**
 * SQLite実装による活動ログRepository
 * 自然言語ログ方式に対応
 */

import { Database } from 'sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { toZonedTime, format } from 'date-fns-tz';
import {
  IActivityLogRepository,
  LogSearchCriteria
} from './activityLogRepository';
import {
  ActivityLog,
  CreateActivityLogRequest,
  AnalysisCache,
  CreateAnalysisCacheRequest,
  DailyAnalysisResult,
  BusinessDateInfo,
  ActivityLogError
} from '../types/activityLog';
import * as fs from 'fs';
import * as path from 'path';

/**
 * SQLite実装クラス
 */
export class SqliteActivityLogRepository implements IActivityLogRepository {
  private db: Database;
  private connected: boolean = false;

  constructor(databasePath: string) {
    // データベースディレクトリの作成
    const dir = path.dirname(databasePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(databasePath);
    this.initializeDatabase();
  }

  /**
   * データベースの初期化（テーブル作成）
   */
  private async initializeDatabase(): Promise<void> {
    try {
      // 新スキーマファイルから読み込み
      const schemaPath = path.join(__dirname, '../database/newSchema.sql');
      const schema = fs.readFileSync(schemaPath, 'utf8');
      
      // スキーマを実行（複数文に対応）
      const statements = schema.split(';').filter(stmt => stmt.trim());
      
      for (const statement of statements) {
        if (statement.trim()) {
          await this.runQuery(statement.trim() + ';');
        }
      }

      this.connected = true;
      console.log('✅ 新活動ログデータベースの初期化が完了しました');
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
        updatedAt: now
      };

      const sql = `
        INSERT INTO activity_logs (
          id, user_id, content, input_timestamp, business_date, 
          is_deleted, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await this.runQuery(sql, [
        log.id,
        log.userId,
        log.content,
        log.inputTimestamp,
        log.businessDate,
        log.isDeleted ? 1 : 0,
        log.createdAt,
        log.updatedAt
      ]);

      console.log(`✅ 活動ログを保存しました: ${log.id}`);
      
      // キャッシュ無効化
      await this.deleteAnalysisCache(request.userId, request.businessDate);
      
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

      const rows = await this.allQuery(sql, [userId, businessDate]) as any[];
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

      const rows = await this.allQuery(sql, [userId, startDate, endDate]) as any[];
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
      const row = await this.getQuery(sql, [logId]) as any;
      
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

      // キャッシュ無効化
      await this.deleteAnalysisCache(existingLog.userId, existingLog.businessDate);

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

      // キャッシュ無効化
      await this.deleteAnalysisCache(existingLog.userId, existingLog.businessDate);

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
      const row = await this.getQuery(sql, [userId, businessDate]) as any;
      
      if (!row) return null;

      return {
        id: row.id,
        userId: row.user_id,
        businessDate: row.business_date,
        analysisResult: JSON.parse(row.analysis_result),
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
      console.log(`🗑️ キャッシュを無効化しました: ${businessDate}`);
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
      const row = await this.getQuery(sql, [userId]) as any;
      return row.count;
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
      const row = await this.getQuery(sql, [userId, businessDate]) as any;
      return row.count;
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
      const rows = await this.allQuery(sql, [userId, limit]) as any[];
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
      const countRow = await this.getQuery(countSql, [cutoffIso]) as any;
      const deleteCount = countRow.count;

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
  private runQuery(sql: string, params: any[] = []): Promise<any> {
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
  private getQuery(sql: string, params: any[] = []): Promise<any> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  /**
   * SQLクエリ実行（複数行取得）
   */
  private allQuery(sql: string, params: any[] = []): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * データベース行をActivityLogオブジェクトにマッピング
   */
  private mapRowToActivityLog(row: any): ActivityLog {
    return {
      id: row.id,
      userId: row.user_id,
      content: row.content,
      inputTimestamp: row.input_timestamp,
      businessDate: row.business_date,
      isDeleted: row.is_deleted === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * データベース接続を閉じる
   */
  async close(): Promise<void> {
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
}