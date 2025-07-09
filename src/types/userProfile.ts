/**
 * ユーザープロファイル関連の型定義
 * マルチユーザー対応のための基本的なユーザー情報管理
 */

/**
 * ユーザープロファイル基本情報
 */
export interface UserProfile {
  /** ユーザーID */
  user_id: string;
  /** ユーザー名 */
  username?: string;
  /** タイムゾーン */
  timezone: string;
  /** 登録日時 */
  created_at: string;
  /** 最終更新日時 */
  updated_at: string;
  /** アクティブ状態 */
  is_active?: boolean;
  /** 最終利用日時 */
  last_seen?: string;
}

/**
 * ユーザー統計情報
 */
export interface UserStats {
  /** 総ログ数 */
  total_logs: number;
  /** 今月のログ数 */
  monthly_logs: number;
  /** 今週のログ数 */
  weekly_logs: number;
  /** 今日のログ数 */
  daily_logs: number;
  /** 総TODO数 */
  total_todos: number;
  /** 完了TODO数 */
  completed_todos: number;
  /** 進行中TODO数 */
  in_progress_todos: number;
  /** 最初のログ日時 */
  first_log_date?: string;
  /** 最後のログ日時 */
  last_log_date?: string;
}

/**
 * ユーザー詳細情報（プロファイル表示用）
 */
export interface UserProfileDetails extends UserProfile {
  /** 統計情報 */
  stats: UserStats;
  /** 管理者権限 */
  is_admin?: boolean;
}

/**
 * ユーザー登録リクエスト
 */
export interface UserRegistrationRequest {
  /** ユーザーID */
  user_id: string;
  /** ユーザー名 */
  username: string;
  /** タイムゾーン（デフォルト: Asia/Tokyo） */
  timezone?: string;
}

/**
 * ユーザー更新リクエスト
 */
export interface UserUpdateRequest {
  /** ユーザーID */
  user_id: string;
  /** 更新するユーザー名 */
  username?: string;
  /** 更新するタイムゾーン */
  timezone?: string;
  /** アクティブ状態の更新 */
  is_active?: boolean;
}

/**
 * ユーザー検索条件
 */
export interface UserSearchCriteria {
  /** ユーザーID部分一致 */
  user_id_pattern?: string;
  /** ユーザー名部分一致 */
  username_pattern?: string;
  /** アクティブ状態でフィルタ */
  is_active?: boolean;
  /** 登録日時の範囲指定 */
  created_after?: string;
  /** 登録日時の範囲指定 */
  created_before?: string;
  /** 結果の件数制限 */
  limit?: number;
}

/**
 * ユーザー管理エラー
 */
export class UserProfileError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'UserProfileError';
  }
}

/**
 * ユーザー管理エラーコード
 */
export enum UserProfileErrorCode {
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  USER_ALREADY_EXISTS = 'USER_ALREADY_EXISTS',
  INVALID_USER_ID = 'INVALID_USER_ID',
  INVALID_USERNAME = 'INVALID_USERNAME',
  INVALID_TIMEZONE = 'INVALID_TIMEZONE',
  DATABASE_ERROR = 'DATABASE_ERROR',
  PERMISSION_DENIED = 'PERMISSION_DENIED'
}

/**
 * プロファイル表示フォーマット
 */
export interface ProfileDisplayFormat {
  /** 基本情報セクション */
  basic_info: {
    user_id: string;
    username: string;
    timezone: string;
    registration_date: string;
    last_activity: string;
  };
  /** 統計情報セクション */
  statistics: {
    total_logs: number;
    monthly_logs: number;
    weekly_logs: number;
    daily_logs: number;
    todo_summary: {
      total: number;
      completed: number;
      in_progress: number;
      completion_rate: number;
    };
  };
  /** 設定情報セクション */
  settings: {
    timezone: string;
    is_active: boolean;
  };
}