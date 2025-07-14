import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { config } from './config';
import { BotStatus } from './types';
import { ActivityLoggingIntegration, createDefaultConfig } from './integration';
import express from 'express';

/**
 * Discord Bot のメインクラス
 * タスク記録の問いかけとユーザーからの回答処理を管理
 */
export class TaskLoggerBot {
  private client: Client;
  private status: BotStatus;
  // 活動記録システム統合
  private activityLoggingIntegration?: ActivityLoggingIntegration;
  // Fly.ioヘルスチェック用HTTPサーバー
  private healthServer?: express.Application;

  constructor() {
    // Discord クライアントの初期化
    this.client = new Client({
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
    this.setupHealthServer();
  }

  /**
   * Fly.ioヘルスチェック用HTTPサーバーを設定
   */
  private setupHealthServer(): void {
    this.healthServer = express();
    
    // ヘルスチェックエンドポイント
    this.healthServer.get('/health', async (req, res) => {
      const healthStatus = await this.checkSystemHealth();
      
      if (healthStatus.status === 'error') {
        // 異常検知時の処理
        await this.handleSystemError(healthStatus);
        res.status(503).json(healthStatus);
      } else {
        res.json(healthStatus);
      }
    });
    
    // システム状態詳細エンドポイント
    this.healthServer.get('/status', async (req, res) => {
      const detailedStatus = await this.getDetailedSystemStatus();
      res.json(detailedStatus);
    });
    
    // 管理者通知テスト用エンドポイント
    this.healthServer.post('/test-notification', async (req, res) => {
      try {
        await this.sendAdminNotification('🧪 **テスト通知**', 'ヘルスチェックシステムの通知テストです。');
        res.json({ success: true, message: '通知テストを送信しました' });
      } catch (error) {
        res.status(500).json({ success: false, error: String(error) });
      }
    });
    
    // 基本的なルート
    this.healthServer.get('/', (req, res) => {
      res.json({
        name: 'TimeLogger Discord Bot',
        version: '1.0.0',
        status: 'running',
        endpoints: {
          health: '/health',
          status: '/status',
          testNotification: '/test-notification'
        }
      });
    });
    
    // サーバー起動
    const port = process.env.PORT || 3000;
    this.healthServer.listen(port, () => {
      console.log(`🏥 ヘルスチェックサーバーがポート${port}で起動しました`);
    });
  }

  /**
   * システムヘルスチェック
   */
  private async checkSystemHealth(): Promise<any> {
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
        await repository.getUserSettings('health-check');
        databaseConnected = true;
      }
    } catch (error) {
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
      botStatus: this.status,
      uptime: process.uptime()
    };
  }
  
  /**
   * 詳細なシステム状態を取得
   */
  private async getDetailedSystemStatus(): Promise<any> {
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
  private async handleSystemError(healthStatus: any): Promise<void> {
    console.error('🚨 システムエラー検知:', healthStatus);
    
    // 管理者通知
    if (config.monitoring.adminNotification.enabled) {
      const errorMessage = healthStatus.issues.join('\n• ');
      await this.sendAdminNotification(
        '🚨 **システムエラー検知**',
        `**検知時刻**: ${healthStatus.timestamp}\n**問題**:\n• ${errorMessage}\n\n**対処**: システムの自動復旧を試行中...`
      );
    }
    
    // 自動復旧試行
    await this.attemptAutoRecovery(healthStatus);
  }
  
  /**
   * 管理者通知を送信
   */
  private async sendAdminNotification(title: string, message: string): Promise<void> {
    try {
      if (!config.monitoring.adminNotification.enabled || !config.monitoring.adminNotification.userId) {
        console.log('⚠️ 管理者通知が無効または管理者IDが未設定です');
        return;
      }
      
      const adminUserId = config.monitoring.adminNotification.userId;
      const fullMessage = `${title}\n\n${message}\n\n---\n*TimeLogger Bot システム監視*`;
      
      await this.sendDirectMessage(adminUserId, fullMessage);
      console.log(`📢 管理者通知送信完了: ${adminUserId}`);
    } catch (error) {
      console.error('❌ 管理者通知送信エラー:', error);
    }
  }
  
  /**
   * 自動復旧試行
   */
  private async attemptAutoRecovery(healthStatus: any): Promise<void> {
    console.log('🔄 自動復旧を試行中...');
    
    // Discord接続の再試行
    if (!healthStatus.checks.discordReady) {
      try {
        console.log('🔄 Discord再接続を試行中...');
        if (this.client.readyAt === null) {
          await this.client.login(config.discord.token);
        }
      } catch (error) {
        console.error('❌ Discord再接続失敗:', error);
      }
    }
    
    // 活動記録システムの再初期化
    if (!healthStatus.checks.activityLoggingInitialized) {
      try {
        console.log('🔄 活動記録システム再初期化を試行中...');
        await this.initializeActivityLogging();
      } catch (error) {
        console.error('❌ 活動記録システム再初期化失敗:', error);
      }
    }
    
    console.log('✅ 自動復旧試行完了');
  }

  /**
   * 活動記録システムを初期化
   */
  private async initializeActivityLogging(): Promise<void> {
    try {
      console.log('🚀 活動記録システム統合開始...');
      
      // 統合設定を作成（既存DBファイルを使用）
      const integrationConfig = createDefaultConfig(
        config.database.path,
        config.gemini.apiKey
      );
      
      // デバッグモードとオートアナリシスを有効化
      integrationConfig.debugMode = true;
      integrationConfig.enableAutoAnalysis = true;
      
      // 活動記録システムを初期化
      this.activityLoggingIntegration = new ActivityLoggingIntegration(integrationConfig);
      await this.activityLoggingIntegration.initialize();
      
      // Discord Clientに統合（自身のBotインスタンスを渡す）
      this.activityLoggingIntegration.integrateWithBot(this.client, this);
      
      console.log('✅ 活動記録システム統合完了！');
      console.log('💡 機能が利用可能:');
      console.log('   - 自然言語でログ記録');
      console.log('   - !edit でログ編集');
      console.log('   - !summary でAI分析表示');
      console.log('   - !logs でログ検索・表示');
      
      
    } catch (error) {
      console.error('❌ 新システム統合エラー:', error);
      throw error; // 新システムの初期化に失敗したら起動を停止
    }
  }

  // 旧システム初期化メソッド削除: 新システムのみ使用

  /**
   * Bot を起動
   */
  public async start(): Promise<void> {
    try {
      console.log('🤖 Discord Bot を起動中...');
      
      // 活動記録システムで独自のデータベース初期化を行う
      
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
    
    // 活動記録システムのシャットダウン
    if (this.activityLoggingIntegration) {
      try {
        await this.activityLoggingIntegration.shutdown();
        console.log('✅ 活動記録システムのシャットダウン完了');
      } catch (error) {
        console.error('❌ 活動記録システムシャットダウンエラー:', error);
      }
    }
    
    // 活動記録システムのシャットダウンのみ実行
    
    console.log('✅ Discord Bot が停止しました');
  }

  /**
   * イベントハンドラーの設定
   */
  private setupEventHandlers(): void {
    // Bot が準備完了したときの処理
    this.client.once('ready', async () => {
      console.log(`✅ ${this.client.user?.tag} としてログインしました`);
      console.log(`🔧 [DEBUG] Bot ID: ${this.client.user?.id}`);
      console.log(`🔧 [DEBUG] マルチユーザー対応で起動中`);
      console.log(`🔧 [DEBUG] Intents: Guilds, DirectMessages, MessageContent`);
      
      // 活動記録システムを統合
      await this.initializeActivityLogging();
    });


    // エラー処理
    this.client.on('error', (error) => {
      console.error('Discord Bot エラー:', error);
    });
  }




  /**
   * 日次サマリーを全ユーザーに送信
   */
  public async sendDailySummaryForAllUsers(): Promise<void> {
    try {
      if (!this.activityLoggingIntegration) {
        console.warn('⚠️ 活動記録システムが初期化されていません');
        return;
      }

      // データベースから全ユーザーを取得
      const repository = this.activityLoggingIntegration.getRepository();
      if (!repository || !repository.getAllUsers) {
        console.warn('⚠️ ユーザー情報を取得できません');
        return;
      }

      const users = await repository.getAllUsers();
      console.log(`📊 全ユーザーへの日次サマリー送信開始: ${users.length}人`);

      for (const user of users) {
        await this.sendDailySummaryToUser(user.userId, user.timezone);
      }

      console.log('✅ 全ユーザーへの日次サマリー送信完了');
    } catch (error) {
      console.error('❌ 全ユーザーへの日次サマリー送信エラー:', error);
    }
  }

  /**
   * 特定ユーザーに日次サマリーを送信（動的スケジューラー用）
   */
  public async sendDailySummaryForUser(userId: string): Promise<void> {
    try {
      // デフォルトタイムゾーンを取得
      const repository = this.activityLoggingIntegration?.getRepository();
      if (repository && repository.getUserSettings) {
        const userSettings = await repository.getUserSettings(userId);
        const timezone = userSettings?.timezone || 'Asia/Tokyo';
        await this.sendDailySummaryToUser(userId, timezone);
      } else {
        await this.sendDailySummaryToUser(userId, 'Asia/Tokyo');
      }
    } catch (error) {
      console.error(`❌ ユーザー ${userId} への日次サマリー送信エラー:`, error);
    }
  }

  /**
   * 指定ユーザーにダイレクトメッセージを送信
   */
  public async sendDirectMessage(userId: string, message: string): Promise<void> {
    try {
      const user = await this.client.users.fetch(userId);
      if (!user) {
        console.error(`❌ ユーザーが見つかりません: ${userId}`);
        return;
      }

      const dmChannel = await user.createDM();
      await dmChannel.send(message);
      console.log(`✅ ${userId} にダイレクトメッセージを送信しました`);
    } catch (error) {
      console.error(`❌ ${userId} へのダイレクトメッセージ送信エラー:`, error);
      throw error;
    }
  }

  /**
   * 特定ユーザーに日次サマリーを送信（内部用）
   */
  private async sendDailySummaryToUser(userId: string, timezone: string): Promise<void> {
    try {
      const user = await this.client.users.fetch(userId);
      if (!user) {
        console.error(`❌ ユーザーが見つかりません: ${userId}`);
        return;
      }

      // サマリー時刻かチェック
      const now = new Date();
      const { toZonedTime } = require('date-fns-tz');
      const localTime = toZonedTime(now, timezone);
      const hours = localTime.getHours();
      
      // サマリー時刻かチェック
      if (hours !== 18) { // config.app.summaryTime.hour
        console.log(`⏰ ${userId} (${timezone}): サマリー時刻ではありません (現在: ${hours}:00)`);
        return;
      }
      
      console.log(`⏰ ${userId} (${timezone}): サマリー時刻です - 送信開始`);

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
        console.log(`✅ ${userId} に日次サマリーを送信しました`);
      } catch (summaryError) {
        console.error(`❌ ${userId} のサマリー生成エラー:`, summaryError);
        
        // フォールバック: シンプルなメッセージ
        const fallbackMessage = '🌅 今日一日お疲れさまでした！\n\n' +
          'サマリーの詳細を確認するには `!summary` コマンドをお使いください。';
        await dmChannel.send(fallbackMessage);
      }
      
      this.status.lastSummaryTime = new Date();
      
    } catch (error) {
      console.error(`❌ ${userId} への日次サマリー送信エラー:`, error);
    }
  }

  /**
   * 日次サマリーを自動送信（レガシーメソッド）
   */
  public async sendDailySummary(): Promise<void> {
    console.log('⚠️ sendDailySummary は非推奨です。sendDailySummaryForAllUsers を使用してください。');
    await this.sendDailySummaryForAllUsers();
  }

  /**
   * APIコストレポートを全ユーザーに送信
   */
  public async sendApiCostReportForAllUsers(): Promise<void> {
    try {
      if (!this.activityLoggingIntegration) {
        console.warn('⚠️ 活動記録システムが初期化されていません');
        return;
      }

      // データベースから全ユーザーを取得
      const repository = this.activityLoggingIntegration.getRepository();
      if (!repository || !repository.getAllUsers) {
        console.warn('⚠️ ユーザー情報を取得できません');
        return;
      }

      const users = await repository.getAllUsers();
      console.log(`💰 全ユーザーへのAPIコストレポート送信開始: ${users.length}人`);

      for (const user of users) {
        await this.sendApiCostReportToUser(user.userId, user.timezone);
      }

      console.log('✅ 全ユーザーへのAPIコストレポート送信完了');
    } catch (error) {
      console.error('❌ 全ユーザーへのAPIコストレポート送信エラー:', error);
    }
  }

  /**
   * 特定ユーザーにAPIコストレポートを送信
   */
  private async sendApiCostReportToUser(userId: string, timezone: string): Promise<void> {
    try {
      const user = await this.client.users.fetch(userId);
      if (!user) {
        console.error(`❌ ユーザーが見つかりません: ${userId}`);
        return;
      }

      // コストレポート時刻かチェック
      const now = new Date();
      const { toZonedTime } = require('date-fns-tz');
      const localTime = toZonedTime(now, timezone);
      const hours = localTime.getHours();
      const minutes = localTime.getMinutes();
      
      // コストレポート時刻かチェック（18:05）
      if (hours !== 18 || minutes !== 5) { // config.app.summaryTime.hour
        console.log(`⏰ ${userId} (${timezone}): コストレポート時刻ではありません (現在: ${hours}:${minutes.toString().padStart(2, '0')})`);
        return;
      }
      
      console.log(`⏰ ${userId} (${timezone}): コストレポート時刻です - 送信開始`);

      const dmChannel = await user.createDM();
      
      if (!this.activityLoggingIntegration) {
        console.warn('⚠️ 活動記録システムが初期化されていません - コストレポートをスキップ');
        return;
      }
      
      // 活動記録システム経由でコストレポートを取得
      const report = await this.activityLoggingIntegration.getCostReport(userId, timezone);
      await dmChannel.send(report);
      console.log(`✅ ${userId} にAPIコストレポートを送信しました`);
    } catch (error) {
      console.error(`❌ ${userId} へのAPIコストレポート送信エラー:`, error);
    }
  }

  /**
   * APIコストレポートを送信（レガシーメソッド）
   */
  public async sendApiCostReport(): Promise<void> {
    console.log('⚠️ sendApiCostReport は非推奨です。sendApiCostReportForAllUsers を使用してください。');
    await this.sendApiCostReportForAllUsers();
  }

  /**
   * コスト警告を全ユーザーに送信
   */
  public async sendCostAlert(message: string): Promise<void> {
    try {
      if (!this.activityLoggingIntegration) {
        console.warn('⚠️ 活動記録システムが初期化されていません');
        return;
      }

      // データベースから全ユーザーを取得
      const repository = this.activityLoggingIntegration.getRepository();
      if (!repository || !repository.getAllUsers) {
        console.warn('⚠️ ユーザー情報を取得できません');
        return;
      }

      const users = await repository.getAllUsers();
      console.log(`🚨 全ユーザーへのコスト警告送信開始: ${users.length}人`);

      for (const user of users) {
        try {
          const discordUser = await this.client.users.fetch(user.userId);
          if (!discordUser) continue;
          
          const dmChannel = await discordUser.createDM();
          await dmChannel.send(`🚨 **コスト警告** 🚨\n${message}`);
          console.log(`✅ ${user.userId} にコスト警告を送信しました`);
        } catch (error) {
          console.error(`❌ ${user.userId} へのコスト警告送信エラー:`, error);
        }
      }

      console.log('✅ 全ユーザーへのコスト警告送信完了');
    } catch (error) {
      console.error('❌ 全ユーザーへのコスト警告送信エラー:', error);
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
   * データベースインスタンスを取得（活動記録システム経由）
   * @returns データベースインスタンス
   */
  public getRepository(): any {
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
  public getActivityLoggingIntegration(): any {
    return this.activityLoggingIntegration;
  }

  /**
   * TimezoneHandlerにタイムゾーン変更コールバックを設定（EnhancedScheduler連携用）
   */
  public setTimezoneChangeCallback(callback: (userId: string, oldTimezone: string | null, newTimezone: string) => Promise<void>): void {
    if (this.activityLoggingIntegration) {
      this.activityLoggingIntegration.setTimezoneChangeCallback(callback);
    } else {
      console.warn('⚠️ ActivityLoggingIntegrationが初期化されていません');
    }
  }

  /**
   * システム初期化が完了しているかチェック
   */
  public isSystemInitialized(): boolean {
    return this.activityLoggingIntegration !== undefined;
  }

  /**
   * システム初期化の完了を待つ
   */
  public async waitForSystemInitialization(timeoutMs: number = 30000): Promise<void> {
    const startTime = Date.now();
    
    while (!this.isSystemInitialized()) {
      if (Date.now() - startTime > timeoutMs) {
        throw new Error('システム初期化がタイムアウトしました');
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

}