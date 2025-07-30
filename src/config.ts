import dotenv from 'dotenv';
import { DATABASE_PATHS } from './database/simplePathConfig';
import { logger } from './utils/logger';

// 環境判定と環境別設定ファイルの読み込み
const NODE_ENV = process.env.NODE_ENV || 'development';
const isDevelopment = NODE_ENV === 'development';
const isProduction = NODE_ENV === 'production';

// 環境に応じた設定ファイルを読み込み
if (isDevelopment) {
  dotenv.config({ path: '.env.development' });
} else if (isProduction) {
  dotenv.config({ path: '.env.production' });
} else {
  dotenv.config(); // デフォルト（.env）
}

logger.info('CONFIG', `環境: ${NODE_ENV}`);

/**
 * アプリケーション設定
 * 環境変数から必要な設定値を取得し、型安全に管理する
 */
export const config = {
  // Discord Bot設定
  discord: {
    token: process.env.DISCORD_TOKEN || '',
    clientId: process.env.DISCORD_CLIENT_ID || '',
    // targetUserId: マルチユーザー対応のため削除
    commandPrefix: process.env.COMMAND_PREFIX || '!',
  },
  
  // Google Gemini API設定
  gemini: {
    apiKey: process.env.GOOGLE_API_KEY || '',
    model: process.env.GOOGLE_MODEL || 'gemini-2.0-flash-exp',
  },
  
  // データベース設定（統一パス管理）
  database: {
    // 統一データベースパス（表記ゆれ防止）
    path: DATABASE_PATHS.getMainDatabasePath(),
    // レガシーパス（マイグレーション時に参照）
    legacyPath: DATABASE_PATHS.getLegacyDatabasePath(),
    // バックアップディレクトリ
    backupDirectory: DATABASE_PATHS.getBackupDirectory(),
    // 環境情報
    environment: DATABASE_PATHS.getEnvironment(),
  },
  
  // アプリケーション設定
  app: {
    // 問いかけ時間帯（平日9:00-18:00）
    workingHours: {
      start: 9,
      end: 18,
    },
    // 日の境界（5:00am-翌4:59am）
    dayBoundary: {
      start: 5, // 5:00am
    },
    // サマリー生成時刻
    summaryTime: {
      hour: 18, // 18:00
      minute: 0,
    },
  },
  
  // システム監視設定
  monitoring: {
    // 管理者通知設定
    adminNotification: {
      userId: process.env.ADMIN_USER_ID || '', // 管理者のDiscord User ID
      enabled: process.env.ADMIN_NOTIFICATIONS_ENABLED === 'true',
    },
    // ヘルスチェック設定
    healthCheck: {
      enabled: process.env.HEALTH_CHECK_ENABLED !== 'false', // デフォルト有効
      interval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000'), // 30秒
      timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT || '10000'), // 10秒
    },
  },
  
  // 環境判定
  environment: {
    nodeEnv: NODE_ENV,
    isDevelopment,
    isProduction,
  },
} as const;

/**
 * 設定値の検証
 * 必須の環境変数が設定されているかチェック
 */
export function validateConfig(): void {
  // デバッグ: 環境変数の状態を出力
  logger.debug('CONFIG', '環境変数のチェック:', {
    環境: config.environment.nodeEnv,
    データベースパス: config.database.path,
    DISCORD_TOKEN: process.env.DISCORD_TOKEN ? '設定済み' : '未設定',
    実際のトークン長: config.discord.token.length,
    トークンプレビュー: config.discord.token.substring(0, 10) + '...'
  });

  const requiredFields = [
    { key: 'DISCORD_TOKEN', value: config.discord.token },
    { key: 'DISCORD_CLIENT_ID', value: config.discord.clientId },
    // TARGET_USER_ID: マルチユーザー対応のため削除
    { key: 'GOOGLE_API_KEY', value: config.gemini.apiKey },
  ];
  
  // 管理者通知が有効な場合のみ必須チェック
  if (config.monitoring.adminNotification.enabled && !config.monitoring.adminNotification.userId) {
    logger.error('CONFIG', '管理者通知が有効ですが、ADMIN_USER_IDが設定されていません');
    process.exit(1);
  }

  const missingFields = requiredFields
    .filter(field => !field.value)
    .map(field => field.key);

  if (missingFields.length > 0) {
    logger.error('CONFIG', '必須の環境変数が設定されていません', undefined, {
      missingFields,
      environment: config.environment.nodeEnv
    });
    process.exit(1);
  }

  logger.success('CONFIG', '設定の検証が完了しました');
}