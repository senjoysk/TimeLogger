import { validateConfig } from './config';
import { TaskLoggerBot } from './bot';
import { EnhancedScheduler } from './enhancedScheduler';
import { DynamicReportScheduler } from './services/dynamicReportScheduler';
import { TimezoneChangeMonitor } from './services/timezoneChangeMonitor';
import { IntegratedServer } from './server';

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
    this.dynamicScheduler = new DynamicReportScheduler();
    this.timezoneMonitor = new TimezoneChangeMonitor();
  }

  /**
   * アプリケーションを起動
   */
  public async start(): Promise<void> {
    try {
      console.log('🚀 Discord Task Logger を起動しています...\n');
      
      // 設定の検証
      validateConfig();
      console.log('');
      
      // Discord Bot の起動
      await this.bot.start();
      console.log('');
      
      // システム初期化の完了を待つ
      console.log('⏳ システム初期化の完了を待機中...');
      await this.bot.waitForSystemInitialization();
      
      // 統合HTTPサーバーの起動（Admin Web App + Health Check）
      if (process.env.ADMIN_USER && process.env.ADMIN_PASSWORD) {
        console.log('🌐 統合HTTPサーバーを起動中...');
        const databasePath = process.env.DATABASE_PATH || './data/new-activity-logs.db';
        this.integratedServer = new IntegratedServer(databasePath);
        await this.integratedServer.start();
      } else {
        console.log('ℹ️ ADMIN_USER/ADMIN_PASSWORD未設定のため、Web管理アプリは起動しません');
      }
      
      // スケジューラーの初期化（活動記録システム初期化完了後）
      console.log('📅 スケジューラーを初期化中...');
      const repository = this.bot.getRepository();
      if (!repository) {
        console.warn('⚠️ リポジトリが取得できませんが、活動記録システムで続行します');
      }
      this.scheduler = new EnhancedScheduler(this.bot, repository);
      
      // 動的スケジューラーの設定
      this.dynamicScheduler.setRepository(repository);
      this.timezoneMonitor.setRepository(repository);
      this.timezoneMonitor.setScheduler(this.dynamicScheduler);
      
      // EnhancedSchedulerに動的コンポーネントを統合
      this.scheduler.setDynamicScheduler(this.dynamicScheduler);
      this.scheduler.setTimezoneMonitor(this.timezoneMonitor);
      
      // 18:30レポート送信機能を設定
      this.scheduler.setReportSender(async (userId: string, timezone: string) => {
        console.log(`📊 ${timezone}の18:30になりました - ユーザー ${userId} に日次レポートを送信中...`);
        await this.bot.sendDailySummaryForUser(userId);
      });
      
      // TimezoneHandlerのコールバック設定（!timezone set 時のEnhancedScheduler連携）
      this.bot.setTimezoneChangeCallback(async (userId: string, oldTimezone: string | null, newTimezone: string) => {
        await this.scheduler.onUserTimezoneChanged(userId, oldTimezone, newTimezone);
      });
      
      // スケジューラーの開始
      await this.scheduler.start();
      console.log('');
      
      
      console.log('🎉 Discord Task Logger が正常に起動しました！');
      
      // 動的スケジューラーの状態を表示
      const status = this.scheduler.getComprehensiveStatus();
      console.log('📈 スケジューラー状態:');
      console.log(`  - 静的スケジュール: ${status.staticSchedules.length}個`);
      console.log(`  - 動的スケジュール: ${status.dynamicSchedules.activeJobCount}個のcronジョブ`);
      console.log(`  - タイムゾーン監視: ${status.timezoneMonitoring.isRunning ? '有効' : '無効'}`);
      console.log('📝 タスクの記録を開始します...\n');
      
      // 終了処理の設定
      this.setupGracefulShutdown();
      
    } catch (error) {
      console.error('❌ アプリケーションの起動に失敗しました:', error);
      process.exit(1);
    }
  }

  /**
   * アプリケーションを停止
   */
  public async stop(): Promise<void> {
    try {
      console.log('\n🛑 Discord Task Logger を停止しています...');
      
      // スケジューラーの停止
      this.scheduler.stop();
      
      // 動的スケジューラーの統計を表示
      const metrics = this.scheduler.getPerformanceMetrics();
      console.log(`📊 送信統計: ${metrics.totalReportsSent}件のレポートを送信`);
      if (Object.keys(metrics.timezoneDistribution).length > 0) {
        console.log('🌍 タイムゾーン分布:', metrics.timezoneDistribution);
      }
      
      
      // Discord Bot の停止
      await this.bot.stop();
      
      console.log('✅ Discord Task Logger が正常に停止しました');
      
    } catch (error) {
      console.error('❌ アプリケーションの停止中にエラーが発生しました:', error);
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
        console.log(`\n📡 ${signal} シグナルを受信しました`);
        await this.stop();
        process.exit(0);
      });
    });

    // 未捕捉エラーの処理
    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ 未処理のPromise拒否:', reason);
      console.error('Promise:', promise);
    });

    process.on('uncaughtException', (error) => {
      console.error('❌ 未捕捉の例外:', error);
      this.stop().finally(() => {
        process.exit(1);
      });
    });
  }

}

// アプリケーションの実行
const app = new Application();
app.start().catch((error) => {
  console.error('❌ アプリケーション起動エラー:', error);
  process.exit(1);
});