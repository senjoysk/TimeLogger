import dotenv from 'dotenv';

// 環境変数の読み込み
dotenv.config();

/**
 * アプリケーション設定
 * 環境変数から必要な設定値を取得し、型安全に管理する
 */
export const config = {
  // Discord Bot設定
  discord: {
    token: process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN || '',
    clientId: process.env.DISCORD_CLIENT_ID || '',
    targetUserId: process.env.TARGET_USER_ID || '',
    commandPrefix: process.env.COMMAND_PREFIX || '!',
  },
  
  // Google Gemini API設定
  gemini: {
    apiKey: process.env.GOOGLE_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || '',
  },
  
  // データベース設定
  database: {
    path: process.env.DATABASE_PATH || './data/activity_logs.db',
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
  
  // 開発環境判定
  isDevelopment: process.env.NODE_ENV === 'development',
} as const;

/**
 * 設定値の検証
 * 必須の環境変数が設定されているかチェック
 */
export function validateConfig(): void {
  // デバッグ: 環境変数の状態を出力
  console.log('🔍 環境変数のチェック:');
  console.log(`   - DISCORD_TOKEN: ${process.env.DISCORD_TOKEN ? '設定済み' : '未設定'}`);
  console.log(`   - DISCORD_BOT_TOKEN: ${process.env.DISCORD_BOT_TOKEN ? '設定済み' : '未設定'}`);
  console.log(`   - 実際のトークン長: ${config.discord.token.length}文字`);
  console.log(`   - トークンプレビュー: ${config.discord.token.substring(0, 10)}...`);
  console.log(`   - トークン最初の5文字: "${config.discord.token.substring(0, 5)}"`);

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
    console.error('\n.env.exampleを参考に.envファイルを作成してください。');
    process.exit(1);
  }

  console.log('✅ 設定の検証が完了しました');
}