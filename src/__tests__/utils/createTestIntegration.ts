/**
 * テスト用のActivityLoggingIntegrationインスタンス作成ヘルパー
 */

import { ActivityLoggingIntegration } from '../../integration/activityLoggingIntegration';
import { ActivityLoggingConfig, createDefaultConfig } from '../../integration/config';
import { PartialCompositeRepository } from '../../repositories/PartialCompositeRepository';

/**
 * テスト用のActivityLoggingIntegrationインスタンスを作成
 */
export async function createTestIntegration(
  config: ActivityLoggingConfig
): Promise<ActivityLoggingIntegration> {
  const repository = new PartialCompositeRepository(config.databasePath);
  await repository.initializeDatabase(); // データベース初期化を追加
  const integration = new ActivityLoggingIntegration(repository, config);
  await integration.initialize();
  return integration;
}

/**
 * テスト用のActivityLoggingIntegrationインスタンスを作成（簡易版）
 */
export async function createTestIntegrationSimple(
  databasePath: string,
  geminiApiKey: string = 'test-api-key'
): Promise<ActivityLoggingIntegration> {
  const config = createDefaultConfig(databasePath, geminiApiKey);
  config.debugMode = true;
  config.enableAutoAnalysis = false;
  return createTestIntegration(config);
}