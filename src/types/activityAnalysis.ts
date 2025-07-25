/**
 * 活動分析結果の型定義
 * AI分析による活動内容の構造化データ
 */

/**
 * 活動分析結果
 */
export interface ActivityAnalysisResult {
  /**
   * 時間推定結果
   */
  timeEstimation: {
    /** 開始時刻（ISO 8601形式） */
    startTime?: string;
    /** 終了時刻（ISO 8601形式） */
    endTime?: string;
    /** 継続時間（分単位） */
    duration?: number;
    /** 推定の信頼度（0.0-1.0） */
    confidence: number;
    /** 時間情報のソース */
    source: 'reminder_reply' | 'ai_estimation' | 'user_specified';
  };

  /**
   * 活動内容の抽出結果
   */
  activityContent: {
    /** メインの活動 */
    mainActivity: string;
    /** サブ活動のリスト */
    subActivities: string[];
    /** 構造化された活動説明 */
    structuredContent: string;
  };

  /**
   * 活動カテゴリー分類
   */
  activityCategory: {
    /** 主カテゴリー（開発、会議、調査、管理、休憩など） */
    primaryCategory: string;
    /** サブカテゴリー（該当する場合） */
    subCategory?: string;
    /** 関連タグ */
    tags: string[];
  };

  /**
   * 分析メタデータ
   */
  analysisMetadata: {
    /** 分析全体の信頼度 */
    confidence: number;
    /** リマインダーReplyコンテキストかどうか */
    reminderReplyContext?: boolean;
    /** 分析時の警告 */
    warnings?: string[];
  };
}

/**
 * リマインダーコンテキスト情報
 */
export interface ReminderContext {
  /** リマインダーReplyかどうか */
  isReminderReply: boolean;
  /** 時間範囲 */
  timeRange?: {
    start: Date;
    end: Date;
  };
  /** リマインダー送信時刻 */
  reminderTime?: Date;
  /** リマインダーメッセージ内容 */
  reminderContent?: string;
}