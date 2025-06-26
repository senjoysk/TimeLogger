import sqlite3 from 'sqlite3';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { config } from '../config';
import { ActivityRecord, DailySummary, CategoryTotal } from '../types';
import { getCurrentBusinessDate, formatDateTime } from '../utils/timeUtils';

/**
 * データベース管理クラス
 * SQLite を使用して活動記録とサマリーを管理
 */
export class Database {
  private db: sqlite3.Database | null = null;
  private dbPath: string;

  constructor() {
    this.dbPath = config.database.path;
  }

  /**
   * データベースを初期化
   */
  public async initialize(): Promise<void> {
    try {
      console.log('🗄️  データベースを初期化中...');
      
      // データベースファイルのディレクトリを作成
      await this.ensureDirectoryExists();
      
      // データベース接続
      await this.connect();
      
      // スキーマの作成
      await this.createSchema();
      
      console.log('✅ データベースの初期化が完了しました');
      
    } catch (error) {
      console.error('❌ データベースの初期化に失敗しました:', error);
      throw error;
    }
  }

  /**
   * データベースに接続
   */
  private async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (error) => {
        if (error) {
          console.error('データベース接続エラー:', error);
          reject(error);
        } else {
          console.log(`データベースに接続しました: ${this.dbPath}`);
          resolve();
        }
      });
    });
  }

  /**
   * データベースを閉じる
   */
  public async close(): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      this.db!.close((error) => {
        if (error) {
          console.error('データベース切断エラー:', error);
          reject(error);
        } else {
          console.log('データベースを切断しました');
          this.db = null;
          resolve();
        }
      });
    });
  }

  /**
   * ディレクトリが存在しない場合は作成
   */
  private async ensureDirectoryExists(): Promise<void> {
    const dir = dirname(this.dbPath);
    try {
      await fs.access(dir);
    } catch {
      // ディレクトリが存在しない場合は作成
      await fs.mkdir(dir, { recursive: true });
      console.log(`データベースディレクトリを作成しました: ${dir}`);
    }
  }

  /**
   * データベーススキーマを作成
   */
  private async createSchema(): Promise<void> {
    const schemaPath = join(__dirname, 'schema.sql');
    const schemaSQL = await fs.readFile(schemaPath, 'utf-8');
    
    return new Promise((resolve, reject) => {
      this.db!.exec(schemaSQL, (error) => {
        if (error) {
          reject(error);
        } else {
          console.log('データベーススキーマを作成しました');
          resolve();
        }
      });
    });
  }

  /**
   * 活動記録を保存
   * @param record 保存する活動記録
   */
  public async saveActivityRecord(record: ActivityRecord): Promise<void> {
    if (!this.db) {
      throw new Error('データベースが初期化されていません');
    }

    const sql = `
      INSERT INTO activity_records (
        id, user_id, time_slot, business_date, original_text,
        category, sub_category, structured_content, 
        estimated_minutes, productivity_level, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      record.id,
      record.userId,
      record.timeSlot,
      getCurrentBusinessDate(),
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
   * @param userId ユーザーID
   * @param businessDate 業務日 (YYYY-MM-DD)
   * @returns 活動記録の配列
   */
  public async getActivityRecords(
    userId: string, 
    businessDate: string = getCurrentBusinessDate()
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
   * @param userId ユーザーID
   * @param timeSlot 時間枠
   * @returns 活動記録の配列
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
   * @param summary 保存するサマリー
   */
  public async saveDailySummary(summary: DailySummary): Promise<void> {
    if (!this.db) {
      throw new Error('データベースが初期化されていません');
    }

    const sql = `
      INSERT OR REPLACE INTO daily_summaries (
        id, user_id, business_date, category_totals, 
        total_minutes, insights, motivation, generated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const id = `${summary.date}_summary`;
    const params = [
      id,
      config.discord.targetUserId, // TODO: 複数ユーザー対応時は引数から取得
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
   * @param userId ユーザーID
   * @param businessDate 業務日 (YYYY-MM-DD)
   * @returns 日次サマリー（存在しない場合はnull）
   */
  public async getDailySummary(
    userId: string, 
    businessDate: string = getCurrentBusinessDate()
  ): Promise<DailySummary | null> {
    if (!this.db) {
      throw new Error('データベースが初期化されていません');
    }

    const sql = `
      SELECT * FROM daily_summaries 
      WHERE user_id = ? AND business_date = ?
    `;

    return new Promise((resolve, reject) => {
      this.db!.get(sql, [userId, businessDate], (error, row: any) => {
        if (error) {
          reject(error);
        } else if (!row) {
          resolve(null);
        } else {
          const summary = this.mapRowToSummary(row);
          resolve(summary);
        }
      });
    });
  }

  /**
   * データベースの行を ActivityRecord に変換
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
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * データベースの行を DailySummary に変換
   */
  private mapRowToSummary(row: any): DailySummary {
    return {
      date: row.business_date,
      categoryTotals: JSON.parse(row.category_totals) as CategoryTotal[],
      totalMinutes: row.total_minutes,
      insights: row.insights,
      motivation: row.motivation,
      generatedAt: row.generated_at,
    };
  }

  /**
   * 古いデータのクリーンアップ（今日のデータのみ保持）
   * 将来の要件で過去データ保存が必要になった際は削除
   */
  public async cleanupOldData(): Promise<void> {
    if (!this.db) {
      throw new Error('データベースが初期化されていません');
    }

    const today = getCurrentBusinessDate();
    
    const sqlActivity = `DELETE FROM activity_records WHERE business_date != ?`;
    const sqlSummary = `DELETE FROM daily_summaries WHERE business_date != ?`;

    return new Promise((resolve, reject) => {
      this.db!.serialize(() => {
        this.db!.run(sqlActivity, [today], (error) => {
          if (error) reject(error);
        });
        
        this.db!.run(sqlSummary, [today], (error) => {
          if (error) {
            reject(error);
          } else {
            console.log(`古いデータをクリーンアップしました (保持日: ${today})`);
            resolve();
          }
        });
      });
    });
  }
}