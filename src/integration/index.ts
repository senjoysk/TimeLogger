/**
 * 新活動記録システム統合エントリーポイント
 * 既存Botに新システムを簡単に統合するためのファサード
 */

export { 
  NewSystemIntegration, 
  IntegrationConfig,
  createDefaultConfig,
  createNewSystemIntegration 
} from './newSystemIntegration';

export { 
  SystemMigrator, 
  MigrationConfig, 
  MigrationStats,
  createDefaultMigrationConfig,
  runMigration 
} from './systemMigrator';

import { Client } from 'discord.js';
import { 
  NewSystemIntegration, 
  IntegrationConfig, 
  createDefaultConfig 
} from './newSystemIntegration';
import { config } from '../config';

/**
 * 既存BotClientに新システムを統合する便利関数
 */
export async function integrateNewSystem(
  discordClient: Client,
  customConfig?: Partial<IntegrationConfig>
): Promise<NewSystemIntegration> {
  try {
    console.log('🚀 新活動記録システム統合を開始...');

    // デフォルト設定を生成
    const defaultConfig = createDefaultConfig(
      config.database?.path || './data/tasks.db',
      config.gemini?.apiKey || process.env.GEMINI_API_KEY || ''
    );

    // カスタム設定をマージ
    const finalConfig: IntegrationConfig = {
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

    // 新システムを初期化
    const integration = new NewSystemIntegration(finalConfig);
    await integration.initialize();

    // Discord Botに統合
    integration.integrateWithBot(discordClient);

    console.log('✅ 新活動記録システム統合完了！');
    
    // ヘルスチェックを実行
    const healthCheck = await integration.healthCheck();
    if (!healthCheck.healthy) {
      console.warn('⚠️ システムヘルスチェックで問題が検出されました:', healthCheck.details);
    }

    return integration;

  } catch (error) {
    console.error('❌ 新システム統合エラー:', error);
    throw error;
  }
}

/**
 * 開発・テスト用の簡易起動関数
 */
export async function createTestIntegration(
  databasePath?: string,
  geminiApiKey?: string
): Promise<NewSystemIntegration> {
  const testConfig = createDefaultConfig(
    databasePath || './test-database.db',
    geminiApiKey || process.env.GEMINI_API_KEY || 'test-key'
  );

  // テスト用設定
  testConfig.debugMode = true;
  testConfig.enableAutoAnalysis = false; // テスト中は自動分析を無効

  const integration = new NewSystemIntegration(testConfig);
  await integration.initialize();
  
  return integration;
}

/**
 * 設定ファイルから統合設定を読み込み
 */
export function loadConfigFromEnv(): IntegrationConfig {
  return {
    databasePath: process.env.DATABASE_PATH || './data/tasks.db',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    debugMode: process.env.NODE_ENV !== 'production',
    defaultTimezone: process.env.DEFAULT_TIMEZONE || 'Asia/Tokyo',
    enableAutoAnalysis: process.env.ENABLE_AUTO_ANALYSIS !== 'false',
    cacheValidityMinutes: parseInt(process.env.CACHE_VALIDITY_MINUTES || '60'),
    targetUserId: process.env.TARGET_USER_ID || '770478489203507241'
  };
}

/**
 * システム統計を取得する便利関数
 */
export async function getSystemOverview(integration: NewSystemIntegration): Promise<{
  health: any;
  stats: any;
  config: IntegrationConfig;
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
export async function emergencyShutdown(integration: NewSystemIntegration): Promise<void> {
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