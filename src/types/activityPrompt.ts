/**
 * 活動促し通知機能の型定義
 */

/**
 * 活動促し設定
 */
export interface ActivityPromptSettings {
  userId: string;
  isEnabled: boolean;
  startHour: number;      // 0-23
  startMinute: number;    // 0 or 30
  endHour: number;        // 0-23
  endMinute: number;      // 0 or 30
  createdAt: string;
  updatedAt: string;
}

/**
 * 活動促し設定作成リクエスト
 */
export interface CreateActivityPromptSettingsRequest {
  userId: string;
  isEnabled?: boolean;
  startHour?: number;
  startMinute?: number;
  endHour?: number;
  endMinute?: number;
}

/**
 * 活動促し設定更新リクエスト
 */
export interface UpdateActivityPromptSettingsRequest {
  isEnabled?: boolean;
  startHour?: number;
  startMinute?: number;
  endHour?: number;
  endMinute?: number;
}

/**
 * 時刻設定
 */
export interface TimeSettings {
  hour: number;    // 0-23
  minute: number;  // 0 or 30
}

/**
 * 活動促し設定検証結果
 */
export interface ActivityPromptValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * 活動促しスケジュール情報
 */
export interface ActivityPromptSchedule {
  userId: string;
  timezone: string;
  settings: ActivityPromptSettings;
  nextPromptTime?: Date;
  shouldPromptNow: boolean;
}

/**
 * 活動促し実行ログ
 */
export interface ActivityPromptExecution {
  userId: string;
  executedAt: Date;
  timezone: string;
  success: boolean;
  errorMessage?: string;
}

/**
 * 活動促し統計
 */
export interface ActivityPromptStats {
  userId: string;
  totalPrompts: number;
  successfulPrompts: number;
  failedPrompts: number;
  lastPromptAt?: Date;
  averageResponseRate: number;
}

/**
 * コマンドパースエラー
 */
export class ActivityPromptError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'ActivityPromptError';
  }
}

/**
 * 活動促し設定のバリデーションルール
 */
export const ACTIVITY_PROMPT_VALIDATION = {
  TIME: {
    VALID_MINUTES: [0, 30],
    MIN_HOUR: 0,
    MAX_HOUR: 23,
  },
  SCHEDULE: {
    MIN_DURATION_MINUTES: 30, // 最低30分の実行時間必要
  },
  MESSAGES: {
    DEFAULT_PROMPT: 'この30分、何してた？',
    CUSTOM_PROMPTS: [
      'この30分、何してた？',
      '最近30分の活動を教えて！',
      'この半時間何をしましたか？',
      '30分間の作業内容は？'
    ]
  }
} as const;