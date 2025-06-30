import { CommandValidator, CRITICAL_COMMANDS, runCommandValidation } from '../../utils/commandValidator';
import { CommandManager } from '../../handlers/commandManager';
import { ActivityHandler } from '../../handlers/activityHandler';
import { SummaryHandler } from '../../handlers/summaryHandler';
import { CostReportHandler } from '../../handlers/costReportHandler';
import { TimezoneCommandHandler } from '../../handlers/timezoneCommandHandler';
import { SummaryCommandHandler } from '../../handlers/summaryCommandHandler';
import { CostCommandHandler } from '../../handlers/costCommandHandler';

// モック作成
const mockActivityHandler = {
  handleActivityLog: jest.fn().mockResolvedValue(undefined)
} as unknown as ActivityHandler;

const mockSummaryHandler = {
  handleSummaryRequest: jest.fn().mockResolvedValue(undefined)
} as unknown as SummaryHandler;

const mockCostReportHandler = {
  handleCostReportRequest: jest.fn().mockResolvedValue(undefined)
} as unknown as CostReportHandler;

const mockTimezoneHandler = {
  handle: jest.fn().mockResolvedValue(true)
} as unknown as TimezoneCommandHandler;

const mockSummaryCommandHandler = {
  handle: jest.fn().mockResolvedValue(true)
} as unknown as SummaryCommandHandler;

const mockCostCommandHandler = {
  handle: jest.fn().mockResolvedValue(true)
} as unknown as CostCommandHandler;

describe('CommandValidator', () => {
  let commandManager: CommandManager;
  let validator: CommandValidator;

  beforeEach(() => {
    jest.clearAllMocks();
    
    commandManager = new CommandManager(
      mockActivityHandler,
      mockSummaryHandler,
      mockCostReportHandler
    );
    
    validator = new CommandValidator(commandManager);
  });

  describe('適切に登録されたコマンドの検証', () => {
    beforeEach(() => {
      // 全コマンドを適切に登録
      commandManager.registerCommandHandler('timezone', mockTimezoneHandler);
      commandManager.registerCommandHandler('summary', mockSummaryCommandHandler);
      commandManager.registerCommandHandler('cost', mockCostCommandHandler);
    });

    test('重要なコマンドが全て登録されている場合', async () => {
      const report = await validator.validateCriticalCommands();

      expect(report.allPassed).toBe(true);
      expect(report.totalCommands).toBe(CRITICAL_COMMANDS.length);
      expect(report.passedCommands).toBe(CRITICAL_COMMANDS.length);
      expect(report.failedCommands).toBe(0);
      expect(report.summary).toContain('✅ 全ての重要コマンド');
      
      // 各コマンドが正常に登録されている
      for (const result of report.results) {
        expect(result.isRegistered).toBe(true);
        expect(result.errorMessage).toBeUndefined();
      }
    });

    test('自然言語キーワードが正常に動作する場合', async () => {
      const report = await validator.validateNaturalLanguage();

      expect(report.allPassed).toBe(true);
      expect(report.summary).toContain('✅ 全ての自然言語キーワード');
      
      // 各キーワードが正常に動作している
      for (const result of report.results) {
        expect(result.isRegistered).toBe(true);
        expect(result.errorMessage).toBeUndefined();
      }
    });
  });

  describe('コマンド登録漏れの検出', () => {
    test('summaryコマンドが未登録の場合', async () => {
      // summaryコマンドのみ登録しない
      commandManager.registerCommandHandler('timezone', mockTimezoneHandler);
      commandManager.registerCommandHandler('cost', mockCostCommandHandler);

      const report = await validator.validateCriticalCommands();

      expect(report.allPassed).toBe(false);
      expect(report.failedCommands).toBe(1);
      expect(report.summary).toContain('❌');
      
      // summaryコマンドが未登録として検出される
      const summaryResult = report.results.find(r => r.command === '!summary');
      expect(summaryResult?.isRegistered).toBe(false);
      expect(summaryResult?.errorMessage).toBe('未登録のコマンドです');
    });

    test('複数のコマンドが未登録の場合', async () => {
      // timezoneコマンドのみ登録
      commandManager.registerCommandHandler('timezone', mockTimezoneHandler);

      const report = await validator.validateCriticalCommands();

      expect(report.allPassed).toBe(false);
      expect(report.failedCommands).toBe(2); // summary と cost が未登録
      expect(report.passedCommands).toBe(1); // timezone のみ登録済み
    });

    test('全コマンドが未登録の場合', async () => {
      // 何も登録しない
      const report = await validator.validateCriticalCommands();

      expect(report.allPassed).toBe(false);
      expect(report.failedCommands).toBe(CRITICAL_COMMANDS.length);
      expect(report.passedCommands).toBe(0);
      
      // 全てのコマンドが未登録として検出される
      for (const result of report.results) {
        expect(result.isRegistered).toBe(false);
        expect(result.errorMessage).toBe('未登録のコマンドです');
      }
    });
  });

  describe('エラーハンドリング', () => {
    test('ハンドラーでエラーが発生した場合', async () => {
      // エラーを投げるモックハンドラー
      const errorHandler = {
        handle: jest.fn().mockRejectedValue(new Error('Handler Error'))
      } as unknown as TimezoneCommandHandler;

      commandManager.registerCommandHandler('timezone', errorHandler);
      commandManager.registerCommandHandler('summary', mockSummaryCommandHandler);
      commandManager.registerCommandHandler('cost', mockCostCommandHandler);

      const report = await validator.validateCriticalCommands();

      // エラーが発生したコマンドが適切に検出される
      const timezoneResult = report.results.find(r => r.command === '!timezone');
      expect(timezoneResult?.isRegistered).toBe(false);
      expect(timezoneResult?.errorMessage).toBe('Handler Error');
    });
  });

  describe('printValidationReport', () => {
    let consoleSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    test('成功レポートが正しく出力される', async () => {
      commandManager.registerCommandHandler('timezone', mockTimezoneHandler);
      commandManager.registerCommandHandler('summary', mockSummaryCommandHandler);
      commandManager.registerCommandHandler('cost', mockCostCommandHandler);

      const report = await validator.validateCriticalCommands();
      validator.printValidationReport(report);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('🔍 コマンド登録検証レポート')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('✅ 全ての重要コマンド')
      );
    });

    test('失敗レポートが正しく出力される', async () => {
      // コマンドを登録しない
      const report = await validator.validateCriticalCommands();
      validator.printValidationReport(report);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('❌')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('🚨 修正が必要な項目があります！')
      );
    });
  });

  describe('runCommandValidation統合テスト', () => {
    let consoleSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    test('全ての検証が成功した場合', async () => {
      commandManager.registerCommandHandler('timezone', mockTimezoneHandler);
      commandManager.registerCommandHandler('summary', mockSummaryCommandHandler);
      commandManager.registerCommandHandler('cost', mockCostCommandHandler);

      const result = await runCommandValidation(commandManager);

      expect(result).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('🎉 全ての検証にパスしました！')
      );
    });

    test('検証に失敗した場合', async () => {
      // コマンドを登録しない
      const result = await runCommandValidation(commandManager);

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('💥 検証に失敗した項目があります')
      );
    });
  });

  describe('定数の検証', () => {
    test('CRITICAL_COMMANDSに必要なコマンドが含まれている', () => {
      const commandNames = CRITICAL_COMMANDS.map(c => c.command);
      
      expect(commandNames).toContain('timezone');
      expect(commandNames).toContain('summary');
      expect(commandNames).toContain('cost');
    });

    test('各コマンドに説明が含まれている', () => {
      for (const command of CRITICAL_COMMANDS) {
        expect(command.description).toBeTruthy();
        expect(typeof command.description).toBe('string');
      }
    });
  });
});