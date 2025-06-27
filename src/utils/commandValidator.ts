import { CommandManager } from '../handlers/commandManager';
import { Message } from 'discord.js';

/**
 * コマンド登録検証ユーティリティ
 * 重要なコマンドが適切に登録されているかを検証する
 */

export interface CommandValidationResult {
  command: string;
  isRegistered: boolean;
  description: string;
  errorMessage?: string;
}

export interface ValidationReport {
  allPassed: boolean;
  totalCommands: number;
  passedCommands: number;
  failedCommands: number;
  results: CommandValidationResult[];
  summary: string;
}

/**
 * 重要なコマンドの定義
 */
export const CRITICAL_COMMANDS = [
  { command: 'timezone', description: 'タイムゾーン設定・表示' },
  { command: 'summary', description: 'サマリー表示' },
  { command: 'cost', description: 'API費用レポート表示' }
] as const;

/**
 * 自然言語キーワードの定義
 */
export const NATURAL_LANGUAGE_KEYWORDS = [
  { keywords: ['サマリー', 'まとめ'], description: 'サマリー要求（自然言語）' },
  { keywords: ['費用', 'コスト'], description: 'コスト要求（自然言語）' }
] as const;

/**
 * コマンド登録の検証を行う
 */
export class CommandValidator {
  private commandManager: CommandManager;

  constructor(commandManager: CommandManager) {
    this.commandManager = commandManager;
  }

  /**
   * 重要なコマンドが全て登録されているかを検証
   * @returns 検証結果レポート
   */
  public async validateCriticalCommands(): Promise<ValidationReport> {
    const results: CommandValidationResult[] = [];

    for (const { command, description } of CRITICAL_COMMANDS) {
      const result = await this.testCommand(command, description);
      results.push(result);
    }

    const passedCommands = results.filter(r => r.isRegistered).length;
    const failedCommands = results.length - passedCommands;
    const allPassed = failedCommands === 0;

    const summary = allPassed 
      ? `✅ 全ての重要コマンド（${passedCommands}/${results.length}）が正常に登録されています`
      : `❌ ${failedCommands}/${results.length}個のコマンドに問題があります`;

    return {
      allPassed,
      totalCommands: results.length,
      passedCommands,
      failedCommands,
      results,
      summary
    };
  }

  /**
   * 自然言語キーワードの動作を検証
   * @returns 検証結果レポート  
   */
  public async validateNaturalLanguage(): Promise<ValidationReport> {
    const results: CommandValidationResult[] = [];

    for (const { keywords, description } of NATURAL_LANGUAGE_KEYWORDS) {
      // 各キーワードの最初のものをテスト
      const testKeyword = keywords[0];
      const result = await this.testNaturalLanguage(testKeyword, description);
      results.push(result);
    }

    const passedCommands = results.filter(r => r.isRegistered).length;
    const failedCommands = results.length - passedCommands;
    const allPassed = failedCommands === 0;

    const summary = allPassed 
      ? `✅ 全ての自然言語キーワード（${passedCommands}/${results.length}）が正常に動作しています`
      : `❌ ${failedCommands}/${results.length}個のキーワードに問題があります`;

    return {
      allPassed,
      totalCommands: results.length,
      passedCommands,
      failedCommands,
      results,
      summary
    };
  }

  /**
   * 個別コマンドのテスト
   */
  private async testCommand(command: string, description: string): Promise<CommandValidationResult> {
    try {
      const mockMessage = this.createMockMessage(`!${command}`);
      const result = await this.commandManager.handleMessage(mockMessage, 'Asia/Tokyo');
      
      // handleMessageが正常に完了し、不明なコマンドエラーが出ていないかチェック
      const replyCallFirstArg = (mockMessage.reply as jest.Mock).mock.calls[0]?.[0];
      const isUnknownCommandError = replyCallFirstArg?.includes('不明なコマンドです');
      
      return {
        command: `!${command}`,
        isRegistered: result && !isUnknownCommandError,
        description,
        errorMessage: isUnknownCommandError ? '未登録のコマンドです' : undefined
      };
    } catch (error) {
      return {
        command: `!${command}`,
        isRegistered: false,
        description,
        errorMessage: error instanceof Error ? error.message : '不明なエラー'
      };
    }
  }

  /**
   * 自然言語キーワードのテスト
   */
  private async testNaturalLanguage(keyword: string, description: string): Promise<CommandValidationResult> {
    try {
      const mockMessage = this.createMockMessage(`${keyword}を見せて`);
      const result = await this.commandManager.handleMessage(mockMessage, 'Asia/Tokyo');
      
      return {
        command: keyword,
        isRegistered: result,
        description,
        errorMessage: !result ? 'キーワードが認識されていません' : undefined
      };
    } catch (error) {
      return {
        command: keyword,
        isRegistered: false,
        description,
        errorMessage: error instanceof Error ? error.message : '不明なエラー'
      };
    }
  }

  /**
   * テスト用のモックメッセージを作成
   */
  private createMockMessage(content: string): Message {
    return {
      content,
      author: { id: 'test-user-123', tag: 'TestUser#1234' },
      reply: jest.fn().mockResolvedValue(undefined),
      channel: { isDMBased: () => true }
    } as unknown as Message;
  }

  /**
   * 検証結果をコンソールに出力
   */
  public printValidationReport(report: ValidationReport): void {
    console.log('\n' + '='.repeat(60));
    console.log('🔍 コマンド登録検証レポート');
    console.log('='.repeat(60));
    console.log(report.summary);
    console.log(`\n📊 詳細結果:`);
    
    for (const result of report.results) {
      const status = result.isRegistered ? '✅' : '❌';
      const error = result.errorMessage ? ` (${result.errorMessage})` : '';
      console.log(`  ${status} ${result.command} - ${result.description}${error}`);
    }
    
    if (!report.allPassed) {
      console.log('\n🚨 修正が必要な項目があります！');
      console.log('   bot.ts の initializeCommandManager() でコマンド登録を確認してください。');
    }
    console.log('='.repeat(60) + '\n');
  }
}

/**
 * スタンドアロンでの検証実行用ヘルパー
 */
export async function runCommandValidation(commandManager: CommandManager): Promise<boolean> {
  const validator = new CommandValidator(commandManager);
  
  console.log('🔧 コマンド登録検証を開始します...\n');
  
  // 重要コマンドの検証
  const commandReport = await validator.validateCriticalCommands();
  validator.printValidationReport(commandReport);
  
  // 自然言語キーワードの検証
  const nlReport = await validator.validateNaturalLanguage();
  validator.printValidationReport(nlReport);
  
  const allValid = commandReport.allPassed && nlReport.allPassed;
  
  if (allValid) {
    console.log('🎉 全ての検証にパスしました！');
  } else {
    console.log('💥 検証に失敗した項目があります。修正してください。');
  }
  
  return allValid;
}