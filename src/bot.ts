import { Client, GatewayIntentBits, Message, Partials } from 'discord.js';
import { config } from './config';
import { isWorkingHours } from './utils/timeUtils';
import { BotStatus } from './types';
import { SqliteRepository } from './repositories/sqliteRepository';
import { GeminiService } from './services/geminiService';
import { ActivityService } from './services/activityService';
import { SummaryService } from './services/summaryService';
import { CommandManager } from './handlers/commandManager';
import { TimezoneCommandHandler } from './handlers/timezoneCommandHandler';
import { SummaryCommandHandler } from './handlers/summaryCommandHandler';
import { CostCommandHandler } from './handlers/costCommandHandler';
import { EditCommandHandler } from './handlers/editCommandHandler';
import { ActivityHandler } from './handlers/activityHandler';
import { SummaryHandler } from './handlers/summaryHandler';
import { CostReportHandler } from './handlers/costReportHandler';
import { ErrorHandler, ErrorType, withErrorHandling } from './utils/errorHandler';

/**
 * Discord Bot のメインクラス
 * タスク記録の問いかけとユーザーからの回答処理を管理
 */
export class TaskLoggerBot {
  private client: Client;
  private status: BotStatus;
  private repository: SqliteRepository;
  private geminiService: GeminiService;
  private activityService: ActivityService;
  private summaryService: SummaryService;
  private commandManager!: CommandManager;

  constructor() {
    // Discord クライアントの初期化
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
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

    // サービスの初期化（依存関係注入）
    this.repository = new SqliteRepository(config.database.path);
    this.geminiService = new GeminiService(this.repository);
    this.activityService = new ActivityService(this.repository, this.geminiService);
    this.summaryService = new SummaryService(this.repository, this.geminiService);

    // ハンドラーの初期化
    this.initializeCommandManager();

    this.setupEventHandlers();
  }

  /**
   * コマンドマネージャーを初期化
   */
  private initializeCommandManager(): void {
    // ハンドラーの作成
    const activityHandler = new ActivityHandler(this.activityService);
    const summaryHandler = new SummaryHandler(this.summaryService);
    const costReportHandler = new CostReportHandler(this.geminiService);

    // コマンドマネージャーの初期化
    this.commandManager = new CommandManager(
      activityHandler,
      summaryHandler,
      costReportHandler
    );

    // コマンドハンドラーの登録
    const timezoneHandler = new TimezoneCommandHandler(this.repository);
    const summaryCommandHandler = new SummaryCommandHandler(this.summaryService);
    const costCommandHandler = new CostCommandHandler(this.geminiService);
    const editCommandHandler = new EditCommandHandler(this.repository);
    
    this.commandManager.registerCommandHandler('timezone', timezoneHandler);
    this.commandManager.registerCommandHandler('summary', summaryCommandHandler);
    this.commandManager.registerCommandHandler('cost', costCommandHandler);
    this.commandManager.registerCommandHandler('edit', editCommandHandler);
  }

  /**
   * Bot を起動
   */
  public async start(): Promise<void> {
    try {
      console.log('🤖 Discord Bot を起動中...');
      
      // データベースの初期化
      await this.repository.initialize();
      
      await this.client.login(config.discord.token);
      this.status.isRunning = true;
      
      console.log('✅ Discord Bot が正常に起動しました');
    } catch (error) {
      console.error('❌ Discord Bot の起動に失敗しました:', error);
      throw error;
    }
  }

  /**
   * Bot を停止
   */
  public async stop(): Promise<void> {
    console.log('🛑 Discord Bot を停止中...');
    
    this.status.isRunning = false;
    this.client.destroy();
    
    // データベース接続を閉じる
    await this.repository.close();
    
    console.log('✅ Discord Bot が停止しました');
  }

  /**
   * イベントハンドラーの設定
   */
  private setupEventHandlers(): void {
    // Bot が準備完了したときの処理
    this.client.once('ready', () => {
      console.log(`✅ ${this.client.user?.tag} としてログインしました`);
      console.log(`🔧 [DEBUG] Bot ID: ${this.client.user?.id}`);
      console.log(`🔧 [DEBUG] 設定されたTARGET_USER_ID: ${config.discord.targetUserId}`);
      console.log(`🔧 [DEBUG] Intents: Guilds, DirectMessages, MessageContent`);
    });

    // メッセージを受信したときの処理
    this.client.on('messageCreate', async (message: Message) => {
      console.log('🚨 [DEBUG] messageCreate イベント発火！');
      
      // パーシャルメッセージの場合はフルメッセージを取得
      if (message.partial) {
        console.log('📄 [DEBUG] パーシャルメッセージを検出、フルメッセージを取得中...');
        try {
          await message.fetch();
          console.log('📄 [DEBUG] フルメッセージ取得完了');
        } catch (error) {
          console.error('❌ [DEBUG] フルメッセージ取得エラー:', error);
          return;
        }
      }
      
      await this.handleMessage(message);
    });

    // エラー処理
    this.client.on('error', (error) => {
      console.error('Discord Bot エラー:', error);
    });
  }

  /**
   * 受信したメッセージを処理
   * @param message 受信したメッセージ
   */
  private async handleMessage(message: Message): Promise<void> {
    // チャンネルがパーシャルの場合はフルチャンネルを取得
    if (message.channel.partial) {
      console.log('🔧 [DEBUG] パーシャルチャンネルを検出、フルチャンネルを取得中...');
      try {
        await message.channel.fetch();
        console.log('🔧 [DEBUG] フルチャンネル取得完了');
      } catch (error) {
        console.error('❌ [DEBUG] フルチャンネル取得エラー:', error);
        return;
      }
    }

    // デバッグ: 全メッセージをログ出力
    console.log('📨 [DEBUG] メッセージ受信:', {
      authorId: message.author?.id,
      authorTag: message.author?.tag,
      isBot: message.author?.bot,
      isDM: message.channel.isDMBased(),
      channelType: message.channel.type,
      content: message.content,
      timestamp: new Date().toISOString()
    });

    // Bot自身のメッセージは無視
    if (message.author.bot) {
      console.log('  ↳ [DEBUG] Botのメッセージのため無視');
      return;
    }

    // まず全てのメッセージを処理してみる（診断用）
    console.log('🔍 [DEBUG] 全メッセージ処理モード - フィルタリングを一時的に無効化');
    
    // 対象ユーザー以外のメッセージは無視
    if (message.author.id !== config.discord.targetUserId) {
      console.log(`  ↳ [DEBUG] 対象外ユーザーのため無視 (受信: ${message.author.id}, 期待: ${config.discord.targetUserId})`);
      return;
    }

    // DMのみを処理
    if (!message.channel.isDMBased()) {
      console.log('  ↳ [DEBUG] DMではないため無視 (チャンネルタイプ:', message.channel.type, ')');
      return;
    }

    const content = message.content.trim();
    console.log(`✅ 処理対象メッセージ: "${content}"`);
    
    try {
      const userId = message.author.id;
      const userTimezone = await withErrorHandling(
        () => this.repository.getUserTimezone(userId),
        ErrorType.DATABASE,
        { userId, operation: 'getUserTimezone' }
      );

      // CommandManagerに処理を委譲
      await withErrorHandling(
        () => this.commandManager.handleMessage(message, userTimezone),
        ErrorType.SYSTEM,
        { userId, operation: 'handleMessage' }
      );
    } catch (error) {
      const userMessage = ErrorHandler.handle(error);
      await message.reply(userMessage);
    }
  }


  /**
   * 30分間の活動について問いかけ
   */
  public async sendActivityPrompt(): Promise<void> {
    console.log('🕐 [DEBUG] 30分間隔問いかけ実行開始');
    
    try {
      // 対象ユーザーを取得
      console.log(`  ↳ [DEBUG] 対象ユーザー取得中: ${config.discord.targetUserId}`);
      const user = await this.client.users.fetch(config.discord.targetUserId);
      if (!user) {
        console.error('  ↳ [DEBUG] ❌ 対象ユーザーが見つかりません');
        return;
      }
      console.log(`  ↳ [DEBUG] ユーザー取得成功: ${user.tag}`);

      // ユーザーのタイムゾーンを取得
      const userTimezone = await this.repository.getUserTimezone(user.id);

      // 働く時間帯でない場合はスキップ
      if (!isWorkingHours(userTimezone)) {
        console.log('  ↳ [DEBUG] 働く時間帯ではないため、問いかけをスキップしました');
        return;
      }

      // DMチャンネルを作成/取得
      console.log('  ↳ [DEBUG] DMチャンネル作成中...');
      const dmChannel = await user.createDM();
      
      // 現在の時間枠を取得
      const timeSlot = require('./utils/timeUtils').getCurrentTimeSlot(userTimezone);
      console.log(`  ↳ [DEBUG] 時間枠: ${timeSlot.label}`);
      
      // 問いかけメッセージを送信
      const promptMessage = 
        `⏰ **${timeSlot.label}の活動記録**\n\n` +
        `この30分間なにしてた？\n` +
        `どんなことでも気軽に教えてください！`;

      console.log('  ↳ [DEBUG] 問いかけメッセージ送信中...');
      await dmChannel.send(promptMessage);
      
      console.log(`  ↳ [DEBUG] 問いかけメッセージ送信完了: ${timeSlot.label}`);
      this.status.lastPromptTime = new Date();
      
    } catch (error) {
      console.error('❌ [DEBUG] 問いかけ送信エラー:', error);
    }
  }

  /**
   * 日次サマリーを自動送信
   */
  public async sendDailySummary(): Promise<void> {
    try {
      // 対象ユーザーを取得
      const user = await this.client.users.fetch(config.discord.targetUserId);
      if (!user) {
        console.error('❌ 対象ユーザーが見つかりません');
        return;
      }

      // DMチャンネルを作成/取得
      const dmChannel = await user.createDM();
      
      const userTimezone = await this.repository.getUserTimezone(config.discord.targetUserId);
      
      // 日次サマリーを生成
      const summary = await this.summaryService.getDailySummary(config.discord.targetUserId, userTimezone);
      
      // 簡潔なサマリーとして送信
      const briefSummary = this.summaryService.formatBriefSummary(summary);
      await dmChannel.send(briefSummary);
      
      console.log('✅ 日次サマリーを送信しました');
      this.status.lastSummaryTime = new Date();
      
    } catch (error) {
      console.error('❌ 日次サマリー送信エラー:', error);
      
      // エラー時も簡単なメッセージを送信
      try {
        const user = await this.client.users.fetch(config.discord.targetUserId);
        const dmChannel = await user.createDM();
        await dmChannel.send(
          '🌅 今日一日お疲れさまでした！\n\n' +
          'サマリーの生成中にエラーが発生しましたが、\n' +
          '今日も素晴らしい一日だったことでしょう。\n\n' +
          '明日も頑張りましょう！'
        );
      } catch (fallbackError) {
        console.error('❌ フォールバックメッセージ送信もエラー:', fallbackError);
      }
    }
  }

  public async sendApiCostReport(): Promise<void> {
    try {
      const user = await this.client.users.fetch(config.discord.targetUserId);
      if (!user) {
        console.error('❌ 対象ユーザーが見つかりません');
        return;
      }
      const dmChannel = await user.createDM();

      const userTimezone = await this.repository.getUserTimezone(user.id);
      const report = await this.geminiService.getDailyCostReport(user.id, userTimezone);
      await dmChannel.send(report);
      console.log('✅ APIコストレポートを送信しました');
    } catch (error) {
      console.error('❌ APIコストレポート送信エラー:', error);
    }
  }

  public async sendCostAlert(message: string): Promise<void> {
    try {
      const user = await this.client.users.fetch(config.discord.targetUserId);
      if (!user) {
        console.error('❌ 対象ユーザーが見つかりません');
        return;
      }
      const dmChannel = await user.createDM();

      await dmChannel.send(`🚨 **コスト警告** 🚨\n${message}`);
      console.log('✅ コスト警告を送信しました');
    } catch (error) {
      console.error('❌ コスト警告送信エラー:', error);
    }
  }

  /**
   * Bot の稼働状態を取得
   * @returns 現在の稼働状態
   */
  public getStatus(): BotStatus {
    return { ...this.status };
  }

  /**
   * データベースインスタンスを取得
   * @returns データベースインスタンス
   */
  public getRepository(): SqliteRepository {
    return this.repository;
  }

}