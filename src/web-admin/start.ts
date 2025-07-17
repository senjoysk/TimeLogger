/**
 * TimeLogger Admin Web App エントリーポイント
 */

import { AdminServer } from './server';
import { config } from '../config';
import { TaskLoggerBot } from '../bot';

async function startAdminServer() {
  try {
    // 必要な環境変数をチェック
    const requiredEnvVars = ['ADMIN_USERNAME', 'ADMIN_PASSWORD'];
    const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingEnvVars.length > 0) {
      console.error('❌ Missing required environment variables:', missingEnvVars);
      console.error('Please set the following environment variables:');
      missingEnvVars.forEach(varName => {
        console.error(`  - ${varName}`);
      });
      const env = process.env.NODE_ENV || 'development';
      console.error(`\nCreate a .env.${env} file based on .env.${env}.example or .env.example`);
      process.exit(1);
    }

    // データベースパスの設定
    const databasePath = config.database.path;
    console.log(`📁 Database path: ${databasePath}`);
    
    // ポート設定
    const port = parseInt(process.env.ADMIN_PORT || '3001');
    console.log(`🚀 Admin server starting on port ${port}`);
    
    // Discord Botを初期化
    console.log('🤖 Discord Bot を初期化中...');
    const bot = new TaskLoggerBot();
    await bot.start();
    
    // システム初期化の完了を待つ
    console.log('⏳ システム初期化の完了を待機中...');
    await bot.waitForSystemInitialization();
    
    // AdminServerを初期化（Botインスタンスを渡す）
    const adminServer = new AdminServer(databasePath, port, bot);
    
    // サーバー起動
    await adminServer.start();
    
    console.log('✅ Admin Web App started successfully!');
    console.log(`🌐 Access at: http://localhost:${port}`);
    
  } catch (error) {
    console.error('❌ Failed to start Admin Web App:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('💤 Admin Web App shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('💤 Admin Web App shutting down gracefully...');
  process.exit(0);
});

// エラーハンドリング
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// サーバー起動
startAdminServer();