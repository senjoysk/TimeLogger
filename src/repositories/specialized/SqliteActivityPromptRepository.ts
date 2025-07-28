/**
 * IActivityPromptRepository専用実装
 * 活動促し通知設定の管理のみを責務とする
 * 
 * 分離対象:
 * - 活動促し通知設定のCRUD操作
 * - スケジューラー連携機能
 * - 通知設定の有効/無効管理
 */

import { DatabaseConnection } from '../base/DatabaseConnection';
import { IActivityPromptRepository } from '../interfaces';
import {
  ActivityPromptSettings,
  CreateActivityPromptSettingsRequest,
  UpdateActivityPromptSettingsRequest
} from '../../types/activityPrompt';
import { AppError, ErrorType } from '../../utils/errorHandler';

/**
 * 活動促し通知設定専用SQLiteリポジトリ
 * 単一責務: 活動促し通知設定の管理
 */
export class SqliteActivityPromptRepository implements IActivityPromptRepository {
  private db: DatabaseConnection;

  constructor(databasePath: string) {
    this.db = DatabaseConnection.getInstance(databasePath);
  }

  /**
   * データベース初期化
   */
  async ensureSchema(): Promise<void> {
    // 活動促し設定テーブルは既にメインスキーマで作成済み
    // 必要に応じて活動促し専用のインデックス作成などを行う
    await this.db.initializeDatabase();
  }

  // =============================================================================
  // 基本操作
  // =============================================================================

  /**
   * 活動促し通知設定を作成
   */
  async createSettings(request: CreateActivityPromptSettingsRequest): Promise<ActivityPromptSettings> {
    return new Promise((resolve, reject) => {
      const db = this.db.getDatabase();
      
      const sql = `
        INSERT INTO user_settings (
          user_id, prompt_enabled, prompt_start_hour, prompt_start_minute, 
          prompt_end_hour, prompt_end_minute, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          prompt_enabled = excluded.prompt_enabled,
          prompt_start_hour = excluded.prompt_start_hour,
          prompt_start_minute = excluded.prompt_start_minute,
          prompt_end_hour = excluded.prompt_end_hour,
          prompt_end_minute = excluded.prompt_end_minute,
          updated_at = excluded.updated_at
      `;

      const now = new Date().toISOString();
      const values = [
        request.userId,
        request.isEnabled ? 1 : 0,
        request.startHour || 9,
        request.startMinute || 0,
        request.endHour || 18,
        request.endMinute || 0,
        now,
        now
      ];

      db.run(sql, values, function(err: Error | null) {
        if (err) {
          reject(new AppError(`活動促し設定作成エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        const settings: ActivityPromptSettings = {
          userId: request.userId,
          isEnabled: request.isEnabled || false,
          startHour: request.startHour || 9,
          startMinute: request.startMinute || 0,
          endHour: request.endHour || 18,
          endMinute: request.endMinute || 0,
          createdAt: now,
          updatedAt: now
        };

        resolve(settings);
      });
    });
  }

  /**
   * ユーザーの活動促し通知設定を取得
   */
  async getSettings(userId: string): Promise<ActivityPromptSettings | null> {
    return new Promise((resolve, reject) => {
      const db = this.db.getDatabase();
      
      const sql = `
        SELECT user_id, prompt_enabled, prompt_start_hour, prompt_start_minute,
               prompt_end_hour, prompt_end_minute, created_at, updated_at
        FROM user_settings 
        WHERE user_id = ? AND prompt_enabled IS NOT NULL
      `;

      db.get(sql, [userId], (err: Error | null, row: Record<string, unknown>) => {
        if (err) {
          reject(new AppError(`活動促し設定取得エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        if (!row) {
          resolve(null);
          return;
        }

        const settings: ActivityPromptSettings = {
          userId: row.user_id as string,
          isEnabled: (row.prompt_enabled as number) === 1,
          startHour: row.prompt_start_hour as number,
          startMinute: row.prompt_start_minute as number,
          endHour: row.prompt_end_hour as number,
          endMinute: row.prompt_end_minute as number,
          createdAt: row.created_at as string,
          updatedAt: row.updated_at as string
        };

        resolve(settings);
      });
    });
  }

  /**
   * 活動促し通知設定を更新
   */
  async updateSettings(userId: string, update: UpdateActivityPromptSettingsRequest): Promise<void> {
    return new Promise((resolve, reject) => {
      const db = this.db.getDatabase();
      
      const setClause: string[] = [];
      const values: unknown[] = [];

      // 更新可能なフィールドのみを処理
      if (update.isEnabled !== undefined) {
        setClause.push('prompt_enabled = ?');
        values.push(update.isEnabled ? 1 : 0);
      }
      if (update.startHour !== undefined) {
        setClause.push('prompt_start_hour = ?');
        values.push(update.startHour);
      }
      if (update.startMinute !== undefined) {
        setClause.push('prompt_start_minute = ?');
        values.push(update.startMinute);
      }
      if (update.endHour !== undefined) {
        setClause.push('prompt_end_hour = ?');
        values.push(update.endHour);
      }
      if (update.endMinute !== undefined) {
        setClause.push('prompt_end_minute = ?');
        values.push(update.endMinute);
      }

      setClause.push('updated_at = ?');
      values.push(new Date().toISOString());
      values.push(userId);

      const sql = `UPDATE user_settings SET ${setClause.join(', ')} WHERE user_id = ?`;

      db.run(sql, values, function(err: Error | null) {
        if (err) {
          reject(new AppError(`活動促し設定更新エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        resolve();
      });
    });
  }

  /**
   * 活動促し通知設定を削除
   */
  async deleteSettings(userId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const db = this.db.getDatabase();
      
      const sql = `
        UPDATE user_settings SET 
          prompt_enabled = NULL,
          prompt_start_hour = NULL,
          prompt_start_minute = NULL,
          prompt_end_hour = NULL,
          prompt_end_minute = NULL,
          updated_at = ?
        WHERE user_id = ?
      `;

      db.run(sql, [new Date().toISOString(), userId], function(err: Error | null) {
        if (err) {
          reject(new AppError(`活動促し設定削除エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        resolve();
      });
    });
  }

  // =============================================================================
  // 有効な設定の取得
  // =============================================================================

  /**
   * 有効な活動促し通知設定をすべて取得
   */
  async getEnabledSettings(): Promise<ActivityPromptSettings[]> {
    return new Promise((resolve, reject) => {
      const db = this.db.getDatabase();
      
      const sql = `
        SELECT user_id, prompt_enabled, prompt_start_hour, prompt_start_minute,
               prompt_end_hour, prompt_end_minute, created_at, updated_at
        FROM user_settings 
        WHERE prompt_enabled = 1
        ORDER BY user_id
      `;

      db.all(sql, [], (err: Error | null, rows: Record<string, unknown>[]) => {
        if (err) {
          reject(new AppError(`有効設定取得エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        const settings: ActivityPromptSettings[] = rows.map(row => ({
          userId: row.user_id as string,
          isEnabled: (row.prompt_enabled as number) === 1,
          startHour: row.prompt_start_hour as number,
          startMinute: row.prompt_start_minute as number,
          endHour: row.prompt_end_hour as number,
          endMinute: row.prompt_end_minute as number,
          createdAt: row.created_at as string,
          updatedAt: row.updated_at as string
        }));

        resolve(settings);
      });
    });
  }

  // =============================================================================
  // 特定時刻に通知すべきユーザーの取得
  // =============================================================================

  /**
   * 指定時刻に通知すべきユーザーIDを取得
   */
  async getUsersToPromptAt(hour: number, minute: number): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const db = this.db.getDatabase();
      
      const sql = `
        SELECT user_id FROM user_settings 
        WHERE prompt_enabled = 1 
          AND prompt_start_hour <= ? 
          AND prompt_end_hour >= ?
          AND (
            (prompt_start_hour < ? OR (prompt_start_hour = ? AND prompt_start_minute <= ?))
            AND
            (prompt_end_hour > ? OR (prompt_end_hour = ? AND prompt_end_minute >= ?))
          )
      `;

      const values = [hour, hour, hour, hour, minute, hour, hour, minute];

      db.all(sql, values, (err: Error | null, rows: Record<string, unknown>[]) => {
        if (err) {
          reject(new AppError(`通知対象ユーザー取得エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        const userIds: string[] = rows.map(row => row.user_id as string);
        resolve(userIds);
      });
    });
  }

  // =============================================================================
  // 設定の有効/無効切り替え
  // =============================================================================

  /**
   * 活動促し通知を有効化
   */
  async enablePrompt(userId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const db = this.db.getDatabase();
      
      const sql = `
        UPDATE user_settings SET 
          prompt_enabled = 1, 
          updated_at = ? 
        WHERE user_id = ? AND prompt_enabled IS NOT NULL
      `;

      db.run(sql, [new Date().toISOString(), userId], function(err: Error | null) {
        if (err) {
          reject(new AppError(`活動促し有効化エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        resolve();
      });
    });
  }

  /**
   * 活動促し通知を無効化
   */
  async disablePrompt(userId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const db = this.db.getDatabase();
      
      const sql = `
        UPDATE user_settings SET 
          prompt_enabled = 0, 
          updated_at = ? 
        WHERE user_id = ?
      `;

      db.run(sql, [new Date().toISOString(), userId], function(err: Error | null) {
        if (err) {
          reject(new AppError(`活動促し無効化エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        resolve();
      });
    });
  }

  // =============================================================================
  // 設定存在確認
  // =============================================================================

  /**
   * ユーザーに活動促し通知設定が存在するかチェック
   */
  async settingsExists(userId: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const db = this.db.getDatabase();
      
      const sql = `
        SELECT COUNT(*) as count FROM user_settings 
        WHERE user_id = ? AND prompt_enabled IS NOT NULL
      `;

      db.get(sql, [userId], (err: Error | null, row: Record<string, unknown>) => {
        if (err) {
          reject(new AppError(`設定存在確認エラー: ${err.message}`, ErrorType.DATABASE, { error: err }));
          return;
        }

        resolve(((row.count as number) || 0) > 0);
      });
    });
  }
}