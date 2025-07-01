#!/usr/bin/env ts-node

/**
 * 活動記録システム検証スクリプト
 * CI/CDパイプラインやローカル開発での品質チェックに使用
 */

import { ActivityLoggingIntegration, createDefaultConfig } from '../src/integration';

/**
 * 本番環境と同じ構成で活動記録システムを作成・テスト
 */
async function createAndTestActivityLogging(): Promise<boolean> {
  try {
    console.log('🧪 活動記録システムの初期化テスト...');
    
    // メモリ内データベースでテスト用の統合システムを初期化
    const testConfig = createDefaultConfig(
      ':memory:', // メモリDBを使用
      'test-api-key',
      false, // debugMode
      'Asia/Tokyo',
      true, // enableAutoAnalysis
      60, // cacheValidityMinutes
      'test-user-id'
    );

    const integration = new ActivityLoggingIntegration(testConfig);
    
    // 初期化テスト
    await integration.initialize();
    console.log('✅ 活動記録システムの初期化が成功しました');
    
    // 基本機能テスト
    console.log('🧪 基本機能のテスト...');
    
    // テスト用の活動記録
    const testUserId = 'test-user-id';
    const testContent = 'テスト用の活動記録です';
    const testTimezone = 'Asia/Tokyo';
    
    // シミュレートされたDiscordメッセージ
    const mockMessage = {
      content: testContent,
      author: { id: testUserId },
      reply: async (content: string) => {
        console.log(`📤 Bot応答: ${content}`);
        return {} as any;
      }
    };
    
    // メッセージ処理テスト
    const result = await integration.handleMessage(mockMessage as any, testUserId, testTimezone);
    
    if (result) {
      console.log('✅ メッセージ処理テストが成功しました');
      return true;
    } else {
      console.log('❌ メッセージ処理テストが失敗しました');
      return false;
    }
    
  } catch (error) {
    console.error('❌ システム検証エラー:', error);
    return false;
  }
}

/**
 * メイン関数
 */
async function main(): Promise<void> {
  console.log('🚀 活動記録システム検証を開始します...\n');
  
  const startTime = Date.now();
  
  try {
    const isValid = await createAndTestActivityLogging();
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`\n⏱️  検証時間: ${duration}ms\n`);
    
    if (isValid) {
      console.log('🎉 活動記録システム検証が成功しました！');
      console.log('✅ 統合システムが正常に動作しています。');
      process.exit(0);
    } else {
      console.log('💥 活動記録システム検証に失敗しました！');
      console.log('❌ 修正が必要な項目があります。');
      console.log('\n🔧 修正手順:');
      console.log('   1. src/integration/activityLoggingIntegration.ts を確認');
      console.log('   2. サービス層の初期化エラーを修正');
      console.log('   3. 再度このスクリプトを実行して確認');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ 検証中に予期しないエラーが発生しました:');
    console.error(error);
    process.exit(1);
  }
}

/**
 * CLI引数の処理
 */
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
📋 活動記録システム検証スクリプト

使用方法:
  npm run validate:commands
  または
  ts-node scripts/validate-commands.ts

このスクリプトは以下を検証します:
  • 活動記録システムの初期化確認
  • メッセージ処理機能の動作確認
  • 統合システムの結合確認

終了コード:
  0: 検証成功
  1: 検証失敗

オプション:
  --help, -h: このヘルプを表示
`);
    process.exit(0);
  }
  
  // メイン処理を実行
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { createAndTestActivityLogging, main };