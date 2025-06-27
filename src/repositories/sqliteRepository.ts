import { Database as SqliteDatabase } from 'sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ActivityRecord, DailySummary } from '../types';
import { IDatabaseRepository } from './interfaces';
import { getCurrentBusinessDate } from '../utils/timeUtils';

/**
 * SQLiteを使用したデータベースリポジトリの実装
 * IDatabaseRepositoryインターフェースを実装し、具体的なSQLite操作を隠蔽
 */
export class SqliteRepository implements IDatabaseRepository {
  private db: SqliteDatabase | null = null;
  private readonly dbPath: string;

  constructor(dbPath: string = './data/tasks.db') {
    this.dbPath = dbPath;
  }

  /**
   * データベースの初期化
   * スキーマの作成とデフォルトユーザーの設定を行う
   */
  public async initialize(): Promise<void> {
    if (this.db) {
      console.log('データベースは既に初期化されています');
      return;
    }

    return new Promise((resolve, reject) => {
      this.db = new SqliteDatabase(this.dbPath, (err) => {
        if (err) {
          console.error('データベース接続エラー:', err.message);
          reject(err);
        } else {
          console.log(`データベースに接続しました: ${this.dbPath}`);
          this.createSchema()
            .then(() => this.initializeDefaultUser())
            .then(() => {
              console.log('✅ データベースの初期化が完了しました');
              resolve();
            })
            .catch(reject);
        }
      });
    });
  }

  /**
   * データベース接続を閉じる
   */
  public async close(): Promise<void> {
    if (!this.db) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.db!.close((err) => {
        if (err) {
          console.error('データベース切断エラー:', err.message);
          reject(err);
        } else {
          console.log('データベースを切断しました');
          this.db = null;
          resolve();
        }
      });
    });
  }

  /**
   * ユーザーのタイムゾーンを取得
   */
  public async getUserTimezone(userId: string): Promise<string> {
    if (!this.db) {
      throw new Error('データベースが初期化されていません');
    }

    return new Promise((resolve, reject) => {
      this.db!.get(
        'SELECT timezone FROM users WHERE user_id = ?',
        [userId],
        (err, row: any) => {
          if (err) {
            reject(err);
          } else {
            resolve(row ? row.timezone : 'Asia/Tokyo');
          }
        }
      );
    });
  }

  /**
   * ユーザーのタイムゾーンを設定
   */
  public async setUserTimezone(userId: string, timezone: string): Promise<void> {
    if (!this.db) {
      throw new Error('データベースが初期化されていません');
    }

    return new Promise((resolve, reject) => {
      this.db!.run(
        'INSERT OR REPLACE INTO users (user_id, timezone) VALUES (?, ?)',
        [userId, timezone],
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  /**
   * 活動記録を保存
   */
  public async saveActivityRecord(record: ActivityRecord, timezone: string): Promise<void> {
    if (!this.db) {
      throw new Error('データベースが初期化されていません');
    }

    const sql = `
      INSERT INTO activity_records (
        id, user_id, time_slot, business_date, original_text,
        category, sub_category, structured_content, estimated_minutes, productivity_level,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      record.id,
      record.userId,
      record.timeSlot,
      getCurrentBusinessDate(timezone),
      record.originalText,
      record.analysis.category,
      record.analysis.subCategory || null,
      record.analysis.structuredContent,
      record.analysis.estimatedMinutes,
      record.analysis.productivityLevel,
      record.createdAt,
      record.updatedAt,
    ];

    return new Promise((resolve, reject) => {
      this.db!.run(sql, params, function(error) {
        if (error) {
          reject(error);
        } else {
          console.log(`活動記録を保存しました: ${record.id}`);
          resolve();
        }
      });
    });
  }

  /**
   * 指定日の活動記録を取得
   */
  public async getActivityRecords(
    userId: string, 
    timezone: string,
    businessDate: string = getCurrentBusinessDate(timezone)
  ): Promise<ActivityRecord[]> {
    if (!this.db) {
      throw new Error('データベースが初期化されていません');
    }

    const sql = `
      SELECT * FROM activity_records 
      WHERE user_id = ? AND business_date = ?
      ORDER BY time_slot
    `;

    return new Promise((resolve, reject) => {
      this.db!.all(sql, [userId, businessDate], (error, rows: any[]) => {
        if (error) {
          reject(error);
        } else {
          const records = rows.map(row => this.mapRowToActivityRecord(row));
          resolve(records);
        }
      });
    });
  }

  /**
   * 特定の時間枠の活動記録を取得
   */
  public async getActivityRecordsByTimeSlot(
    userId: string, 
    timeSlot: string
  ): Promise<ActivityRecord[]> {
    if (!this.db) {
      throw new Error('データベースが初期化されていません');
    }

    const sql = `
      SELECT * FROM activity_records 
      WHERE user_id = ? AND time_slot = ?
      ORDER BY created_at
    `;

    return new Promise((resolve, reject) => {
      this.db!.all(sql, [userId, timeSlot], (error, rows: any[]) => {
        if (error) {
          reject(error);
        } else {
          const records = rows.map(row => this.mapRowToActivityRecord(row));
          resolve(records);
        }
      });
    });
  }

  /**
   * 日次サマリーを保存
   */
  public async saveDailySummary(summary: DailySummary, timezone: string): Promise<void> {
    if (!this.db) {
      throw new Error('データベースが初期化されていません');
    }

    const sql = `
      INSERT OR REPLACE INTO daily_summaries (
        id, userId, business_date, category_totals, total_minutes, insights, motivation, generated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const summaryId = `summary_${summary.date}`;
    const params = [
      summaryId,
      'default_user', // TODO: ユーザーIDを動的に取得
      summary.date,
      JSON.stringify(summary.categoryTotals),
      summary.totalMinutes,
      summary.insights,
      summary.motivation,
      summary.generatedAt,
    ];

    return new Promise((resolve, reject) => {
      this.db!.run(sql, params, function(error) {
        if (error) {
          reject(error);
        } else {
          console.log(`日次サマリーを保存しました: ${summary.date}`);
          resolve();
        }
      });
    });
  }

  /**
   * 日次サマリーを取得
   */
  public async getDailySummary(
    userId: string,
    timezone: string,
    businessDate: string = getCurrentBusinessDate(timezone)
  ): Promise<DailySummary | null> {
    if (!this.db) {
      throw new Error('データベースが初期化されていません');
    }

    const sql = `
      SELECT * FROM daily_summaries 
      WHERE business_date = ?
      ORDER BY generated_at DESC
      LIMIT 1
    `;

    return new Promise((resolve, reject) => {
      this.db!.get(sql, [businessDate], (error, row: any) => {
        if (error) {
          reject(error);
        } else {
          resolve(row ? this.mapRowToSummary(row) : null);
        }
      });
    });
  }

  /**
   * データベースのスキーマを作成
   */
  private async createSchema(): Promise<void> {
    if (!this.db) {
      throw new Error('データベースが初期化されていません');
    }

    const schemaPath = join(__dirname, '../database/schema.sql');
    const schemaSql = readFileSync(schemaPath, 'utf8');

    return new Promise((resolve, reject) => {
      this.db!.exec(schemaSql, (err) => {
        if (err) {
          console.error('スキーマ作成エラー:', err.message);
          reject(err);
        } else {
          console.log('データベーススキーマを作成しました');
          resolve();
        }
      });
    });
  }

  /**
   * デフォルトユーザーの初期化
   */
  private async initializeDefaultUser(): Promise<void> {
    const defaultUserId = 'default_user';
    const defaultTimezone = 'Asia/Tokyo';

    try {
      const existingTimezone = await this.getUserTimezone(defaultUserId);
      if (existingTimezone) {
        console.log('ユーザーテーブルを初期化しました（既存ユーザーはスキップ）');
        return;
      }
    } catch {
      // ユーザーが存在しない場合は新規作成
    }

    await this.setUserTimezone(defaultUserId, defaultTimezone);
    console.log('デフォルトユーザーを初期化しました');
  }

  /**
   * データベースの行をActivityRecordに変換
   */
  private mapRowToActivityRecord(row: any): ActivityRecord {
    return {
      id: row.id,
      userId: row.user_id,
      timeSlot: row.time_slot,
      originalText: row.original_text,
      analysis: {
        category: row.category,
        subCategory: row.sub_category,
        structuredContent: row.structured_content,
        estimatedMinutes: row.estimated_minutes,
        productivityLevel: row.productivity_level,
      },
      // データベースから直接取得したカテゴリ（スクリプトで修正済み）
      category: row.category,
      subCategory: row.sub_category,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * データベースの行をDailySummaryに変換
   */
  private mapRowToSummary(row: any): DailySummary {
    return {
      date: row.business_date,
      categoryTotals: JSON.parse(row.category_totals),
      totalMinutes: row.total_minutes,
      insights: row.insights,
      motivation: row.motivation,
      generatedAt: row.generated_at,
    };
  }
}