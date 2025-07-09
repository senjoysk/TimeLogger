/**
 * SQLite実装による夜間サスペンド機能Repository
 * TDD: Green Phase - テストを通すための実装
 */

import { Database } from 'sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { INightSuspendRepository, SuspendState, DiscordActivityLogData } from './interfaces';
import { withErrorHandling, ErrorType } from '../utils/errorHandler';

/**
 * SQLite実装クラス
 * 夜間サスペンドとメッセージリカバリの機能を提供
 */
export class SqliteNightSuspendRepository implements INightSuspendRepository {
  private db: Database;

  constructor(database: Database) {
    this.db = database;
  }

  /**
   * Discord メッセージIDの存在チェック
   */
  async existsByDiscordMessageId(messageId: string): Promise<boolean> {
    return withErrorHandling(async () => {
      return new Promise<boolean>((resolve, reject) => {
        const query = `
          SELECT COUNT(*) as count 
          FROM activity_logs 
          WHERE discord_message_id = ?
        `;
        
        this.db.get(query, [messageId], (err, row: any) => {
          if (err) {
            reject(err);
          } else {
            resolve(row.count > 0);
          }
        });
      });
    }, ErrorType.DATABASE, { operation: 'existsByDiscordMessageId', messageId });
  }

  /**
   * Discord メッセージIDによるログ取得
   */
  async getByDiscordMessageId(messageId: string): Promise<any | null> {
    return withErrorHandling(async () => {
      return new Promise<any | null>((resolve, reject) => {
        const query = `
          SELECT * 
          FROM activity_logs 
          WHERE discord_message_id = ?
        `;
        
        this.db.get(query, [messageId], (err, row: any) => {
          if (err) {
            reject(err);
          } else {
            resolve(row || null);
          }
        });
      });
    }, ErrorType.DATABASE, { operation: 'getByDiscordMessageId', messageId });
  }

  /**
   * 未処理メッセージの取得
   */
  async getUnprocessedMessages(
    userId: string, 
    timeRange: { start: Date; end: Date }
  ): Promise<any[]> {
    return withErrorHandling(async () => {
      return new Promise<any[]>((resolve, reject) => {
        const query = `
          SELECT * 
          FROM activity_logs 
          WHERE user_id = ? 
            AND input_timestamp >= ? 
            AND input_timestamp < ?
            AND recovery_processed = FALSE
            AND discord_message_id IS NOT NULL
          ORDER BY input_timestamp ASC
        `;
        
        this.db.all(query, [
          userId,
          timeRange.start.toISOString(),
          timeRange.end.toISOString()
        ], (err, rows: any[]) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows || []);
          }
        });
      });
    }, ErrorType.DATABASE);
  }

  /**
   * リカバリ処理済みとしてマーク
   */
  async markAsRecoveryProcessed(logId: string, timestamp: string): Promise<void> {
    return withErrorHandling(async () => {
      return new Promise<void>((resolve, reject) => {
        const query = `
          UPDATE activity_logs 
          SET recovery_processed = TRUE, recovery_timestamp = ?
          WHERE id = ?
        `;
        
        this.db.run(query, [timestamp, logId], (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    }, ErrorType.DATABASE);
  }

  /**
   * サスペンド状態の保存
   */
  async saveSuspendState(state: SuspendState): Promise<void> {
    return withErrorHandling(async () => {
      return new Promise<void>((resolve, reject) => {
        const query = `
          INSERT INTO suspend_states (
            id, user_id, suspend_time, expected_recovery_time, 
            actual_recovery_time, created_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `;
        
        this.db.run(query, [
          state.id,
          state.user_id,
          state.suspend_time,
          state.expected_recovery_time,
          state.actual_recovery_time,
          state.created_at
        ], (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    }, ErrorType.DATABASE);
  }

  /**
   * 最新のサスペンド状態を取得
   */
  async getLastSuspendState(userId: string): Promise<SuspendState | null> {
    return withErrorHandling(async () => {
      return new Promise<SuspendState | null>((resolve, reject) => {
        const query = `
          SELECT * 
          FROM suspend_states 
          WHERE user_id = ? 
          ORDER BY created_at DESC 
          LIMIT 1
        `;
        
        this.db.get(query, [userId], (err, row: any) => {
          if (err) {
            reject(err);
          } else {
            resolve(row || null);
          }
        });
      });
    }, ErrorType.DATABASE);
  }

  /**
   * Discord経由でActivityLogを作成
   */
  async createActivityLogFromDiscord(data: DiscordActivityLogData): Promise<any> {
    return withErrorHandling(async () => {
      return new Promise<any>((resolve, reject) => {
        const id = uuidv4();
        const now = new Date().toISOString();
        
        const query = `
          INSERT INTO activity_logs (
            id, user_id, content, analysis_result, estimated_minutes,
            actual_minutes, input_timestamp, analysis_timestamp, 
            business_date, discord_message_id, recovery_processed, 
            recovery_timestamp
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        this.db.run(query, [
          id,
          data.user_id,
          data.content,
          'Discord経由で作成（AI分析待ち）',
          0,
          0,
          data.input_timestamp,
          now,
          data.business_date,
          data.discord_message_id,
          data.recovery_processed,
          data.recovery_timestamp
        ], function(err) {
          if (err) {
            reject(err);
          } else {
            // 作成されたログを返す
            resolve({
              id,
              user_id: data.user_id,
              content: data.content,
              discord_message_id: data.discord_message_id,
              recovery_processed: data.recovery_processed,
              recovery_timestamp: data.recovery_timestamp,
              business_date: data.business_date,
              input_timestamp: data.input_timestamp
            });
          }
        });
      });
    }, ErrorType.DATABASE);
  }
}