import { Client, GatewayIntentBits, Message, Partials } from 'discord.js';
import { config } from './config';
import { getCurrentTimeSlot, isWorkingHours, formatTime } from './utils/timeUtils';
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
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
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
      console.log(`🔧 [DEBUG] Bot ID: ${this.client.user?.id}`);
      console.log(`🔧 [DEBUG] 設定されたTARGET_USER_ID: ${config.discord.targetUserId}`);
      console.log(`🔧 [DEBUG] Intents: Guilds, DirectMessages, MessageContent`);
    });

    // メッセージを受信したときの処理
    this.client.on('messageCreate', async (message: Message) => {
      console.log('🚨 [DEBUG] messageCreate イベント発火！');
      
      // パーシャルメッセージの場合はフルメッセージを取得
      if (message.partial) {
        console.log('📄 [DEBUG] パーシャルメッセージを検出、フルメッセージを取得中...');
        try {
          await message.fetch();
          console.log('📄 [DEBUG] フルメッセージ取得完了');
        } catch (error) {
          console.error('❌ [DEBUG] フルメッセージ取得エラー:', error);
          return;
        }
      }
      
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
    // チャンネルがパーシャルの場合はフルチャンネルを取得
    if (message.channel.partial) {
      console.log('🔧 [DEBUG] パーシャルチャンネルを検出、フルチャンネルを取得中...');
      try {
        await message.channel.fetch();
        console.log('🔧 [DEBUG] フルチャンネル取得完了');
      } catch (error) {
        console.error('❌ [DEBUG] フルチャンネル取得エラー:', error);
        return;
      }
    }

    // デバッグ: 全メッセージをログ出力
    console.log('📨 [DEBUG] メッセージ受信:', {
      authorId: message.author?.id,
      authorTag: message.author?.tag,
      isBot: message.author?.bot,
      isDM: message.channel.isDMBased(),
      channelType: message.channel.type,
      content: message.content,
      timestamp: new Date().toISOString()
    });

    // Bot自身のメッセージは無視
    if (message.author.bot) {
      console.log('  ↳ [DEBUG] Botのメッセージのため無視');
      return;
    }

    // まず全てのメッセージを処理してみる（診断用）
    console.log('🔍 [DEBUG] 全メッセージ処理モード - フィルタリングを一時的に無効化');
    
    // 対象ユーザー以外のメッセージは無視
    if (message.author.id !== config.discord.targetUserId) {
      console.log(`  ↳ [DEBUG] 対象外ユーザーのため無視 (受信: ${message.author.id}, 期待: ${config.discord.targetUserId})`);
      return;
    }

    // DMのみを処理
    if (!message.channel.isDMBased()) {
      console.log('  ↳ [DEBUG] DMではないため無視 (チャンネルタイプ:', message.channel.type, ')');
      return;
    }

    const content = message.content.trim();
    console.log(`✅ 処理対象メッセージ: "${content}"`);
    
    try {
      // メッセージの種類に応じて処理を分岐
      if (this.isSummaryRequest(content)) {
        console.log('  ↳ [DEBUG] サマリー要求として処理');
        await this.handleSummaryRequest(message);
      } else {
        console.log('  ↳ [DEBUG] 活動記録として処理');
        await this.handleActivityLog(message, content);
      }
    } catch (error) {
      console.error('❌ メッセージ処理エラー:', error);
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
    console.log(`📝 [DEBUG] 活動記録処理開始: ${message.author.tag} - "${content}"`);
    
    try {
      // 活動記録を処理・保存
      console.log('  ↳ [DEBUG] ActivityServiceで処理中...');
      const activityRecords = await this.activityService.processActivityRecord(
        message.author.id,
        content
      );
      console.log(`  ↳ [DEBUG] 活動記録処理完了: ${activityRecords.length}件の記録を作成`);

      if (activityRecords.length === 0) {
        await message.reply('活動を記録できませんでした。時間や内容を明確にしてもう一度お試しください。');
        return;
      }

      const firstRecord = activityRecords[0];
      const lastRecord = activityRecords[activityRecords.length - 1];

      // 確認メッセージを送信
      const startTime = formatTime(new Date(firstRecord.analysis.startTime!));
      const endTime = formatTime(new Date(lastRecord.analysis.endTime!));
      const totalMinutes = activityRecords.reduce((sum, r) => sum + r.analysis.estimatedMinutes, 0);

      const confirmation = [
        '✅ **活動記録を保存しました！**',
        '',
        `⏰ 時間: ${startTime} - ${endTime} (${totalMinutes}分)`,
        `📂 カテゴリ: ${firstRecord.analysis.category}`,
        `⭐ 生産性: ${'★'.repeat(firstRecord.analysis.productivityLevel)} (${firstRecord.analysis.productivityLevel}/5)`,
        '',
        `💡 ${firstRecord.analysis.structuredContent}`,
      ].join('\n');

      console.log('  ↳ [DEBUG] 確認メッセージ送信中...');
      await message.reply(confirmation);
      console.log('  ↳ [DEBUG] 確認メッセージ送信完了');

    } catch (error) {
      console.error('❌ [DEBUG] 活動記録処理エラー:', error);
      await message.reply(
        '申し訳ありません。活動記録の処理中にエラーが発生しました.\n' +
        'しばらく時間をおいて再度お試しください。'
      );
    }
  }

  /**
   * サマリー要求を処理
   * @param message メッセージオブジェクト
   */
  private async handleSummaryRequest(message: Message): Promise<void> {
    console.log(`📊 [DEBUG] サマリー要求処理開始: ${message.author.tag}`);
    
    try {
      // 日次サマリーを取得・生成
      console.log('  ↳ [DEBUG] SummaryServiceでサマリー取得中...');
      const summary = await this.summaryService.getDailySummary(message.author.id);
      console.log('  ↳ [DEBUG] サマリー取得完了:', {
        date: summary.date,
        totalMinutes: summary.totalMinutes,
        categoryCount: summary.categoryTotals.length
      });
      
      // フォーマットして送信
      console.log('  ↳ [DEBUG] サマリーフォーマット中...');
      const formattedSummary = this.summaryService.formatDailySummary(summary);
      console.log('  ↳ [DEBUG] サマリー送信中...');
      await message.reply(formattedSummary);
      console.log('  ↳ [DEBUG] サマリー送信完了');

    } catch (error) {
      console.error('❌ [DEBUG] サマリー生成エラー:', error);
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
    console.log('🕐 [DEBUG] 30分間隔問いかけ実行開始');
    
    // 働く時間帯でない場合はスキップ
    if (!isWorkingHours()) {
      console.log('  ↳ [DEBUG] 働く時間帯ではないため、問いかけをスキップしました');
      return;
    }

    try {
      // 対象ユーザーを取得
      console.log(`  ↳ [DEBUG] 対象ユーザー取得中: ${config.discord.targetUserId}`);
      const user = await this.client.users.fetch(config.discord.targetUserId);
      if (!user) {
        console.error('  ↳ [DEBUG] ❌ 対象ユーザーが見つかりません');
        return;
      }
      console.log(`  ↳ [DEBUG] ユーザー取得成功: ${user.tag}`);

      // DMチャンネルを作成/取得
      console.log('  ↳ [DEBUG] DMチャンネル作成中...');
      const dmChannel = await user.createDM();
      
      // 現在の時間枠を取得
      const timeSlot = getCurrentTimeSlot();
      console.log(`  ↳ [DEBUG] 時間枠: ${timeSlot.label}`);
      
      // 問いかけメッセージを送信
      const promptMessage = 
        `⏰ **${timeSlot.label}の活動記録**\n\n` +
        `この30分間なにしてた？\n` +
        `どんなことでも気軽に教えてください！`;

      console.log('  ↳ [DEBUG] 問いかけメッセージ送信中...');
      await dmChannel.send(promptMessage);
      
      console.log(`  ↳ [DEBUG] 問いかけメッセージ送信完了: ${timeSlot.label}`);
      this.status.lastPromptTime = new Date();
      
    } catch (error) {
      console.error('❌ [DEBUG] 問いかけ送信エラー:', error);
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