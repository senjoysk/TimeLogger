/**
 * メモ管理システム用型定義
 */

// メモの基本型
export interface Memo {
  id: string;
  userId: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

// メモ作成用リクエスト
export interface CreateMemoRequest {
  userId: string;
  content: string;
  tags: string[];
}

// メモ更新用リクエスト
export interface UpdateMemoRequest {
  content?: string;
  tags?: string[];
}

// メモエラー詳細情報の型定義
export type MemoErrorDetails = {
  /** エラーの原因となったメモID */
  memoId?: string;
  /** エラーの原因となったユーザーID */
  userId?: string;
  /** エラーが発生した操作 */
  operation?: 'create' | 'update' | 'delete' | 'read';
  /** エラーの原因となったパラメータ */
  invalidParameters?: Record<string, string | number | boolean>;
  /** バリデーションエラーの詳細 */
  validationErrors?: {
    field: string;
    message: string;
    value?: unknown;
  }[];
  /** データベースエラー情報 */
  dbError?: {
    constraint?: string;
    table?: string;
    column?: string;
  };
} | Error | unknown;

// メモエラー型定義
export class MemoError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: MemoErrorDetails
  ) {
    super(message);
    this.name = 'MemoError';
  }
}