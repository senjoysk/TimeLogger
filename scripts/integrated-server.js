#!/usr/bin/env node
/**
 * 統合サーバー: Bot + Web管理アプリ + ヘルスチェック
 * 単一ポートで動作（Fly.io対応）
 */

const { spawn, execSync } = require('child_process');
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

console.log('🚀 TimeLogger 統合サーバー起動中...');

// 環境変数チェック
const adminUser = process.env.ADMIN_USER;
const adminPassword = process.env.ADMIN_PASSWORD;
const port = process.env.PORT || '3000';
const adminPort = '3001'; // 内部ポート

if (!adminUser || !adminPassword) {
  console.error('❌ 環境変数 ADMIN_USER と ADMIN_PASSWORD が必要です');
  process.exit(1);
}

// 0. データベースマイグレーションを実行
console.log('🔄 データベースマイグレーション実行中...');
try {
  execSync('node scripts/production/safe-unified-migration.js', { stdio: 'inherit' });
  console.log('✅ マイグレーション完了');
} catch (error) {
  console.error('❌ マイグレーション失敗:', error.message);
  process.exit(1);
}

// 1. Discord Botを起動（バックグラウンド）
console.log('\n🤖 Discord Bot を起動中...');
const botProcess = spawn('node', ['dist/index.js'], {
  stdio: 'inherit',
  env: { ...process.env }
});

// 2. Web管理アプリを起動（5秒待機）
setTimeout(() => {
  console.log(`\n🌐 Web管理アプリを起動中... (内部ポート: ${adminPort})`);
  const adminProcess = spawn('node', ['dist/web-admin/start.js'], {
    stdio: 'inherit',
    env: { 
      ...process.env,
      ADMIN_PORT: adminPort
    }
  });

  adminProcess.on('exit', (code) => {
    console.log(`Web管理アプリが終了しました (code: ${code})`);
    botProcess.kill();
    process.exit(code);
  });
}, 5000);

// 3. リバースプロキシサーバーを起動（10秒待機）
setTimeout(() => {
  console.log(`\n🌐 統合プロキシサーバーを起動中... (ポート: ${port})`);
  
  const app = express();

  // ヘルスチェック（Bot側）
  app.get('/health', async (req, res) => {
    try {
      // 簡易的なヘルスチェック
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        services: {
          bot: 'running',
          admin: 'running'
        }
      });
    } catch (error) {
      res.status(503).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // Admin アプリへのプロキシ
  app.use('/admin', createProxyMiddleware({
    target: `http://localhost:${adminPort}`,
    changeOrigin: true,
    pathRewrite: {
      '^/admin': ''
    }
  }));

  // Static files
  app.use('/static', createProxyMiddleware({
    target: `http://localhost:${adminPort}`,
    changeOrigin: true
  }));

  // ルートアクセス
  app.get('/', (req, res) => {
    res.send(`
      <html>
        <head><title>TimeLogger</title></head>
        <body>
          <h1>TimeLogger Bot is running</h1>
          <p><a href="/admin">Admin Panel</a></p>
          <p><a href="/health">Health Check</a></p>
        </body>
      </html>
    `);
  });

  app.listen(port, () => {
    console.log(`✅ 統合サーバー起動完了: http://localhost:${port}`);
    console.log(`
📊 サービス情報:
- Discord Bot: バックグラウンドで実行中
- Web管理アプリ: http://localhost:${port}/admin
- ヘルスチェック: http://localhost:${port}/health
- 認証情報: 環境変数で設定済み
`);
  });
}, 10000);

// プロセス終了時のハンドリング
botProcess.on('exit', (code) => {
  console.log(`Discord Bot が終了しました (code: ${code})`);
  process.exit(code);
});

// シグナルハンドリング
process.on('SIGINT', () => {
  console.log('\n⏹️ シャットダウン中...');
  botProcess.kill();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n⏹️ シャットダウン中...');
  botProcess.kill();
  process.exit(0);
});