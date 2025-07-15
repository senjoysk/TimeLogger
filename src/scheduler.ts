import * as cron from 'node-cron';
import { TaskLoggerBot } from './bot';
import { config } from './config';
import { SqliteActivityLogRepository } from './repositories/sqliteActivityLogRepository';
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

/**
 * Scheduler DI依存関係オプション
 */
export interface SchedulerDependencies {
  schedulerService?: ISchedulerService;
  logger?: ILogger;
  timeProvider?: ITimeProvider;
  configService?: IConfigService;
}

/**
 * スケジュール管理クラス
 * 30分間隔の問いかけと日次サマリーの自動実行を管理
 */
export class Scheduler {
  private bot: TaskLoggerBot;
  private repository: SqliteActivityLogRepository;
  private jobs: Map<string, any> = new Map(); // cron.ScheduledTaskからanyに変更（DI対応）
  private userTimezones: Map<string, string> = new Map();
  
  // DI依存関係
  private readonly schedulerService: ISchedulerService;
  private readonly logger: ILogger;
  private readonly timeProvider: ITimeProvider;
  private readonly configService: IConfigService;

  constructor(
    bot: TaskLoggerBot, 
    repository: SqliteActivityLogRepository,
    dependencies?: SchedulerDependencies
  ) {
    this.bot = bot;
    this.repository = repository;
    
    // DI依存関係の初期化（デフォルトまたは注入された実装を使用）
    this.schedulerService = dependencies?.schedulerService || new CronSchedulerService();
    this.logger = dependencies?.logger || new ConsoleLogger();
    this.timeProvider = dependencies?.timeProvider || new RealTimeProvider();
    this.configService = dependencies?.configService || new ConfigService();
  }

  /**
   * 全てのスケジュールを開始
   */
  public async start(): Promise<void> {
    this.logger.info('⏰ スケジューラーを開始します...');
    
    // ユーザーのタイムゾーンを取得
    await this.loadUserTimezones();
    
    // 活動促し機能は削除
    // this.startActivityPromptSchedule();
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
   * 活動促し機能は削除済み（新システムでは自然言語でいつでも記録可能）
   */
  private startActivityPromptSchedule(): void {
    // 活動促し機能は削除（マルチユーザー対応のため）
    console.log('  ✅ 活動促し機能は削除済み（自然言語でいつでも記録可能）');
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
   * スケジュール情報をログ出力
   */
  private logScheduleInfo(): void {
    console.log('\n📅 スケジュール情報:');
    console.log(`  🔔 活動促し機能: 削除済み（マルチユーザー対応）`);
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
    console.log(`🔧 手動実行: ${scheduleName}`);
    
    try {
      switch (scheduleName) {
        case 'activityPrompt':
          console.log('⏰ 活動促し機能は削除済み（マルチユーザー対応）');
          break;
        case 'dailySummary':
          await this.bot.sendDailySummaryForAllUsers();
          break;
        default:
          throw new Error(`未知のスケジュール名: ${scheduleName}`);
      }
      
      console.log(`✅ ${scheduleName} の手動実行が完了しました`);
    } catch (error) {
      console.error(`❌ ${scheduleName} の手動実行に失敗しました:`, error);
    }
  }
}