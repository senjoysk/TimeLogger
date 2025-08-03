/**
 * リアルタイム活動解析システムの型定義
 * 入力時点での詳細な時刻・活動分析を行うための型
 * 
 * @SRP-EXCEPTION: リアルタイム解析に必要なすべての型定義を統合
 * @SRP-REASON: 相互依存する複雑な型定義群を一箇所で管理することで型の整合性を保証
 */

// ===== 入力データ型 =====

/**
 * 分析入力データ
 */
export interface AnalysisInput {
  /** 元の入力文字列 */
  userInput: string;
  /** ユーザーID */
  userId: string;
  /** ユーザーのタイムゾーン */
  timezone: string;
  /** 入力時刻 */
  inputTimestamp: Date;
  /** 最近の活動コンテキスト */
  context: RecentActivityContext;
}

/**
 * 最近の活動コンテキスト
 */
export interface RecentActivityContext {
  /** 直近のログ（重複検出用） */
  recentLogs: RecentActivityLog[];
  /** ユーザーの記録パターン */
  userPatterns?: UserPattern[];
  /** 現在のセッション情報 */
  currentSession?: SessionInfo;
}

/**
 * 最近の活動ログ（簡略版）
 */
export interface RecentActivityLog {
  id: string;
  content: string;
  startTime?: string;
  endTime?: string;
  inputTimestamp: string;
  category?: string;
}

// 学習された値の型定義
export interface LearnedValue {
  /** 時間表現パターンの値 */
  timeValue?: {
    start?: string;
    end?: string;
    duration?: number;
  };
  /** 活動期間パターンの値 */
  durationValue?: {
    typical: number; // 分
    minimum: number;
    maximum: number;
  };
  /** 作業スケジュールパターンの値 */
  scheduleValue?: {
    startTime: string;
    endTime: string;
    breakTimes?: string[];
  };
  /** その他の値 */
  rawValue?: string | number | boolean;
}

/**
 * ユーザーの記録パターン
 */
export interface UserPattern {
  /** パターンタイプ */
  type: 'time_expression' | 'activity_duration' | 'work_schedule';
  /** パターン */
  pattern: string;
  /** 学習された値 */
  learnedValue: LearnedValue;
  /** 信頼度 */
  confidence: number;
  /** 最終更新日 */
  lastUpdated: Date;
}

/**
 * セッション情報
 */
export interface SessionInfo {
  /** セッション開始時刻 */
  startTime: string;
  /** タイムゾーン */
  timezone: string;
  /** アクティブセッション時間（分） */
  activeSessionMinutes: number;
  /** セッションタイプ */
  type?: 'work' | 'break' | 'meeting' | 'focus';
}

// ===== 出力データ型 =====

/**
 * 詳細活動解析結果
 */
export interface DetailedActivityAnalysis {
  /** 時刻分析結果 */
  timeAnalysis: TimeAnalysisResult;
  /** 活動詳細リスト */
  activities: ActivityDetail[];
  /** 全体的な信頼度 (0-1) */
  confidence: number;
  /** 警告・注意事項 */
  warnings: AnalysisWarning[];
  /** メタ情報 */
  metadata: AnalysisMetadata;
  /** 分析サマリー */
  summary: string;
  /** 推奨事項 */
  recommendations: string[];
}

/**
 * 時刻分析結果
 */
export interface TimeAnalysisResult {
  /** 開始時刻 (ISO 8601 UTC) */
  startTime: string;
  /** 終了時刻 (ISO 8601 UTC) */
  endTime: string;
  /** 総時間（分） */
  totalMinutes: number;
  /** 時刻推定の信頼度 (0-1) */
  confidence: number;
  /** 抽出方法 */
  method: TimeExtractionMethod;
  /** 使用したタイムゾーン */
  timezone: string;
  /** 抽出された時刻コンポーネント */
  extractedComponents: ParsedTimeComponent[];
  /** デバッグ情報 */
  debugInfo?: TimeAnalysisDebugInfo;
}

/**
 * 時刻抽出方法
 */
export enum TimeExtractionMethod {
  /** 明示的指定: "14:00-15:30" */
  EXPLICIT = 'explicit',
  /** 相対指定: "さっき1時間" */
  RELATIVE = 'relative',
  /** 推定: "午前中" */
  INFERRED = 'inferred',
  /** コンテキストベース: 前後のログから推定 */
  CONTEXTUAL = 'contextual'
}

// 正規化された値の型定義
export interface NormalizedValue {
  /** 時刻値（ISO 8601形式） */
  timeValue?: string;
  /** 期間値（分） */
  durationMinutes?: number;
  /** 数値 */
  numericValue?: number;
  /** 真偽値 */
  booleanValue?: boolean;
  /** 文字列値 */
  stringValue?: string;
}

/**
 * 解析された時刻コンポーネント
 */
export interface ParsedTimeComponent {
  /** コンポーネントタイプ */
  type: TimeComponentType;
  /** 抽出された値 */
  value: string;
  /** 正規化された値 */
  normalizedValue?: NormalizedValue;
  /** 信頼度 */
  confidence: number;
  /** 文字列内の位置 */
  position: {
    start: number;
    end: number;
  };
}

/**
 * 時刻コンポーネントタイプ
 */
export enum TimeComponentType {
  /** 開始時刻 */
  START_TIME = 'start_time',
  /** 終了時刻 */
  END_TIME = 'end_time',
  /** 継続時間 */
  DURATION = 'duration',
  /** 相対時刻 */
  RELATIVE_TIME = 'relative_time',
  /** 時間帯 */
  TIME_PERIOD = 'time_period'
}

/**
 * 時刻分析デバッグ情報
 */
export interface TimeAnalysisDebugInfo {
  /** 検出されたパターン */
  detectedPatterns: string[];
  /** Geminiからの生レスポンス */
  geminiRawResponse?: string;
  /** 処理時間（ミリ秒） */
  processingTimeMs: number;
  /** 使用したプロンプト */
  usedPrompt?: string;
}

/**
 * 活動詳細
 */
export interface ActivityDetail {
  /** 活動内容 */
  content: string;
  /** メインカテゴリ */
  category: string;
  /** サブカテゴリ */
  subCategory?: string;
  /** この活動の時間比率 (0-100) */
  timePercentage: number;
  /** 実際の分数 */
  actualMinutes: number;
  /** 活動の優先度 */
  priority: ActivityPriority;
  /** この活動分析の信頼度 (0-1) */
  confidence: number;
  /** 活動の開始時刻 (ISO 8601 UTC) */
  startTime?: string;
  /** 活動の終了時刻 (ISO 8601 UTC) */
  endTime?: string;
}

/**
 * 活動優先度
 */
export enum ActivityPriority {
  /** 主要活動 */
  PRIMARY = 'primary',
  /** 副次活動 */
  SECONDARY = 'secondary',
  /** バックグラウンド活動 */
  BACKGROUND = 'background'
}

// リアルタイム分析警告詳細情報の型定義
export interface RealTimeAnalysisWarningDetails {
  /** 警告が発生した時刻 */
  timestamp?: string;
  /** 信頼度の値 */
  confidenceValue?: number;
  /** 信頼度 */
  confidence?: number;
  /** 分析に失敗した要素 */
  failedElement?: string;
  /** 推定された時間範囲 */
  estimatedRange?: {
    start?: string;
    end?: string;
  };
  /** 重複している時間 */
  overlapInfo?: {
    conflictWith?: string;
    overlapMinutes?: number;
  };
  /** 入力解析の詳細 */
  inputAnalysis?: {
    originalText?: string;
    parsedElements?: string[];
    unparsedText?: string;
  };
  /** その他の詳細情報 */
  [key: string]: unknown;
}

/**
 * 分析警告
 */
export interface AnalysisWarning {
  /** 警告タイプ */
  type: WarningType;
  /** 警告レベル */
  level: WarningLevel;
  /** 警告メッセージ */
  message: string;
  /** 詳細情報 */
  details: RealTimeAnalysisWarningDetails;
}


/**
 * 分析メタデータ
 */
export interface AnalysisMetadata {
  /** 処理時間（ミリ秒） */
  processingTimeMs: number;
  /** 分析手法 */
  analysisMethod: string;
  /** コンポーネントバージョン */
  componentVersions: {
    timeExtractor: string;
    activityAnalyzer: string;
    consistencyValidator: string;
  };
  /** 入力特性 */
  inputCharacteristics: {
    length: number;
    hasExplicitTime: boolean;
    hasMultipleActivities: boolean;
    complexityLevel: 'simple' | 'medium' | 'complex';
  };
  /** 品質指標 */
  qualityMetrics: {
    timeExtractionConfidence: number;
    averageActivityConfidence: number;
    validationScore: number;
    warningCount: number;
  };
}

// ===== 内部処理用型 =====

/**
 * Gemini分析レスポンス
 */
export interface GeminiTimeAnalysisResponse {
  /** 抽出された時刻情報 */
  timeInfo: {
    startTime: string;
    endTime: string;
    confidence: number;
    method: string;
    timezone: string;
  };
  /** 活動詳細 */
  activities: {
    content: string;
    category: string;
    subCategory?: string;
    timePercentage: number;
    priority: string;
    confidence: number;
  }[];
  /** 分析詳細 */
  analysis: {
    hasParallelActivities: boolean;
    complexityLevel: 'simple' | 'medium' | 'complex';
    totalPercentage: number;
    extractedPatterns: string[];
  };
  /** 警告 */
  warnings?: {
    type: string;
    severity: string;
    message: string;
  }[];
}

// パターンマッチング結果の型定義
export interface PatternMatchResult {
  /** 開始時刻（時） */
  startHour?: number;
  /** 開始時刻（分） */
  startMinute?: number;
  /** 終了時刻（時） */
  endHour?: number;
  /** 終了時刻（分） */
  endMinute?: number;
  /** 継続時間（分） */
  durationMinutes?: number;
  /** 相対時刻（分前） */
  relativeMinutes?: number;
  /** 時間帯タイプ */
  periodType?: string;
  /** 時刻情報 */
  timeInfo?: {
    start?: string;
    end?: string;
    duration?: number;
  };
  /** マッチしたキーワード */
  keywords?: string[];
  /** 抽出された数値 */
  numbers?: number[];
  /** 抽出された単位 */
  units?: string[];
  /** 追加情報 */
  additional?: Record<string, unknown>;
  /** その他の情報 */
  metadata?: Record<string, string | number | boolean>;
}

/**
 * 時刻パターンマッチング結果
 */
export interface TimePatternMatch {
  /** マッチしたパターン名 */
  patternName: string;
  /** パターン名（代替形式） */
  name?: string;
  /** マッチした内容 */
  match: string;
  /** キャプチャグループ */
  groups: string[];
  /** パース結果 */
  parsed?: PatternMatchResult;
  /** パース結果（代替形式） */
  parsedInfo?: PatternMatchResult;
  /** 信頼度 */
  confidence: number;
  /** 文字列内の位置 */
  position: {
    start: number;
    end: number;
  };
}

/**
 * コンテキスト調整結果
 */
export interface ContextualAdjustment {
  /** 調整前の時刻 */
  original: TimeAnalysisResult;
  /** 調整後の時刻 */
  adjusted: TimeAnalysisResult;
  /** 調整理由 */
  adjustmentReason: string;
  /** 調整の信頼度 */
  adjustmentConfidence: number;
}

// ===== エラー型 =====

// リアルタイム分析エラー詳細情報の型定義
export interface RealTimeAnalysisErrorDetails {
  /** エラーの原因となった入力 */
  input?: string;
  /** エラーが発生した分析段階 */
  analysisStage?: 'input_validation' | 'time_extraction' | 'activity_analysis' | 'consistency_check' | 'output_generation';
  /** AI分析のレスポンス */
  aiResponse?: string;
  /** 関連するタイムスタンプ */
  timestamp?: string;
  /** 関連するユーザーID */
  userId?: string;
  /** エラーオブジェクト */
  error?: unknown;
  /** 分析のコンテキスト情報 */
  context?: {
    timezone?: string;
    sessionInfo?: string;
    recentLogs?: string[];
  };
  /** パフォーマンス情報 */
  performance?: {
    processingTimeMs?: number;
    memoryUsage?: number;
  };
  /** ネットワークエラー情報 */
  networkInfo?: {
    endpoint?: string;
    statusCode?: number;
    responseTime?: number;
  };
  /** その他の詳細情報 */
  [key: string]: unknown;
}

/**
 * リアルタイム分析エラー
 */
export class RealTimeAnalysisError extends Error {
  constructor(
    message: string,
    public code: RealTimeAnalysisErrorCode,
    public details?: RealTimeAnalysisErrorDetails
  ) {
    super(message);
    this.name = 'RealTimeAnalysisError';
  }
}

/**
 * リアルタイム分析エラーコード
 */
export enum RealTimeAnalysisErrorCode {
  /** 無効な入力 */
  INVALID_INPUT = 'INVALID_INPUT',
  /** 時刻抽出失敗 */
  TIME_EXTRACTION_FAILED = 'TIME_EXTRACTION_FAILED',
  /** AI分析失敗 */
  AI_ANALYSIS_FAILED = 'AI_ANALYSIS_FAILED',
  /** コンテキスト読み込み失敗 */
  CONTEXT_LOAD_FAILED = 'CONTEXT_LOAD_FAILED',
  /** タイムゾーン変換失敗 */
  TIMEZONE_CONVERSION_FAILED = 'TIMEZONE_CONVERSION_FAILED',
  /** データ保存失敗 */
  DATA_SAVE_FAILED = 'DATA_SAVE_FAILED',
  /** 検証失敗 */
  VALIDATION_FAILED = 'VALIDATION_FAILED'
}

// ===== 警告・エラー管理 =====

/**
 * 警告タイプ
 */
export enum WarningType {
  /** 時刻の整合性エラー */
  TIME_INCONSISTENCY = 'TIME_INCONSISTENCY',
  /** 時間計算エラー */
  TIME_CALCULATION_ERROR = 'TIME_CALCULATION_ERROR',
  /** 疑わしい活動時間 */
  DURATION_SUSPICIOUS = 'DURATION_SUSPICIOUS',
  /** 信頼度の低下 */
  LOW_CONFIDENCE = 'LOW_CONFIDENCE',
  /** 時間配分エラー */
  TIME_DISTRIBUTION_ERROR = 'TIME_DISTRIBUTION_ERROR',
  /** 活動時間の疑問 */
  ACTIVITY_DURATION_SUSPICIOUS = 'ACTIVITY_DURATION_SUSPICIOUS',
  /** 重複する時間エントリ */
  DUPLICATE_TIME_ENTRY = 'DUPLICATE_TIME_ENTRY',
  /** 時間重複 */
  TIME_OVERLAP = 'TIME_OVERLAP',
  /** 入力と分析の不一致 */
  INPUT_ANALYSIS_MISMATCH = 'INPUT_ANALYSIS_MISMATCH',
  /** 内容分析の不完全 */
  CONTENT_ANALYSIS_INCOMPLETE = 'CONTENT_ANALYSIS_INCOMPLETE',
  /** 並列活動の衝突 */
  PARALLEL_ACTIVITY_CONFLICT = 'PARALLEL_ACTIVITY_CONFLICT',
  /** 非現実的な時間配分 */
  TIME_DISTRIBUTION_UNREALISTIC = 'TIME_DISTRIBUTION_UNREALISTIC',
  /** 一般的な分析失敗 */
  ANALYSIS_FAILED = 'ANALYSIS_FAILED'
}

/**
 * 警告レベル
 */
export enum WarningLevel {
  /** 情報レベル */
  INFO = 'info',
  /** 警告レベル */
  WARNING = 'warning',
  /** エラーレベル */
  ERROR = 'error'
}

