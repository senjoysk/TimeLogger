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
      console.log(`🔧 [DEBUG] 設定されたTARGET_USER_ID: ${config.discord.targetUserId}`);
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
      
      // 新システムから適切なタイムゾーンを取得
      const userTimezone = process.env.USER_TIMEZONE || 'Asia/Tokyo';
      
      if (!this.activityLoggingIntegration) {
        console.warn('⚠️ 活動記録システムが初期化されていません - プレースホルダーメッセージを送信');
        const briefSummary = '🌅 今日一日お疲れさまでした！\n\n活動記録システムでのサマリー機能は開発中です。';
        await dmChannel.send(briefSummary);
        return;
      }

      // 活動記録システムを使って実際のサマリーを生成
      try {
        const summaryText = await this.activityLoggingIntegration.generateDailySummaryText(user.id, userTimezone);
        await dmChannel.send(summaryText);
        console.log('✅ 活動記録システム経由で日次サマリーを送信しました');
      } catch (summaryError) {
        console.error('❌ 活動記録システムでのサマリー生成エラー:', summaryError);
        
        // フォールバック: シンプルなメッセージ
        const fallbackMessage = '🌅 今日一日お疲れさまでした！\n\n' +
          'サマリーの詳細を確認するには `!summary` コマンドをお使いください。';
        await dmChannel.send(fallbackMessage);
      }
      
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

      const userTimezone = process.env.USER_TIMEZONE || 'Asia/Tokyo';
      
      if (!this.activityLoggingIntegration) {
        console.warn('⚠️ 活動記録システムが初期化されていません - コストレポートをスキップ');
        return;
      }
      
      // 活動記録システム経由でコストレポートを取得
      const report = await this.activityLoggingIntegration.getCostReport(user.id, userTimezone);
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
   * データベースインスタンスを取得（活動記録システム経由）
   * @returns データベースインスタンス
   */
  public getRepository(): any {
    return this.activityLoggingIntegration?.getRepository();
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