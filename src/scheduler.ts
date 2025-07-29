import * as cron from 'node-cron';
import { TaskLoggerBot } from './bot';
import { config } from './config';
import { IUnifiedRepository } from './repositories/interfaces';
import { toZonedTime } from 'date-fns-tz';
import { 
  ISchedulerService, 
  ILogger,
  ITimeProvider,
  IConfigService 
} from './interfaces/dependencies';
import { 
  CronSchedulerService,
  ConsoleLogger,
  RealTimeProvider 
} from './factories';
import { ConfigService } from './services/configService';
import { IActivityPromptRepository } from './repositories/interfaces';
// ActivityPromptRepository は PartialCompositeRepository に統合済み

/**
 * Scheduler DI依存関係オプション
 */
export interface SchedulerDependencies {
  schedulerService?: ISchedulerService;
  logger?: ILogger;
  timeProvider?: ITimeProvider;
  configService?: IConfigService;
  activityPromptRepository?: IActivityPromptRepository;
  activityLogRepository?: IUnifiedRepository;
}

/**
 * スケジュール管理クラス
 * 30分間隔の問いかけと日次サマリーの自動実行を管理
 */
export class Scheduler {
  private bot: TaskLoggerBot;
  private repository: IUnifiedRepository;
  private jobs: Map<string, any> = new Map(); // cron.ScheduledTaskからanyに変更（DI対応）
  private userTimezones: Map<string, string> = new Map();
  
  // DI依存関係
  private readonly schedulerService: ISchedulerService;
  private readonly logger: ILogger;
  private readonly timeProvider: ITimeProvider;
  private readonly configService: IConfigService;
  private readonly activityPromptRepository: IActivityPromptRepository | undefined;

  constructor(
    bot: TaskLoggerBot, 
    repository: IUnifiedRepository,
    dependencies?: SchedulerDependencies
  ) {
    this.bot = bot;
    this.repository = dependencies?.activityLogRepository || repository;
    
    // DI依存関係の初期化（デフォルトまたは注入された実装を使用）
    this.schedulerService = dependencies?.schedulerService || new CronSchedulerService();
    this.logger = dependencies?.logger || new ConsoleLogger();
    this.timeProvider = dependencies?.timeProvider || new RealTimeProvider();
    this.configService = dependencies?.configService || new ConfigService();
    
    // PartialCompositeRepository は IActivityPromptRepository を実装しているため直接使用
    this.activityPromptRepository = dependencies?.activityPromptRepository || this.repository;
  }

  /**
   * 全てのスケジュールを開始
   */
  public async start(): Promise<void> {
    this.logger.info('⏰ スケジューラーを開始します...');
    
    // ユーザーのタイムゾーンを取得
    await this.loadUserTimezones();
    
    this.startActivityPromptSchedule();
    this.startDailySummarySchedule();
    this.startApiCostReportSchedule();
    
    this.logger.info('✅ 全てのスケジュールが開始されました');
    this.logScheduleInfo();
  }

  /**
   * 全てのスケジュールを停止
   */
  public stop(): void {
    console.log('🛑 スケジューラーを停止します...');
    
    for (const [name, job] of this.jobs) {
      job.stop();
      console.log(`  ✅ ${name} を停止しました`);
    }
    
    this.jobs.clear();
    console.log('✅ 全てのスケジュールが停止されました');
  }

  /**
   * 活動促しスケジュールを開始
   * 毎分実行し、各ユーザーのタイムゾーンで0分・30分かつ設定時間内の場合に通知
   */
  private startActivityPromptSchedule(): void {
    // 毎分実行（各ユーザーのタイムゾーンで判定）
    const cronPattern = '* * * * *';
    
    const job = this.schedulerService.schedule(cronPattern, async () => {
      try {
        const now = this.timeProvider.now();
        this.logger.debug(`🔔 活動促し通知チェック (UTC: ${now.toISOString()})`);
        
        // 各ユーザーのタイムゾーンで現在時刻をチェック
        await this.checkAndSendActivityPrompts(now);
        
      } catch (error) {
        this.logger.error('❌ 活動促し通知エラー:', error as Error);
      }
    });

    this.jobs.set('activityPrompt', job);
    this.logger.info(`  ✅ 活動促しスケジュール (${cronPattern}) を開始しました`);
  }

  /**
   * 日次サマリースケジュールを開始
   * 毎時0分に実行し、全ユーザーのタイムゾーンでサマリー時刻かチェック
   */
  private startDailySummarySchedule(): void {
    // 毎時0分に実行
    const cronPattern = '0 * * * *';
    
    const job = this.schedulerService.schedule(cronPattern, async () => {
      try {
        const now = this.timeProvider.now();
        this.logger.info(`📊 日次サマリーチェック (UTC: ${now.toISOString()})`);
        
        // 全ユーザーに対してサマリーを送信
        await this.bot.sendDailySummaryForAllUsers();
        
      } catch (error) {
        this.logger.error('❌ 日次サマリースケジュール実行エラー:', error as Error);
      }
    });

    this.jobs.set('dailySummary', job);
    this.logger.info(`  ✅ 日次サマリースケジュール (${cronPattern}) を開始しました`);
  }

  private startApiCostReportSchedule(): void {
    // 毎時5分に実行し、全ユーザーに対してコストレポートを送信
    const cronPattern = '5 * * * *';

    const job = this.schedulerService.schedule(cronPattern, async () => {
      try {
        const now = this.timeProvider.now();
        this.logger.info(`💰 APIコストレポートチェック (UTC: ${now.toISOString()})`);
        
        // 全ユーザーに対してコストレポートを送信
        await this.bot.sendApiCostReportForAllUsers();
        
      } catch (error) {
        this.logger.error('❌ APIコストレポートスケジュール実行エラー:', error as Error);
      }
    });

    this.jobs.set('apiCostReport', job);
    this.logger.info(`  ✅ APIコストレポートスケジュール (${cronPattern}) を開始しました`);
  }

  /**
   * 活動促し通知チェックと送信
   */
  private async checkAndSendActivityPrompts(now: Date): Promise<void> {
    try {
      // 全ユーザーのタイムゾーン情報を取得
      const repository = this.bot.getRepository();
      if (!repository || !repository.getAllUsers) {
        this.logger.warn('ユーザー情報が取得できません');
        return;
      }

      const users = await repository.getAllUsers();
      
      for (const user of users) {
        try {
          // ユーザーのタイムゾーンで現在時刻を取得
          const localTime = toZonedTime(now, user.timezone);
          const localHour = localTime.getHours();
          const localMinute = localTime.getMinutes();
          
          // 環境チェック
          const nodeEnv = process.env.NODE_ENV || 'development';
          const isDevelopment = nodeEnv === 'development';
          
          if (!isDevelopment) {
            // staging/production環境では0分と30分のみチェック
            if (localMinute !== 0 && localMinute !== 30) {
              continue;
            }
          }
          
          // 該当時刻に通知すべきユーザーかチェック
          if (!this.activityPromptRepository) {
            // ActivityPromptRepositoryが未初期化の場合はスキップ
            continue;
          }
          const usersToPrompt = await this.activityPromptRepository.getUsersToPromptAt(localHour, localMinute);
          
          if (usersToPrompt.includes(user.userId)) {
            const envInfo = isDevelopment ? '[DEV]' : '[STG/PROD]';
            this.logger.info(`📢 ${envInfo} 活動促し通知送信: ${user.userId} (${user.timezone} ${localHour}:${localMinute.toString().padStart(2, '0')})`);
            await this.bot.sendActivityPromptToUser(user.userId, user.timezone);
          }
          
        } catch (userError) {
          this.logger.error(`❌ ユーザー ${user.userId} の活動促し通知エラー:`, userError as Error);
          // 個別ユーザーのエラーは継続
        }
      }
    } catch (error) {
      this.logger.error('❌ 活動促し通知チェックエラー:', error as Error);
    }
  }

  /**
   * スケジュール情報をログ出力
   */
  private logScheduleInfo(): void {
    const nodeEnv = process.env.NODE_ENV || 'development';
    const scheduleInfo = nodeEnv === 'development'
      ? '有効（毎分チェック・毎分実行）' 
      : '有効（毎分チェック、0分・30分に実行）';
    
    console.log('\n📅 スケジュール情報:');
    console.log(`  🔔 活動促し機能: ${scheduleInfo}`);
    console.log(`  📊 サマリー時間: 毎日 ${config.app.summaryTime.hour}:00`);
    console.log(`  🌍 対応ユーザー数: ${this.userTimezones.size}`);
    
    // 各ユーザーのタイムゾーン情報を表示
    for (const [userId, timezone] of this.userTimezones) {
      const now = new Date();
      const localTime = toZonedTime(now, timezone);
      console.log(`  👤 ${userId}: ${timezone} (現在時刻: ${localTime.toLocaleString()})`);
    }
    
    if (this.userTimezones.size === 0) {
      console.log('  👤 登録済みユーザーはいません。サマリー送信時に動的に取得します。');
    }
  }

  /**
   * ユーザーのタイムゾーン情報を読み込む
   */
  private async loadUserTimezones(): Promise<void> {
    try {
      // マルチユーザー対応: データベースから全ユーザーのタイムゾーンを取得
      const repository = this.bot.getRepository();
      if (repository && repository.getAllUsers) {
        const users = await repository.getAllUsers();
        for (const user of users) {
          this.userTimezones.set(user.userId, user.timezone);
          console.log(`  → ユーザー ${user.userId} のタイムゾーン: ${user.timezone}`);
        }
      }
      
      // ユーザーがいない場合は空でもOK（サマリー送信時に動的に取得）
      console.log(`  → 読み込み完了: ${this.userTimezones.size}人のユーザー`);
    } catch (error) {
      console.error('❌ タイムゾーン情報の読み込みエラー:', error);
      // エラー時は空のマップで続行
      this.userTimezones.clear();
    }
  }
  

  /**
   * 現在のスケジュール状態を取得
   * @returns スケジュール状態の情報
   */
  public getStatus(): { name: string; isRunning: boolean }[] {
    const status: { name: string; isRunning: boolean }[] = [];
    
    for (const [name] of this.jobs) {
      status.push({
        name,
        // node-cronのScheduledTaskには running プロパティがないため
        // ジョブが存在していれば実行中とみなす
        isRunning: true,
      });
    }
    
    return status;
  }

  /**
   * 特定のスケジュールを手動実行（テスト用）
   * @param scheduleName スケジュール名
   */
  public async executeManually(scheduleName: string): Promise<void> {
    this.logger.info(`🔧 手動実行: ${scheduleName}`);
    
    try {
      switch (scheduleName) {
        case 'activityPrompt':
          await this.checkAndSendActivityPrompts(this.timeProvider.now());
          break;
        case 'dailySummary':
          await this.bot.sendDailySummaryForAllUsers();
          break;
        default:
          throw new Error(`未知のスケジュール名: ${scheduleName}`);
      }
      
      this.logger.info(`✅ ${scheduleName} の手動実行が完了しました`);
    } catch (error) {
      this.logger.error(`❌ ${scheduleName} の手動実行に失敗しました:`, error as Error);
    }
  }
}