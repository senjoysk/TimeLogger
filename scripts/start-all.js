#!/usr/bin/env node
/**
 * Bot + Web管理アプリ同時起動スクリプト
 * Production/Staging環境用
 */

const { spawn, execSync } = require('child_process');
const path = require('path');

console.log('🚀 TimeLogger All-in-One 起動中...');

// 環境変数チェック
const adminUser = process.env.ADMIN_USER;
const adminPassword = process.env.ADMIN_PASSWORD;

if (!adminUser || !adminPassword) {
  console.error('❌ 環境変数 ADMIN_USER と ADMIN_PASSWORD が必要です');
  process.exit(1);
}

// Web管理アプリのポート（環境変数から取得、デフォルト: 3001）
const adminPort = process.env.ADMIN_PORT || '3001';

// 0. データベースマイグレーションを実行
console.log('🔄 データベースマイグレーション実行中...');
try {
  execSync('node scripts/production/safe-unified-migration.js', { stdio: 'inherit' });
  console.log('✅ マイグレーション完了');
} catch (error) {
  console.error('❌ マイグレーション失敗:', error.message);
  process.exit(1);
}

// 1. Discord Botを起動
console.log('\n🤖 Discord Bot を起動中...');
const botProcess = spawn('node', ['dist/index.js'], {
  stdio: 'inherit',
  env: { ...process.env }
});

// 2. 少し待ってからWeb管理アプリを起動（DBの初期化を待つ）
setTimeout(() => {
  console.log(`\n🌐 Web管理アプリを起動中... (ポート: ${adminPort})`);
  const adminProcess = spawn('node', ['dist/web-admin/start.js'], {
    stdio: 'inherit',
    env: { 
      ...process.env,
      ADMIN_PORT: adminPort
    }
  });

  // プロセス終了時のハンドリング
  adminProcess.on('exit', (code) => {
    console.log(`Web管理アプリが終了しました (code: ${code})`);
    botProcess.kill();
    process.exit(code);
  });
}, 5000); // 5秒待機

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

console.log(`
📊 起動情報:
- Discord Bot: メインプロセス
- Web管理アプリ: http://localhost:${adminPort}/admin
- 認証情報: 環境変数で設定済み
`);