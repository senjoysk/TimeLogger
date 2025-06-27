import { Database as SqliteDatabase } from 'sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ActivityRecord, DailySummary } from '../types';
import { IDatabaseRepository, IApiCostRepository } from './interfaces';
import { getCurrentBusinessDate } from '../utils/timeUtils';

/**
 * SQLiteを使用したデータベースリポジトリの実装
 * IDatabaseRepositoryインターフェースを実装し、具体的なSQLite操作を隠蔽
 */
export class SqliteRepository implements IDatabaseRepository, IApiCostRepository {
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
        id, user_id, business_date, category_totals, total_minutes, insights, motivation, generated_at
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

  // ========== IApiCostRepository インターフェースの実装 ==========

  /**
   * API使用ログを記録
   */
  public async recordApiCall(operation: string, inputTokens: number, outputTokens: number): Promise<void> {
    if (!this.db) {
      throw new Error('データベースが初期化されていません');
    }

    // コスト計算（Gemini 1.5 Flash の料金）
    const PRICE_PER_INPUT_TOKEN = 0.00000075; // $0.075/1M tokens
    const PRICE_PER_OUTPUT_TOKEN = 0.0000003;  // $0.3/1M tokens
    const cost = (inputTokens * PRICE_PER_INPUT_TOKEN) + (outputTokens * PRICE_PER_OUTPUT_TOKEN);

    const sql = `
      INSERT INTO api_usage_logs (id, operation, input_tokens, output_tokens, cost, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    const params = [
      require('crypto').randomUUID(),
      operation,
      inputTokens,
      outputTokens,
      cost,
      new Date().toISOString(),
    ];

    return new Promise((resolve, reject) => {
      this.db!.run(sql, params, function(error) {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * 本日の統計を取得
   */
  public async getTodayStats(timezone: string = 'Asia/Tokyo'): Promise<{
    totalCalls: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    estimatedCost: number;
    operationBreakdown: Record<string, { calls: number; inputTokens: number; outputTokens: number; cost: number }>;
  }> {
    if (!this.db) {
      throw new Error('データベースが初期化されていません');
    }

    const businessDate = getCurrentBusinessDate(timezone);
    
    // タイムゾーンでの日付をUTCに変換
    const startOfDayLocal = new Date(`${businessDate}T00:00:00`);
    const endOfDayLocal = new Date(`${businessDate}T23:59:59`);
    
    // 簡易的な変換（正確な実装は後で調整）
    const startOfDayUTC = new Date(startOfDayLocal.getTime() - 9 * 60 * 60 * 1000).toISOString();
    const endOfDayUTC = new Date(endOfDayLocal.getTime() - 9 * 60 * 60 * 1000).toISOString();

    const sql = `
      SELECT 
        operation,
        COUNT(*) as call_count,
        SUM(input_tokens) as total_input,
        SUM(output_tokens) as total_output,
        SUM(cost) as total_cost
      FROM api_usage_logs
      WHERE created_at BETWEEN ? AND ?
      GROUP BY operation
    `;

    return new Promise((resolve, reject) => {
      this.db!.all(sql, [startOfDayUTC, endOfDayUTC], (error, rows: any[]) => {
        if (error) {
          reject(error);
        } else {
          const stats = {
            totalCalls: 0,
            totalInputTokens: 0,
            totalOutputTokens: 0,
            estimatedCost: 0,
            operationBreakdown: {} as Record<string, { calls: number; inputTokens: number; outputTokens: number; cost: number }>,
          };

          rows.forEach(row => {
            stats.totalCalls += row.call_count;
            stats.totalInputTokens += row.total_input;
            stats.totalOutputTokens += row.total_output;
            stats.estimatedCost += row.total_cost;
            stats.operationBreakdown[row.operation] = {
              calls: row.call_count,
              inputTokens: row.total_input,
              outputTokens: row.total_output,
              cost: row.total_cost,
            };
          });

          resolve(stats);
        }
      });
    });
  }

  /**
   * コスト警告をチェック
   */
  public async checkCostAlerts(timezone: string = 'Asia/Tokyo'): Promise<{ message: string; level: 'warning' | 'critical' } | null> {
    const stats = await this.getTodayStats(timezone);
    const workingDaysPerMonth = 20;
    const monthlyEstimate = stats.estimatedCost * workingDaysPerMonth;
    
    if (monthlyEstimate > 50) {
      return {
        level: 'critical',
        message: `🚨 月間コスト推定が$${monthlyEstimate.toFixed(2)}に達しています！使用量を確認してください。`
      };
    }
    
    if (monthlyEstimate > 20) {
      return {
        level: 'warning',
        message: `⚠️ 月間コスト推定が$${monthlyEstimate.toFixed(2)}です。使用量にご注意ください。`
      };
    }
    
    if (stats.totalCalls > 50) {
      return {
        level: 'warning',
        message: `⚠️ 本日のAPI呼び出しが${stats.totalCalls}回に達しています。`
      };
    }
    
    return null;
  }

  /**
   * 日次レポートを生成
   */
  public async generateDailyReport(timezone: string): Promise<string> {
    const stats = await this.getTodayStats(timezone);
    const workingDaysPerMonth = 20;
    const monthlyEstimate = stats.estimatedCost * workingDaysPerMonth;
    
    return [
      '💰 **Gemini API 使用量レポート**',
      '',
      `📅 **本日 (${getCurrentBusinessDate(timezone)})**`,
      `• 総API呼び出し数: ${stats.totalCalls}回`,
      `• 入力トークン: ${stats.totalInputTokens.toLocaleString()}`,
      `• 出力トークン: ${stats.totalOutputTokens.toLocaleString()}`,
      `• 推定コスト: $${stats.estimatedCost.toFixed(4)}`,
      '',
      `📊 **月間推定 (20営業日)**`,
      `• 月間コスト: $${monthlyEstimate.toFixed(2)}`,
      '',
      `ℹ️ 料金は2024年6月のGemini 1.5 Flash価格に基づく推定値です`,
    ].join('\n');
  }
}