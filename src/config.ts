import dotenv from 'dotenv';
import { DATABASE_PATHS } from './database/simplePathConfig';

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

console.log(`🚀 環境: ${NODE_ENV}`);

/**
 * アプリケーション設定
 * 環境変数から必要な設定値を取得し、型安全に管理する
 */
export const config = {
  // Discord Bot設定
  discord: {
    token: process.env.DISCORD_TOKEN || '',
    clientId: process.env.DISCORD_CLIENT_ID || '',
    targetUserId: process.env.TARGET_USER_ID || '',
    commandPrefix: process.env.COMMAND_PREFIX || '!',
  },
  
  // Google Gemini API設定
  gemini: {
    apiKey: process.env.GOOGLE_API_KEY || '',
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
  console.log('🔍 環境変数のチェック:');
  console.log(`   - 環境: ${config.environment.nodeEnv}`);
  console.log(`   - データベースパス: ${config.database.path}`);
  console.log(`   - DISCORD_TOKEN: ${process.env.DISCORD_TOKEN ? '設定済み' : '未設定'}`);
  console.log(`   - 実際のトークン長: ${config.discord.token.length}文字`);
  console.log(`   - トークンプレビュー: ${config.discord.token.substring(0, 10)}...`);

  const requiredFields = [
    { key: 'DISCORD_TOKEN', value: config.discord.token },
    { key: 'DISCORD_CLIENT_ID', value: config.discord.clientId },
    { key: 'TARGET_USER_ID', value: config.discord.targetUserId },
    { key: 'GOOGLE_API_KEY', value: config.gemini.apiKey },
  ];

  const missingFields = requiredFields
    .filter(field => !field.value)
    .map(field => field.key);

  if (missingFields.length > 0) {
    console.error('❌ 必須の環境変数が設定されていません:');
    missingFields.forEach(field => console.error(`   - ${field}`));
    console.error(`\n.env.${config.environment.nodeEnv}を参考に環境変数を設定してください。`);
    process.exit(1);
  }

  console.log('✅ 設定の検証が完了しました');
}