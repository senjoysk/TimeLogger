/**
 * 活動記録システム統合エントリーポイント
 * 既存Botに活動記録システムを簡単に統合するためのファサード
 */

// 活動記録システム統合クラス
export { 
  ActivityLoggingIntegration,
  IActivityLoggingIntegration
} from './activityLoggingIntegration';

// 設定関連
export {
  ActivityLoggingConfig,
  createDefaultConfig,
  createActivityLoggingIntegration 
} from './config';

export { 
  SystemMigrator, 
  MigrationConfig, 
  MigrationStats,
  createDefaultMigrationConfig,
  runMigration 
} from './systemMigrator';

import { Client } from 'discord.js';
import { ActivityLoggingIntegration } from './activityLoggingIntegration';
import { 
  ActivityLoggingConfig, 
  createDefaultConfig 
} from './config';
import { config } from '../config';
import { DATABASE_PATHS } from '../database/simplePathConfig';
import { logger } from '../utils/logger';

/**
 * 既存BotClientに活動記録システムを統合する便利関数
 */
export async function integrateActivityLogging(
  discordClient: Client,
  customConfig?: Partial<ActivityLoggingConfig>
): Promise<ActivityLoggingIntegration> {
  try {
    logger.info('INTEGRATION', '🚀 活動記録システム統合を開始...');

    // デフォルト設定を生成（統一DBパスを使用）
    const defaultConfig = createDefaultConfig(
      config.database?.path || DATABASE_PATHS.getMainDatabasePath(),
      config.gemini?.apiKey || process.env.GEMINI_API_KEY || ''
    );

    // カスタム設定をマージ
    const finalConfig: ActivityLoggingConfig = {
      ...defaultConfig,
      ...customConfig
    };

    // 設定の検証
    if (!finalConfig.geminiApiKey) {
      throw new Error('Gemini APIキーが設定されていません');
    }

    if (!finalConfig.databasePath) {
      throw new Error('データベースパスが設定されていません');
    }

    // リポジトリを作成
    const { PartialCompositeRepository } = await import('../repositories/PartialCompositeRepository');
    const repository = new PartialCompositeRepository(finalConfig.databasePath);
    
    // V2版の活動記録システムを初期化
    const integration = new ActivityLoggingIntegration(repository, finalConfig);
    await integration.initialize();

    // Discord Botに統合
    integration.integrateWithBot(discordClient);

    logger.info('INTEGRATION', '✅ 活動記録システム統合完了！');
    
    // ヘルスチェックを実行
    const healthCheck = await integration.healthCheck();
    if (!healthCheck.healthy) {
      logger.warn('INTEGRATION', '⚠️ システムヘルスチェックで問題が検出されました', { details: healthCheck.details });
    }

    return integration;

  } catch (error) {
    logger.error('INTEGRATION', '❌ 活動記録システム統合エラー:', error as Error);
    throw error;
  }
}

/**
 * 開発・テスト用の簡易起動関数
 */
export async function createTestIntegration(
  databasePath?: string,
  geminiApiKey?: string
): Promise<ActivityLoggingIntegration> {
  const testConfig = createDefaultConfig(
    databasePath || DATABASE_PATHS.getMainDatabasePath(),
    geminiApiKey || process.env.GEMINI_API_KEY || 'test-key'
  );

  // テスト用設定
  testConfig.debugMode = true;
  testConfig.enableAutoAnalysis = false; // テスト中は自動分析を無効

  // リポジトリを作成
  const { PartialCompositeRepository } = await import('../repositories/PartialCompositeRepository');
  const repository = new PartialCompositeRepository(testConfig.databasePath);
  
  // V2版の活動記録システムを初期化
  const integration = new ActivityLoggingIntegration(repository, testConfig);
  await integration.initialize();
  
  return integration;
}

/**
 * 設定ファイルから統合設定を読み込み
 */
export function loadConfigFromEnv(): ActivityLoggingConfig {
  return {
    databasePath: process.env.DATABASE_PATH || DATABASE_PATHS.getMainDatabasePath(),
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    debugMode: process.env.NODE_ENV !== 'production',
    defaultTimezone: process.env.DEFAULT_TIMEZONE || 'Asia/Tokyo',
    enableAutoAnalysis: process.env.ENABLE_AUTO_ANALYSIS !== 'false',
    cacheValidityMinutes: parseInt(process.env.CACHE_VALIDITY_MINUTES || '60'),
    targetUserId: '' // マルチユーザー対応により削除（レガシー設定）
  };
}

/**
 * システム統計を取得する便利関数
 */
export async function getSystemOverview(integration: ActivityLoggingIntegration): Promise<{
  health: Record<string, unknown>;
  stats: Record<string, unknown>;
  config: ActivityLoggingConfig;
}> {
  const [health, stats] = await Promise.all([
    integration.healthCheck(),
    integration.getSystemStats()
  ]);

  return {
    health: health as unknown as Record<string, unknown>,
    stats,
    config: integration.getConfig()
  };
}

/**
 * 緊急時のシステム停止
 */
export async function emergencyShutdown(integration: ActivityLoggingIntegration): Promise<void> {
  try {
    logger.info('INTEGRATION', '🚨 緊急シャットダウンを実行中...');
    await integration.shutdown();
    logger.info('INTEGRATION', '✅ 緊急シャットダウン完了');
  } catch (error) {
    logger.error('INTEGRATION', '❌ 緊急シャットダウンエラー:', error as Error);
    throw error;
  }
}

/**
 * 使用例のコメント
 * 
 * 既存のbot.tsファイルで以下のように使用:
 * 
 * ```typescript
 * import { Client } from 'discord.js';
 * import { integrateNewSystem } from './integration';
 * import { logger } from '../utils/logger';
 * 
 * const client = new Client({ ... });
 * 
 * client.once('ready', async () => {
 *   logger.info('BOT', 'Bot is ready!');
 *   
 *   // 新システムを統合
 *   try {
 *     const integration = await integrateNewSystem(client, {
 *       debugMode: true,
 *       enableAutoAnalysis: true
 *     });
 *     
 *     logger.info('INTEGRATION', 'New system integrated successfully!');
 *   } catch (error) {
 *     logger.error('INTEGRATION', 'Failed to integrate new system:', error);
 *   }
 * });
 * 
 * client.login(process.env.DISCORD_TOKEN);
 * ```
 */