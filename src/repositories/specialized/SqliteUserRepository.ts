/**
 * SQLite ユーザー管理専用リポジトリ
 * IUserRepository の完全実装
 */

import { DatabaseConnection } from '../base/DatabaseConnection';
import { IUserRepository, UserInfo, UserStats } from '../interfaces';
import {
  TodoError
} from '../../types/todo';
import { 
  UserRegistrationRow,
  UserStatsAggregateRow
} from '../../types/database';

/**
 * SQLiteパラメータ型定義
 */
type SqliteParam = string | number | boolean | null;

/**
 * SQLite ユーザー管理専用リポジトリクラス
 * user_settingsテーブルの操作を専門に担当
 */
export class SqliteUserRepository implements IUserRepository {
  private dbConnection: DatabaseConnection;

  constructor(databasePath: string) {
    this.dbConnection = DatabaseConnection.getInstance(databasePath);
  }

  /**
   * スキーマ確保
   */
  async ensureSchema(): Promise<void> {
    await this.dbConnection.ensureSchema();
  }

  /**
   * ユーザーが存在するかチェック
   */
  async userExists(userId: string): Promise<boolean> {
    try {
      const result = await this.dbConnection.all(
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
      const defaultTimezone = 'Asia/Tokyo';
      
      // user_settingsに登録
      await this.dbConnection.run(`
        INSERT INTO user_settings (user_id, username, timezone, first_seen, last_seen, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [userId, username, defaultTimezone, now, now, 1, now, now]);
      
      console.log(`✅ 新規ユーザー登録完了: ${userId} (${username})`);
    } catch (error) {
      console.error('❌ ユーザー登録エラー:', error);
      throw new TodoError('ユーザー登録に失敗しました', 'USER_REGISTRATION_ERROR', { userId, username, error });
    }
  }

  /**
   * ユーザー情報を取得
   */
  async getUserInfo(userId: string): Promise<UserInfo | null> {
    try {
      const row = await this.dbConnection.get<UserRegistrationRow>(
        'SELECT * FROM user_settings WHERE user_id = ?',
        [userId]
      );

      if (!row) {
        return null;
      }

      return this.mapRowToUserInfo(row);
    } catch (error) {
      throw new TodoError('ユーザー情報取得に失敗しました', 'GET_USER_INFO_ERROR', { userId, error });
    }
  }

  /**
   * 全ユーザー取得
   */
  async getAllUsers(): Promise<UserInfo[]> {
    try {
      const rows = await this.dbConnection.all<UserRegistrationRow>(
        'SELECT * FROM user_settings ORDER BY created_at DESC'
      );
      return rows.map(row => this.mapRowToUserInfo(row));
    } catch (error) {
      throw new TodoError('全ユーザー取得に失敗しました', 'GET_ALL_USERS_ERROR', { error });
    }
  }

  /**
   * ユーザー統計取得
   */
  async getUserStats(userId: string): Promise<UserStats> {
    try {
      // 基本ログ統計の集計クエリ
      const statsRow = await this.dbConnection.get<UserStatsAggregateRow>(`
        SELECT 
          COUNT(*) as total_logs,
          COUNT(CASE WHEN DATE(input_timestamp) = DATE('now', 'localtime') THEN 1 END) as today_logs,
          COUNT(CASE WHEN DATE(input_timestamp) >= DATE('now', 'localtime', '-7 days') THEN 1 END) as this_week_logs,
          COUNT(CASE WHEN DATE(input_timestamp) >= DATE('now', 'localtime', 'start of month') THEN 1 END) as this_month_logs,
          ROUND(
            CAST(COUNT(*) AS REAL) / 
            CAST(JULIANDAY('now') - JULIANDAY(MIN(input_timestamp)) + 1 AS REAL), 2
          ) as avg_logs_per_day,
          COALESCE(SUM(total_minutes), 0) as total_minutes
        FROM activity_logs 
        WHERE user_id = ? AND is_deleted = 0
      `, [userId]);

      // 最もアクティブな時間帯を取得
      const mostActiveHourRow = await this.dbConnection.get<{ hour: string }>(`
        SELECT strftime('%H', input_timestamp) as hour
        FROM activity_logs 
        WHERE user_id = ? AND is_deleted = 0
        GROUP BY strftime('%H', input_timestamp)
        ORDER BY COUNT(*) DESC
        LIMIT 1
      `, [userId]);

      // 最もアクティブな日を取得
      const longestActiveDayRow = await this.dbConnection.get<{ date: string; log_count: number }>(`
        SELECT DATE(input_timestamp) as date, COUNT(*) as log_count
        FROM activity_logs 
        WHERE user_id = ? AND is_deleted = 0
        GROUP BY DATE(input_timestamp)
        ORDER BY COUNT(*) DESC
        LIMIT 1
      `, [userId]);

      if (!statsRow || statsRow.total_logs === 0) {
        // ユーザーが存在しない、またはデータがない場合はデフォルト統計を返す
        return {
          userId,
          totalLogs: 0,
          todayLogs: 0,
          thisWeekLogs: 0,
          thisMonthLogs: 0,
          avgLogsPerDay: 0,
          totalMinutesLogged: 0,
          mostActiveHour: null,
          longestActiveDay: null
        };
      }

      return {
        userId,
        totalLogs: statsRow.total_logs,
        todayLogs: statsRow.today_logs,
        thisWeekLogs: statsRow.this_week_logs,
        thisMonthLogs: statsRow.this_month_logs,
        avgLogsPerDay: statsRow.avg_logs_per_day || 0,
        totalMinutesLogged: statsRow.total_minutes,
        mostActiveHour: mostActiveHourRow ? parseInt(mostActiveHourRow.hour) : null,
        longestActiveDay: longestActiveDayRow ? {
          date: longestActiveDayRow.date,
          logCount: longestActiveDayRow.log_count
        } : null
      };
    } catch (error) {
      throw new TodoError('ユーザー統計取得に失敗しました', 'GET_USER_STATS_ERROR', { userId, error });
    }
  }

  /**
   * 最終利用日時更新
   */
  async updateLastSeen(userId: string): Promise<void> {
    try {
      const now = new Date().toISOString();
      await this.dbConnection.run(
        'UPDATE user_settings SET last_seen = ?, updated_at = ? WHERE user_id = ?',
        [now, now, userId]
      );
    } catch (error) {
      throw new TodoError('最終利用日時更新に失敗しました', 'UPDATE_LAST_SEEN_ERROR', { userId, error });
    }
  }

  /**
   * データベース行をUserInfoオブジェクトにマッピング
   */
  private mapRowToUserInfo(row: UserRegistrationRow): UserInfo {
    return {
      userId: row.user_id || '',
      username: row.username,
      timezone: row.timezone || 'Asia/Tokyo',
      registrationDate: row.first_seen || new Date().toISOString(),
      lastSeenAt: row.last_seen || new Date().toISOString(),
      isActive: row.is_active === 1,
      createdAt: row.created_at || new Date().toISOString(),
      updatedAt: row.updated_at || new Date().toISOString()
    };
  }
}