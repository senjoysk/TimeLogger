/**
 * 新活動記録システム用型定義
 * 自然言語ログ方式に対応
 */


// 活動ログの基本型（データベース対応）
export interface ActivityLog {
  id: string;
  userId: string;
  content: string;           // ユーザーの生入力
  inputTimestamp: string;    // 入力時刻（UTC、ISO 8601形式）
  businessDate: string;      // 業務日（YYYY-MM-DD、5am基準）
  isDeleted: boolean;        // 論理削除フラグ
  createdAt: string;         // 作成日時（UTC）
  updatedAt: string;         // 更新日時（UTC）
  
  // リアルタイム分析結果（新機能）
  startTime?: string;        // 活動開始時刻（UTC、ISO 8601形式）
  endTime?: string;          // 活動終了時刻（UTC、ISO 8601形式）
  totalMinutes?: number;     // 総活動時間（分）
  confidence?: number;       // 分析の信頼度 (0-1)
  analysisMethod?: string;   // 時刻抽出手法
  categories?: string;       // カテゴリ（カンマ区切り）
  analysisWarnings?: string; // 警告メッセージ（セミコロン区切り）


  // リマインダーReply機能（新機能）
  isReminderReply?: boolean; // リマインダーへのreplyかどうか
  timeRangeStart?: string;   // 明示的な時間範囲開始（UTC、ISO 8601形式）
  timeRangeEnd?: string;     // 明示的な時間範囲終了（UTC、ISO 8601形式）
  contextType?: 'REMINDER_REPLY' | 'POST_REMINDER' | 'NORMAL'; // コンテキストタイプ
}

// 活動ログ作成用（ID等は自動生成）
export interface CreateActivityLogRequest {
  userId: string;
  content: string;
  inputTimestamp: string;
  businessDate: string;
  
  // リアルタイム分析結果（オプション）
  startTime?: string;
  endTime?: string;
  totalMinutes?: number;
  confidence?: number;
  analysisMethod?: string;
  categories?: string;
  analysisWarnings?: string;


  // リマインダーReply機能（オプション）
  isReminderReply?: boolean;
  timeRangeStart?: string;
  timeRangeEnd?: string;
  contextType?: 'REMINDER_REPLY' | 'POST_REMINDER' | 'NORMAL';
}

// 統合分析結果の型定義
export interface DailyAnalysisResult {
  businessDate: string;
  totalLogCount: number;
  categories: CategorySummary[];
  timeline: TimelineEntry[];
  timeDistribution: TimeDistribution;
  insights: AnalysisInsight;
  warnings: AnalysisWarning[];
  generatedAt: string;
}

// カテゴリ別サマリー
export interface CategorySummary {
  category: string;
  subCategory?: string;
  estimatedMinutes: number;
  confidence: number;        // AIの推定信頼度（0-1）
  logCount: number;          // このカテゴリに分類されたログ数
  representativeActivities: string[]; // 代表的な活動内容
}

// タイムライン要素
export interface TimelineEntry {
  startTime: string;         // 推定開始時刻（ISO 8601）
  endTime: string;           // 推定終了時刻（ISO 8601）
  category: string;
  subCategory?: string;
  content: string;           // 活動内容
  confidence: number;        // AIの時間推定信頼度（0-1）
  sourceLogIds: string[];    // 元になったログのID群
}

// 時間分布情報
export interface TimeDistribution {
  totalEstimatedMinutes: number;
  workingMinutes: number;
  breakMinutes: number;
  unaccountedMinutes: number; // 記録されていない時間
  overlapMinutes: number;     // 重複している時間
}

// 分析による洞察
export interface AnalysisInsight {
  productivityScore: number; // 生産性スコア（0-100）
  workBalance: WorkBalance;   // 作業バランス
  suggestions: string[];      // 改善提案
  highlights: string[];       // 今日のハイライト
  motivation: string;         // 励ましメッセージ
}

// 作業バランス情報
export interface WorkBalance {
  focusTimeRatio: number;     // 集中作業時間の割合
  meetingTimeRatio: number;   // 会議時間の割合
  breakTimeRatio: number;     // 休憩時間の割合
  adminTimeRatio: number;     // 管理業務時間の割合
}

// エラー詳細情報の型定義
export interface ErrorDetails {
  /** エラーの原因となったデータ */
  sourceData?: unknown;
  /** エラーが発生した処理段階 */
  stage?: string;
  /** 関連するIDや識別子 */
  relatedIds?: string[];
  /** エラーコード */
  errorCode?: string;
  /** スタックトレース情報 */
  stackTrace?: string;
  /** エラーオブジェクト */
  error?: unknown;
  /** スキーマパス */
  schemaPath?: string;
  /** ユーザーID */
  userId?: string;
  /** 操作名 */
  operation?: string;
  /** 時刻情報 */
  timestamp?: string;
  /** ログID */
  logId?: string;
  /** タイムゾーン */
  timezone?: string;
  /** 追加のコンテキスト情報 */
  context?: Record<string, string | number | boolean>;
  /** その他の詳細情報 */
  [key: string]: unknown;
}

// 分析警告詳細情報の型定義
export interface AnalysisWarningDetails {
  /** 警告が発生したログID */
  logId?: string;
  /** 警告が発生した時刻 */
  timestamp?: string;
  /** 影響を受けるデータの範囲 */
  affectedRange?: {
    startTime?: string;
    endTime?: string;
  };
  /** 推奨される修正アクション */
  suggestedFix?: string;
  /** 信頼度の値 */
  confidenceValue?: number;
  /** 重複している時間（分） */
  overlapMinutes?: number;
  /** 空白の時間（分） */
  gapMinutes?: number;
  /** その他の詳細情報 */
  [key: string]: unknown;
}

// 分析警告・注意事項
export interface AnalysisWarning {
  type: WarningType;
  level: WarningLevel;
  message: string;
  details: AnalysisWarningDetails;
}

export type WarningType = 
  | 'time_overlap'        // 時間重複
  | 'time_gap'            // 時間の空白
  | 'inconsistent_input'  // 矛盾した入力
  | 'low_confidence'      // 低信頼度推定
  | 'excessive_work_time' // 長時間労働
  | 'insufficient_breaks'; // 休憩不足

export enum WarningLevel {
  /** 情報レベル */
  INFO = 'info',
  /** 警告レベル */
  WARNING = 'warning',
  /** エラーレベル */
  ERROR = 'error'
}

// 時間範囲
export interface TimeRange {
  startTime: string;
  endTime: string;
  description?: string;
}

// 分析キャッシュ情報
export interface AnalysisCache {
  id: string;
  userId: string;
  businessDate: string;
  analysisResult: DailyAnalysisResult;
  logCount: number;
  generatedAt: string;
}

// 分析キャッシュ作成用
export interface CreateAnalysisCacheRequest {
  userId: string;
  businessDate: string;
  analysisResult: DailyAnalysisResult;
  logCount: number;
}

// ログ編集用のリクエスト
export interface EditLogRequest {
  logId: string;
  newContent: string;
  timezone: string;
}

// ログ削除用のリクエスト
export interface DeleteLogRequest {
  logId: string;
  timezone: string;
}

// 統合分析のリクエスト
export interface AnalysisRequest {
  userId: string;
  businessDate: string;
  timezone: string;
  forceRefresh?: boolean;    // キャッシュを無視して再分析
}

// Gemini APIへの分析リクエスト用
export interface GeminiAnalysisRequest {
  logs: ActivityLog[];
  timezone: string;
  businessDate: string;
  currentTime: string;       // 分析実行時刻
}

// Gemini APIからの分析レスポンス用
export interface GeminiAnalysisResponse {
  categories: CategorySummary[];
  timeline: TimelineEntry[];
  timeDistribution: TimeDistribution;
  insights: AnalysisInsight;
  warnings: AnalysisWarning[];
  confidence: number;        // 全体の分析信頼度
}

// エラー型定義
export class ActivityLogError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: ErrorDetails
  ) {
    super(message);
    this.name = 'ActivityLogError';
  }
}

// 業務日計算のユーティリティ型
export interface BusinessDateInfo {
  businessDate: string;      // YYYY-MM-DD形式
  startTime: string;         // 業務日開始時刻（5am UTC）
  endTime: string;           // 業務日終了時刻（翌日4:59am UTC）
  timezone: string;
}

// 統計情報（デバッグ・監視用）
export interface SystemStats {
  totalLogs: number;
  totalUsers: number;
  cacheHitRate: number;
  averageLogsPerDay: number;
  averageAnalysisTime: number;
  lastAnalysisTime: string;
}

