import { Client, GatewayIntentBits, Message } from 'discord.js';
import { config } from './config';
import { getCurrentTimeSlot, isWorkingHours } from './utils/timeUtils';
import { BotStatus } from './types';
import { Database } from './database/database';
import { GeminiService } from './services/geminiService';
import { ActivityService } from './services/activityService';
import { SummaryService } from './services/summaryService';

/**
 * Discord Bot のメインクラス
 * タスク記録の問いかけとユーザーからの回答処理を管理
 */
export class TaskLoggerBot {
  private client: Client;
  private status: BotStatus;
  private database: Database;
  private geminiService: GeminiService;
  private activityService: ActivityService;
  private summaryService: SummaryService;

  constructor() {
    // Discord クライアントの初期化
    this.client = new Client({
      intents: [
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    this.status = {
      isRunning: false,
      scheduledJobs: [],
    };

    // サービスの初期化
    this.database = new Database();
    this.geminiService = new GeminiService();
    this.activityService = new ActivityService(this.database, this.geminiService);
    this.summaryService = new SummaryService(this.database, this.geminiService);

    this.setupEventHandlers();
  }

  /**
   * Bot を起動
   */
  public async start(): Promise<void> {
    try {
      console.log('🤖 Discord Bot を起動中...');
      
      // データベースの初期化
      await this.database.initialize();
      
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
    await this.database.close();
    
    console.log('✅ Discord Bot が停止しました');
  }

  /**
   * イベントハンドラーの設定
   */
  private setupEventHandlers(): void {
    // Bot が準備完了したときの処理
    this.client.once('ready', () => {
      console.log(`✅ ${this.client.user?.tag} としてログインしました`);
    });

    // メッセージを受信したときの処理
    this.client.on('messageCreate', async (message: Message) => {
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
    // Bot自身のメッセージは無視
    if (message.author.bot) return;

    // 対象ユーザー以外のメッセージは無視
    if (message.author.id !== config.discord.targetUserId) return;

    // DMのみを処理
    if (!message.channel.isDMBased()) return;

    const content = message.content.trim();
    
    try {
      // メッセージの種類に応じて処理を分岐
      if (this.isSummaryRequest(content)) {
        await this.handleSummaryRequest(message);
      } else {
        await this.handleActivityLog(message, content);
      }
    } catch (error) {
      console.error('メッセージ処理エラー:', error);
      await message.reply('申し訳ありません。処理中にエラーが発生しました。');
    }
  }

  /**
   * サマリー要求かどうかを判定
   * @param content メッセージ内容
   * @returns サマリー要求の場合true
   */
  private isSummaryRequest(content: string): boolean {
    const summaryKeywords = [
      'サマリー', 'まとめ', '要約', '集計', 
      '今日', '一日', '振り返り', 'summary'
    ];
    
    return summaryKeywords.some(keyword => 
      content.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  /**
   * 活動記録を処理
   * @param message メッセージオブジェクト
   * @param content メッセージ内容
   */
  private async handleActivityLog(message: Message, content: string): Promise<void> {
    console.log(`📝 活動記録を受信: ${message.author.tag} - ${content}`);
    
    try {
      // 活動記録を処理・保存
      const activityRecord = await this.activityService.processActivityRecord(
        message.author.id,
        content
      );

      // 確認メッセージを送信
      const timeSlot = getCurrentTimeSlot();
      const confirmation = [
        '✅ **活動記録を保存しました！**',
        '',
        `⏰ 時間枠: ${timeSlot.label}`,
        `📂 カテゴリ: ${activityRecord.analysis.category}`,
        `⏱️ 推定時間: ${activityRecord.analysis.estimatedMinutes}分`,
        `⭐ 生産性: ${'★'.repeat(activityRecord.analysis.productivityLevel)} (${activityRecord.analysis.productivityLevel}/5)`,
        '',
        `💡 ${activityRecord.analysis.structuredContent}`,
      ].join('\n');

      await message.reply(confirmation);

    } catch (error) {
      console.error('活動記録処理エラー:', error);
      await message.reply(
        '申し訳ありません。活動記録の処理中にエラーが発生しました。\n' +
        'しばらく時間をおいて再度お試しください。'
      );
    }

    this.status.lastPromptTime = new Date();
  }

  /**
   * サマリー要求を処理
   * @param message メッセージオブジェクト
   */
  private async handleSummaryRequest(message: Message): Promise<void> {
    console.log(`📊 サマリー要求を受信: ${message.author.tag}`);
    
    try {
      // 日次サマリーを取得・生成
      const summary = await this.summaryService.getDailySummary(message.author.id);
      
      // フォーマットして送信
      const formattedSummary = this.summaryService.formatDailySummary(summary);
      await message.reply(formattedSummary);

    } catch (error) {
      console.error('サマリー生成エラー:', error);
      await message.reply(
        '申し訳ありません。サマリーの生成中にエラーが発生しました。\n' +
        'しばらく時間をおいて再度お試しください。'
      );
    }

    this.status.lastSummaryTime = new Date();
  }

  /**
   * 30分間の活動について問いかけ
   */
  public async sendActivityPrompt(): Promise<void> {
    // 働く時間帯でない場合はスキップ
    if (!isWorkingHours()) {
      console.log('⏰ 働く時間帯ではないため、問いかけをスキップしました');
      return;
    }

    try {
      // 対象ユーザーを取得
      const user = await this.client.users.fetch(config.discord.targetUserId);
      if (!user) {
        console.error('❌ 対象ユーザーが見つかりません');
        return;
      }

      // DMチャンネルを作成/取得
      const dmChannel = await user.createDM();
      
      // 現在の時間枠を取得
      const timeSlot = getCurrentTimeSlot();
      
      // 問いかけメッセージを送信
      const promptMessage = 
        `⏰ **${timeSlot.label}の活動記録**\n\n` +
        `この30分間なにしてた？\n` +
        `どんなことでも気軽に教えてください！`;

      await dmChannel.send(promptMessage);
      
      console.log(`✅ 問いかけを送信しました: ${timeSlot.label}`);
      this.status.lastPromptTime = new Date();
      
    } catch (error) {
      console.error('❌ 問いかけ送信エラー:', error);
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
      
      // 日次サマリーを生成
      const summary = await this.summaryService.getDailySummary(config.discord.targetUserId);
      
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

  /**
   * Bot の稼働状態を取得
   * @returns 現在の稼働状態
   */
  public getStatus(): BotStatus {
    return { ...this.status };
  }
}