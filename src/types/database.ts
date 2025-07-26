/**
 * データベース関連の型定義
 * SQLiteクエリパラメータと結果の型安全性を向上
 */

import { ActivityLog, AnalysisCache, DailyAnalysisResult } from './activityLog';
import { Todo } from './todo';

/**
 * SQLiteデータベースの基本操作結果
 */
export interface SqliteRunResult {
  lastID?: number;
  changes?: number;
}

/**
 * SQLクエリパラメータの型（Union型で安全性を確保）
 */
export type QueryParam = string | number | boolean | null | undefined;

/**
 * SQLクエリパラメータ配列
 */
export type QueryParams = QueryParam[];

/**
 * activity_logsテーブルの行データ型
 */
export interface ActivityLogRow {
  id: string;
  user_id: string;
  content: string;
  input_timestamp: string;
  business_date: string;
  is_deleted: number; // SQLiteのBOOLEANは0/1のINTEGER
  created_at: string;
  updated_at: string;
  // リアルタイム分析結果
  start_time?: string;
  end_time?: string;
  total_minutes?: number;
  confidence?: number;
  analysis_method?: string;
  categories?: string;
  analysis_warnings?: string;
  // 開始・終了ログマッチング機能
  log_type?: string;
  match_status?: string;
  matched_log_id?: string;
  activity_key?: string;
  similarity_score?: number;
  // リマインダーReply機能
  is_reminder_reply?: number; // SQLiteのBOOLEANは0/1のINTEGER
  time_range_start?: string;
  time_range_end?: string;
  context_type?: string;
}

/**
 * analysis_cacheテーブルの行データ型
 */
export interface AnalysisCacheRow {
  id: string;
  user_id: string;
  business_date: string;
  analysis_result: string; // JSON文字列
  log_count: number;
  generated_at: string;
}

/**
 * api_costsテーブルの行データ型
 */
export interface ApiCostRow {
  id: string;
  user_id: string;
  operation_type: string;
  token_count: number;
  cost_usd: number;
  timestamp: string;
  model_name?: string;
  business_date: string;
}

/**
 * user_timezonesテーブルの行データ型
 */
export interface UserTimezoneRow {
  user_id: string;
  timezone: string;
  created_at: string;
  updated_at: string;
}

/**
 * todo_tasksテーブルの行データ型
 */
export interface TodoTaskRow {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  due_date?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

/**
 * message_classification_historyテーブルの行データ型
 */
export interface MessageClassificationHistoryRow {
  id: string;
  user_id: string;
  message_content: string;
  classification_type: string;
  confidence_score: number;
  processed_at: string;
  business_date: string;
}

/**
 * user_registrationsテーブルの行データ型
 */
export interface UserRegistrationRow {
  user_id: string;
  username?: string;
  timezone: string;
  registration_date: string;
  last_seen_at: string;
  is_active: number; // SQLiteのBOOLEANは0/1のINTEGER
  created_at: string;
  updated_at: string;
}

/**
 * notificationsテーブルの行データ型
 */
export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  data: string; // JSON文字列
  is_processed: number; // SQLiteのBOOLEANは0/1のINTEGER
  created_at: string;
  processed_at?: string;
}

/**
 * スケジューラー用のユーザータイムゾーン情報
 */
export interface UserTimezoneInfo {
  userId: string;
  timezone: string;
}

/**
 * ユーザータイムゾーン変更履歴
 */
export interface UserTimezoneChange {
  userId: string;
  oldTimezone: string | null;
  newTimezone: string;
  changedAt: Date;
}

/**
 * ユーザー情報（管理機能用）
 */
export interface UserInfo {
  userId: string;
  username?: string;
  timezone: string;
  registrationDate: string;
  lastSeenAt: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * 未処理通知情報
 */
export interface UnprocessedNotification {
  id: string;
  userId: string;
  type: string;
  data: unknown; // JSON.parseした結果
  createdAt: Date;
}

/**
 * データベースクエリの戻り値型を統一
 */
export type DatabaseQueryResult<T> = T | null;
export type DatabaseQueryResults<T> = T[];

/**
 * 検索結果のページネーション情報
 */
export interface SearchResult<T> {
  items: T[];
  totalCount: number;
  hasMore: boolean;
  offset: number;
  limit: number;
}

/**
 * 前回活動データの型定義（previousActivitiesのany[]を置換）
 */
export interface PreviousActivity {
  id: string;
  content: string;
  timestamp: string;
  startTime?: string;
  endTime?: string;
  categories?: string[];
  confidence?: number;
}

/**
 * 前回活動データ配列
 */
export type PreviousActivities = PreviousActivity[];

/**
 * SQLite boolean値の変換ユーティリティ型
 */
export type SqliteBoolean = 0 | 1;

/**
 * SQLite boolean値をTypeScript booleanに変換
 */
export function sqliteBooleanToBoolean(value: SqliteBoolean | null | undefined): boolean {
  return value === 1;
}

/**
 * TypeScript booleanをSQLite boolean値に変換
 */
export function booleanToSqliteBoolean(value: boolean): SqliteBoolean {
  return value ? 1 : 0;
}

/**
 * user_settingsテーブルの行データ型
 */
export interface UserSettingRow {
  user_id: string;
  prompt_enabled: number; // SQLiteのBOOLEAN
  prompt_start_hour: number;
  prompt_start_minute: number;
  prompt_end_hour: number;
  prompt_end_minute: number;
  created_at: string;
  updated_at: string;
}

/**
 * API統計集計クエリの結果型
 */
export interface ApiStatsRow {
  operation_type: string;
  calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost: number;
}

/**
 * ユーザータイムゾーン統計クエリの結果型
 */
export interface UserTimezoneStatsRow {
  user_id: string;
  timezone: string;
  created_at: string;
  updated_at: string;
}

/**
 * タイムゾーン変更履歴クエリの結果型
 */
export interface TimezoneChangeRow {
  user_id: string;
  old_timezone: string | null;
  new_timezone: string;
  changed_at: string;
}

/**
 * ユーザー統計集計クエリの結果型
 */
export interface UserStatsAggregateRow {
  total_logs: number;
  this_month_logs: number;
  this_week_logs: number;
  today_logs: number;
  avg_logs_per_day: number;
  total_minutes: number;
}

/**
 * 通知データクエリの結果型
 */
export interface NotificationDataRow {
  id: string;
  user_id: string;
  type: string;
  data: string; // JSON文字列
  is_processed: number; // SQLiteのBOOLEAN
  created_at: string;
  processed_at?: string;
}

/**
 * 統計クエリの結果型（count系）
 */
export interface CountRow {
  count: number;
}

/**
 * 日別統計クエリの結果型
 */
export interface DailyStatsRow {
  days: number;
  logs: number;
}

/**
 * 時間別統計クエリの結果型
 */
export interface HourlyStatsRow {
  hour: number;
  total: number;
}

/**
 * 日付別ログ統計クエリの結果型
 */
export interface DateLogStatsRow {
  date: string;
  logCount: number;
}

/**
 * マッチしたログペア用の拡張行型
 */
export interface MatchedLogPairRow extends ActivityLogRow {
  end_id: string;
  end_content: string;
  end_input_timestamp: string;
  end_log_type: string;
}

/**
 * 活動促し設定クエリの結果型
 */
export interface ActivityPromptSettingRow {
  user_id: string;
  prompt_enabled: number; // SQLiteのBOOLEAN
  prompt_start_hour: number;
  prompt_start_minute: number;
  prompt_end_hour: number;
  prompt_end_minute: number;
  created_at: string;
  updated_at: string;
}

/**
 * TODO統計クエリの結果型
 */
export interface TodoStatsRow {
  total: number;
  pending: number;
  in_progress: number;
  completed: number;
  cancelled: number;
  today_completed: number;
  week_completed: number;
}

/**
 * 分類精度統計クエリの結果型
 */
export interface ClassificationAccuracyRow {
  classification: string;
  total_count: number;
  correct_count: number;
  accuracy: number;
  avg_confidence: number;
}