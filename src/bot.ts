import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { config } from './config';
import { BotStatus } from './types';
import { ActivityLoggingIntegration, createDefaultConfig } from './integration';

/**
 * Discord Bot のメインクラス
 * タスク記録の問いかけとユーザーからの回答処理を管理
 */
export class TaskLoggerBot {
  private client: Client;
  private status: BotStatus;
  // 活動記録システム統合
  private activityLoggingIntegration?: ActivityLoggingIntegration;

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
      
      // Discord Clientに統合
      this.activityLoggingIntegration.integrateWithBot(this.client);
      
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
   * 特定ユーザーに日次サマリーを送信
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