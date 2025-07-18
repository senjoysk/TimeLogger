/**
 * SQLiteメモリポジトリ実装
 */

import { Database } from 'sqlite3';
import { IMemoRepository } from './interfaces';
import { Memo, CreateMemoRequest, UpdateMemoRequest, MemoError } from '../types/memo';
import { v4 as uuidv4 } from 'uuid';
import { promisify } from 'util';

/**
 * SQLiteメモリポジトリの実装
 */
export class SqliteMemoRepository implements IMemoRepository {
  private db: Database;

  constructor(databasePath: string) {
    this.db = new Database(databasePath);
    this.initializeDatabase();
  }

  /**
   * データベースの初期化
   */
  private initializeDatabase(): void {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS memos (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        content TEXT NOT NULL,
        tags TEXT NOT NULL, -- JSON文字列として保存
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `;

    this.db.run(createTableQuery, (err) => {
      if (err) {
        console.error('❌ メモテーブル作成エラー:', err);
        throw new MemoError('メモテーブルの作成に失敗しました', 'DATABASE_ERROR', err);
      } else {
        // テーブル作成成功後にインデックスを作成
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_memos_user_id ON memos(user_id)`, (err) => {
          if (err) {
            console.error('❌ メモインデックス作成エラー:', err);
          }
        });
      }
    });
  }

  /**
   * メモを作成
   */
  async createMemo(request: CreateMemoRequest): Promise<Memo> {
    const memo: Memo = {
      id: uuidv4(),
      userId: request.userId,
      content: request.content,
      tags: request.tags || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO memos (id, user_id, content, tags, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `;

      this.db.run(query, [
        memo.id,
        memo.userId,
        memo.content,
        JSON.stringify(memo.tags),
        memo.createdAt,
        memo.updatedAt
      ], function(err) {
        if (err) {
          reject(new MemoError('メモの作成に失敗しました', 'CREATE_ERROR', err));
        } else {
          resolve(memo);
        }
      });
    });
  }

  /**
   * IDでメモを取得
   */
  async getMemoById(id: string): Promise<Memo | null> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT id, user_id, content, tags, created_at, updated_at
        FROM memos
        WHERE id = ?
      `;

      this.db.get(query, [id], (err, row: any) => {
        if (err) {
          reject(new MemoError('メモの取得に失敗しました', 'GET_ERROR', err));
        } else if (!row) {
          resolve(null);
        } else {
          resolve(this.rowToMemo(row));
        }
      });
    });
  }

  /**
   * ユーザーIDでメモを取得
   */
  async getMemosByUserId(userId: string): Promise<Memo[]> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT id, user_id, content, tags, created_at, updated_at
        FROM memos
        WHERE user_id = ?
        ORDER BY created_at DESC
      `;

      this.db.all(query, [userId], (err, rows: any[]) => {
        if (err) {
          reject(new MemoError('メモの取得に失敗しました', 'GET_ERROR', err));
        } else {
          const memos = rows.map(row => this.rowToMemo(row));
          resolve(memos);
        }
      });
    });
  }

  /**
   * メモを更新
   */
  async updateMemo(id: string, update: UpdateMemoRequest): Promise<void> {
    return new Promise((resolve, reject) => {
      const setParts: string[] = [];
      const params: any[] = [];

      if (update.content !== undefined) {
        setParts.push('content = ?');
        params.push(update.content);
      }

      if (update.tags !== undefined) {
        setParts.push('tags = ?');
        params.push(JSON.stringify(update.tags));
      }

      if (setParts.length === 0) {
        resolve();
        return;
      }

      setParts.push('updated_at = ?');
      params.push(new Date().toISOString());
      params.push(id);

      const query = `
        UPDATE memos
        SET ${setParts.join(', ')}
        WHERE id = ?
      `;

      this.db.run(query, params, function(err) {
        if (err) {
          reject(new MemoError('メモの更新に失敗しました', 'UPDATE_ERROR', err));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * メモを削除
   */
  async deleteMemo(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const query = `DELETE FROM memos WHERE id = ?`;

      this.db.run(query, [id], function(err) {
        if (err) {
          reject(new MemoError('メモの削除に失敗しました', 'DELETE_ERROR', err));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * メモを検索
   */
  async searchMemos(userId: string, keyword: string): Promise<Memo[]> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT id, user_id, content, tags, created_at, updated_at
        FROM memos
        WHERE user_id = ? AND content LIKE ?
        ORDER BY created_at DESC
      `;

      this.db.all(query, [userId, `%${keyword}%`], (err, rows: any[]) => {
        if (err) {
          reject(new MemoError('メモの検索に失敗しました', 'SEARCH_ERROR', err));
        } else {
          const memos = rows.map(row => this.rowToMemo(row));
          resolve(memos);
        }
      });
    });
  }

  /**
   * タグでメモを取得
   */
  async getMemosByTag(userId: string, tag: string): Promise<Memo[]> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT id, user_id, content, tags, created_at, updated_at
        FROM memos
        WHERE user_id = ? AND tags LIKE ?
        ORDER BY created_at DESC
      `;

      this.db.all(query, [userId, `%"${tag}"%`], (err, rows: any[]) => {
        if (err) {
          reject(new MemoError('メモの検索に失敗しました', 'SEARCH_ERROR', err));
        } else {
          const memos = rows.map(row => this.rowToMemo(row));
          resolve(memos);
        }
      });
    });
  }

  /**
   * データベース行をMemoオブジェクトに変換
   */
  private rowToMemo(row: any): Memo {
    return {
      id: row.id,
      userId: row.user_id,
      content: row.content,
      tags: JSON.parse(row.tags || '[]'),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * データベース接続を閉じる
   */
  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          reject(new MemoError('データベース接続の終了に失敗しました', 'CLOSE_ERROR', err));
        } else {
          resolve();
        }
      });
    });
  }
}