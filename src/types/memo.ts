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

// メモエラー型定義
export class MemoError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'MemoError';
  }
}