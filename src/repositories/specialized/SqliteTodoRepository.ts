/**
 * SQLite TODO専用リポジトリ
 * ITodoRepository の完全実装
 */

import { DatabaseConnection } from '../base/DatabaseConnection';
import { ITodoRepository } from '../interfaces';
import {
  Todo,
  CreateTodoRequest,
  UpdateTodoRequest,
  GetTodosOptions,
  TodoStats,
  TodoStatus,
  TodoSourceType,
  TodoError
} from '../../types/todo';
import { QueryParams } from '../../types/database';
import { v4 as uuidv4 } from 'uuid';

/**
 * SQLite TODO専用リポジトリクラス
 * TodoTaskテーブルの操作を専門に担当
 */
export class SqliteTodoRepository implements ITodoRepository {
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
   * TODOを作成
   */
  async createTodo(request: CreateTodoRequest): Promise<Todo> {
    // バリデーション
    if (!request.userId || request.userId.trim() === '') {
      throw new TodoError('ユーザーIDが必要です', 'VALIDATION_ERROR');
    }
    if (!request.content || request.content.trim() === '') {
      throw new TodoError('TODOコンテンツが必要です', 'VALIDATION_ERROR');
    }

    const todo: Todo = {
      id: uuidv4(),
      userId: request.userId,
      content: request.content,
      status: 'pending',
      priority: request.priority || 0, // 数値型: 0=通常, 1=高, -1=低
      dueDate: request.dueDate,
      sourceType: request.sourceType || 'manual',
      relatedActivityId: request.relatedActivityId,
      aiConfidence: request.aiConfidence,
      completedAt: undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const sql = `
      INSERT INTO todo_tasks (
        id, user_id, content, status, priority,
        due_date, source_type, related_activity_id, ai_confidence,
        completed_at, created_at, updated_at, is_deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `;

    try {
      await this.dbConnection.run(sql, [
        todo.id,
        todo.userId,
        todo.content,
        todo.status,
        todo.priority,
        todo.dueDate || null,
        todo.sourceType,
        todo.relatedActivityId || null,
        todo.aiConfidence || null,
        todo.completedAt || null,
        todo.createdAt,
        todo.updatedAt
      ]);

      return todo;
    } catch (error) {
      throw new TodoError(`TODO作成エラー: ${error instanceof Error ? error.message : 'Unknown error'}`, 'CREATE_ERROR');
    }
  }

  /**
   * IDでTODOを取得
   */
  async getTodoById(id: string): Promise<Todo | null> {
    const sql = 'SELECT * FROM todo_tasks WHERE id = ? AND is_deleted = 0';
    
    try {
      const row = await this.dbConnection.get<Record<string, unknown>>(sql, [id]);
      return row ? this.mapRowToTodo(row) : null;
    } catch (error) {
      throw new TodoError(`TODO取得エラー: ${error instanceof Error ? error.message : 'Unknown error'}`, 'GET_ERROR');
    }
  }

  /**
   * ユーザーIDでTODO一覧を取得
   */
  async getTodosByUserId(userId: string, options?: GetTodosOptions): Promise<Todo[]> {
    let sql = 'SELECT * FROM todo_tasks WHERE user_id = ? AND is_deleted = 0';
    const params: Array<string | number | boolean | null> = [userId];

    // ステータスフィルタ
    if (options?.status) {
      sql += ' AND status = ?';
      params.push(options.status);
    }


    // ソート
    if (options?.orderBy) {
      sql += ` ORDER BY ${options.orderBy} DESC`;
    } else {
      sql += ' ORDER BY created_at DESC';
    }

    // 制限
    if (options?.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    try {
      const rows = await this.dbConnection.all<Record<string, unknown>>(sql, params);
      return rows.map(row => this.mapRowToTodo(row));
    } catch (error) {
      throw new TodoError(`TODO一覧取得エラー: ${error instanceof Error ? error.message : 'Unknown error'}`, 'GET_LIST_ERROR');
    }
  }

  /**
   * TODOを更新
   */
  async updateTodo(id: string, update: UpdateTodoRequest): Promise<void> {
    const updateFields: string[] = [];
    const params: (string | number | boolean | null)[] = [];

    // 更新フィールドを動的に構築
    if (update.content !== undefined) {
      updateFields.push('content = ?');
      params.push(update.content);
    }
    if (update.status !== undefined) {
      updateFields.push('status = ?');
      params.push(update.status);
      
      // ステータスがcompletedに変更された場合
      if (update.status === 'completed') {
        updateFields.push('completed_at = ?');
        params.push(new Date().toISOString());
      } else if (update.status === 'pending' || update.status === 'in_progress') {
        updateFields.push('completed_at = ?');
        params.push(null);
      }
    }
    if (update.priority !== undefined) {
      updateFields.push('priority = ?');
      params.push(update.priority);
    }
    if (update.dueDate !== undefined) {
      updateFields.push('due_date = ?');
      params.push(update.dueDate);
    }

    // 更新日時は常に設定
    updateFields.push('updated_at = ?');
    params.push(new Date().toISOString());

    const sql = `UPDATE todo_tasks SET ${updateFields.join(', ')} WHERE id = ?`;
    params.push(id);

    try {
      await this.dbConnection.run(sql, params);
    } catch (error) {
      throw new TodoError(`TODO更新エラー: ${error instanceof Error ? error.message : 'Unknown error'}`, 'UPDATE_ERROR');
    }
  }

  /**
   * TODOステータスを更新
   */
  async updateTodoStatus(id: string, status: TodoStatus): Promise<void> {
    const updateFields = ['status = ?', 'updated_at = ?'];
    const params: (string | number | boolean | null)[] = [status, new Date().toISOString()];

    // ステータスに応じてcompletedAtを更新
    if (status === 'completed') {
      updateFields.push('completed_at = ?');
      params.push(new Date().toISOString());
    } else {
      updateFields.push('completed_at = ?');
      params.push(null);
    }

    const sql = `UPDATE todo_tasks SET ${updateFields.join(', ')} WHERE id = ?`;
    params.push(id);

    try {
      await this.dbConnection.run(sql, params);
    } catch (error) {
      throw new TodoError(`TODOステータス更新エラー: ${error instanceof Error ? error.message : 'Unknown error'}`, 'UPDATE_STATUS_ERROR');
    }
  }

  /**
   * TODOを削除（論理削除）
   */
  async deleteTodo(id: string): Promise<void> {
    const sql = 'UPDATE todo_tasks SET is_deleted = 1, updated_at = ? WHERE id = ?';
    
    try {
      await this.dbConnection.run(sql, [new Date().toISOString(), id]);
    } catch (error) {
      throw new TodoError(`TODO削除エラー: ${error instanceof Error ? error.message : 'Unknown error'}`, 'DELETE_ERROR');
    }
  }

  /**
   * キーワードでTODOを検索
   */
  async searchTodos(userId: string, keyword: string): Promise<Todo[]> {
    const sql = 'SELECT * FROM todo_tasks WHERE user_id = ? AND content LIKE ? AND is_deleted = 0 ORDER BY created_at DESC';
    const searchPattern = `%${keyword}%`;
    
    try {
      const rows = await this.dbConnection.all<Record<string, unknown>>(sql, [userId, searchPattern]);
      return rows.map(row => this.mapRowToTodo(row));
    } catch (error) {
      throw new TodoError(`TODO検索エラー: ${error instanceof Error ? error.message : 'Unknown error'}`, 'SEARCH_ERROR');
    }
  }

  /**
   * TODO統計を取得
   */
  async getTodoStats(userId: string): Promise<TodoStats> {
    const sql = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress
      FROM todo_tasks 
      WHERE user_id = ? AND is_deleted = 0
    `;
    
    try {
      const row = await this.dbConnection.get<Record<string, unknown>>(sql, [userId]);
      
      if (!row) {
        return {
          total: 0,
          completed: 0,
          pending: 0,
          inProgress: 0,
          cancelled: 0,
          todayCompleted: 0,
          weekCompleted: 0
        };
      }
      
      return {
        total: (row.total as number) || 0,
        completed: (row.completed as number) || 0,
        pending: (row.pending as number) || 0,
        inProgress: (row.in_progress as number) || 0,
        cancelled: 0, // 現在はキャンセル機能未実装
        todayCompleted: 0, // 現在は未実装
        weekCompleted: 0 // 現在は未実装
      };
    } catch (error) {
      throw new TodoError(`TODO統計取得エラー: ${error instanceof Error ? error.message : 'Unknown error'}`, 'STATS_ERROR');
    }
  }

  /**
   * 期日があるTODOを取得
   */
  async getTodosWithDueDate(userId: string, beforeDate?: string): Promise<Todo[]> {
    let sql = 'SELECT * FROM todo_tasks WHERE user_id = ? AND due_date IS NOT NULL AND is_deleted = 0';
    const params: Array<string | number | boolean | null> = [userId];

    if (beforeDate) {
      sql += ' AND due_date <= ?';
      params.push(beforeDate);
    }

    sql += ' ORDER BY due_date ASC';

    try {
      const rows = await this.dbConnection.all<Record<string, unknown>>(sql, params);
      return rows.map(row => this.mapRowToTodo(row));
    } catch (error) {
      throw new TodoError(`期日付きTODO取得エラー: ${error instanceof Error ? error.message : 'Unknown error'}`, 'GET_DUE_ERROR');
    }
  }

  /**
   * 活動IDに関連するTODOを取得
   */
  async getTodosByActivityId(activityId: string): Promise<Todo[]> {
    const sql = 'SELECT * FROM todo_tasks WHERE related_activity_id = ? AND is_deleted = 0 ORDER BY created_at DESC';
    
    try {
      const rows = await this.dbConnection.all<Record<string, unknown>>(sql, [activityId]);
      return rows.map(row => this.mapRowToTodo(row));
    } catch (error) {
      throw new TodoError(`活動関連TODO取得エラー: ${error instanceof Error ? error.message : 'Unknown error'}`, 'GET_ACTIVITY_ERROR');
    }
  }

  /**
   * 日付範囲でTODOを取得
   */
  async getTodosByDateRange(userId: string, startDate: string, endDate: string): Promise<Todo[]> {
    const sql = `
      SELECT * FROM todo_tasks 
      WHERE user_id = ? AND is_deleted = 0
        AND (
          (due_date IS NOT NULL AND due_date BETWEEN ? AND ?)
          OR (created_at BETWEEN ? AND ?)
        )
      ORDER BY COALESCE(due_date, created_at) ASC
    `;
    
    try {
      const rows = await this.dbConnection.all<Record<string, unknown>>(sql, [
        userId, startDate, endDate, startDate, endDate
      ]);
      return rows.map(row => this.mapRowToTodo(row));
    } catch (error) {
      throw new TodoError(`日付範囲TODO取得エラー: ${error instanceof Error ? error.message : 'Unknown error'}`, 'GET_DATE_RANGE_ERROR');
    }
  }

  /**
   * ステータス指定でTODOを最適化取得
   */
  async getTodosByStatusOptimized(userId: string, statuses: TodoStatus[]): Promise<Todo[]> {
    if (statuses.length === 0) {
      return [];
    }

    const placeholders = statuses.map(() => '?').join(', ');
    const sql = `
      SELECT * FROM todo_tasks 
      WHERE user_id = ? AND status IN (${placeholders}) AND is_deleted = 0
      ORDER BY created_at DESC
    `;
    
    try {
      const rows = await this.dbConnection.all<Record<string, unknown>>(sql, [userId, ...statuses]);
      return rows.map(row => this.mapRowToTodo(row));
    } catch (error) {
      throw new TodoError(`ステータス別TODO取得エラー: ${error instanceof Error ? error.message : 'Unknown error'}`, 'GET_STATUS_ERROR');
    }
  }

  /**
   * データベース行をTodoオブジェクトにマッピング
   */
  private mapRowToTodo(row: Record<string, unknown>): Todo {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      content: row.content as string,
      status: row.status as TodoStatus,
      priority: row.priority as number,
      dueDate: row.due_date as string | undefined,
      sourceType: row.source_type as TodoSourceType,
      relatedActivityId: row.related_activity_id as string | undefined,
      aiConfidence: row.ai_confidence as number | undefined,
      completedAt: row.completed_at as string | undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string
    };
  }
}