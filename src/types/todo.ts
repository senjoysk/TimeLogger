/**
 * TODO機能関連の型定義
 */

/**
 * TODOステータス
 */
export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

/**
 * TODO優先度
 */
export type TodoPriority = 'low' | 'medium' | 'high';

/**
 * TODOソースタイプ
 */
export type TodoSourceType = 'manual' | 'ai_suggested' | 'ai_classified' | 'activity_derived';

/**
 * TODOタスク
 */
export interface Todo {
  id: string;
  userId: string;
  content: string;
  status: TodoStatus;
  priority: number; // 0: 通常, 1: 高, -1: 低
  dueDate?: string; // ISO 8601
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  sourceType: TodoSourceType;
  relatedActivityId?: string;
  aiConfidence?: number; // 0.0-1.0
}

/**
 * Admin Web App用のTODOタスク（拡張型）
 */
export interface TodoTask {
  id: string;
  userId: string;
  title: string;
  description?: string;
  status: TodoStatus;
  priority: TodoPriority;
  dueDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * TODO作成リクエスト
 */
export interface CreateTodoRequest {
  userId: string;
  content: string;
  priority?: number;
  dueDate?: string;
  sourceType?: TodoSourceType;
  relatedActivityId?: string;
  aiConfidence?: number;
}

/**
 * TODO更新リクエスト
 */
export interface UpdateTodoRequest {
  content?: string;
  priority?: number;
  dueDate?: string;
  status?: TodoStatus;
}

/**
 * TODO取得オプション
 */
export interface GetTodosOptions {
  status?: TodoStatus;
  orderBy?: 'priority' | 'created' | 'due_date';
  limit?: number;
  offset?: number;
}

/**
 * TODO統計情報
 */
export interface TodoStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  todayCompleted: number;
  weekCompleted: number;
}

/**
 * メッセージ分類結果
 */
export type MessageClassification = 'TODO' | 'ACTIVITY_LOG' | 'MEMO' | 'UNCERTAIN';

/**
 * AI分類結果
 */
export interface ClassificationResult {
  classification: MessageClassification;
  confidence: number;
  reason: string;
  analysis?: string; // 分析結果の詳細（リマインダーコンテキスト用）
  suggestedAction?: string;
  priority?: number;
  dueDateSuggestion?: string;
}

/**
 * メッセージ分類履歴
 */
export interface MessageClassificationHistory {
  id: string;
  userId: string;
  messageContent: string;
  aiClassification: MessageClassification;
  aiConfidence: number;
  userClassification?: MessageClassification;
  classifiedAt: string;
  feedback?: string;
  isCorrect?: boolean;
}

/**
 * TODOエラー
 */
export class TodoError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'TodoError';
  }
}