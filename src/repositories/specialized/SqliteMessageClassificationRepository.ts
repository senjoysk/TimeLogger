/**
 * SQLite メッセージ分類専用リポジトリ
 * IMessageClassificationRepository の完全実装
 */

import { DatabaseConnection } from '../base/DatabaseConnection';
import { IMessageClassificationRepository } from '../interfaces';
import {
  MessageClassificationHistory,
  MessageClassification,
  TodoError
} from '../../types/todo';
import { 
  ClassificationAccuracyRow
} from '../../types/database';
import { v4 as uuidv4 } from 'uuid';

/**
 * SQLiteパラメータ型定義
 */
type SqliteParam = string | number | boolean | null;

/**
 * SQLite メッセージ分類専用リポジトリクラス
 * message_classificationsテーブルの操作を専門に担当
 */
export class SqliteMessageClassificationRepository implements IMessageClassificationRepository {
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
    // バリデーション
    if (!userId || userId.trim() === '') {
      throw new TodoError('ユーザーIDが必要です', 'VALIDATION_ERROR');
    }
    if (!messageContent || messageContent.trim() === '') {
      throw new TodoError('メッセージ内容が必要です', 'VALIDATION_ERROR');
    }

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
      await this.dbConnection.run(sql, [
        record.id,
        record.userId,
        record.messageContent,
        record.aiClassification,
        record.aiConfidence,
        record.userClassification || null,
        record.classifiedAt,
        record.feedback || null,
        record.isCorrect !== undefined ? (record.isCorrect ? 1 : 0) : null,
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
      await this.dbConnection.run(sql, [userClassification, feedback || null, userClassification, id]);
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
    const params: SqliteParam[] = [];

    if (userId) {
      sql += ' AND user_id = ?';
      params.push(userId);
    }

    sql += ' GROUP BY ai_classification';

    try {
      const rows = await this.dbConnection.all<ClassificationAccuracyRow>(sql, params);
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
    const params: SqliteParam[] = [userId];

    if (limit) {
      sql += ' LIMIT ?';
      params.push(limit);
    }

    try {
      const rows = await this.dbConnection.all<Record<string, unknown>>(sql, params);
      return rows.map(row => this.mapRowToClassificationHistory(row));
    } catch (error) {
      throw new TodoError('分類履歴取得に失敗しました', 'GET_CLASSIFICATION_HISTORY_ERROR', { error, userId });
    }
  }

  /**
   * データベース行をMessageClassificationHistoryオブジェクトにマッピング
   */
  private mapRowToClassificationHistory(row: Record<string, unknown>): MessageClassificationHistory {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      messageContent: row.message_content as string,
      aiClassification: row.ai_classification as MessageClassification,
      aiConfidence: row.ai_confidence as number,
      userClassification: row.user_classification as MessageClassification | undefined,
      classifiedAt: row.classified_at as string,
      feedback: row.feedback as string | undefined,
      isCorrect: row.is_correct !== null && row.is_correct !== undefined ? (row.is_correct as number) === 1 : undefined
    };
  }
}