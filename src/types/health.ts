/**
 * システムヘルス監視関連の型定義
 */

/**
 * システムヘルスステータス
 */
export interface HealthStatus {
  /** 全体的な健全性 */
  healthy: boolean;
  
  /** 各項目のチェック結果 */
  checks: {
    /** Discord接続状態 */
    discordReady: boolean;
    
    /** 活動記録システム初期化状態 */
    activityLoggingInitialized: boolean;
    
    /** データベース接続状態 */
    databaseConnected: boolean;
    
    /** その他のチェック項目 */
    [key: string]: boolean;
  };
  
  /** エラー詳細 */
  details?: {
    /** エラー情報 */
    errors?: string[];
    
    /** 初期化状態 */
    initialized?: boolean;
    
    /** データベース接続状態 */
    database?: boolean;
    
    /** サービス準備状態 */
    services?: boolean;
    
    /** ハンドラー準備状態 */
    handlers?: boolean;
    
    /** その他の詳細情報 */
    [key: string]: any;
  };
  
  /** チェック実行時刻 */
  timestamp?: Date;
}

/**
 * システム回復試行結果
 */
export interface RecoveryAttemptResult {
  /** 回復成功フラグ */
  success: boolean;
  
  /** 回復試行の詳細 */
  details: string;
  
  /** 実行したアクション */
  actions: string[];
  
  /** エラー情報（失敗時） */
  error?: string;
}