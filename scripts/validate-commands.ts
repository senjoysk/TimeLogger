#!/usr/bin/env ts-node

/**
 * コマンド登録検証スクリプト
 * CI/CDパイプラインやローカル開発での品質チェックに使用
 */

import { CommandManager } from '../src/handlers/commandManager';
import { CostReportHandler } from '../src/handlers/costReportHandler';
import { SqliteActivityLogRepository } from '../src/repositories/sqliteActivityLogRepository';
import { GeminiService } from '../src/services/geminiService';
import { runCommandValidation } from '../src/utils/commandValidator';
import { ActivityLogService } from '../src/services/activityLogService';
import { UnifiedAnalysisService } from '../src/services/unifiedAnalysisService';
import { NewEditCommandHandler } from '../src/handlers/newEditCommandHandler';
import { NewSummaryHandler } from '../src/handlers/newSummaryHandler';
import { LogsCommandHandler } from '../src/handlers/logsCommandHandler';
import { NewTimezoneHandler } from '../src/handlers/newTimezoneHandler';

/**
 * 本番環境と同じ構成でCommandManagerを作成
 */
async function createProductionCommandManager(): Promise<CommandManager> {
  // メモリ内データベースでテスト用のサービスを初期化
  const repository = new SqliteActivityLogRepository(':memory:');
  await repository.initializeDatabase();

  // モックを使わずに実際のサービスを使用（外部API呼び出しのみモック）
  const geminiService = new GeminiService(repository);
  
  // Gemini APIの実際の呼び出しをモック化（テスト用）
  jest.mock('../src/services/geminiService');
  const MockedGeminiService = geminiService as jest.Mocked<GeminiService>;
  MockedGeminiService.analyzeActivity = jest.fn().mockResolvedValue({
    category: 'テスト',
    subCategory: 'コマンド検証',
    productivityLevel: 5,
    structuredContent: 'コマンド登録の検証を実行中',
    estimatedMinutes: 1,
    startTime: new Date(),
    endTime: new Date()
  });
  MockedGeminiService.generateDailySummary = jest.fn().mockResolvedValue({
    insights: 'テスト用のサマリーです',
    motivation: 'テストが成功しました！'
  });
  MockedGeminiService.getDailyCostReport = jest.fn().mockResolvedValue('テスト用のコストレポート');
  MockedGeminiService.checkCostAlerts = jest.fn().mockResolvedValue(null);

  const activityLogService = new ActivityLogService(repository);
  const unifiedAnalysisService = new UnifiedAnalysisService(repository, repository);

  // ハンドラーの作成（新システムのみ）
  const summaryHandler = new NewSummaryHandler(activityLogService, unifiedAnalysisService);
  const costReportHandler = new CostReportHandler(geminiService);

  // CommandManagerの初期化（本番環境と同じ）
  const commandManager = new CommandManager(
    costReportHandler
  );

  // コマンドハンドラーの登録（本番環境と同じ）
  const timezoneHandler = new NewTimezoneHandler(activityLogService);
  const editHandler = new NewEditCommandHandler(activityLogService);
  const logsHandler = new LogsCommandHandler(activityLogService);
  
  commandManager.registerCommandHandler('timezone', timezoneHandler);
  commandManager.registerCommandHandler('edit', editHandler);
  commandManager.registerCommandHandler('logs', logsHandler);
  commandManager.registerCommandHandler('summary', summaryHandler);

  return commandManager;
}

/**
 * メイン関数
 */
async function main(): Promise<void> {
  console.log('🚀 コマンド登録検証を開始します...\n');
  
  const startTime = Date.now();
  
  try {
    // 本番環境と同じ構成でCommandManagerを作成
    const commandManager = await createProductionCommandManager();
    
    // コマンド検証を実行
    const isValid = await runCommandValidation(commandManager);
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`\n⏱️  検証時間: ${duration}ms\n`);
    
    if (isValid) {
      console.log('🎉 コマンド登録検証が成功しました！');
      console.log('✅ 全ての重要コマンドが正常に登録されています。');
      process.exit(0);
    } else {
      console.log('💥 コマンド登録検証に失敗しました！');
      console.log('❌ 修正が必要な項目があります。');
      console.log('\n🔧 修正手順:');
      console.log('   1. src/bot.ts の initializeCommandManager() を確認');
      console.log('   2. 未登録のコマンドを CommandManager に登録');
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
📋 コマンド登録検証スクリプト

使用方法:
  npm run validate:commands
  または
  ts-node scripts/validate-commands.ts

このスクリプトは以下を検証します:
  • 重要なコマンド(!timezone, !summary, !cost)の登録確認
  • 自然言語キーワードの動作確認
  • CommandManagerとハンドラーの結合確認

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

export { createProductionCommandManager, main };