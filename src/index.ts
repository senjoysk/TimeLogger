import { validateConfig } from './config';
import { TaskLoggerBot } from './bot';
import { EnhancedScheduler } from './enhancedScheduler';
import { DynamicReportScheduler } from './services/dynamicReportScheduler';
import { TimezoneChangeMonitor } from './services/timezoneChangeMonitor';
import { IntegratedServer } from './server';
import { logger } from './utils/logger';

/**
 * アプリケーションのメインエントリーポイント
 * Discord Task Logger の起動と初期化を行う
 */
class Application {
  private bot: TaskLoggerBot;
  private scheduler: EnhancedScheduler;
  private dynamicScheduler: DynamicReportScheduler;
  private timezoneMonitor: TimezoneChangeMonitor;
  private integratedServer: IntegratedServer | null = null;

  constructor() {
    this.bot = new TaskLoggerBot();
    // スケジューラーの初期化はBotの初期化後に行う
    this.scheduler = null as any;
    // DynamicReportSchedulerとTimezoneChangeMonitorはリポジトリ取得後に初期化
    this.dynamicScheduler = null as any;
    this.timezoneMonitor = null as any;
  }

  /**
   * アプリケーションを起動
   */
  public async start(): Promise<void> {
    try {
      logger.info('APP', 'Discord Task Logger を起動しています...');
      
      // 設定の検証
      validateConfig();
      
      // Discord Bot の起動
      await this.bot.start();
      
      // システム初期化の完了を待つ
      logger.info('APP', 'システム初期化の完了を待機中...');
      await this.bot.waitForSystemInitialization();
      
      // 統合HTTPサーバーの起動（Admin Web App + Health Check）
      if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
        logger.info('APP', '統合HTTPサーバーを起動中...');
        const databasePath = process.env.DATABASE_PATH || './data/app.db';
        this.integratedServer = new IntegratedServer(databasePath, this.bot as unknown as import('./interfaces/dependencies').IDiscordBot);
        await this.integratedServer.start();
      } else {
        logger.info('APP', 'ADMIN_USERNAME/ADMIN_PASSWORD未設定のため、Web管理アプリは起動しません');
      }
      
      // スケジューラーの初期化（活動記録システム初期化完了後）
      logger.info('APP', 'スケジューラーを初期化中...');
      const repository = this.bot.getRepository();
      if (!repository) {
        logger.error('APP', 'リポジトリが取得できないため、スケジューラーの初期化をスキップします');
        return;
      }
      // スケジューラーと動的コンポーネントを初期化
      this.dynamicScheduler = new DynamicReportScheduler(repository);
      this.timezoneMonitor = new TimezoneChangeMonitor(repository, this.dynamicScheduler);
      this.scheduler = new EnhancedScheduler(this.bot, repository);
      
      // EnhancedSchedulerに動的コンポーネントを統合
      this.scheduler.setDynamicScheduler(this.dynamicScheduler);
      this.scheduler.setTimezoneMonitor(this.timezoneMonitor);
      
      // 18:30レポート送信機能を設定
      this.scheduler.setReportSender(async (userId: string, timezone: string) => {
        logger.info('SCHEDULER', `${timezone}の18:30になりました - ユーザー ${userId} に日次レポートを送信中...`);
        await this.bot.sendDailySummaryForUser(userId);
      });
      
      // TimezoneHandlerのコールバック設定（!timezone set 時のEnhancedScheduler連携）
      this.bot.setTimezoneChangeCallback(async (userId: string, oldTimezone: string | null, newTimezone: string) => {
        await this.scheduler.onUserTimezoneChanged(userId, oldTimezone, newTimezone);
      });
      
      // スケジューラーの開始
      await this.scheduler.start();
      
      
      logger.success('APP', 'Discord Task Logger が正常に起動しました！');
      
      // 動的スケジューラーの状態を表示
      const status = this.scheduler.getComprehensiveStatus();
      logger.info('APP', 'スケジューラー状態', {
        静的スケジュール: status.staticSchedules.length,
        動的スケジュール: status.dynamicSchedules.activeJobCount,
        タイムゾーン監視: status.timezoneMonitoring.isRunning ? '有効' : '無効'
      });
      logger.info('APP', 'タスクの記録を開始します...');
      
      // 終了処理の設定
      this.setupGracefulShutdown();
      
    } catch (error) {
      logger.error('APP', 'アプリケーションの起動に失敗しました', error);
      process.exit(1);
    }
  }

  /**
   * アプリケーションを停止
   */
  public async stop(): Promise<void> {
    try {
      logger.info('APP', 'Discord Task Logger を停止しています...');
      
      // スケジューラーの停止
      this.scheduler.stop();
      
      // 動的スケジューラーの統計を表示
      const metrics = this.scheduler.getPerformanceMetrics();
      logger.info('APP', '送信統計', {
        totalReportsSent: metrics.totalReportsSent,
        timezoneDistribution: Object.keys(metrics.timezoneDistribution).length > 0 ? metrics.timezoneDistribution : undefined
      });
      
      
      // Discord Bot の停止
      await this.bot.stop();
      
      logger.success('APP', 'Discord Task Logger が正常に停止しました');
      
    } catch (error) {
      logger.error('APP', 'アプリケーションの停止中にエラーが発生しました', error);
    }
  }

  /**
   * グレースフルシャットダウンの設定
   * Ctrl+C や SIGTERM でアプリケーションを適切に終了する
   */
  private setupGracefulShutdown(): void {
    // プロセス終了シグナルをキャッチ
    const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
    
    signals.forEach(signal => {
      process.on(signal, async () => {
        logger.info('APP', `${signal} シグナルを受信しました`);
        await this.stop();
        process.exit(0);
      });
    });

    // 未捕捉エラーの処理
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('APP', '未処理のPromise拒否', reason, { promise: String(promise) });
    });

    process.on('uncaughtException', (error) => {
      logger.error('APP', '未捕捉の例外', error);
      this.stop().finally(() => {
        process.exit(1);
      });
    });
  }

}

// アプリケーションの実行
const app = new Application();
app.start().catch((error) => {
  logger.error('APP', 'アプリケーション起動エラー', error);
  process.exit(1);
});