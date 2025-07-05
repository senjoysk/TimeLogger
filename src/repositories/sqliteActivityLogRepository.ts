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
import { IApiCostRepository, ITodoRepository, IMessageClassificationRepository } from './interfaces';
import {
  ActivityLog,
  CreateActivityLogRequest,
  AnalysisCache,
  CreateAnalysisCacheRequest,
  DailyAnalysisResult,
  BusinessDateInfo,
  ActivityLogError
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
import * as fs from 'fs';
import * as path from 'path';

/**
 * SQLite実装クラス
 * 活動ログ、APIコストモニタリング、TODO管理、メッセージ分類の統合実装
 */
export class SqliteActivityLogRepository implements IActivityLogRepository, IApiCostRepository, ITodoRepository, IMessageClassificationRepository {
  private db: Database;
  private connected: boolean = false;

  constructor(databasePath: string) {
    // データベースディレクトリの作成
    const dir = path.dirname(databasePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(databasePath);
    // 初期化は非同期で行うため、ここでは実行しない
  }

  /**
   * データベースの初期化（テーブル作成）
   */
  public async initializeDatabase(): Promise<void> {
    try {
      // 新スキーマファイルから読み込み
      const schemaPath = path.join(__dirname, '../database/newSchema.sql');
      const schema = fs.readFileSync(schemaPath, 'utf8');
      
      // スキーマを実行（複数文に対応、TRIGGERとVIEWを考慮）
      const statements = this.splitSqlStatements(schema);
      
      console.log(`📝 実行予定のSQL文数: ${statements.length}`);
      
      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i].trim();
        if (statement) {
          try {
            console.log(`🔧 SQL文 ${i + 1}/${statements.length} 実行中: ${statement.substring(0, 100)}...`);
            await this.runQuery(statement);
            console.log(`✅ SQL文 ${i + 1} 実行完了`);
          } catch (error) {
            console.error(`❌ SQL文 ${i + 1} 実行エラー:`, error);
            console.error(`問題のSQL文:`, statement);
            throw error;
          }
        }
      }

      this.connected = true;
      console.log('✅ 新活動ログデータベースの初期化が完了しました');
    } catch (error) {
      console.error('スキーマ作成エラー:', error);
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
          log_type, match_status, matched_log_id, activity_key, similarity_score
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        log.similarityScore || null
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
    const log: ActivityLog = {
      id: row.id,
      userId: row.user_id,
      content: row.content,
      inputTimestamp: row.input_timestamp,
      businessDate: row.business_date,
      isDeleted: row.is_deleted === 1,
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
    if (row.log_type !== undefined) log.logType = row.log_type;
    if (row.match_status !== undefined) log.matchStatus = row.match_status;
    if (row.matched_log_id !== undefined) log.matchedLogId = row.matched_log_id;
    if (row.activity_key !== undefined) log.activityKey = row.activity_key;
    if (row.similarity_score !== undefined) log.similarityScore = row.similarity_score;

    return log;
  }

  /**
   * SQL文を適切に分割（TRIGGER、VIEWなどの複数行文に対応）
   */
  private splitSqlStatements(schema: string): string[] {
    const statements: string[] = [];
    let current = '';
    let inTrigger = false;
    let inView = false;
    
    const lines = schema.split('\n');
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // コメント行は無視
      if (trimmedLine.startsWith('--') || trimmedLine === '') {
        continue;
      }
      
      current += line + '\n';
      
      // TRIGGER開始検知
      if (trimmedLine.toUpperCase().includes('CREATE TRIGGER')) {
        inTrigger = true;
      }
      
      // VIEW開始検知
      if (trimmedLine.toUpperCase().includes('CREATE VIEW')) {
        inView = true;
      }
      
      // TRIGGER終了検知（ENDで終わる）
      if (inTrigger && trimmedLine.toUpperCase() === 'END;') {
        statements.push(current.trim());
        current = '';
        inTrigger = false;
        continue;
      }
      
      // 通常の文終了（TRIGGERやVIEW以外）
      if (!inTrigger && !inView && trimmedLine.endsWith(';')) {
        statements.push(current.trim());
        current = '';
        inView = false; // VIEW終了
      }
    }
    
    // 最後の文があれば追加
    if (current.trim()) {
      statements.push(current.trim());
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
          total_cost, timestamp, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `;

      await this.runQuery(sql, [
        id,
        operation,
        inputTokens,
        outputTokens,
        totalCost,
        now,
        now
      ]);

      console.log(`📊 API呼び出しを記録: ${operation} (入力: ${inputTokens}, 出力: ${outputTokens}, コスト: $${totalCost.toFixed(4)})`);
    } catch (error) {
      console.error('❌ API呼び出し記録エラー:', error);
      // エラー時も処理を継続（コスト記録失敗で本来の機能を止めない）
    }
  }

  /**
   * 今日の統計を取得
   */
  async getTodayStats(timezone: string = 'Asia/Tokyo'): Promise<{
    totalCalls: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    estimatedCost: number;
    operationBreakdown: Record<string, { calls: number; inputTokens: number; outputTokens: number; cost: number }>;
  }> {
    try {
      // 今日の範囲を計算（タイムゾーン考慮）
      const now = new Date();
      const zonedNow = toZonedTime(now, timezone);
      const startOfDay = new Date(zonedNow);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(zonedNow);
      endOfDay.setHours(23, 59, 59, 999);

      await this.ensureApiCostsTable();

      const sql = `
        SELECT 
          operation,
          COUNT(*) as calls,
          SUM(input_tokens) as total_input_tokens,
          SUM(output_tokens) as total_output_tokens,
          SUM(total_cost) as total_cost
        FROM api_costs 
        WHERE timestamp >= ? AND timestamp <= ?
        GROUP BY operation
      `;

      const rows = await this.allQuery(sql, [
        startOfDay.toISOString(),
        endOfDay.toISOString()
      ]) as any[];

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
  async checkCostAlerts(timezone: string = 'Asia/Tokyo'): Promise<{ message: string; level: 'warning' | 'critical' } | null> {
    try {
      const stats = await this.getTodayStats(timezone);
      
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
          input_tokens INTEGER NOT NULL,
          output_tokens INTEGER NOT NULL,
          total_cost REAL NOT NULL,
          timestamp TEXT NOT NULL,
          created_at TEXT NOT NULL
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
      const sql = `
        INSERT OR REPLACE INTO user_settings (user_id, timezone)
        VALUES (?, ?)
      `;
      
      await this.runQuery(sql, [userId, timezone]);
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
      
      const row = await this.getQuery(sql, [userId]);
      
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
      
      const rows = await this.allQuery(sql);
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
      const params: any[] = [];

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

      const rows = await this.allQuery(sql, params) as any[];
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

      const rows = await this.allQuery(sql, params) as any[];
      
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
          logType: row.end_log_type,
          matchStatus: 'matched',
          matchedLogId: startLog.id,
          activityKey: row.end_activity_key
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
        created_at, updated_at, source_type, related_activity_id, ai_confidence
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      const row = await this.getQuery(sql, [id]);
      return row ? this.mapRowToTodo(row) : null;
    } catch (error) {
      throw new TodoError('TODO取得に失敗しました', 'GET_TODO_ERROR', { error, id });
    }
  }

  /**
   * ユーザーIDでTODO一覧を取得
   */
  async getTodosByUserId(userId: string, options?: GetTodosOptions): Promise<Todo[]> {
    let sql = 'SELECT * FROM todo_tasks WHERE user_id = ?';
    const params: any[] = [userId];

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
      const rows = await this.allQuery(sql, params);
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
    const params: any[] = [];

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
      const rows = await this.allQuery(sql, [userId, searchPattern]);
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
      const row = await this.getQuery(sql, [userId]);
      return {
        total: row.total || 0,
        pending: row.pending || 0,
        inProgress: row.in_progress || 0,
        completed: row.completed || 0,
        cancelled: row.cancelled || 0,
        todayCompleted: row.today_completed || 0,
        weekCompleted: row.week_completed || 0,
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
    const params: any[] = [userId];

    if (beforeDate) {
      sql += ' AND due_date <= ?';
      params.push(beforeDate);
    }

    sql += ' ORDER BY due_date ASC';

    try {
      const rows = await this.allQuery(sql, params);
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
      const rows = await this.allQuery(sql, [activityId]);
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
    const params: any[] = [];

    if (userId) {
      sql += ' AND user_id = ?';
      params.push(userId);
    }

    sql += ' GROUP BY ai_classification';

    try {
      const rows = await this.allQuery(sql, params);
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
    const params: any[] = [userId];

    if (limit) {
      sql += ' LIMIT ?';
      params.push(limit);
    }

    try {
      const rows = await this.allQuery(sql, params);
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
  private mapRowToTodo(row: any): Todo {
    return {
      id: row.id,
      userId: row.user_id,
      content: row.content,
      status: row.status as TodoStatus,
      priority: row.priority,
      dueDate: row.due_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
      sourceType: row.source_type as any,
      relatedActivityId: row.related_activity_id,
      aiConfidence: row.ai_confidence,
    };
  }

  /**
   * データベース行をMessageClassificationHistoryオブジェクトにマッピング
   */
  private mapRowToClassificationHistory(row: any): MessageClassificationHistory {
    return {
      id: row.id,
      userId: row.user_id,
      messageContent: row.message_content,
      aiClassification: row.ai_classification as MessageClassification,
      aiConfidence: row.ai_confidence,
      userClassification: row.user_classification as MessageClassification,
      classifiedAt: row.classified_at,
      feedback: row.feedback,
      isCorrect: row.is_correct === 1 ? true : row.is_correct === 0 ? false : undefined,
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