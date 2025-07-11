/**
 * ユーザープロファイル関連の型定義
 */

export interface UserProfile {
  userId: string;
  username?: string;
  timezone: string;
  registrationDate: string;
  lastSeenAt: string;
  isActive: boolean;
  stats: UserActivityStats;
}

export interface UserActivityStats {
  totalLogs: number;
  thisMonthLogs: number;
  thisWeekLogs: number;
  todayLogs: number;
  avgLogsPerDay: number;
  mostActiveHour: number;
  totalMinutesLogged: number;
  longestActiveDay?: {
    date: string;
    logCount: number;
  };
}

export interface ProfileDisplayOptions {
  includeStats: boolean;
  includeSettings: boolean;
  includeRecentActivity: boolean;
  compact: boolean;
}

/**
 * プロファイル表示のデフォルトオプション
 */
export const DEFAULT_PROFILE_OPTIONS: ProfileDisplayOptions = {
  includeStats: true,
  includeSettings: true,
  includeRecentActivity: false,
  compact: false
};