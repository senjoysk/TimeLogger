/**
 * 🟢 Green Phase: ActivityPromptRepository 実装
 * TDDアプローチ: テストを通す最小限の実装
 */

import { Database } from 'sqlite3';
import { promisify } from 'util';
import {
  ActivityPromptSettings,
  CreateActivityPromptSettingsRequest,
  UpdateActivityPromptSettingsRequest,
  ActivityPromptError,
  ACTIVITY_PROMPT_VALIDATION
} from '../types/activityPrompt';
import { IActivityPromptRepository } from './interfaces';

/**
 * 活動促し通知設定リポジトリ
 */
export class ActivityPromptRepository implements IActivityPromptRepository {
  private db: Database;

  constructor(database: Database) {
    this.db = database;
  }

  /**
   * 設定を作成
   */
  async createSettings(request: CreateActivityPromptSettingsRequest): Promise<ActivityPromptSettings> {
    // バリデーション
    this.validateRequest(request);

    const sql = `
      INSERT INTO activity_prompt_settings (
        user_id, is_enabled, start_hour, start_minute, end_hour, end_minute
      ) VALUES (?, ?, ?, ?, ?, ?)
    `;

    const values = [
      request.userId,
      request.isEnabled ?? false,
      request.startHour ?? 8,
      request.startMinute ?? 30,
      request.endHour ?? 18,
      request.endMinute ?? 0
    ];

    await this.runQuery(sql, values);

    // 作成された設定を返す
    const created = await this.getSettings(request.userId);
    if (!created) {
      throw new ActivityPromptError('設定の作成に失敗しました', 'CREATE_FAILED');
    }

    return created;
  }

  /**
   * 設定を取得
   */
  async getSettings(userId: string): Promise<ActivityPromptSettings | null> {
    const sql = `
      SELECT user_id, is_enabled, start_hour, start_minute, end_hour, end_minute,
             created_at, updated_at
      FROM activity_prompt_settings 
      WHERE user_id = ?
    `;

    const row = await this.getQuery(sql, [userId]);
    if (!row) return null;

    return {
      userId: row.user_id,
      isEnabled: Boolean(row.is_enabled),
      startHour: row.start_hour,
      startMinute: row.start_minute,
      endHour: row.end_hour,
      endMinute: row.end_minute,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * 設定を更新
   */
  async updateSettings(userId: string, update: UpdateActivityPromptSettingsRequest): Promise<void> {
    const setParts: string[] = [];
    const values: any[] = [];

    if (update.isEnabled !== undefined) {
      setParts.push('is_enabled = ?');
      values.push(update.isEnabled);
    }

    if (update.startHour !== undefined) {
      this.validateHour(update.startHour);
      setParts.push('start_hour = ?');
      values.push(update.startHour);
    }

    if (update.startMinute !== undefined) {
      this.validateMinute(update.startMinute);
      setParts.push('start_minute = ?');
      values.push(update.startMinute);
    }

    if (update.endHour !== undefined) {
      this.validateHour(update.endHour);
      setParts.push('end_hour = ?');
      values.push(update.endHour);
    }

    if (update.endMinute !== undefined) {
      this.validateMinute(update.endMinute);
      setParts.push('end_minute = ?');
      values.push(update.endMinute);
    }

    if (setParts.length === 0) {
      throw new ActivityPromptError('更新する項目がありません', 'NO_UPDATES');
    }

    setParts.push('updated_at = datetime(\'now\', \'utc\')');
    values.push(userId);

    const sql = `
      UPDATE activity_prompt_settings 
      SET ${setParts.join(', ')}
      WHERE user_id = ?
    `;

    await this.runQuery(sql, values);
  }

  /**
   * 設定を削除
   */
  async deleteSettings(userId: string): Promise<void> {
    const sql = `DELETE FROM activity_prompt_settings WHERE user_id = ?`;
    await this.runQuery(sql, [userId]);
  }

  /**
   * 有効な設定をすべて取得
   */
  async getEnabledSettings(): Promise<ActivityPromptSettings[]> {
    const sql = `
      SELECT user_id, is_enabled, start_hour, start_minute, end_hour, end_minute,
             created_at, updated_at
      FROM activity_prompt_settings 
      WHERE is_enabled = TRUE
      ORDER BY user_id
    `;

    const rows = await this.allQuery(sql, []);
    return rows.map(row => ({
      userId: row.user_id,
      isEnabled: Boolean(row.is_enabled),
      startHour: row.start_hour,
      startMinute: row.start_minute,
      endHour: row.end_hour,
      endMinute: row.end_minute,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  /**
   * 特定時刻に通知すべきユーザーを取得
   */
  async getUsersToPromptAt(hour: number, minute: number): Promise<string[]> {
    const sql = `
      SELECT user_id
      FROM activity_prompt_settings
      WHERE is_enabled = TRUE
        AND (
          (start_hour < ? OR (start_hour = ? AND start_minute <= ?))
          AND
          (end_hour > ? OR (end_hour = ? AND end_minute >= ?))
        )
      ORDER BY user_id
    `;

    const rows = await this.allQuery(sql, [
      hour, hour, minute,  // 開始時刻チェック
      hour, hour, minute   // 終了時刻チェック
    ]);

    return rows.map(row => row.user_id);
  }

  /**
   * 通知を有効化
   */
  async enablePrompt(userId: string): Promise<void> {
    await this.updateSettings(userId, { isEnabled: true });
  }

  /**
   * 通知を無効化
   */
  async disablePrompt(userId: string): Promise<void> {
    await this.updateSettings(userId, { isEnabled: false });
  }

  /**
   * 設定存在確認
   */
  async settingsExists(userId: string): Promise<boolean> {
    const sql = `SELECT 1 FROM activity_prompt_settings WHERE user_id = ?`;
    const row = await this.getQuery(sql, [userId]);
    return row !== null;
  }

  /**
   * リクエストバリデーション
   */
  private validateRequest(request: CreateActivityPromptSettingsRequest): void {
    if (!request.userId) {
      throw new ActivityPromptError('ユーザーIDは必須です', 'MISSING_USER_ID');
    }

    if (request.startHour !== undefined) {
      this.validateHour(request.startHour);
    }

    if (request.startMinute !== undefined) {
      this.validateMinute(request.startMinute);
    }

    if (request.endHour !== undefined) {
      this.validateHour(request.endHour);
    }

    if (request.endMinute !== undefined) {
      this.validateMinute(request.endMinute);
    }

    // 時刻範囲チェック
    const startHour = request.startHour ?? 8;
    const startMinute = request.startMinute ?? 30;
    const endHour = request.endHour ?? 18;
    const endMinute = request.endMinute ?? 0;

    if (endHour < startHour || (endHour === startHour && endMinute <= startMinute)) {
      throw new ActivityPromptError(
        '終了時刻は開始時刻より後である必要があります',
        'INVALID_TIME_RANGE'
      );
    }
  }

  /**
   * 時刻バリデーション
   */
  private validateHour(hour: number): void {
    if (hour < ACTIVITY_PROMPT_VALIDATION.TIME.MIN_HOUR || 
        hour > ACTIVITY_PROMPT_VALIDATION.TIME.MAX_HOUR) {
      throw new ActivityPromptError(
        `時刻は${ACTIVITY_PROMPT_VALIDATION.TIME.MIN_HOUR}-${ACTIVITY_PROMPT_VALIDATION.TIME.MAX_HOUR}の範囲で指定してください`,
        'INVALID_HOUR'
      );
    }
  }

  /**
   * 分バリデーション
   */
  private validateMinute(minute: number): void {
    if (!ACTIVITY_PROMPT_VALIDATION.TIME.VALID_MINUTES.includes(minute as 0 | 30)) {
      throw new ActivityPromptError(
        `分は${ACTIVITY_PROMPT_VALIDATION.TIME.VALID_MINUTES.join('または')}を指定してください`,
        'INVALID_MINUTE'
      );
    }
  }

  /**
   * SQLクエリ実行（INSERT/UPDATE/DELETE）
   */
  private async runQuery(sql: string, params: any[]): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * SQLクエリ実行（単一行取得）
   */
  private async getQuery(sql: string, params: any[]): Promise<any> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      });
    });
  }

  /**
   * SQLクエリ実行（複数行取得）
   */
  private async allQuery(sql: string, params: any[]): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }
}