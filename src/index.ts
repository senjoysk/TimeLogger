import { validateConfig } from './config';
import { TaskLoggerBot } from './bot';
import { Scheduler } from './scheduler';
import { NightSuspendServer } from './api/nightSuspendServer';
import { MorningMessageRecovery } from './services/morningMessageRecovery';
import { SqliteNightSuspendRepository } from './repositories/sqliteNightSuspendRepository';

/**
 * アプリケーションのメインエントリーポイント
 * Discord Task Logger の起動と初期化を行う
 */
class Application {
  private bot: TaskLoggerBot;
  private scheduler: Scheduler;
  private nightSuspendServer: NightSuspendServer | null = null;

  constructor() {
    this.bot = new TaskLoggerBot();
    // スケジューラーの初期化はBotの初期化後に行う
    this.scheduler = null as any;
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
      this.scheduler = new Scheduler(this.bot, repository);
      
      // スケジューラーの開始
      await this.scheduler.start();
      console.log('');
      
      // 夜間サスペンドサーバーの起動
      console.log('🌙 夜間サスペンドサーバーを起動中...');
      await this.setupNightSuspendServer();
      console.log('');
      
      console.log('🎉 Discord Task Logger が正常に起動しました！');
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
        
        // 環境変数からターゲットユーザーIDを取得
        const targetUserId = process.env.DISCORD_TARGET_USER_ID;
        
        if (discordClient && targetUserId) {
          morningRecovery = new MorningMessageRecovery(discordClient, nightSuspendRepo, {
            targetUserId: targetUserId,
            timezone: 'Asia/Tokyo'
          });
          console.log('✅ メッセージリカバリサービスが設定されました');
        } else {
          console.warn('⚠️ Discord ClientまたはターゲットユーザーIDが設定されていません');
        }
      }

      // 夜間サスペンドサーバーの起動
      this.nightSuspendServer = new NightSuspendServer(morningRecovery);
      await this.nightSuspendServer.start();
      
      console.log('🌙 夜間サスペンドサーバーが正常に起動しました');
      console.log('📡 API エンドポイント:');
      console.log('  - POST /api/night-suspend (認証必要)');
      console.log('  - POST /api/wake-up (認証必要)');
      console.log('  - POST /api/morning-recovery (認証必要)');
      console.log('  - GET /health (認証不要)');
      console.log('  - GET /api/suspend-status (認証不要)');
      
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