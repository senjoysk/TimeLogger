/**
 * 時刻シミュレーション・サマリーテスト機能の型定義
 */

/**
 * 時刻設定リクエスト
 */
export interface TimeSetRequest {
  /** 年 */
  year: number;
  /** 月（1-12） */
  month: number;
  /** 日（1-31） */
  day: number;
  /** 時間（0-23） */
  hour: number;
  /** 分（0-59） */
  minute: number;
  /** タイムゾーン */
  timezone: string;
}

/**
 * 時刻設定レスポンス
 */
export interface TimeSetResponse {
  /** 設定成功フラグ */
  success: boolean;
  /** 設定された日時（ISO文字列） */
  setDateTime?: string;
  /** 設定されたタイムゾーン */
  timezone?: string;
  /** 各タイムゾーンでの表示時刻 */
  timezoneDisplays?: TimezoneDisplay[];
  /** エラーメッセージ */
  error?: string;
}

/**
 * タイムゾーン表示情報
 */
export interface TimezoneDisplay {
  /** タイムゾーン名 */
  timezone: string;
  /** 表示用名称 */
  displayName: string;
  /** 現地時刻 */
  localTime: string;
  /** 18:30送信時刻かどうか */
  isSummaryTime: boolean;
}

/**
 * サマリーテストリクエスト
 */
export interface SummaryTestRequest {
  /** ドライランモード（実際にDiscord送信しない） */
  dryRun: boolean;
  /** 対象ユーザーID配列（空の場合は全ユーザー） */
  targetUsers?: string[];
  /** テスト実行時刻（設定しない場合は現在の時刻シミュレーション設定を使用） */
  testDateTime?: string;
  /** テスト実行タイムゾーン */
  testTimezone?: string;
}

/**
 * サマリーテストレスポンス
 */
export interface SummaryTestResponse {
  /** テスト実行成功フラグ */
  success: boolean;
  /** テスト実行日時 */
  executedAt: string;
  /** テスト設定情報 */
  testSettings: {
    dryRun: boolean;
    testDateTime: string;
    testTimezone: string;
    targetUserCount: number;
  };
  /** 送信対象ユーザー結果 */
  results: SummaryTestUserResult[];
  /** サマリー統計 */
  summary: {
    totalUsers: number;
    sentCount: number;
    skippedCount: number;
    errorCount: number;
  };
  /** エラーメッセージ */
  error?: string;
}

/**
 * ユーザー別サマリーテスト結果
 */
export interface SummaryTestUserResult {
  /** ユーザーID */
  userId: string;
  /** ユーザーのタイムゾーン */
  timezone: string;
  /** ユーザーの現地時刻 */
  localTime: string;
  /** 送信ステータス */
  status: 'sent' | 'skipped' | 'error';
  /** 送信判定理由 */
  reason: string;
  /** サマリー内容プレビュー（dryRunまたは実際の送信内容） */
  summaryPreview?: string;
  /** エラー詳細（エラー時のみ） */
  errorDetail?: string;
}

/**
 * テストユーザー情報
 */
export interface TestUser {
  /** テストユーザーID */
  id: string;
  /** 表示名 */
  displayName: string;
  /** タイムゾーン */
  timezone: string;
  /** 作成日時 */
  createdAt: string;
  /** 最終更新日時 */
  updatedAt: string;
  /** アクティブフラグ */
  isActive: boolean;
}

/**
 * テストユーザー作成リクエスト
 */
export interface CreateTestUserRequest {
  /** 表示名 */
  displayName: string;
  /** タイムゾーン */
  timezone: string;
}

/**
 * テストユーザー更新リクエスト
 */
export interface UpdateTestUserRequest {
  /** 表示名 */
  displayName?: string;
  /** タイムゾーン */
  timezone?: string;
  /** アクティブフラグ */
  isActive?: boolean;
}

/**
 * プリセット時刻設定
 */
export interface TimePreset {
  /** プリセット名 */
  name: string;
  /** 説明 */
  description: string;
  /** 時間 */
  hour: number;
  /** 分 */
  minute: number;
  /** デフォルトタイムゾーン */
  defaultTimezone: string;
}

/**
 * 環境設定
 */
export interface TestingEnvironmentSettings {
  /** 時刻シミュレーション機能が有効かどうか */
  timeSimulationEnabled: boolean;
  /** サマリーテスト機能が有効かどうか */
  summaryTestEnabled: boolean;
  /** 本番環境での制限事項 */
  productionRestrictions: {
    /** 時刻シミュレーション無効化 */
    disableTimeSimulation: boolean;
    /** 実際のDiscord送信無効化 */
    disableActualSending: boolean;
  };
}

/**
 * API共通レスポンス型
 */
export interface ApiResponse<T = any> {
  /** 成功フラグ */
  success: boolean;
  /** レスポンスデータ */
  data?: T;
  /** エラーメッセージ */
  error?: string;
  /** タイムスタンプ */
  timestamp: string;
}