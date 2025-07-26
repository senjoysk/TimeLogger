/**
 * コストアラート関連の型定義
 */

/**
 * アラートレベル
 */
export type AlertLevel = 'info' | 'warning' | 'critical';

/**
 * コストアラート情報
 */
export interface CostAlert {
  /** アラートレベル */
  level: AlertLevel;
  /** アラートメッセージ */
  message: string;
}