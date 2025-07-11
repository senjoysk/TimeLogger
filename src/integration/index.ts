/**
 * 活動記録システム統合エントリーポイント
 * 既存Botに活動記録システムを簡単に統合するためのファサード
 */

export { 
  ActivityLoggingIntegration, 
  ActivityLoggingConfig,
  createDefaultConfig,
  createActivityLoggingIntegration 
} from './activityLoggingIntegration';

export { 
  SystemMigrator, 
  MigrationConfig, 
  MigrationStats,
  createDefaultMigrationConfig,
  runMigration 
} from './systemMigrator';

import { Client } from 'discord.js';
import { 
  ActivityLoggingIntegration, 
  ActivityLoggingConfig, 
  createDefaultConfig 
} from './activityLoggingIntegration';
import { config } from '../config';
import { DATABASE_PATHS } from '../database/simplePathConfig';

/**
 * 既存BotClientに活動記録システムを統合する便利関数
 */
export async function integrateActivityLogging(
  discordClient: Client,
  customConfig?: Partial<ActivityLoggingConfig>
): Promise<ActivityLoggingIntegration> {
  try {
    console.log('🚀 活動記録システム統合を開始...');

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

    // 活動記録システムを初期化
    const integration = new ActivityLoggingIntegration(finalConfig);
    await integration.initialize();

    // Discord Botに統合
    integration.integrateWithBot(discordClient);

    console.log('✅ 活動記録システム統合完了！');
    
    // ヘルスチェックを実行
    const healthCheck = await integration.healthCheck();
    if (!healthCheck.healthy) {
      console.warn('⚠️ システムヘルスチェックで問題が検出されました:', healthCheck.details);
    }

    return integration;

  } catch (error) {
    console.error('❌ 活動記録システム統合エラー:', error);
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

  const integration = new ActivityLoggingIntegration(testConfig);
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
  health: any;
  stats: any;
  config: ActivityLoggingConfig;
}> {
  const [health, stats] = await Promise.all([
    integration.healthCheck(),
    integration.getSystemStats()
  ]);

  return {
    health,
    stats,
    config: integration.getConfig()
  };
}

/**
 * 緊急時のシステム停止
 */
export async function emergencyShutdown(integration: ActivityLoggingIntegration): Promise<void> {
  try {
    console.log('🚨 緊急シャットダウンを実行中...');
    await integration.shutdown();
    console.log('✅ 緊急シャットダウン完了');
  } catch (error) {
    console.error('❌ 緊急シャットダウンエラー:', error);
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
 * 
 * const client = new Client({ ... });
 * 
 * client.once('ready', async () => {
 *   console.log('Bot is ready!');
 *   
 *   // 新システムを統合
 *   try {
 *     const integration = await integrateNewSystem(client, {
 *       debugMode: true,
 *       enableAutoAnalysis: true
 *     });
 *     
 *     console.log('New system integrated successfully!');
 *   } catch (error) {
 *     console.error('Failed to integrate new system:', error);
 *   }
 * });
 * 
 * client.login(process.env.DISCORD_TOKEN);
 * ```
 */