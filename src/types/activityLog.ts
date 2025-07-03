/**
 * 新活動記録システム用型定義
 * 自然言語ログ方式に対応
 */

// 開始・終了ログマッチング用の型定義
export type LogType = 'complete' | 'start_only' | 'end_only';
export type MatchStatus = 'unmatched' | 'matched' | 'ignored';

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

  // 開始・終了ログマッチング機能（新機能）
  logType?: LogType;         // ログの種類（complete/start_only/end_only）
  matchStatus?: MatchStatus; // マッチング状態（unmatched/matched/ignored）
  matchedLogId?: string;     // マッチング相手のログID
  activityKey?: string;      // 活動内容の分類キー（マッチング用）
  similarityScore?: number;  // マッチング時の類似度スコア
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

  // 開始・終了ログマッチング機能（オプション）
  logType?: LogType;
  matchStatus?: MatchStatus;
  matchedLogId?: string;
  activityKey?: string;
  similarityScore?: number;
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

// 分析警告・注意事項
export interface AnalysisWarning {
  type: WarningType;
  level: WarningLevel;
  message: string;
  details: Record<string, any>;
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
    public details?: any
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

// === 開始・終了ログマッチング関連の型定義 ===

// マッチング候補
export interface MatchingCandidate {
  logId: string;
  score: number;
  reason: string;
  confidence: number;
}

// マッチング結果
export interface MatchingResult {
  startLog: ActivityLog;
  endLog: ActivityLog;
  matchScore: number;
  confidence: number;
  durationMinutes: number;
  warnings?: string[];
}

// マッチング戦略設定
export interface MatchingStrategy {
  // 時間的制約
  maxDurationHours: number;      // 最大作業時間（24時間）
  maxGapDays: number;            // 最大日数差（2日）
  
  // 類似性判定
  minSimilarityScore: number;    // 最小類似度スコア（0.6）
  keywordWeight: number;         // キーワード一致の重み（0.4）
  semanticWeight: number;        // 意味的類似性の重み（0.6）
  
  // マッチング優先度
  timeProximityWeight: number;   // 時間の近さの重み（0.3）
  contentSimilarityWeight: number; // 内容類似性の重み（0.7）
}

// ログタイプ分析リクエスト
export interface LogTypeAnalysisRequest {
  content: string;
  inputTimestamp: string;
  timezone: string;
}

// ログタイプ分析レスポンス
export interface LogTypeAnalysisResponse {
  logType: LogType;
  confidence: number;
  extractedTime?: string;
  activityKey: string;
  keywords: string[];
  reasoning: string;
}

// マッチング分析リクエスト
export interface MatchingAnalysisRequest {
  startLog: ActivityLog;
  endCandidates: ActivityLog[];
  timezone: string;
}

// マッチング分析レスポンス
export interface MatchingAnalysisResponse {
  bestMatch?: {
    logId: string;
    confidence: number;
    reasoning: string;
  };
  alternatives: {
    logId: string;
    confidence: number;
    reasoning: string;
  }[];
  warnings: string[];
}

// マッチング済み活動エントリ
export interface MatchedActivityEntry {
  startTime: string;
  endTime: string;
  duration: number;
  activity: string;
  confidence: number;
  matchType: 'auto' | 'manual';
}

// 未マッチログの警告
export interface UnmatchedWarning {
  logId: string;
  logType: LogType;
  content: string;
  timestamp: string;
  suggestions: string[];
}