import { Message } from 'discord.js';
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

// コマンドハンドラーのモック
const mockTimezoneHandler = {
  handle: jest.fn().mockResolvedValue(true)
} as unknown as TimezoneCommandHandler;

const mockSummaryCommandHandler = {
  handle: jest.fn().mockResolvedValue(true)
} as unknown as SummaryCommandHandler;

const mockCostCommandHandler = {
  handle: jest.fn().mockResolvedValue(true)
} as unknown as CostCommandHandler;

// Messageオブジェクトのモック
const createMockMessage = (content: string, userId: string = 'test-user-123') => ({
  content,
  author: { id: userId, tag: 'TestUser#1234' },
  reply: jest.fn().mockResolvedValue(undefined)
} as unknown as Message);

describe('CommandManager Integration Test', () => {
  let commandManager: CommandManager;

  beforeEach(() => {
    // モックをリセット
    jest.clearAllMocks();
    
    // CommandManagerの初期化
    commandManager = new CommandManager(
      mockActivityHandler,
      mockSummaryHandler,
      mockCostReportHandler
    );

    // コマンドハンドラーを登録
    commandManager.registerCommandHandler('timezone', mockTimezoneHandler);
    commandManager.registerCommandHandler('summary', mockSummaryCommandHandler);
    commandManager.registerCommandHandler('cost', mockCostCommandHandler);
  });

  describe('重要なコマンドの動作確認', () => {
    test('!summary コマンドが正しく処理される', async () => {
      const message = createMockMessage('!summary');
      const userTimezone = 'Asia/Tokyo';

      const result = await commandManager.handleMessage(message, userTimezone);

      expect(result).toBe(true);
      expect(mockSummaryCommandHandler.handle).toHaveBeenCalledWith(message, []);
      expect(mockSummaryCommandHandler.handle).toHaveBeenCalledTimes(1);
    });

    test('!summary 2025-06-27 コマンド（日付指定）が正しく処理される', async () => {
      const message = createMockMessage('!summary 2025-06-27');
      const userTimezone = 'Asia/Tokyo';

      const result = await commandManager.handleMessage(message, userTimezone);

      expect(result).toBe(true);
      expect(mockSummaryCommandHandler.handle).toHaveBeenCalledWith(message, ['2025-06-27']);
      expect(mockSummaryCommandHandler.handle).toHaveBeenCalledTimes(1);
    });

    test('!cost コマンドが正しく処理される', async () => {
      const message = createMockMessage('!cost');
      const userTimezone = 'Asia/Tokyo';

      const result = await commandManager.handleMessage(message, userTimezone);

      expect(result).toBe(true);
      expect(mockCostCommandHandler.handle).toHaveBeenCalledWith(message, []);
      expect(mockCostCommandHandler.handle).toHaveBeenCalledTimes(1);
    });

    test('!timezone コマンドが正しく処理される', async () => {
      const message = createMockMessage('!timezone');
      const userTimezone = 'Asia/Tokyo';

      const result = await commandManager.handleMessage(message, userTimezone);

      expect(result).toBe(true);
      expect(mockTimezoneHandler.handle).toHaveBeenCalledWith(message, []);
      expect(mockTimezoneHandler.handle).toHaveBeenCalledTimes(1);
    });

    test('!timezone set Asia/Tokyo コマンドが正しく処理される', async () => {
      const message = createMockMessage('!timezone set Asia/Tokyo');
      const userTimezone = 'Asia/Tokyo';

      const result = await commandManager.handleMessage(message, userTimezone);

      expect(result).toBe(true);
      expect(mockTimezoneHandler.handle).toHaveBeenCalledWith(message, ['set', 'Asia/Tokyo']);
      expect(mockTimezoneHandler.handle).toHaveBeenCalledTimes(1);
    });
  });

  describe('不明なコマンドの処理', () => {
    test('存在しないコマンドに対してエラーメッセージが表示される', async () => {
      const message = createMockMessage('!unknown');
      const userTimezone = 'Asia/Tokyo';

      const result = await commandManager.handleMessage(message, userTimezone);

      expect(result).toBe(true);
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('不明なコマンドです: `!unknown`')
      );
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('**利用可能なコマンド:**')
      );
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('• `!timezone`')
      );
    });
  });

  describe('自然言語処理', () => {
    test('「サマリー」キーワードでサマリーハンドラーが呼ばれる', async () => {
      const message = createMockMessage('今日のサマリーを見せて');
      const userTimezone = 'Asia/Tokyo';

      const result = await commandManager.handleMessage(message, userTimezone);

      expect(result).toBe(true);
      expect(mockSummaryHandler.handleSummaryRequest).toHaveBeenCalledWith(
        message, 
        userTimezone, 
        undefined
      );
    });

    test('「費用」キーワードでコストレポートハンドラーが呼ばれる', async () => {
      const message = createMockMessage('API費用を確認したい');
      const userTimezone = 'Asia/Tokyo';

      const result = await commandManager.handleMessage(message, userTimezone);

      expect(result).toBe(true);
      expect(mockCostReportHandler.handleCostReportRequest).toHaveBeenCalledWith(
        message, 
        userTimezone
      );
    });

    test('通常のメッセージで活動記録ハンドラーが呼ばれる', async () => {
      const message = createMockMessage('プログラミングをしていました');
      const userTimezone = 'Asia/Tokyo';

      const result = await commandManager.handleMessage(message, userTimezone);

      expect(result).toBe(true);
      expect(mockActivityHandler.handleActivityLog).toHaveBeenCalledWith(
        message, 
        'プログラミングをしていました', 
        userTimezone
      );
    });
  });

  describe('コマンド登録の検証', () => {
    test('必須コマンドがすべて登録されているかを確認', async () => {
      const requiredCommands = ['timezone', 'summary', 'cost'];
      
      for (const command of requiredCommands) {
        const message = createMockMessage(`!${command}`);
        const result = await commandManager.handleMessage(message, 'Asia/Tokyo');
        
        // 不明なコマンドエラーが出ないことを確認
        expect(result).toBe(true);
        expect(message.reply).not.toHaveBeenCalledWith(
          expect.stringContaining(`不明なコマンドです: \`!${command}\``)
        );
      }
    });
  });
});