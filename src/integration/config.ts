/**
 * 活動記録システム統合設定
 */

/**
 * 活動記録システム統合設定インターフェース
 */
export interface ActivityLoggingConfig {
  /** データベースパス */
  databasePath: string;
  /** Google Gemini APIキー */
  geminiApiKey: string;
  /** デバッグモード */
  debugMode: boolean;
  /** タイムゾーン（デフォルト） */
  defaultTimezone: string;
  /** 自動分析の有効化 */
  enableAutoAnalysis: boolean;
  /** キャッシュ有効期間（分） */
  cacheValidityMinutes: number;
  /** 対象ユーザーID（レガシー設定・将来削除予定） */
  targetUserId: string;
  /** 外部リポジトリの注入（テスト用） */
  repository?: any;
  /** バージョン情報 */
  version?: string;
  /** TimeProviderの注入（テスト用） */
  timeProvider?: any;
}

/**
 * デフォルト設定を生成
 */
export function createDefaultConfig(databasePath: string, geminiApiKey: string): ActivityLoggingConfig {
  return {
    databasePath,
    geminiApiKey,
    debugMode: process.env.NODE_ENV !== 'production',
    defaultTimezone: 'Asia/Tokyo',
    enableAutoAnalysis: true,
    cacheValidityMinutes: 60,
    targetUserId: '' // マルチユーザー対応により削除（レガシー設定）
  };
}

/**
 * 活動記録システム統合のファクトリー関数
 */
export async function createActivityLoggingIntegration(config: ActivityLoggingConfig): Promise<any> {
  const { ActivityLoggingIntegration } = await import('./activityLoggingIntegration');
  const { PartialCompositeRepository } = await import('../repositories/PartialCompositeRepository');
  
  const repository = new PartialCompositeRepository(config.databasePath);
  const integration = new ActivityLoggingIntegration(repository, config);
  await integration.initialize();
  return integration;
}