/**
 * ActivityLoggingIntegrationV2
 * リファクタリング版：責任を分離して管理
 * 
 * @SRP-EXCEPTION: 統合クラスとして複数サービスの調整役を担う
 * @SRP-REASON: システム全体の初期化・調整・後方互換性維持のための中央統合点として機能
 */

import { Client, Message, ButtonInteraction } from 'discord.js';
import { IUnifiedRepository } from '../repositories/interfaces';
import { ActivityLogError } from '../types/activityLog';
import { logger } from '../utils/logger';
import { MessageProcessor } from './services/messageProcessor';
import { CommandRouter } from './services/commandRouter';
import { UserManager } from './services/userManager';
import { SystemMonitor } from './services/systemMonitor';
import { format } from 'date-fns-tz';

// ハンドラーのインポート
import { EditCommandHandler } from '../handlers/editCommandHandler';
import { SummaryHandler } from '../handlers/summaryHandler';
import { LogsCommandHandler } from '../handlers/logsCommandHandler';
import { TimezoneHandler } from '../handlers/timezoneHandler';
import { GapHandler } from '../handlers/gapHandler';
import { TodoCrudHandler } from '../handlers/todoCrudHandler';
import { TodoInteractionHandler } from '../handlers/todoInteractionHandler';
import { ProfileCommandHandler } from '../handlers/profileCommandHandler';
import { MemoCommandHandler } from '../handlers/memoCommandHandler';
import { MessageSelectionHandler } from '../handlers/messageSelectionHandler';

// サービスのインポート
import { ActivityLogService } from '../services/activityLogService';
import { GeminiService } from '../services/geminiService';
import { GapDetectionService } from '../services/gapDetectionService';
import { TimezoneService } from '../services/timezoneService';
import { ConfigService } from '../services/configService';
import { ReminderReplyService } from '../services/reminderReplyService';
import { DynamicReportScheduler } from '../services/dynamicReportScheduler';
import { DailyReportSender } from '../services/dailyReportSender';

export interface IActivityLoggingIntegration {
  initialize(): Promise<void>;
  integrateWithBot(client: Client, bot?: any): void;
  handleMessage(message: Message): Promise<boolean>;
  handleButtonInteraction(interaction: ButtonInteraction): Promise<void>;
  healthCheck(): Promise<any>;
  shutdown(): Promise<void>;
  destroy(): Promise<void>;
}

/**
 * リファクタリングされた統合クラス
 * 責任を各サービスに委譲して管理
 */
export class ActivityLoggingIntegration implements IActivityLoggingIntegration {
  // コアサービス
  private messageProcessor!: MessageProcessor;
  private commandRouter!: CommandRouter;
  private userManager!: UserManager;
  private systemMonitor!: SystemMonitor;

  // ハンドラー
  private editHandler!: EditCommandHandler;
  private summaryHandler!: SummaryHandler;
  private logsHandler!: LogsCommandHandler;
  private timezoneHandler!: TimezoneHandler;
  private gapHandler!: GapHandler;
  private todoCrudHandler!: TodoCrudHandler;
  private todoInteractionHandler!: TodoInteractionHandler;
  private profileHandler!: ProfileCommandHandler;
  private memoHandler!: MemoCommandHandler;
  private messageSelectionHandler!: MessageSelectionHandler;

  // サービス
  private activityLogService!: ActivityLogService;
  private geminiService!: GeminiService;
  private gapDetectionService!: GapDetectionService;
  private timezoneService!: TimezoneService;
  private configService!: ConfigService;
  private reminderReplyService!: ReminderReplyService;
  private dynamicReportScheduler!: DynamicReportScheduler;
  private dailyReportSender?: DailyReportSender;

  // その他
  private isInitialized = false;
  private isShuttingDown = false;
  private botInstance?: any;
  private config: any;
  private timeProvider: any;

  constructor(
    private repository: IUnifiedRepository,
    config?: any
  ) {
    this.config = config || {};
    this.timeProvider = config?.timeProvider;
  }

  /**
   * システムを初期化
   */
  async initialize(): Promise<void> {
    // 既に初期化済みの場合はスキップ
    if (this.isInitialized) {
      logger.info('ACTIVITY_LOG', 'システムは既に初期化済みです');
      return;
    }

    try {
      logger.info('ACTIVITY_LOG', '🚀 活動記録システム初期化開始...');

      // サービス層の初期化
      await this.initializeServices();
      
      // ハンドラー層の初期化
      await this.initializeHandlers();
      
      // コアサービスの初期化
      this.initializeCoreServices();

      // コマンドルーティングの設定
      this.setupCommandRouting();

      this.isInitialized = true;
      logger.info('ACTIVITY_LOG', '🎉 活動記録システム初期化完了！');

    } catch (error) {
      logger.error('ACTIVITY_LOG', '❌ 初期化エラー:', error);
      throw new ActivityLogError(
        '活動記録システムの初期化に失敗しました', 
        'INTEGRATION_INIT_ERROR', 
        { error }
      );
    }
  }

  /**
   * サービス層の初期化
   */
  private async initializeServices(): Promise<void> {
    this.geminiService = new GeminiService();
    this.timezoneService = new TimezoneService(this.repository);
    this.activityLogService = new ActivityLogService(
      this.repository, 
      this.geminiService,
      this.timezoneService
    );
    this.gapDetectionService = new GapDetectionService(this.repository as any);
    this.configService = new ConfigService();
    this.dynamicReportScheduler = new DynamicReportScheduler(this.repository);
    
    const { DiscordMessageClient } = await import('../interfaces/discordClient');
    const discordClient = new DiscordMessageClient();
    this.reminderReplyService = new ReminderReplyService(discordClient);
    
    logger.info('ACTIVITY_LOG', '✅ サービス層初期化完了');
  }

  /**
   * ハンドラー層の初期化
   */
  private async initializeHandlers(): Promise<void> {
    this.editHandler = new EditCommandHandler(this.activityLogService);
    this.summaryHandler = new SummaryHandler(
      this.activityLogService,
      this.repository
    );
    this.logsHandler = new LogsCommandHandler(this.activityLogService);
    this.timezoneHandler = new TimezoneHandler(this.repository as any, this.timezoneService, this.timeProvider);
    this.gapHandler = new GapHandler(this.gapDetectionService, this.activityLogService);
    this.todoCrudHandler = new TodoCrudHandler(this.repository as any);
    this.todoInteractionHandler = new TodoInteractionHandler(this.repository);
    this.profileHandler = new ProfileCommandHandler(this.repository);
    
    // ALLOW_LAYER_VIOLATION: 一時的な回避策
    const memoRepository = (this.repository as any).getMemoRepository ? 
      await (this.repository as any).getMemoRepository() : 
      this.repository;
    this.memoHandler = new MemoCommandHandler(memoRepository);
    
    this.messageSelectionHandler = new MessageSelectionHandler();
    this.messageSelectionHandler.setTodoRepository(this.repository);
    this.messageSelectionHandler.setActivityLogService(this.activityLogService);
    this.messageSelectionHandler.setMemoRepository(memoRepository);
    this.messageSelectionHandler.setGeminiService(this.geminiService);
    
    logger.info('ACTIVITY_LOG', '✅ ハンドラー層初期化完了');
  }

  /**
   * コアサービスの初期化
   */
  private initializeCoreServices(): void {
    // ユーザーマネージャー
    this.userManager = new UserManager(this.repository);
    
    // メッセージプロセッサー
    this.messageProcessor = new MessageProcessor(
      this.repository,
      (userId) => this.userManager.getUserTimezone(userId),
      (date, timezone) => this.formatTimeForUser(date, timezone),
      (date, timezone) => this.calculateBusinessDate(date, timezone)
    );
    this.messageProcessor.setReminderReplyService(this.reminderReplyService);
    this.messageProcessor.setMessageSelectionHandler(this.messageSelectionHandler);
    
    // コマンドルーター
    this.commandRouter = new CommandRouter();
    
    // システムモニター
    this.systemMonitor = new SystemMonitor(this.repository, this.config);
    
    logger.info('ACTIVITY_LOG', '✅ コアサービス初期化完了');
  }

  /**
   * コマンドルーティングの設定
   */
  private setupCommandRouting(): void {
    this.commandRouter.registerCommand('edit', this.editHandler);
    this.commandRouter.registerCommand('summary', this.summaryHandler);
    this.commandRouter.registerCommand('logs', this.logsHandler);
    this.commandRouter.registerCommand('timezone', this.timezoneHandler);
    this.commandRouter.registerCommand('gap', this.gapHandler);
    this.commandRouter.registerCommand('todo', this.todoCrudHandler);
    this.commandRouter.registerCommand('profile', this.profileHandler);
    // MemoCommandHandlerはhandleCommandメソッドを持つので、そのまま登録可能
    this.commandRouter.registerCommand('memo', this.memoHandler as any);
    
    // ヘルプとステータスは直接処理
    this.commandRouter.registerCommand('help', {
      handle: async (message) => this.showGeneralHelp(message)
    });
    this.commandRouter.registerCommand('status', {
      handle: async (message, userId) => this.showSystemStatus(message, userId)
    });
    
    logger.info('ACTIVITY_LOG', '✅ コマンドルーティング設定完了');
  }

  /**
   * Discord Botに統合
   */
  integrateWithBot(client: Client, bot?: any): void {
    if (!this.isInitialized) {
      throw new ActivityLogError(
        '活動記録システムが初期化されていません', 
        'SYSTEM_NOT_INITIALIZED'
      );
    }

    logger.info('ACTIVITY_LOG', '🔗 Discord Botへの統合を開始...');
    this.botInstance = bot;

    // DailyReportSenderの初期化
    if (bot) {
      // ALLOW_LAYER_VIOLATION: DailyReportSenderとの互換性のため
      this.dailyReportSender = new DailyReportSender(this as any, bot);
      this.dynamicReportScheduler.setReportSender(this.dailyReportSender);
    }

    // メッセージハンドラーを追加
    const existingListeners = client.listeners('messageCreate');
    client.removeAllListeners('messageCreate');

    client.on('messageCreate', async (message: Message) => {
      const handled = await this.handleMessage(message);
      
      if (!handled) {
        for (const listener of existingListeners) {
          try {
            await (listener as Function)(message);
          } catch (error) {
            logger.error('ACTIVITY_LOG', 'レガシーハンドラーエラー:', error);
          }
        }
      }
    });

    // ボタンインタラクションハンドラーを追加
    client.on('interactionCreate', async (interaction) => {
      if (interaction.isButton()) {
        await this.handleButtonInteraction(interaction as ButtonInteraction);
      }
    });

    logger.info('ACTIVITY_LOG', '✅ Discord Bot統合完了');
  }

  /**
   * メッセージを処理
   */
  async handleMessage(message: Message): Promise<boolean> {
    try {
      // Bot自身のメッセージは無視
      if (message.author.bot) {
        return false;
      }

      // 空のメッセージは無視
      if (!message.content || message.content.trim().length === 0) {
        return false;
      }

      const userId = message.author.id;
      const content = message.content.trim();
      const timezone = await this.userManager.getUserTimezone(userId);

      // 新規ユーザーチェック
      const isNewUser = await this.userManager.ensureUserRegistered(
        userId, 
        message.author.username
      );
      
      if (isNewUser && !content.startsWith('!')) {
        await message.reply(UserManager.getWelcomeMessage());
      }

      // コマンド処理
      if (content.startsWith('!')) {
        const handled = await this.commandRouter.routeCommand(message, userId, content, timezone);
        // 未知のコマンドでも処理済みとして返す（エラーメッセージなしで無視）
        return true;
      }

      // 通常メッセージ処理
      return await this.messageProcessor.processMessage(message);

    } catch (error) {
      logger.error('ACTIVITY_LOG', 'メッセージ処理エラー:', error);
      return false;
    }
  }

  /**
   * ボタンインタラクションを処理
   */
  async handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
    try {
      const userId = interaction.user.id;
      const timezone = await this.userManager.getUserTimezone(userId);
      
      if (interaction.customId.startsWith('select_')) {
        await this.messageSelectionHandler.handleButtonInteraction(interaction, userId, timezone);
      } else if (interaction.customId.startsWith('todo_')) {
        await this.handleTodoButtonInteraction(interaction, userId, timezone);
      }
    } catch (error) {
      logger.error('ACTIVITY_LOG', 'ボタンインタラクション処理エラー:', error);
      
      if (!interaction.replied) {
        await interaction.reply({ 
          content: '❌ ボタン操作の処理中にエラーが発生しました。', 
          ephemeral: true 
        });
      }
    }
  }

  /**
   * TODOボタンインタラクションを処理
   */
  private async handleTodoButtonInteraction(
    interaction: ButtonInteraction, 
    userId: string, 
    timezone: string
  ): Promise<void> {
    const idParts = interaction.customId.split('_');
    const type = idParts[1];
    
    if (type === 'page') {
      const pageAction = idParts[2];
      const currentPage = parseInt(idParts[3]);
      await this.todoInteractionHandler.handlePaginationInteraction(
        interaction, pageAction, currentPage, userId
      );
    } else if (type === 'number') {
      await this.todoInteractionHandler.handleTodoNumberButton(interaction, userId);
    } else {
      const todoId = idParts.slice(2).join('_');
      await this.todoInteractionHandler.handleTodoActionButton(
        interaction, type, todoId, userId, timezone
      );
    }
  }

  /**
   * ヘルプを表示
   */
  private async showGeneralHelp(message: Message): Promise<void> {
    const helpText = `📚 **Discord TimeLogger ヘルプ**

**基本コマンド:**
• \`!summary [日付]\` - サマリー表示
• \`!logs [日付]\` - ログ一覧表示
• \`!edit\` - 今日のログを編集
• \`!todo\` - TODOリスト管理
• \`!memo\` - メモ管理
• \`!status\` - システム状態表示

**設定コマンド:**
• \`!timezone\` - タイムゾーン設定
• \`!profile\` - プロファイル表示

**その他:**
• \`!gap\` - 活動ギャップ分析
• \`!help\` - このヘルプを表示

メッセージを送信すると、活動ログ/TODO/メモから選択できます。`;

    await message.reply(helpText);
  }

  /**
   * システムステータスを表示
   */
  private async showSystemStatus(message: Message, userId: string): Promise<void> {
    try {
      const stats = await this.systemMonitor.getSystemStats();
      
      const statusText = `📊 **システムステータス**
• アクティブユーザー: ${stats.activeUsers}人
• 総ログ数: ${stats.totalLogs}件
• 今日のログ: ${stats.todayLogs}件
• TODO総数: ${stats.totalTodos}件
• DB容量: ${stats.dbSize}
• 稼働時間: ${stats.uptime}
• メモリ使用: ${stats.memoryUsage}`;

      await message.reply(statusText);
    } catch (error) {
      logger.error('ACTIVITY_LOG', 'ステータス表示エラー:', error);
      await message.reply('❌ ステータス取得中にエラーが発生しました。');
    }
  }

  /**
   * ヘルスチェック
   */
  async healthCheck(): Promise<any> {
    if (!this.isInitialized) {
      return {
        healthy: false,
        details: {
          initialized: false,
          database: false,
          services: false,
          handlers: false
        }
      };
    }

    try {
      const result = await this.systemMonitor.healthCheck();
      // 旧形式との互換性のため変換
      return {
        healthy: result.status === 'healthy',
        details: {
          initialized: this.isInitialized,
          database: result.database.connected,
          services: true,
          handlers: true,
          // 新形式の情報も含める
          status: result.status,
          memory: result.memory,
          uptime: result.uptime,
          timestamp: result.timestamp
        }
      };
    } catch (error) {
      return {
        healthy: false,
        details: {
          initialized: this.isInitialized,
          database: false,
          services: false,
          handlers: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  /**
   * シャットダウン
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      logger.warn('ACTIVITY_LOG', 'すでにシャットダウン処理中です');
      return;
    }

    this.isShuttingDown = true;
    logger.info('ACTIVITY_LOG', '🛑 シャットダウン処理を開始...');

    try {
      if (this.dynamicReportScheduler) {
        // stopAllメソッドがない場合の対処
        try {
          (this.dynamicReportScheduler as any).stopAll?.();
        } catch (e) {
          logger.warn('ACTIVITY_LOG', 'スケジューラー停止メソッドが見つかりません');
        }
      }
      
      this.isInitialized = false;
      logger.info('ACTIVITY_LOG', '✅ シャットダウン完了');
    } catch (error) {
      logger.error('ACTIVITY_LOG', 'シャットダウンエラー:', error);
      throw error;
    } finally {
      this.isShuttingDown = false;
    }
  }

  /**
   * リソースを破棄
   */
  async destroy(): Promise<void> {
    await this.shutdown();
    
    // リポジトリのクローズ
    if (this.repository && typeof (this.repository as any).close === 'function') {
      try {
        await (this.repository as any).close();
      } catch (error) {
        logger.warn('ACTIVITY_LOG', 'リポジトリクローズエラー:', { error });
      }
    }
    
    // リソースのクリーンアップ
    this.messageProcessor = null as any;
    this.commandRouter = null as any;
    this.userManager = null as any;
    this.systemMonitor = null as any;
    
    logger.info('ACTIVITY_LOG', '🗑️ リソース破棄完了');
  }

  // ユーティリティメソッド
  private formatTimeForUser(date: Date, timezone: string): string {
    return format(date, 'HH:mm', { timeZone: timezone });
  }

  private calculateBusinessDate(date: Date, timezone: string): string {
    return format(date, 'yyyy-MM-dd', { timeZone: timezone });
  }

  // 公開メソッド（互換性のため）
  getRepository() { return this.repository; }
  getTimezoneService() { return this.timezoneService; }
  getConfig() { return this.config; }
  
  /**
   * システム統計を取得（互換性のため）
   */
  async getSystemStats(): Promise<any> {
    try {
      const stats = await this.systemMonitor.getSystemStats();
      // 旧形式との互換性のため追加のフィールドを含める
      return {
        ...stats,
        isInitialized: this.isInitialized,
        totalLogs: stats.totalLogs || 0,
        uptime: stats.uptime || '0日 0時間 0分'
      };
    } catch (error) {
      logger.error('ACTIVITY_LOG', 'システム統計取得エラー:', error);
      return {
        totalLogs: 0,
        isInitialized: this.isInitialized,
        uptime: '0日 0時間 0分',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * タイムゾーン変更コールバックを設定（互換性のため）
   */
  setTimezoneChangeCallback(callback: (userId: string, timezone: string) => void): void {
    // 内部的に処理されるため、ログのみ出力
    logger.info('ACTIVITY_LOG', 'タイムゾーン変更コールバック設定（内部処理）');
  }
  
  /**
   * 日次サマリーテキストを生成（互換性のため）
   */
  async generateDailySummaryText(userId: string, date: string): Promise<string> {
    const timezone = await this.userManager.getUserTimezone(userId);
    const logs = await this.repository.getLogsByDate(userId, date);
    
    if (logs.length === 0) {
      return `${date}の活動記録はありません。`;
    }
    
    // ActivityAnalysisServiceを使用
    const analysis = await (this.geminiService as any).activityAnalysis?.analyzeDailyActivity(logs, timezone);
    return analysis?.summary || '分析結果が取得できませんでした。';
  }
  
  /**
   * すべてのユーザーのタイムゾーンを取得（互換性のため）
   */
  async getAllUserTimezones(): Promise<Map<string, string[]>> {
    return await this.userManager.getAllUserTimezones();
  }
}