/**
 * 活動記録システム統合クラス
 * Discord Botに自然言語活動ログシステムを統合
 * 
 * @SRP-EXCEPTION: Discord Bot統合システムとして複数責務の統合管理が必要
 * @SRP-REASON: Phase 4C予定 - メッセージ処理・AI統合・コマンド処理・システム初期化を分離予定
 */

import { Client, Message, ButtonInteraction } from 'discord.js';
// Removed better-sqlite3 import - using sqlite3 via repository
import { PartialCompositeRepository } from '../repositories/PartialCompositeRepository';
import { IUnifiedRepository, IMemoRepository } from '../repositories/interfaces';
import { SqliteMemoRepository } from '../repositories/sqliteMemoRepository';
import { ActivityLogService, IActivityLogService } from '../services/activityLogService';
import { EditCommandHandler } from '../handlers/editCommandHandler';
import { SummaryHandler } from '../handlers/summaryHandler';
import { LogsCommandHandler } from '../handlers/logsCommandHandler';
import { TimezoneHandler } from '../handlers/timezoneHandler';
import { TodoCrudHandler } from '../handlers/todoCrudHandler';
import { MessageClassificationHandler } from '../handlers/messageClassificationHandler';
import { TodoInteractionHandler } from '../handlers/todoInteractionHandler';
import { ProfileCommandHandler } from '../handlers/profileCommandHandler';
import { MemoCommandHandler } from '../handlers/memoCommandHandler';
import { IGeminiService } from '../services/interfaces/IGeminiService';
import { IMessageClassificationService } from '../services/messageClassificationService';
import { GapDetectionService, IGapDetectionService } from '../services/gapDetectionService';
import { DynamicReportScheduler } from '../services/dynamicReportScheduler';
import { DailyReportSender } from '../services/dailyReportSender';
import { ActivityLogError } from '../types/activityLog';
import { GapHandler } from '../handlers/gapHandler';
import { MessageSelectionHandler } from '../handlers/messageSelectionHandler';
import { TimezoneService } from '../services/timezoneService';
import { ITimezoneService } from '../services/interfaces/ITimezoneService';
import { ConfigService } from '../services/configService';
import { IConfigService } from '../interfaces/dependencies';
import { TaskLoggerBot } from '../bot';
import { ITimeProvider, IDiscordBot } from '../interfaces/dependencies';
import { TimeProviderService } from '../services/timeProviderService';
import { ReminderReplyService, IReminderReplyService } from '../services/reminderReplyService';
import { HealthStatus } from '../types/health';
import { logger } from '../utils/logger';
import { SystemError } from '../errors';

/**
 * 活動記録システム統合設定インターフェース
 */
export interface ActivityLoggingConfig {
  /** データベースパス */
  databasePath: string;
  /** Google Gemini APIキー */
  geminiApiKey: string;
  /** デバッグモード */
  debugMode: boolean;
  /** タイムゾーン（デフォルト） */
  defaultTimezone: string;
  /** 自動分析の有効化 */
  enableAutoAnalysis: boolean;
  /** キャッシュ有効期間（分） */
  cacheValidityMinutes: number;
  /** 対象ユーザーID（レガシー設定・将来削除予定） */
  targetUserId: string;
  /** 外部リポジトリの注入（テスト用） */
  repository?: IUnifiedRepository;
  /** 外部時刻プロバイダーの注入（テスト・シミュレーション用） */
  timeProvider?: ITimeProvider;
  /** 外部Geminiサービスの注入（テスト用） */
  geminiService?: IGeminiService;
  /** 外部メッセージ分類サービスの注入（テスト用） */
  messageClassificationService?: IMessageClassificationService;
}

/**
 * 活動記録システム統合クラス
 */
export class ActivityLoggingIntegration {
  // サービス層
  private repository!: IUnifiedRepository;
  private memoRepository!: IMemoRepository;
  private activityLogService!: IActivityLogService;
  private geminiService!: IGeminiService;
  private messageClassificationService!: IMessageClassificationService;
  private gapDetectionService!: IGapDetectionService;
  private dynamicReportScheduler!: DynamicReportScheduler;
  private dailyReportSender!: DailyReportSender;
  private configService!: IConfigService;
  private timezoneService!: ITimezoneService;

  // ハンドラー層
  private editHandler!: EditCommandHandler;
  private summaryHandler!: SummaryHandler;
  private logsHandler!: LogsCommandHandler;
  private timezoneHandler!: TimezoneHandler;
  private gapHandler!: GapHandler;
  private todoCrudHandler!: TodoCrudHandler;
  private messageClassificationHandler!: MessageClassificationHandler;
  private todoInteractionHandler!: TodoInteractionHandler;
  private profileHandler!: ProfileCommandHandler;
  private memoHandler!: MemoCommandHandler;
  private messageSelectionHandler!: MessageSelectionHandler;
  private reminderReplyService!: IReminderReplyService;

  // 設定
  private config: ActivityLoggingConfig;
  private isInitialized: boolean = false;
  private timeProvider: ITimeProvider;
  
  // Bot インスタンス（コマンド処理用）
  private botInstance?: IDiscordBot;
  
  // 非同期処理の管理
  private pendingAnalysisTasks: Set<NodeJS.Immediate> = new Set();
  private isShuttingDown: boolean = false;

  constructor(config: ActivityLoggingConfig) {
    this.config = config;
    // TimeProviderの設定（注入された場合はそれを使用、そうでなければシングルトンから取得）
    this.timeProvider = config.timeProvider || TimeProviderService.getInstance().getTimeProvider();
  }

  /**
   * 活動記録システムを初期化
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.info('ACTIVITY_LOG', 'ℹ️ 活動記録システムは既に初期化済みです');
      return;
    }
    
    try {
      logger.info('ACTIVITY_LOG', '🚀 活動記録システムの初期化を開始...');

      // 1. データベース接続とRepository初期化
      if (this.config.repository) {
        // 外部から注入されたリポジトリを使用（テスト用）
        this.repository = this.config.repository;
        logger.info('ACTIVITY_LOG', '✅ 外部リポジトリを使用（テスト用）');
      } else {
        // 通常の場合は新しいリポジトリを作成
        this.repository = new PartialCompositeRepository(this.config.databasePath);
        
        // リポジトリの初期化を明示的に実行
        await this.repository.initializeDatabase();
        
        // ConfigServiceとTimezoneServiceの初期化（リポジトリを注入）
        this.configService = new ConfigService();
        this.timezoneService = new TimezoneService(this.repository);
        logger.info('ACTIVITY_LOG', '✅ データベース接続・初期化完了');
      }

      // メモリポジトリの初期化
      this.memoRepository = new SqliteMemoRepository(this.config.databasePath);
      logger.info('ACTIVITY_LOG', '✅ メモリポジトリ初期化完了');

      // 外部リポジトリの場合のConfigServiceとTimezoneService初期化
      if (this.config.repository) {
        this.configService = new ConfigService();
        this.timezoneService = new TimezoneService(this.repository);
        logger.info('ACTIVITY_LOG', '✅ ConfigService・TimezoneService初期化完了（外部リポジトリ用）');
      }

      // 2. サービス層の初期化
      // コスト管理機能の初期化（統合版）
      // CompositeRepositoryが複数のインターフェースを統合しているため、同じインスタンスを使用
      if (this.config.geminiService) {
        // 外部から注入されたGeminiServiceを使用（テスト用）
        this.geminiService = this.config.geminiService;
        logger.info('ACTIVITY_LOG', '✅ 外部GeminiServiceを使用（テスト用）');
      } else {
        // 通常の場合は新しいGeminiServiceを作成
        const { GeminiService } = await import('../services/geminiService');
        this.geminiService = new GeminiService(this.repository);
        logger.info('ACTIVITY_LOG', '✅ 新規GeminiServiceを作成');
      }
      
      // ActivityLogServiceにGeminiServiceを注入（リアルタイム分析のため）
      this.activityLogService = new ActivityLogService(this.repository, this.geminiService);
      logger.info('ACTIVITY_LOG', '✅ GeminiService初期化完了（CompositeRepository使用）');
      
      
      this.gapDetectionService = new GapDetectionService(this.repository);
      
      
      // TODO機能サービスの初期化
      if (this.config.messageClassificationService) {
        // 外部から注入されたメッセージ分類サービスを使用（テスト用）
        this.messageClassificationService = this.config.messageClassificationService;
        logger.info('ACTIVITY_LOG', '✅ 外部MessageClassificationServiceを使用（テスト用）');
      } else {
        // 通常の場合は新しいMessageClassificationServiceを作成
        const { MessageClassificationService } = await import('../services/messageClassificationService');
        this.messageClassificationService = new MessageClassificationService(this.geminiService);
        logger.info('ACTIVITY_LOG', '✅ 新規MessageClassificationServiceを作成');
      }
      
      // DynamicReportSchedulerの初期化
      this.dynamicReportScheduler = new DynamicReportScheduler(this.repository);
      
      logger.info('ACTIVITY_LOG', '✅ サービス層初期化完了（TODO統合機能含む）');

      // 3. ハンドラー層の初期化
      this.editHandler = new EditCommandHandler(this.activityLogService);
      this.summaryHandler = new SummaryHandler(
        this.activityLogService,
        this.repository
      );
      this.logsHandler = new LogsCommandHandler(this.activityLogService);
      this.timezoneHandler = new TimezoneHandler(this.repository, this.timezoneService, this.timeProvider);
      this.gapHandler = new GapHandler(
        this.gapDetectionService,
        this.activityLogService
      );
      
      // TODO機能ハンドラーの初期化（分割版）
      this.todoCrudHandler = new TodoCrudHandler(this.repository);
      this.messageClassificationHandler = new MessageClassificationHandler(
        this.repository, // ITodoRepository
        this.repository, // IMessageClassificationRepository  
        this.geminiService,
        this.messageClassificationService
      );
      this.todoInteractionHandler = new TodoInteractionHandler(this.repository);
      
      // プロファイル機能ハンドラーの初期化
      this.profileHandler = new ProfileCommandHandler(this.repository);
      
      // メモ機能ハンドラーの初期化
      this.memoHandler = new MemoCommandHandler(this.memoRepository);
      
      this.messageSelectionHandler = new MessageSelectionHandler();
      
      // 🟢 Green Phase: MessageSelectionHandlerに依存性注入
      this.messageSelectionHandler.setTodoRepository(this.repository);
      this.messageSelectionHandler.setActivityLogService(this.activityLogService);
      this.messageSelectionHandler.setMemoRepository(this.memoRepository);
      this.messageSelectionHandler.setGeminiService(this.geminiService);
      
      // リマインダーReplyサービスの初期化
      const { DiscordMessageClient } = await import('../interfaces/discordClient');
      const discordClient = new DiscordMessageClient();
      this.reminderReplyService = new ReminderReplyService(discordClient);
      
      // TimezoneHandlerにDynamicReportSchedulerのコールバックを設定
      this.timezoneHandler.setTimezoneChangeCallback(async (userId: string, oldTimezone: string | null, newTimezone: string) => {
        try {
          await this.dynamicReportScheduler.onTimezoneChanged(userId, oldTimezone, newTimezone);
          logger.info('ACTIVITY_LOG', `📅 DynamicReportSchedulerに通知: ${userId} ${oldTimezone} -> ${newTimezone}`);
        } catch (error) {
          logger.warn('ACTIVITY_LOG', 'DynamicReportSchedulerへの通知に失敗', { error });
        }
      });
      
      logger.info('ACTIVITY_LOG', '✅ ハンドラー層初期化完了（TODO機能統合済み）');

      this.isInitialized = true;
      logger.info('ACTIVITY_LOG', '🎉 活動記録システム初期化完了！');

    } catch (error) {
      logger.error('ACTIVITY_LOG', '❌ 活動記録システム初期化エラー:', error);
      throw new ActivityLogError(
        '活動記録システムの初期化に失敗しました', 
        'INTEGRATION_INIT_ERROR', 
        { error }
      );
    }
  }

  /**
   * Discord Botにメッセージハンドラーを統合
   * 既存のハンドラーより優先して処理
   */
  integrateWithBot(client: Client, bot?: IDiscordBot): void {
    if (!this.isInitialized) {
      throw new ActivityLogError(
        '活動記録システムが初期化されていません', 
        'SYSTEM_NOT_INITIALIZED'
      );
    }

    logger.info('ACTIVITY_LOG', '🔗 Discord Botへの統合を開始...');

    // Botインスタンスを保存
    this.botInstance = bot;

    // DailyReportSenderの初期化（Botが提供された場合）
    if (bot) {
      this.dailyReportSender = new DailyReportSender(this, bot as unknown as TaskLoggerBot);
      this.dynamicReportScheduler.setReportSender(this.dailyReportSender);
      logger.info('ACTIVITY_LOG', '✅ DailyReportSender初期化完了');
    }

    // 既存のmessageCreateリスナーを一時的に無効化
    const existingListeners = client.listeners('messageCreate');
    client.removeAllListeners('messageCreate');

    // 活動記録システムのメッセージハンドラーを最優先で追加
    client.on('messageCreate', async (message: Message) => {
      const handled = await this.handleMessage(message);
      
      // 活動記録システムで処理されなかった場合は既存のハンドラーに委譲
      if (!handled) {
        for (const listener of existingListeners) {
          try {
            await (listener as Function)(message);
          } catch (error) {
            logger.error('ACTIVITY_LOG', '❌ レガシーハンドラーエラー:', error);
          }
        }
      }
    });

    // ボタンインタラクションハンドラーを追加（TODO機能）
    client.on('interactionCreate', async (interaction) => {
      if (interaction.isButton()) {
        await this.handleButtonInteraction(interaction);
      }
    });

    logger.info('ACTIVITY_LOG', '✅ Discord Bot統合完了（活動記録システム + TODO機能統合）');
  }

  /**
   * メッセージを処理（既存システムとの互換性を保持）
   * @returns 活動記録システムで処理された場合true、そうでなければfalse
   */
  async handleMessage(message: Message): Promise<boolean> {
    try {
      logger.info('ACTIVITY_LOG', '🔍 [活動記録] メッセージ受信:', {
        authorId: message.author?.id,
        authorTag: message.author?.tag,
        isBot: message.author?.bot,
        isDM: message.channel.isDMBased(),
        content: message.content,
        timestamp: new Date().toISOString()
      });

      // Bot自身のメッセージは無視
      if (message.author.bot) {
        logger.info('ACTIVITY_LOG', '  ↳ [活動記録] Botメッセージのため無視');
        return false;
      }

      // DMのみを処理（ギルドチャンネルは無視）
      if (message.guild) {
        logger.info('ACTIVITY_LOG', '  ↳ [活動記録] ギルドメッセージのため無視（DMのみ処理）');
        return false;
      }

      const userId = message.author.id;
      const content = message.content.trim();
      const timezone = await this.getUserTimezone(userId);

      // マルチユーザー対応: 新規ユーザーの自動登録
      const isNewUser = await this.ensureUserRegistered(userId, message.author.username);
      
      // 新規ユーザーの場合、まずウェルカムメッセージを送信
      if (isNewUser && !content.startsWith('!')) {
        const welcomeMessage = this.getWelcomeMessage();
        try {
          await message.reply(welcomeMessage);
          logger.info('ACTIVITY_LOG', `🎉 ウェルカムメッセージ送信完了: ${userId}`);
          // ウェルカムメッセージ送信後、通常の処理も継続
        } catch (error) {
          logger.error('ACTIVITY_LOG', '❌ ウェルカムメッセージ送信エラー:', error);
        }
      }
      
      logger.info('ACTIVITY_LOG', `✅ [活動記録] 処理対象ユーザー: ${userId}`);
      logger.info('ACTIVITY_LOG', `✅ [活動記録] 処理対象メッセージ: "${content}"`)

      // コマンド処理
      if (content.startsWith('!')) {
        logger.info('ACTIVITY_LOG', `🔧 [活動記録] コマンド検出: "${content}"`);
        await this.handleCommand(message, userId, content, timezone);
        return true;
      }

      // リマインダーReply検出処理
      logger.info('ACTIVITY_LOG', `🔍 [リマインダーReply] 検出処理開始: ${userId}`);
      const reminderReplyResult = await this.reminderReplyService.isReminderReply(message);
      
      if (reminderReplyResult.isReminderReply && reminderReplyResult.timeRange) {
        logger.info('ACTIVITY_LOG', '✅ [リマインダーReply] Reply検出成功', { timeRange: reminderReplyResult.timeRange });
        
        // GeminiServiceでAI分析を実行（新しいanalyzeActivityContentメソッドを使用）
        logger.info('ACTIVITY_LOG', `🤖 [リマインダーReply] Gemini分析開始...`);
        const analysis = await this.geminiService.analyzeActivityContent(
          content,
          message.createdAt,
          timezone,
          {
            isReminderReply: true,
            timeRange: reminderReplyResult.timeRange,
            reminderTime: reminderReplyResult.reminderTime,
            reminderContent: reminderReplyResult.reminderContent
          }
        );
        logger.info('ACTIVITY_LOG', '✅ [リマインダーReply] Gemini分析完了', { analysis });
        
        // 分析結果を含めてリマインダーReplyとして活動ログに記録
        const activityLog = {
          userId,
          content,
          inputTimestamp: message.createdAt.toISOString(),
          businessDate: this.calculateBusinessDate(message.createdAt, timezone),
          isReminderReply: true,
          timeRangeStart: reminderReplyResult.timeRange.start.toISOString(),
          timeRangeEnd: reminderReplyResult.timeRange.end.toISOString(),
          contextType: 'REMINDER_REPLY' as const,
          // AI分析結果を追加（新しい構造）
          estimatedStartTime: analysis.timeEstimation.startTime,
          estimatedEndTime: analysis.timeEstimation.endTime,
          estimatedDuration: analysis.timeEstimation.duration,
          activityCategory: analysis.activityCategory.primaryCategory,
          activitySubCategory: analysis.activityCategory.subCategory,
          activityTags: analysis.activityCategory.tags?.join(', '),
          structuredContent: analysis.activityContent.structuredContent,
          aiAnalysisConfidence: analysis.analysisMetadata.confidence,
          aiAnalysisSource: analysis.timeEstimation.source
        };
        
        await this.repository.saveLog(activityLog);
        logger.info('ACTIVITY_LOG', `✅ [リマインダーReply] 活動ログ記録完了: ${userId}`);
        
        // ユーザーに確認メッセージを送信（AI分析結果も含む）
        const timeRange = reminderReplyResult.timeRange;
        const startTime = this.formatTimeForUser(timeRange.start, timezone);
        const endTime = this.formatTimeForUser(timeRange.end, timezone);
        
        await message.reply(`✅ リマインダーへの返信として記録しました。
⏰ 時間範囲: ${startTime} - ${endTime}
📊 カテゴリー: ${analysis.activityCategory.primaryCategory}
📝 ${analysis.activityContent.structuredContent}
🏷️ タグ: ${analysis.activityCategory.tags.join(', ')}`);
        
        return true;
      }

      // 通常のメッセージはAI分類を優先し、分類結果に基づいて適切に記録
      if (content.length > 0 && content.length <= 2000) {
        logger.info('ACTIVITY_LOG', `🤖 メッセージ分類処理開始: ${userId}`);
        
        // 🟢 Green Phase: AI分類をMessageSelectionHandlerに置き換え
        await this.messageSelectionHandler.processNonCommandMessage(message, userId, timezone);
        
        logger.info('ACTIVITY_LOG', `✅ メッセージ分類処理完了: ${userId}`);
        return true;
      }

      return false; // 処理対象外

    } catch (error) {
      logger.error('ACTIVITY_LOG', '❌ メッセージ処理エラー:', error);
      
      // エラーを適切にユーザーに通知
      const errorMessage = error instanceof ActivityLogError 
        ? `❌ ${error.message}`
        : '❌ メッセージ処理中にエラーが発生しました。';
        
      try {
        await message.reply(errorMessage);
      } catch (replyError) {
        logger.error('ACTIVITY_LOG', '❌ エラー返信失敗:', replyError);
      }
      
      return false; // エラーのため未処理扱い
    }
  }

  /**
   * コマンド処理
   */
  private async handleCommand(message: Message, userId: string, content: string, timezone: string): Promise<void> {
    const parts = content.slice(1).split(' ');
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    logger.info('ACTIVITY_LOG', `🎮 コマンド処理: ${command} (${userId}), args: [${args.join(', ')}]`);

    switch (command) {
      case 'edit':
      case '編集':
        await this.editHandler.handle(message, userId, args, timezone);
        break;

      case 'summary':
      case 'サマリー':
        await this.summaryHandler.handle(message, userId, args, timezone);
        break;

      case 'logs':
      case 'ログ':
        await this.logsHandler.handle(message, userId, args, timezone);
        break;

      case 'help':
      case 'ヘルプ':
        await this.showGeneralHelp(message);
        break;

      case 'status':
      case 'ステータス':
        await this.showSystemStatus(message, userId);
        break;

      case 'cost':
      case 'コスト':
        await this.handleCostCommand(message, userId, timezone);
        break;

      case 'timezone':
      case 'タイムゾーン':
        await this.timezoneHandler.handle(message, userId, args);
        break;

      case 'gap':
      case 'ギャップ':
        logger.info('ACTIVITY_LOG', `🔧 gapコマンド実行: ユーザー=${userId}, タイムゾーン=${timezone}, ハンドラー存在=${!!this.gapHandler}`);
        await this.gapHandler.handle(message, userId, args, timezone);
        break;

      case 'unmatched':

      case 'todo':
      case 'タスク':
        logger.info('ACTIVITY_LOG', `📋 todoコマンド実行: ユーザー=${userId}, タイムゾーン=${timezone}`);
        await this.todoCrudHandler.handleCommand(message, userId, args, timezone);
        break;

      case 'profile':
      case 'プロファイル':
        logger.info('ACTIVITY_LOG', `📊 profileコマンド実行: ユーザー=${userId}, タイムゾーン=${timezone}`);
        await this.profileHandler.handle(message, userId, args, timezone);
        break;

      case 'memo':
      case 'メモ':
        logger.info('ACTIVITY_LOG', `📝 memoコマンド実行: ユーザー=${userId}, タイムゾーン=${timezone}`);
        await this.memoHandler.handleCommand(message, args);
        break;

      case 'prompt':
      case 'プロンプト':
      case '通知':
        logger.info('ACTIVITY_LOG', `📢 promptコマンド実行: ユーザー=${userId}, タイムゾーン=${timezone}`);
        if (this.botInstance?.handlePromptCommand) {
          await this.botInstance.handlePromptCommand(message, args, userId, timezone);
        }
        break;

      default:
        // 他のコマンドは既存システムに委譲または無視
        logger.info('ACTIVITY_LOG', `📝 未対応コマンド: ${command}`);
        break;
    }
  }

  /**
   * ボタンインタラクションを処理（TODO機能）
   */
  async handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
    try {
      // マルチユーザー対応: 全ユーザーがボタンを使用可能
      const userId = interaction.user.id;
      const timezone = await this.getUserTimezone(userId);
      
      logger.info('ACTIVITY_LOG', `🔘 ボタンインタラクション処理: ${userId} - ${interaction.customId}`);
      
      // 🟢 Green Phase: MessageSelectionのボタンかTODOボタンかを判定
      if (interaction.customId.startsWith('select_')) {
        // MessageSelectionHandlerに委譲
        await this.messageSelectionHandler.handleButtonInteraction(interaction, userId, timezone);
      } else if (interaction.customId.startsWith('todo_')) {
        // TodoInteractionHandlerに委譲
        await this.handleTodoButtonInteraction(interaction, userId, timezone);
      } else {
        logger.info('ACTIVITY_LOG', '⚠️ 未知のボタンインタラクション', { customId: interaction.customId });
      }
      
    } catch (error) {
      logger.error('ACTIVITY_LOG', '❌ ボタンインタラクション処理エラー:', error);
      
      if (!interaction.replied) {
        try {
          await interaction.reply({ 
            content: '❌ ボタン操作の処理中にエラーが発生しました。', 
            ephemeral: true 
          });
        } catch (replyError) {
          logger.error('ACTIVITY_LOG', '❌ エラー返信失敗:', replyError);
        }
      }
    }
  }

  /**
   * TODOボタンインタラクションを処理
   */
  private async handleTodoButtonInteraction(interaction: ButtonInteraction, userId: string, timezone: string): Promise<void> {
    logger.info('ACTIVITY_LOG', `🔘 TODOボタンインタラクション: ${userId} ${interaction.customId}`);

    // カスタムIDを解析
    const idParts = interaction.customId.split('_');
    const action = idParts[0]; // 'todo'
    const type = idParts[1]; // 'page', 'complete', 'start', 'delete' など
    
    if (action !== 'todo') {
      await interaction.reply({ content: '❌ 無効なボタン操作です。', ephemeral: true });
      return;
    }

    // ページネーションボタンの処理
    if (type === 'page') {
      const pageAction = idParts[2]; // prev または next
      const currentPage = parseInt(idParts[3]);
      await this.todoInteractionHandler.handlePaginationInteraction(interaction, pageAction, currentPage, userId);
    } else {
      // TODOアクションの場合、todoIdは第3要素以降のすべて
      const todoId = idParts.slice(2).join('_');
      await this.todoInteractionHandler.handleTodoActionButton(interaction, type, todoId, userId, timezone);
    }
  }

  /**
   * 活動を記録
   */
  private async recordActivity(message: Message, userId: string, content: string, timezone: string): Promise<void> {
    try {
      logger.info('ACTIVITY_LOG', `📝 活動記録: ${userId} - ${content.substring(0, 50)}...`);

      // 活動を記録
      const log = await this.activityLogService.recordActivity(userId, content, timezone);

      // キャッシュ無効化はシンプルサマリーでは不要
      logger.info('ACTIVITY_LOG', `📋 ログ記録完了: ${userId} ${log.businessDate}`);

      // 記録完了の確認（デバッグモードのみ）
      if (this.config.debugMode) {
        await message.react('✅');
      }

      // 自動分析が有効な場合、バックグラウンドで分析をトリガー
      if (this.config.enableAutoAnalysis) {
        this.triggerAutoAnalysis(userId, log.businessDate, timezone).catch(error => {
          logger.warn('ACTIVITY_LOG', '自動分析エラー', { error });
        });
      }

    } catch (error) {
      logger.error('ACTIVITY_LOG', '❌ 活動記録エラー:', error);
      throw error;
    }
  }

  /**
   * 自動分析をトリガー（バックグラウンド処理）
   */
  private async triggerAutoAnalysis(userId: string, businessDate: string, timezone: string): Promise<void> {
    // シャットダウン中は新しい分析を開始しない
    if (this.isShuttingDown) {
      return;
    }

    // 完全非同期化：メインスレッドをブロックしない
    const immediateHandle = setImmediate(async () => {
      try {
        // シャットダウン中はスキップ
        if (this.isShuttingDown) {
          return;
        }

        // 今日のログ数をチェック
        const logs = await this.activityLogService.getLogsForDate(userId, businessDate, timezone);
        
        // シンプルサマリーでは自動分析は不要
        logger.info('ACTIVITY_LOG', `📋 活動ログ登録完了: ${userId} (${logs.length}件目)`);
      } catch (error) {
        logger.warn('ACTIVITY_LOG', '自動分析トリガー失敗', { error });
      } finally {
        // 完了したタスクを管理セットから除去
        this.pendingAnalysisTasks.delete(immediateHandle);
      }
    });
    
    // タスクを管理セットに追加
    this.pendingAnalysisTasks.add(immediateHandle);
    
    // メインスレッドは即座に制御を返す
  }

  /**
   * システム全般のヘルプを表示
   */
  private async showGeneralHelp(message: Message): Promise<void> {
    const helpMessage = `🤖 **TimeLogger 活動記録システム**

**📝 活動記録**
メッセージを送信するだけで自動記録されます
例: 「プログラミングをしています」

**⚡ 主要コマンド**
\`!summary\` - 今日の活動サマリー表示
\`!profile\` - ユーザープロファイル表示
\`!edit\` - ログの編集・削除
\`!logs\` - 生ログの表示・検索
\`!gap\` - 未記録時間の検出・記録
\`!cost\` - API使用コスト確認
\`!timezone\` - タイムゾーン表示・検索・設定
\`!prompt\` - 活動促し通知の設定・管理
\`!status\` - システム状態確認

**📊 分析機能**
・カテゴリ別時間集計
・タイムライン生成
・生産性分析
・改善提案

**💡 使い方のコツ**
・具体的な活動内容を記録
・「会議」「休憩」「作業」など分かりやすく
・編集機能で後から修正可能

各コマンドの詳細は \`!<コマンド> help\` で確認できます。`;

    await message.reply(helpMessage);
  }

  /**
   * システムステータスを表示
   */
  private async showSystemStatus(message: Message, userId: string): Promise<void> {
    try {
      const stats = await this.activityLogService.getStatistics(userId);
      const isConnected = await this.repository.isConnected();
      
      const statusMessage = `📊 **システムステータス**

**🔗 データベース**: ${isConnected ? '✅ 接続中' : '❌ 切断'}
**📝 総記録数**: ${stats.totalLogs}件
**📅 今日の記録**: ${stats.todayLogs}件
**📈 今週の記録**: ${stats.weekLogs}件

**⚙️ 設定**
・タイムゾーン: ${this.config.defaultTimezone}
・自動分析: ${this.config.enableAutoAnalysis ? '有効' : '無効'}
・デバッグモード: ${this.config.debugMode ? '有効' : '無効'}

**🕐 システム時刻**: ${new Date().toLocaleString('ja-JP', { timeZone: this.config.defaultTimezone })}`;

      await message.reply(statusMessage);
    } catch (error) {
      logger.error('ACTIVITY_LOG', '❌ ステータス表示エラー:', error);
      await message.reply('❌ ステータス情報の取得に失敗しました。');
    }
  }

  /**
   * コストレポートを取得
   */
  async getCostReport(userId: string, timezone: string): Promise<string> {
    try {
      // GeminiService経由でコストレポートを取得
      return await this.geminiService.getDailyCostReport(userId, timezone);
    } catch (error) {
      logger.error('ACTIVITY_LOG', '❌ コストレポート取得エラー:', error);
      return '❌ コストレポートの取得に失敗しました。';
    }
  }

  /**
   * リポジトリインスタンスを取得
   */
  getRepository(): IUnifiedRepository {
    return this.repository;
  }

  /**
   * TimezoneServiceインスタンスを取得
   */
  getTimezoneService(): ITimezoneService {
    return this.timezoneService;
  }

  /**
   * TimezoneHandlerにタイムゾーン変更コールバックを設定（EnhancedScheduler連携用）
   */
  setTimezoneChangeCallback(callback: (userId: string, oldTimezone: string | null, newTimezone: string) => Promise<void>): void {
    if (this.timezoneHandler) {
      this.timezoneHandler.setTimezoneChangeCallback(callback);
      logger.info('ACTIVITY_LOG', '📅 TimezoneHandlerにコールバックを設定しました');
    } else {
      logger.warn('ACTIVITY_LOG', 'TimezoneHandlerが初期化されていません');
    }
  }

  /**
   * 日次サマリーを生成して文字列として取得
   * 自動送信用のメソッド
   */
  async generateDailySummaryText(userId: string, timezone: string): Promise<string> {
    try {
      if (!this.summaryHandler) {
        throw new SystemError('サマリーハンドラーが初期化されていません');
      }

      // モックメッセージオブジェクトを作成
      let summaryText = '';
      
      // プログレスメッセージモック
      const mockProgressMessage = {
        edit: async (content: string) => {
          summaryText = content; // 最終的なサマリーテキストを保存
          return mockProgressMessage;
        }
      };
      
      const mockMessage = {
        reply: async (content: string) => {
          return mockProgressMessage; // プログレスメッセージを返す
        }
      } as Pick<Message, 'reply'>;
      
      // サマリーハンドラーを使って今日のサマリーを生成
      await this.summaryHandler.handle(mockMessage as Message, userId, [], timezone);
      
      return summaryText || '🌅 今日一日お疲れさまでした！\n\nサマリーの詳細は `!summary` コマンドで確認できます。';
    } catch (error) {
      logger.error('ACTIVITY_LOG', '❌ 日次サマリーテキスト生成エラー:', error);
      return '🌅 今日一日お疲れさまでした！\n\nサマリーの詳細は `!summary` コマンドで確認できます。';
    }
  }

  /**
   * システムを正常にシャットダウン
   */
  async shutdown(): Promise<void> {
    try {
      logger.info('ACTIVITY_LOG', '🔄 活動記録システムのシャットダウンを開始...');

      // シャットダウンフラグを設定
      this.isShuttingDown = true;

      // 実行中の非同期分析タスクをキャンセル
      for (const handle of this.pendingAnalysisTasks) {
        clearImmediate(handle);
      }
      this.pendingAnalysisTasks.clear();
      logger.info('ACTIVITY_LOG', '✅ 非同期分析タスクをクリーンアップしました');

      // TODOハンドラーのクリーンアップ（分割版）
      if (this.messageClassificationHandler && typeof this.messageClassificationHandler.destroy === 'function') {
        this.messageClassificationHandler.destroy();
        logger.info('ACTIVITY_LOG', '✅ メッセージ分類ハンドラーをクリーンアップしました');
      }

      if (this.repository) {
        await this.repository.close();
        logger.info('ACTIVITY_LOG', '✅ データベース接続を閉じました');
      }

      this.isInitialized = false;
      logger.info('ACTIVITY_LOG', '✅ 活動記録システムのシャットダウン完了');
    } catch (error) {
      logger.error('ACTIVITY_LOG', '❌ シャットダウンエラー:', error);
      throw error;
    }
  }

  /**
   * システムの健全性チェック
   */
  async healthCheck(): Promise<HealthStatus> {
    try {
      const checks = {
        discordReady: false,
        activityLoggingInitialized: this.isInitialized,
        databaseConnected: false,
        servicesReady: false,
        handlersReady: false
      };

      if (this.isInitialized) {
        // データベース接続チェック
        checks.databaseConnected = await this.repository.isConnected();

        // サービス存在チェック
        checks.servicesReady = !!(this.activityLogService);

        // ハンドラー存在チェック
        checks.handlersReady = !!(this.editHandler && this.summaryHandler && this.logsHandler && this.timezoneHandler);

        // Discord Bot接続チェック（統合済みの場合）
        checks.discordReady = !!(this.botInstance);
      }

      const healthy = checks.activityLoggingInitialized && 
                     checks.databaseConnected && 
                     checks.servicesReady && 
                     checks.handlersReady;

      return { 
        healthy, 
        checks,
        details: {
          initialized: checks.activityLoggingInitialized,
          database: checks.databaseConnected,
          services: checks.servicesReady,
          handlers: checks.handlersReady
        },
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('ACTIVITY_LOG', '❌ ヘルスチェックエラー:', error);
      return { 
        healthy: false, 
        checks: {
          discordReady: false,
          activityLoggingInitialized: false,
          databaseConnected: false
        },
        details: { 
          errors: [String(error)] 
        },
        timestamp: new Date()
      };
    }
  }

  /**
   * 設定を取得
   */
  getConfig(): ActivityLoggingConfig {
    return { ...this.config };
  }

  /**
   * 統計情報を取得
   */
  async getSystemStats(): Promise<{
    totalUsers: number;
    totalLogs: number;
    isInitialized: boolean;
    uptime: number;
    config: {
      enableAutoAnalysis: boolean;
      [key: string]: unknown;
    };
  }> {
    if (!this.isInitialized) {
      throw new ActivityLogError('システムが初期化されていません', 'SYSTEM_NOT_INITIALIZED');
    }

    try {
      // リポジトリから全体統計を取得
      const totalUsers = await this.repository.getLogCount(''); // 全ユーザー
      const totalLogs = await this.repository.getLogCount('');
      
      return {
        totalUsers,
        totalLogs,
        isInitialized: this.isInitialized,
        uptime: process.uptime(),
        config: {
          enableAutoAnalysis: this.config.enableAutoAnalysis,
          debugMode: this.config.debugMode,
          defaultTimezone: this.config.defaultTimezone
        }
      };
    } catch (error) {
      logger.error('ACTIVITY_LOG', '❌ システム統計取得エラー:', error);
      throw new ActivityLogError('システム統計の取得に失敗しました', 'GET_SYSTEM_STATS_ERROR', { error });
    }
  }

  /**
   * コストコマンドを処理
   * @param message Discordメッセージ
   * @param userId ユーザーID
   * @param timezone タイムゾーン
   */
  private async handleCostCommand(message: Message, userId: string, timezone: string): Promise<void> {
    try {
      logger.info('ACTIVITY_LOG', `💰 コスト情報要求: ${userId}, timezone: ${timezone}`);
      
      // GeminiServiceが利用可能かチェック
      if (!this.geminiService) {
        logger.error('ACTIVITY_LOG', '❌ GeminiServiceが初期化されていません');
        await message.reply('❌ コスト情報の取得機能が利用できません。');
        return;
      }

      logger.info('ACTIVITY_LOG', '🔍 GeminiService利用可能、コストレポート生成中...');

      // API使用コストレポートを生成
      const costReport = await this.geminiService.getDailyCostReport(userId, timezone);
      
      logger.info('ACTIVITY_LOG', `📊 コストレポート生成完了: ${costReport.substring(0, 100)}...`);

      // Discordに送信
      await message.reply(costReport);
      
      logger.info('ACTIVITY_LOG', `✅ コストレポート送信完了: ${userId}`);
      
    } catch (error) {
      logger.error('ACTIVITY_LOG', '❌ コストコマンドエラー:', error);
      logger.error('ACTIVITY_LOG', '❌ エラー詳細:', {
        name: (error as Error).name,
        message: (error as Error).message,
        stack: (error as Error).stack?.split('\n').slice(0, 3)
      });
      await message.reply('❌ コスト情報の取得中にエラーが発生しました。しばらく後でもう一度お試しください。');
    }
  }


  /**
   * ユーザーのタイムゾーンを取得
   * @param userId ユーザーID
   * @returns タイムゾーン文字列
   */
  private async getUserTimezone(userId: string): Promise<string> {
    try {
      // データベースからユーザーのタイムゾーンを取得
      if ('getUserTimezone' in this.repository) {
        const dbTimezone = await this.repository.getUserTimezone(userId);
        if (dbTimezone) {
          return dbTimezone;
        }
      }

      // フォールバック: デフォルト値を使用
      return this.config.defaultTimezone;
    } catch (error) {
      logger.error('ACTIVITY_LOG', '❌ タイムゾーン取得エラー:', error);
      return this.config.defaultTimezone;
    }
  }

  /**
   * ユーザーの登録状態を確認し、未登録の場合は自動登録
   * @returns 新規ユーザーの場合true、既存ユーザーの場合false
   */
  private async ensureUserRegistered(userId: string, username: string): Promise<boolean> {
    try {
      // IUserRepositoryメソッドを使用
      const userExists = await this.repository.userExists(userId);
      
      if (!userExists) {
        await this.repository.registerUser(userId, username);
        logger.info('ACTIVITY_LOG', `🎉 新規ユーザー自動登録: ${userId} (${username})`);
        return true; // 新規ユーザー
      } else {
        // 最終利用日時を更新
        await this.repository.updateLastSeen(userId);
        return false; // 既存ユーザー
      }
    } catch (error) {
      logger.error('ACTIVITY_LOG', '❌ ユーザー登録確認エラー:', error);
      // 登録エラーは処理を止めない（ログ記録は継続）
      return false;
    }
  }

  /**
   * ウェルカムメッセージの生成
   */
  private getWelcomeMessage(): string {
    return `
🎉 **TimeLoggerへようこそ！**

アカウントを自動作成しました。

📊 **アカウント情報**
タイムゾーン: Asia/Tokyo
登録日: ${new Date().toLocaleDateString('ja-JP')}

📝 **使い方**
- 活動記録: そのままメッセージを送信
- 今日のサマリー: \`!summary\`
- プロファイル確認: \`!profile\`
- コマンド一覧: \`!help\`

さっそく今日の活動を記録してみましょう！
    `.trim();
  }

  /**
   * 業務日を計算（5am基準）
   */
  private calculateBusinessDate(timestamp: Date, timezone: string): string {
    // TimeProviderを使用してユーザーのタイムゾーンで5am基準の業務日を計算
    const localTime = new Date(timestamp.toLocaleString('en-US', { timeZone: timezone }));
    const businessDate = new Date(localTime);
    
    // 5am未満の場合は前日扱い
    if (localTime.getHours() < 5) {
      businessDate.setDate(businessDate.getDate() - 1);
    }
    
    return businessDate.toISOString().split('T')[0]; // YYYY-MM-DD形式
  }

  /**
   * ユーザーのタイムゾーンで時刻をフォーマット
   */
  private formatTimeForUser(timestamp: Date, timezone: string): string {
    return timestamp.toLocaleString('ja-JP', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  }

  /**
   * 全ユーザーのタイムゾーン情報を取得（Bot用）
   */
  async getAllUserTimezones(): Promise<Array<{ user_id: string; timezone: string }>> {
    if (!this.isInitialized) {
      throw new ActivityLogError('システムが初期化されていません', 'SYSTEM_NOT_INITIALIZED');
    }

    try {
      // スケジューラー用のメソッドを使用して、フィールド名を変換
      const userTimezones = await this.repository.getAllUserTimezonesForScheduler();
      return userTimezones.map(({ userId, timezone }) => ({
        user_id: userId,
        timezone
      }));
    } catch (error) {
      logger.error('ACTIVITY_LOG', '❌ 全ユーザータイムゾーン取得エラー:', error);
      throw new ActivityLogError('全ユーザータイムゾーンの取得に失敗しました', 'GET_ALL_USER_TIMEZONES_ERROR', { error });
    }
  }

  /**
   * システムリソースをクリーンアップ（TODO機能統合対応）
   */
  async destroy(): Promise<void> {
    try {
      logger.info('ACTIVITY_LOG', '🧹 活動記録システムのクリーンアップ開始...');

      // TODO機能ハンドラーのクリーンアップ（分割版）
      if (this.messageClassificationHandler && typeof this.messageClassificationHandler.destroy === 'function') {
        this.messageClassificationHandler.destroy();
        logger.info('ACTIVITY_LOG', '✅ メッセージ分類ハンドラークリーンアップ完了');
      }

      // データベースリポジトリのクリーンアップ
      if (this.repository) {
        await this.repository.close();
        logger.info('ACTIVITY_LOG', '✅ データベース接続クリーンアップ完了');
      }

      this.isInitialized = false;
      logger.info('ACTIVITY_LOG', '🎉 活動記録システムクリーンアップ完了');

    } catch (error) {
      logger.error('ACTIVITY_LOG', '❌ システムクリーンアップエラー:', error);
      throw new ActivityLogError(
        'システムクリーンアップに失敗しました', 
        'SYSTEM_CLEANUP_ERROR', 
        { error }
      );
    }
  }
}

/**
 * デフォルト設定を生成
 */
export function createDefaultConfig(databasePath: string, geminiApiKey: string): ActivityLoggingConfig {
  return {
    databasePath,
    geminiApiKey,
    debugMode: process.env.NODE_ENV !== 'production',
    defaultTimezone: 'Asia/Tokyo',
    enableAutoAnalysis: true,
    cacheValidityMinutes: 60,
    targetUserId: '' // マルチユーザー対応により削除（レガシー設定）
  };
}

/**
 * 活動記録システム統合のファクトリー関数
 */
export async function createActivityLoggingIntegration(config: ActivityLoggingConfig): Promise<ActivityLoggingIntegration> {
  const integration = new ActivityLoggingIntegration(config);
  await integration.initialize();
  return integration;
}