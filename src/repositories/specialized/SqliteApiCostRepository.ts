/**
 * SQLite実装によるAPIコスト監視Repository
 * API呼び出し記録、使用量統計、コスト警告機能を提供
 */

import { IApiCostRepository } from '../interfaces';
import { DatabaseConnection } from '../base/DatabaseConnection';
import { CostAlert } from '../../types/costAlert';
import { ApiCostRow, ApiStatsRow } from '../../types/database';
import { v4 as uuidv4 } from 'uuid';
import { toZonedTime, format } from 'date-fns-tz';
import { ITimezoneService } from '../../services/interfaces/ITimezoneService';

/**
 * SQLite実装によるAPIコスト監視Repository
 */
export class SqliteApiCostRepository implements IApiCostRepository {
  private dbConnection: DatabaseConnection;
  private timezoneService?: ITimezoneService;

  constructor(databasePath: string, timezoneService?: ITimezoneService) {
    this.dbConnection = DatabaseConnection.getInstance(databasePath);
    this.timezoneService = timezoneService;
  }

  /**
   * API呼び出しを記録
   */
  async recordApiCall(operation: string, inputTokens: number, outputTokens: number): Promise<void> {
    try {
      const id = uuidv4();
      const now = new Date().toISOString();
      
      // Gemini 1.5 Flash料金計算（参考: https://ai.google.dev/pricing）
      const inputCostPer1k = 0.075;  // $0.075 per 1K input tokens
      const outputCostPer1k = 0.30;  // $0.30 per 1K output tokens
      
      const inputCost = (inputTokens / 1000) * inputCostPer1k;
      const outputCost = (outputTokens / 1000) * outputCostPer1k;
      const totalCost = inputCost + outputCost;

      // api_costs テーブルが存在しない場合は作成
      await this.ensureApiCostsTable();

      const sql = `
        INSERT INTO api_costs (
          id, operation, input_tokens, output_tokens, 
          estimated_cost, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?)
      `;

      await this.dbConnection.run(sql, [
        id,
        operation,
        inputTokens,
        outputTokens,
        totalCost,
        now
      ]);

      if (process.env.NODE_ENV === 'test') {
        console.log(`📊 API呼び出しを記録: ${operation} (入力: ${inputTokens}, 出力: ${outputTokens}, コスト: $${totalCost.toFixed(4)}), timestamp: ${now}`);
      }
    } catch (error) {
      console.error('❌ API呼び出し記録エラー:', error);
      // エラー時も処理を継続（コスト記録失敗で本来の機能を止めない）
    }
  }

  /**
   * 今日の統計を取得
   */
  async getTodayStats(timezone?: string): Promise<{
    totalCalls: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    estimatedCost: number;
    operationBreakdown: Record<string, { calls: number; inputTokens: number; outputTokens: number; cost: number }>;
  }> {
    try {
      await this.ensureApiCostsTable();

      // デバッグ用: 全レコードを取得
      if (process.env.NODE_ENV === 'test') {
        const allRecords = await this.dbConnection.all<ApiCostRow>('SELECT * FROM api_costs ORDER BY timestamp DESC');
        console.log(`🔍 getTodayStats - 全レコード数: ${allRecords.length}`);
        if (allRecords.length > 0) {
          console.log(`🔍 最新レコード: ${JSON.stringify(allRecords[0])}`);
        }
      }

      const sql = `
        SELECT 
          operation,
          COUNT(*) as calls,
          SUM(input_tokens) as total_input_tokens,
          SUM(output_tokens) as total_output_tokens,
          SUM(estimated_cost) as total_cost
        FROM api_costs 
        GROUP BY operation
      `;

      const rows = await this.dbConnection.all<ApiStatsRow>(sql);
      
      // デバッグ情報（テスト時のみ）
      if (process.env.NODE_ENV === 'test') {
        console.log(`🔍 getTodayStats デバッグ: rows=${rows.length}`);
      }

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
  async checkCostAlerts(timezone?: string): Promise<CostAlert | null> {
    try {
      const resolvedTimezone = timezone || this.getDefaultTimezone();
      const stats = await this.getTodayStats(resolvedTimezone);
      
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
   * デフォルトタイムゾーンを取得
   */
  private getDefaultTimezone(): string {
    return this.timezoneService?.getSystemTimezone() || 'Asia/Tokyo';
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
          input_tokens INTEGER DEFAULT 0,
          output_tokens INTEGER DEFAULT 0,
          estimated_cost REAL DEFAULT 0.0,
          timestamp TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
          user_id TEXT,
          business_date TEXT
        )
      `;
      
      await this.dbConnection.run(createTableSql);
      
      // インデックスの作成
      const createIndexSql = `
        CREATE INDEX IF NOT EXISTS idx_api_costs_timestamp 
        ON api_costs(timestamp)
      `;
      
      await this.dbConnection.run(createIndexSql);
    } catch (error) {
      console.error('❌ API費用テーブル確認エラー:', error);
      throw error;
    }
  }
}