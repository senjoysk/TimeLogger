import { validateConfig } from './config';
import { TaskLoggerBot } from './bot';
import { EnhancedScheduler } from './enhancedScheduler';
import { DynamicReportScheduler } from './services/dynamicReportScheduler';
import { TimezoneChangeMonitor } from './services/timezoneChangeMonitor';
import { NightSuspendServer } from './api/nightSuspendServer';
import { MorningMessageRecovery } from './services/morningMessageRecovery';
import { SqliteNightSuspendRepository } from './repositories/sqliteNightSuspendRepository';

/**
 * アプリケーションのメインエントリーポイント
 * Discord Task Logger の起動と初期化を行う
 */
class Application {
  private bot: TaskLoggerBot;
  private scheduler: EnhancedScheduler;
  private dynamicScheduler: DynamicReportScheduler;
  private timezoneMonitor: TimezoneChangeMonitor;
  private nightSuspendServer: NightSuspendServer | null = null;

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
      
      // 夜間サスペンドサーバーの起動
      console.log('🌙 夜間サスペンドサーバーを起動中...');
      await this.setupNightSuspendServer();
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
      
      // 夜間サスペンドサーバーの停止
      if (this.nightSuspendServer) {
        await this.nightSuspendServer.stop();
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

  /**
   * 夜間サスペンドサーバーの設定
   */
  private async setupNightSuspendServer(): Promise<void> {
    try {
      // データベースとリポジトリの取得
      const repository = this.bot.getRepository();
      if (!repository) {
        console.warn('⚠️ リポジトリが取得できないため、夜間サスペンドサーバーはメッセージリカバリなしで起動します');
      }

      // 夜間サスペンド機能の設定
      let morningRecovery: MorningMessageRecovery | undefined;
      
      if (repository) {
        // SqliteNightSuspendRepositoryの作成（既存のリポジトリのDatabaseを使用）
        const nightSuspendRepo = new SqliteNightSuspendRepository((repository as any).db);
        
        // Discord Clientの取得
        const discordClient = this.bot.getClient();
        
        if (discordClient) {
          // マルチユーザー対応: 全ユーザーに対応したメッセージリカバリサービス
          morningRecovery = new MorningMessageRecovery(discordClient, nightSuspendRepo, {
            targetUserId: '', // マルチユーザー対応のため空文字（全ユーザー対応）
            timezone: 'Asia/Tokyo'
          });
          console.log('✅ メッセージリカバリサービスが設定されました（マルチユーザー対応）');
        } else {
          console.warn('⚠️ Discord Clientが設定されていません');
        }
      }

      // ActivityLoggingIntegrationの取得
      const activityIntegration = this.bot.getActivityLoggingIntegration();
      
      // 夜間サスペンドサーバーの起動
      this.nightSuspendServer = new NightSuspendServer(morningRecovery, activityIntegration);
      await this.nightSuspendServer.start();
      
      console.log('🌙 夜間サスペンドサーバーが正常に起動しました');
      console.log('📡 API エンドポイント:');
      console.log('  - POST /api/night-suspend (認証必要)');
      console.log('  - POST /api/wake-up (認証必要)');
      console.log('  - POST /api/morning-recovery (認証必要)');
      console.log('  - GET /health (認証不要)');
      console.log('  - GET /api/suspend-status (認証不要)');
      console.log('  - GET /api/schedule-check (認証不要)');
      
    } catch (error) {
      console.error('❌ 夜間サスペンドサーバーの起動に失敗しました:', error);
      console.warn('⚠️ 夜間サスペンド機能なしで続行します');
    }
  }
}

// アプリケーションの実行
const app = new Application();
app.start().catch((error) => {
  console.error('❌ アプリケーション起動エラー:', error);
  process.exit(1);
});