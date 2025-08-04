/**
 * @SRP-EXCEPTION: Discord Bot統合クラスとして複数の機能統合が必要
 * @SRP-REASON: コマンドハンドリング、メッセージ処理、スケジューリング統合のため段階的分割中
 */
import { Client, GatewayIntentBits, Partials, Message } from 'discord.js';
import { config } from './config';
import { ActivityLoggingIntegration, createDefaultConfig } from './integration';
import type { UserInfo } from './interfaces/dependencies';

/**
 * Bot の動作状態
 */
interface BotStatus {
  isRunning: boolean;
  lastPromptTime?: Date;
  lastSummaryTime?: Date;
  scheduledJobs: string[];
  timezone?: string;
}
import { 
  IClientFactory, 
  IConfigService, 
  ILogger,
  ITimeProvider 
} from './interfaces/dependencies';
import { IActivityLogRepository } from './repositories/activityLogRepository';
import { IUnifiedRepository } from './repositories/interfaces';
import { HealthStatus, RecoveryAttemptResult } from './types/health';
import { 
  DiscordClientFactory, 
  RealTimeProvider,
  ConsoleLogger 
} from './factories';
import { ConfigService } from './services/configService';
import { ITimezoneService } from './services/interfaces/ITimezoneService';
import { PromptCommandHandler } from './handlers/promptCommandHandler';
import { IActivityPromptRepository } from './repositories/interfaces';
import { ACTIVITY_PROMPT_VALIDATION } from './types/activityPrompt';
import { DatabaseError, SystemError, DiscordError, TimeoutError, NotFoundError } from './errors';
import { ErrorHandler } from './utils/errorHandler';
import { logger } from './utils/logger';

/**
 * DI依存関係オプション
 */
export interface TaskLoggerBotDependencies {
  clientFactory?: IClientFactory;
  configService?: IConfigService;
  logger?: ILogger;
  timeProvider?: ITimeProvider;
  timezoneService?: ITimezoneService;
}

/**
 * Discord Bot のメインクラス
 * タスク記録の問いかけとユーザーからの回答処理を管理
 */
export class TaskLoggerBot {
  private client: Client;
  private status: BotStatus;
  // 活動記録システム統合
  private activityLoggingIntegration?: ActivityLoggingIntegration;
  // HTTPサーバーはIntegratedServerに統合済み
  // エラー発生回数トラッキング
  private errorCounters: Map<string, number> = new Map();
  // 活動促しコマンドハンドラー
  private promptCommandHandler?: PromptCommandHandler;
  
  // DI依存関係
  private readonly clientFactory: IClientFactory;
  private readonly configService: IConfigService;
  private readonly logger: ILogger;
  private readonly timeProvider: ITimeProvider;
  private timezoneService?: ITimezoneService;

  constructor(dependencies?: TaskLoggerBotDependencies) {
    // DI依存関係の初期化（デフォルトまたは注入された実装を使用）
    this.clientFactory = dependencies?.clientFactory || new DiscordClientFactory();
    this.configService = dependencies?.configService || new ConfigService();
    this.logger = dependencies?.logger || new ConsoleLogger();
    this.timeProvider = dependencies?.timeProvider || new RealTimeProvider();
    this.timezoneService = dependencies?.timezoneService;

    // Discord クライアントの初期化（ファクトリー使用）
    this.client = this.clientFactory.create({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.MessageContent,
      ],
      partials: [
        Partials.Channel,
        Partials.Message,
      ],
    });

    this.status = {
      isRunning: false,
      scheduledJobs: [],
    };

    // 活動記録システムで統合管理

    this.setupEventHandlers();
    // ヘルスチェックサーバーはIntegratedServerに統合
  }

  // ヘルスチェックサーバーはIntegratedServerに統合済み

  /**
   * システムヘルスチェック
   */
  private async checkSystemHealth(): Promise<{
    status: 'ok' | 'error';
    timestamp: string;
    checks: {
      discordReady: boolean;
      activityLoggingInitialized: boolean;
      databaseConnected: boolean;
    };
    issues: string[];
    botStatus: string;
    uptime: number;
  }> {
    const issues = [];
    
    // Discord接続チェック
    const discordReady = this.client.readyAt !== null;
    if (!discordReady) {
      issues.push('Discord接続が確立されていません');
    }
    
    // 活動記録システムチェック
    const activityLoggingInitialized = this.activityLoggingIntegration !== undefined;
    if (!activityLoggingInitialized) {
      issues.push('活動記録システムが初期化されていません');
    }
    
    // データベース接続チェック
    let databaseConnected = false;
    try {
      const repository = this.activityLoggingIntegration?.getRepository();
      if (repository) {
        // 簡単なクエリでデータベース接続を確認
        // getAllUsersメソッドを使用（存在することが確認済み）
        await repository.getAllUsers();
        databaseConnected = true;
      }
    } catch (error) {
      const dbError = new DatabaseError('データベース接続エラー', {
        operation: 'checkSystemHealth',
        error
      }, error instanceof Error ? error : undefined);
      
      logger.error('HEALTH_CHECK', 'データベース接続エラー', dbError);
      issues.push(`データベース接続エラー: ${String(error)}`);
    }
    
    const status = issues.length === 0 ? 'ok' : 'error';
    
    return {
      status,
      timestamp: new Date().toISOString(),
      checks: {
        discordReady,
        activityLoggingInitialized,
        databaseConnected
      },
      issues,
      botStatus: String(this.status),
      uptime: process.uptime()
    };
  }
  
  /**
   * 詳細なシステム状態を取得
   */
  private async getDetailedSystemStatus(): Promise<{
    status: 'ok' | 'error';
    timestamp: string;
    checks: {
      discordReady: boolean;
      activityLoggingInitialized: boolean;
      databaseConnected: boolean;
    };
    issues: string[];
    botStatus: string;
    uptime: number;
    environment: Record<string, unknown>;
    discord: Record<string, unknown>;
    config: Record<string, unknown>;
  }> {
    const healthStatus = await this.checkSystemHealth();
    
    return {
      ...healthStatus,
      environment: {
        nodeEnv: process.env.NODE_ENV,
        platform: process.platform,
        nodeVersion: process.version,
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage()
      },
      discord: {
        clientId: this.client.user?.id,
        username: this.client.user?.username,
        guilds: this.client.guilds.cache.size,
        users: this.client.users.cache.size,
        ping: this.client.ws.ping
      },
      config: {
        adminNotificationsEnabled: config.monitoring.adminNotification.enabled,
        healthCheckEnabled: config.monitoring.healthCheck.enabled
      }
    };
  }
  
  /**
   * システムエラーハンドリング
   */
  private async handleSystemError(healthStatus: HealthStatus): Promise<void> {
    logger.error('SYSTEM_ERROR', 'システムエラー検知', undefined, {
      healthStatus: healthStatus as unknown as Record<string, unknown>
    });
    
    // 重大なエラーかどうかを判定
    const isCriticalError = this.isCriticalError(healthStatus);
    
    // 管理者通知（重大なエラーの場合のみ）
    if (config.monitoring.adminNotification.enabled && isCriticalError) {
      const errorMessage = healthStatus.details?.errors?.join('\n• ') || 'システムエラーが発生しました';
      await this.sendAdminNotification(
        '🚨 **システムエラー検知**',
        `**検知時刻**: ${healthStatus.timestamp}\n**問題**:\n• ${errorMessage}\n\n**対処**: システムの自動復旧を試行中...`
      );
    }
    
    // 自動復旧試行
    await this.attemptAutoRecovery(healthStatus);
  }
  
  /**
   * 重大なエラーかどうかを判定
   */
  private isCriticalError(healthStatus: HealthStatus): boolean {
    // Discord接続が切れている場合は重大
    if (!healthStatus.checks.discordReady) {
      this.incrementErrorCount('discord_connection');
      return true;
    }
    
    // 活動記録システムが初期化されていない場合は重大
    if (!healthStatus.checks.activityLoggingInitialized) {
      this.incrementErrorCount('activity_logging');
      return true;
    }
    
    // データベース接続エラーが連続して発生している場合
    if (!healthStatus.checks.databaseConnected) {
      const errorCount = this.incrementErrorCount('database_connection');
      // 3回以上連続でエラーが発生した場合は重大とみなす
      if (errorCount >= 3) {
        return true;
      }
    } else {
      // 正常な場合はカウンターをリセット
      this.resetErrorCount('database_connection');
    }
    
    // それ以外は重大ではない（一時的なエラーの可能性）
    return false;
  }
  
  /**
   * エラーカウンターを増加
   */
  private incrementErrorCount(errorType: string): number {
    const currentCount = this.errorCounters.get(errorType) || 0;
    const newCount = currentCount + 1;
    this.errorCounters.set(errorType, newCount);
    logger.warn('BOT', `エラーカウント増加: ${errorType} = ${newCount}回`);
    return newCount;
  }
  
  /**
   * エラーカウンターをリセット
   */
  private resetErrorCount(errorType: string): void {
    if (this.errorCounters.has(errorType)) {
      this.errorCounters.set(errorType, 0);
      logger.info('BOT', `エラーカウントリセット: ${errorType}`);
    }
  }
  
  /**
   * 管理者通知を送信
   */
  private async sendAdminNotification(title: string, message: string): Promise<void> {
    try {
      if (!config.monitoring.adminNotification.enabled || !config.monitoring.adminNotification.userId) {
        logger.warn('BOT', '管理者通知が無効または管理者IDが未設定です');
        return;
      }
      
      const adminUserId = config.monitoring.adminNotification.userId;
      const fullMessage = `${title}\n\n${message}\n\n---\n*TimeLogger Bot システム監視*`;
      
      await this.sendDirectMessage(adminUserId, fullMessage);
      logger.info('BOT', `管理者通知送信完了: ${adminUserId}`);
    } catch (error) {
      const notifyError = new SystemError('管理者通知送信エラー', {
        operation: 'sendAdminNotification',
        error
      }, error instanceof Error ? error : undefined);
      
      logger.error('ADMIN_NOTIFY', '管理者通知送信エラー', notifyError);
      // 通知エラーは握りつぶさず再スロー
      throw notifyError;
    }
  }
  
  /**
   * 自動復旧試行
   */
  private async attemptAutoRecovery(healthStatus: HealthStatus): Promise<void> {
    logger.info('BOT', '自動復旧を試行中...');
    
    // Discord接続の再試行
    if (!healthStatus.checks.discordReady) {
      try {
        logger.info('BOT', 'Discord再接続を試行中...');
        if (this.client.readyAt === null) {
          await this.client.login(config.discord.token);
        }
      } catch (error) {
        const discordError = new DiscordError('Discord再接続失敗', {
          operation: 'recoverDiscordConnection',
          error
        }, error instanceof Error ? error : undefined);
        
        logger.error('DISCORD_RECOVERY', 'Discord再接続失敗', discordError);
        throw discordError;
      }
    }
    
    // 活動記録システムの再初期化
    if (!healthStatus.checks.activityLoggingInitialized) {
      try {
        logger.info('BOT', '活動記録システム再初期化を試行中...');
        await this.initializeActivityLogging();
      } catch (error) {
        const initError = new SystemError('活動記録システム再初期化失敗', {
          operation: 'recoverActivityLogging',
          error
        }, error instanceof Error ? error : undefined);
        
        logger.error('ACTIVITY_LOGGING_RECOVERY', '活動記録システム再初期化失敗', initError);
        throw initError;
      }
    }
    
    logger.success('BOT', '自動復旧試行完了');
  }

  /**
   * 活動記録システムを初期化
   */
  private async initializeActivityLogging(): Promise<void> {
    try {
      logger.info('BOT', '活動記録システム統合開始...');
      
      // 統合設定を作成（既存DBファイルを使用）
      const integrationConfig = createDefaultConfig(
        config.database.path,
        config.gemini.apiKey
      );
      
      // デバッグモードとオートアナリシスを有効化
      integrationConfig.debugMode = true;
      integrationConfig.enableAutoAnalysis = true;
      
      // リポジトリを作成
      const { PartialCompositeRepository } = await import('./repositories/PartialCompositeRepository');
      const repository = new PartialCompositeRepository(integrationConfig.databasePath);
      
      // 活動記録システムを初期化
      this.activityLoggingIntegration = new ActivityLoggingIntegration(repository, integrationConfig);
      await this.activityLoggingIntegration.initialize();
      
      // Discord Clientに統合（自身のBotインスタンスを渡す）
      this.activityLoggingIntegration.integrateWithBot(this.client, this as unknown as import('./interfaces/dependencies').IDiscordBot);
      
      // 活動促しコマンドハンドラーを初期化
      await this.initializePromptCommandHandler();
      
      logger.success('BOT', '活動記録システム統合完了！', {
        利用可能機能: [
          '自然言語でログ記録',
          '!edit でログ編集',
          '!summary でAI分析表示',
          '!logs でログ検索・表示'
        ]
      });
      
      
    } catch (error) {
      const integrationError = new SystemError('新システム統合エラー', {
        operation: 'initializeActivityLogging',
        error
      }, error instanceof Error ? error : undefined);
      
      logger.error('INTEGRATION', '新システム統合エラー', integrationError);
      throw integrationError; // 新システムの初期化に失敗したら起動を停止
    }
  }

  // 旧システム初期化メソッド削除: 新システムのみ使用

  /**
   * Bot を起動
   */
  public async start(): Promise<void> {
    try {
      logger.info('BOT', 'Discord Bot を起動中...');
      
      // 活動記録システムで独自のデータベース初期化を行う
      
      await this.client.login(config.discord.token);
      this.status.isRunning = true;
      
      logger.success('BOT', 'Discord Bot が正常に起動しました');
    } catch (error) {
      const startError = new SystemError('Discord Bot の起動に失敗しました', {
        operation: 'start',
        error
      }, error instanceof Error ? error : undefined);
      
      logger.error('BOT_START', 'Discord Bot の起動に失敗しました', startError);
      throw startError;
    }
  }

  /**
   * Bot を停止
   */
  public async stop(): Promise<void> {
    logger.info('BOT', 'Discord Bot を停止中...');
    
    this.status.isRunning = false;
    this.client.destroy();
    
    // 活動記録システムのシャットダウン
    if (this.activityLoggingIntegration) {
      try {
        await this.activityLoggingIntegration.shutdown();
        logger.success('BOT', '活動記録システムのシャットダウン完了');
      } catch (error) {
        const shutdownError = new SystemError('活動記録システムシャットダウンエラー', {
          operation: 'shutdown',
          error
        }, error instanceof Error ? error : undefined);
        
        logger.error('SHUTDOWN', '活動記録システムシャットダウンエラー', shutdownError);
        // シャットダウン時のエラーは握りつぶさず再スロー
        throw shutdownError;
      }
    }
    
    // 活動記録システムのシャットダウンのみ実行
    
    logger.success('BOT', 'Discord Bot が停止しました');
  }

  /**
   * イベントハンドラーの設定
   */
  private setupEventHandlers(): void {
    // Bot が準備完了したときの処理
    this.client.once('ready', async () => {
      logger.success('BOT', `${this.client.user?.tag} としてログインしました`, {
        botId: this.client.user?.id,
        mode: 'マルチユーザー対応',
        intents: 'Guilds, DirectMessages, MessageContent'
      });
      
      // 活動記録システムを統合
      await this.initializeActivityLogging();
    });


    // エラー処理
    this.client.on('error', (error) => {
      const botError = new SystemError('Discord Bot エラー', {
        operation: 'discord_error',
        error
      }, error instanceof Error ? error : undefined);
      logger.error('DISCORD', 'Discord Bot エラー', botError);
    });
  }




  /**
   * 日次サマリーを全ユーザーに送信
   */
  public async sendDailySummaryForAllUsers(): Promise<void> {
    try {
      if (!this.activityLoggingIntegration) {
        logger.warn('BOT', '活動記録システムが初期化されていません');
        return;
      }

      // データベースから全ユーザーを取得
      const repository = this.activityLoggingIntegration.getRepository();
      if (!repository || !repository.getAllUsers) {
        logger.warn('BOT', 'ユーザー情報を取得できません');
        return;
      }

      const users = await repository.getAllUsers();
      logger.info('BOT', `全ユーザーへの日次サマリー送信開始: ${users.length}人`);

      for (const user of users) {
        await this.sendDailySummaryToUser(user.userId, user.timezone);
      }

      logger.success('BOT', '全ユーザーへの日次サマリー送信完了');
    } catch (error) {
      const summaryError = new SystemError('全ユーザーへの日次サマリー送信エラー', {
        operation: 'sendDailySummaryToAllUsers',
        error
      }, error instanceof Error ? error : undefined);
      
      logger.error('SUMMARY', '全ユーザーへの日次サマリー送信エラー', summaryError);
      throw summaryError;
    }
  }

  /**
   * 特定ユーザーに日次サマリーを送信（動的スケジューラー用）
   */
  public async sendDailySummaryForUser(userId: string): Promise<void> {
    try {
      // デフォルトタイムゾーンを取得
      const repository = this.activityLoggingIntegration?.getRepository();
      const timezone = await this.getUserTimezone(userId);
      await this.sendDailySummaryToUser(userId, timezone);
    } catch (error) {
      const userSummaryError = new SystemError(`ユーザー ${userId} への日次サマリー送信エラー`, {
        operation: 'sendDailySummaryForUser',
        userId,
        error
      }, error instanceof Error ? error : undefined);
      
      logger.error('SUMMARY', `ユーザー ${userId} への日次サマリー送信エラー`, userSummaryError);
      throw userSummaryError;
    }
  }

  /**
   * 指定ユーザーにダイレクトメッセージを送信
   */
  public async sendDirectMessage(userId: string, message: string): Promise<void> {
    try {
      const user = await this.client.users.fetch(userId);
      if (!user) {
        const notFoundError = new NotFoundError(`ユーザー: ${userId}`, { userId });
        logger.error('DISCORD', `ユーザーが見つかりません: ${userId}`, notFoundError);
        throw notFoundError;
      }

      const dmChannel = await user.createDM();
      await dmChannel.send(message);
      logger.info('BOT', `${userId} にダイレクトメッセージを送信しました`);
    } catch (error) {
      const dmError = new DiscordError(`${userId} へのダイレクトメッセージ送信エラー`, {
        operation: 'sendDirectMessage',
        userId,
        error
      }, error instanceof Error ? error : undefined);
      
      logger.error('DISCORD', `${userId} へのダイレクトメッセージ送信エラー`, dmError);
      throw dmError;
    }
  }

  /**
   * 特定ユーザーに日次サマリーを送信（内部用）
   */
  private async sendDailySummaryToUser(userId: string, timezone: string): Promise<void> {
    try {
      const user = await this.client.users.fetch(userId);
      if (!user) {
        const notFoundError = new NotFoundError(`ユーザー: ${userId}`, { userId });
        logger.error('DISCORD', `ユーザーが見つかりません: ${userId}`, notFoundError);
        throw notFoundError;
      }

      // サマリー時刻かチェック
      const now = new Date();
      const { toZonedTime } = require('date-fns-tz');
      const localTime = toZonedTime(now, timezone);
      const hours = localTime.getHours();
      const minutes = localTime.getMinutes();
      
      // サマリー時刻かチェック（18:30）
      if (hours !== 18 || minutes !== 30) {
        logger.debug('BOT', `${userId} (${timezone}): サマリー時刻ではありません`, {
          currentTime: `${hours}:${minutes.toString().padStart(2, '0')}`
        });
        return;
      }
      
      logger.info('BOT', `${userId} (${timezone}): サマリー時刻です - 送信開始`);

      const dmChannel = await user.createDM();
      
      if (!this.activityLoggingIntegration) {
        const briefSummary = '🌅 今日一日お疲れさまでした！\n\n活動記録システムでのサマリー機能は開発中です。';
        await dmChannel.send(briefSummary);
        return;
      }

      // 活動記録システムを使って実際のサマリーを生成
      try {
        const summaryText = await this.activityLoggingIntegration.generateDailySummaryText(userId, timezone);
        await dmChannel.send(summaryText);
        logger.success('BOT', `${userId} に日次サマリーを送信しました`);
      } catch (summaryError) {
        const genError = new SystemError(`${userId} のサマリー生成エラー`, {
          operation: 'generateDailySummaryText',
          userId,
          error: summaryError
        }, summaryError instanceof Error ? summaryError : undefined);
        
        logger.error('SUMMARY', `${userId} のサマリー生成エラー`, genError);
        
        // フォールバック: シンプルなメッセージ
        const fallbackMessage = '🌅 今日一日お疲れさまでした！\n\n' +
          'サマリーの詳細を確認するには `!summary` コマンドをお使いください。';
        await dmChannel.send(fallbackMessage);
      }
      
      this.status.lastSummaryTime = new Date();
      
    } catch (error) {
      const sendError = new SystemError(`${userId} への日次サマリー送信エラー`, {
        operation: 'sendDailySummaryToUser',
        userId,
        timezone,
        error
      }, error instanceof Error ? error : undefined);
      
      logger.error('SUMMARY', `${userId} への日次サマリー送信エラー`, sendError);
      throw sendError;
    }
  }

  /**
   * 日次サマリーを自動送信（レガシーメソッド）
   */
  public async sendDailySummary(): Promise<void> {
    logger.warn('BOT', 'sendDailySummary は非推奨です。sendDailySummaryForAllUsers を使用してください。');
    await this.sendDailySummaryForAllUsers();
  }

  // ========================================
  // テスト用メソッド群
  // ========================================

  /**
   * 登録ユーザー一覧を取得（テスト用）
   */
  public async getRegisteredUsers(): Promise<UserInfo[]> {
    try {
      if (!this.activityLoggingIntegration) {
        return [];
      }

      // SqliteActivityLogRepositoryから登録ユーザーを取得
      const timezoneMap = await this.activityLoggingIntegration.getAllUserTimezones();
      const now = new Date().toISOString();
      const users: UserInfo[] = [];
      
      // Map<timezone, userId[]>をUserInfo[]に変換
      for (const [timezone, userIds] of timezoneMap) {
        for (const userId of userIds) {
          users.push({
            userId,
            username: undefined,
            timezone,
            registrationDate: now,
            lastSeenAt: now,
            isActive: true,
            createdAt: now,
            updatedAt: now
          });
        }
      }
      return users;
    } catch (error) {
      const fetchError = new DatabaseError('登録ユーザー取得エラー', {
        operation: 'getRegisteredUsers',
        error
      }, error instanceof Error ? error : undefined);
      
      logger.error('DATABASE', '登録ユーザー取得エラー', fetchError);
      throw fetchError;
    }
  }

  /**
   * サマリープレビューを生成（テスト用）
   */
  public async generateSummaryPreview(userId: string): Promise<string> {
    try {
      if (!this.activityLoggingIntegration) {
        return '🌅 今日一日お疲れさまでした！\n\n活動記録システムでのサマリー機能は開発中です。';
      }

      // 実際のサマリー生成ロジックを使用
      const timezone = await this.getUserTimezone(userId);
      return await this.activityLoggingIntegration.generateDailySummaryText(userId, timezone);
    } catch (error) {
      logger.error('SUMMARY', `${userId} のサマリープレビュー生成エラー`, error, { userId });
      // プレビュー生成エラーの場合はフォールバックメッセージを返す
      return '🌅 今日一日お疲れさまでした！\n\nサマリーの詳細を確認するには `!summary` コマンドをお使いください。';
    }
  }

  /**
   * 日次サマリーを指定ユーザーに送信（テスト用公開メソッド - 時刻チェックなし）
   */
  public async sendDailySummaryToUserForTest(userId: string, timezone: string): Promise<void> {
    try {
      const user = await this.client.users.fetch(userId);
      if (!user) {
        const notFoundError = new NotFoundError(`ユーザー: ${userId}`, { userId });
        logger.error('DISCORD', `ユーザーが見つかりません: ${userId}`, notFoundError);
        throw notFoundError;
      }

      logger.info('BOT', `${userId} (${timezone}): テストモード - 時刻チェックをスキップして送信開始`);

      const dmChannel = await user.createDM();
      
      if (!this.activityLoggingIntegration) {
        const briefSummary = '🌅 今日一日お疲れさまでした！\n\n活動記録システムでのサマリー機能は開発中です。\n\n（テストモードで送信）';
        await dmChannel.send(briefSummary);
        return;
      }

      // 活動記録システムを使って実際のサマリーを生成
      try {
        const summaryText = await this.activityLoggingIntegration.generateDailySummaryText(userId, timezone);
        await dmChannel.send(summaryText + '\n\n（テストモードで送信）');
        logger.success('BOT', `${userId} に日次サマリーを送信しました（テストモード）`);
      } catch (summaryError) {
        logger.error('SUMMARY', `${userId} のサマリー生成エラー`, summaryError, { userId });
        
        // フォールバック: シンプルなメッセージ
        const fallbackMessage = '🌅 今日一日お疲れさまでした！\n\n' +
          'サマリーの詳細を確認するには `!summary` コマンドをお使いください。\n\n（テストモードで送信）';
        await dmChannel.send(fallbackMessage);
      }
      
      this.status.lastSummaryTime = new Date();
      
    } catch (error) {
      logger.error('SUMMARY', `${userId} へのサマリー送信エラー（テストモード）`, error, { userId, mode: 'test' });
      throw new DiscordError(`サマリー送信に失敗しました: ${error instanceof Error ? error.message : String(error)}`, { userId, mode: 'test', originalError: error });
    }
  }

  /**
   * ユーザーのタイムゾーンを取得（プライベートメソッドのヘルパー）
   */
  private async getUserTimezone(userId: string): Promise<string> {
    try {
      // TimezoneServiceが利用可能な場合は優先して使用
      if (this.timezoneService) {
        return await this.timezoneService.getUserTimezone(userId);
      }
      
      // フォールバック: ActivityLoggingIntegrationから取得
      if (!this.activityLoggingIntegration) {
        return this.getSystemDefaultTimezone();
      }
      
      const timezoneMap = await this.activityLoggingIntegration.getAllUserTimezones();
      // Map<timezone, userId[]>から該当ユーザーを探す
      for (const [timezone, userIds] of timezoneMap) {
        if (userIds.includes(userId)) {
          return timezone;
        }
      }
      return this.getSystemDefaultTimezone();
    } catch (error) {
      logger.error('TIMEZONE', `${userId} のタイムゾーン取得エラー`, error, { userId });
      // デフォルト値を返すのでエラーは再スローしない
      return this.getSystemDefaultTimezone();
    }
  }

  /**
   * システムデフォルトタイムゾーンを取得
   */
  private getSystemDefaultTimezone(): string {
    return this.timezoneService?.getSystemTimezone() || 'Asia/Tokyo';
  }



  /**
   * Bot の稼働状態を取得
   * @returns 現在の稼働状態
   */
  public getStatus(): BotStatus {
    return { ...this.status };
  }

  /**
   * データベースインスタンスを取得（活動記録システム経由）
   * @returns データベースインスタンス
   */
  public getRepository(): IUnifiedRepository | undefined {
    return this.activityLoggingIntegration?.getRepository();
  }

  /**
   * Discord Clientを取得
   */
  public getClient(): Client {
    return this.client;
  }

  /**
   * ActivityLoggingIntegrationインスタンスを取得
   */
  public getActivityLoggingIntegration(): ActivityLoggingIntegration | undefined {
    return this.activityLoggingIntegration;
  }

  /**
   * TimezoneHandlerにタイムゾーン変更コールバックを設定（EnhancedScheduler連携用）
   */
  public setTimezoneChangeCallback(callback: (userId: string, oldTimezone: string | null, newTimezone: string) => Promise<void>): void {
    if (this.activityLoggingIntegration) {
      // コールバックの引数が異なるので、ラッパーを作成
      this.activityLoggingIntegration.setTimezoneChangeCallback((userId: string, timezone: string) => {
        // oldTimezoneは渡されないので、nullとする
        callback(userId, null, timezone);
      });
    } else {
      logger.warn('BOT', 'ActivityLoggingIntegrationが初期化されていません');
    }
  }

  /**
   * システム初期化が完了しているかチェック
   */
  public isSystemInitialized(): boolean {
    return this.activityLoggingIntegration !== undefined && 
           this.activityLoggingIntegration.getRepository() !== undefined;
  }

  /**
   * システム初期化の完了を待つ
   */
  public async waitForSystemInitialization(timeoutMs: number = 30000): Promise<void> {
    const startTime = Date.now();
    
    while (!this.isSystemInitialized()) {
      if (Date.now() - startTime > timeoutMs) {
        throw new TimeoutError('システム初期化', timeoutMs);
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * 活動促しコマンドハンドラーを初期化
   */
  private async initializePromptCommandHandler(): Promise<void> {
    try {
      if (!this.activityLoggingIntegration) {
        throw new SystemError('ActivityLoggingIntegrationが初期化されていません', {
          operation: 'getPromptCommandHandler'
        });
      }

      const repository = this.activityLoggingIntegration.getRepository();
      if (!repository) {
        throw new SystemError('Repositoryが取得できません', {
          operation: 'getPromptCommandHandler'
        });
      }

      // PromptCommandHandlerを初期化（PartialCompositeRepositoryを直接使用）
      this.promptCommandHandler = new PromptCommandHandler(repository);
      
      logger.success('BOT', '活動促しコマンドハンドラーを初期化しました');
    } catch (error) {
      logger.error('INITIALIZATION', '活動促しコマンドハンドラーの初期化に失敗', error);
      throw new SystemError(`活動促しコマンドハンドラーの初期化に失敗しました: ${error instanceof Error ? error.message : String(error)}`, { originalError: error });
    }
  }

  /**
   * 特定ユーザーに活動促し通知を送信
   */
  public async sendActivityPromptToUser(userId: string, timezone: string): Promise<void> {
    try {
      if (!this.client.isReady()) {
        this.logger.error('Discord Clientが準備できていません');
        return;
      }

      // ユーザーを取得
      const user = await this.client.users.fetch(userId).catch(() => null);
      if (!user) {
        this.logger.warn(`ユーザーが見つかりません: ${userId}`);
        return;
      }

      // 活動促しメッセージを送信
      const message = ACTIVITY_PROMPT_VALIDATION.MESSAGES.DEFAULT_PROMPT;
      
      await user.send({
        content: `🤖 **活動記録のお時間です！**\n\n${message}`
      });

      this.logger.info(`📢 活動促し通知送信完了: ${userId} (${timezone})`);
      
    } catch (error) {
      this.logger.error(`❌ 活動促し通知送信失敗: ${userId}`, error as Error);
      throw error;
    }
  }

  /**
   * promptコマンドを処理（統合システムから呼び出される）
   */
  public async handlePromptCommand(message: Message, args: string[], userId: string, timezone: string): Promise<void> {
    if (!this.promptCommandHandler) {
      await message.reply('❌ 活動促し機能が初期化されていません。');
      return;
    }

    await this.promptCommandHandler.handleCommand(message, args, userId, timezone);
  }

}