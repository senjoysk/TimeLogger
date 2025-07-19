/**
 * 活動記録システム統合クラス
 * Discord Botに自然言語活動ログシステムを統合
 */

import { Client, Message, ButtonInteraction } from 'discord.js';
// Removed better-sqlite3 import - using sqlite3 via repository
import { SqliteActivityLogRepository } from '../repositories/sqliteActivityLogRepository';
import { SqliteMemoRepository } from '../repositories/sqliteMemoRepository';
import { ActivityLogService } from '../services/activityLogService';
import { EditCommandHandler } from '../handlers/editCommandHandler';
import { SummaryHandler } from '../handlers/summaryHandler';
import { LogsCommandHandler } from '../handlers/logsCommandHandler';
import { TimezoneHandler } from '../handlers/timezoneHandler';
import { UnmatchedCommandHandler } from '../handlers/unmatchedCommandHandler';
import { TodoCommandHandler } from '../handlers/todoCommandHandler';
import { ProfileCommandHandler } from '../handlers/profileCommandHandler';
import { MemoCommandHandler } from '../handlers/memoCommandHandler';
import { GeminiService } from '../services/geminiService';
import { MessageClassificationService } from '../services/messageClassificationService';
import { GapDetectionService } from '../services/gapDetectionService';
import { DynamicReportScheduler } from '../services/dynamicReportScheduler';
import { DailyReportSender } from '../services/dailyReportSender';
import { ActivityLogError } from '../types/activityLog';
import { GapHandler } from '../handlers/gapHandler';
import { MessageSelectionHandler } from '../handlers/messageSelectionHandler';

/**
 * 活動記録システム統合設定インターフェース
 */
export interface ActivityLoggingConfig {
  /** データベースパス */
  databasePath: string;
  /** Google Gemini APIキー */
  geminiApiKey: string;
  /** デバッグモード */
  debugMode: boolean;
  /** タイムゾーン（デフォルト） */
  defaultTimezone: string;
  /** 自動分析の有効化 */
  enableAutoAnalysis: boolean;
  /** キャッシュ有効期間（分） */
  cacheValidityMinutes: number;
  /** 対象ユーザーID（レガシー設定・将来削除予定） */
  targetUserId: string;
  /** 外部リポジトリの注入（テスト用） */
  repository?: SqliteActivityLogRepository;
}

/**
 * 活動記録システム統合クラス
 */
export class ActivityLoggingIntegration {
  // サービス層
  private repository!: SqliteActivityLogRepository;
  private memoRepository!: SqliteMemoRepository;
  private activityLogService!: ActivityLogService;
  private geminiService!: GeminiService;
  private messageClassificationService!: MessageClassificationService;
  private gapDetectionService!: GapDetectionService;
  private dynamicReportScheduler!: DynamicReportScheduler;
  private dailyReportSender!: DailyReportSender;

  // ハンドラー層
  private editHandler!: EditCommandHandler;
  private summaryHandler!: SummaryHandler;
  private logsHandler!: LogsCommandHandler;
  private timezoneHandler!: TimezoneHandler;
  private gapHandler!: GapHandler;
  private unmatchedHandler!: UnmatchedCommandHandler;
  private todoHandler!: TodoCommandHandler;
  private profileHandler!: ProfileCommandHandler;
  private memoHandler!: MemoCommandHandler;
  private messageSelectionHandler!: MessageSelectionHandler;

  // 設定
  private config: ActivityLoggingConfig;
  private isInitialized: boolean = false;
  
  // 非同期処理の管理
  private pendingAnalysisTasks: Set<NodeJS.Immediate> = new Set();
  private isShuttingDown: boolean = false;

  constructor(config: ActivityLoggingConfig) {
    this.config = config;
  }

  /**
   * 活動記録システムを初期化
   */
  async initialize(): Promise<void> {
    try {
      console.log('🚀 活動記録システムの初期化を開始...');

      // 1. データベース接続とRepository初期化
      if (this.config.repository) {
        // 外部から注入されたリポジトリを使用（テスト用）
        this.repository = this.config.repository;
        console.log('✅ 外部リポジトリを使用（テスト用）');
      } else {
        // 通常の場合は新しいリポジトリを作成
        this.repository = new SqliteActivityLogRepository(this.config.databasePath);
        // リポジトリの初期化を明示的に実行
        await this.repository.initializeDatabase();
        console.log('✅ データベース接続・初期化完了');
      }

      // メモリポジトリの初期化
      this.memoRepository = new SqliteMemoRepository(this.config.databasePath);
      console.log('✅ メモリポジトリ初期化完了');

      // 2. サービス層の初期化
      // コスト管理機能の初期化（統合版）
      // SqliteActivityLogRepositoryがIApiCostRepositoryも実装しているため、同じインスタンスを使用
      this.geminiService = new GeminiService(this.repository);
      
      // ActivityLogServiceにGeminiServiceを注入（リアルタイム分析のため）
      this.activityLogService = new ActivityLogService(this.repository, this.geminiService);
      console.log('✅ GeminiService初期化完了（統合リポジトリ使用）');
      
      
      this.gapDetectionService = new GapDetectionService(this.repository);
      
      
      // TODO機能サービスの初期化
      this.messageClassificationService = new MessageClassificationService(this.geminiService);
      
      // DynamicReportSchedulerの初期化
      this.dynamicReportScheduler = new DynamicReportScheduler();
      this.dynamicReportScheduler.setRepository(this.repository);
      
      console.log('✅ サービス層初期化完了（TODO統合機能含む）');

      // 3. ハンドラー層の初期化
      this.editHandler = new EditCommandHandler(this.activityLogService);
      this.summaryHandler = new SummaryHandler(
        this.activityLogService,
        this.repository
      );
      this.logsHandler = new LogsCommandHandler(this.activityLogService);
      this.timezoneHandler = new TimezoneHandler(this.repository);
      this.gapHandler = new GapHandler(
        this.gapDetectionService,
        this.activityLogService
      );
      this.unmatchedHandler = new UnmatchedCommandHandler(this.activityLogService);
      
      // TODO機能ハンドラーの初期化
      this.todoHandler = new TodoCommandHandler(
        this.repository, // ITodoRepository
        this.repository, // IMessageClassificationRepository  
        this.geminiService,
        this.messageClassificationService,
        this.activityLogService // 活動ログサービスを注入
      );
      
      // プロファイル機能ハンドラーの初期化
      this.profileHandler = new ProfileCommandHandler(this.repository);
      
      // メモ機能ハンドラーの初期化
      this.memoHandler = new MemoCommandHandler(this.memoRepository);
      
      this.messageSelectionHandler = new MessageSelectionHandler();
      
      // 🟢 Green Phase: MessageSelectionHandlerに依存性注入
      this.messageSelectionHandler.setTodoRepository(this.repository);
      this.messageSelectionHandler.setActivityLogService(this.activityLogService);
      this.messageSelectionHandler.setMemoRepository(this.memoRepository);
      
      // TimezoneHandlerにDynamicReportSchedulerのコールバックを設定
      this.timezoneHandler.setTimezoneChangeCallback(async (userId: string, oldTimezone: string | null, newTimezone: string) => {
        try {
          await this.dynamicReportScheduler.onTimezoneChanged(userId, oldTimezone, newTimezone);
          console.log(`📅 DynamicReportSchedulerに通知: ${userId} ${oldTimezone} -> ${newTimezone}`);
        } catch (error) {
          console.warn(`⚠️ DynamicReportSchedulerへの通知に失敗: ${error}`);
        }
      });
      
      console.log('✅ ハンドラー層初期化完了（TODO機能統合済み）');

      this.isInitialized = true;
      console.log('🎉 活動記録システム初期化完了！');

    } catch (error) {
      console.error('❌ 活動記録システム初期化エラー:', error);
      throw new ActivityLogError(
        '活動記録システムの初期化に失敗しました', 
        'INTEGRATION_INIT_ERROR', 
        { error }
      );
    }
  }

  /**
   * Discord Botにメッセージハンドラーを統合
   * 既存のハンドラーより優先して処理
   */
  integrateWithBot(client: Client, bot?: any): void {
    if (!this.isInitialized) {
      throw new ActivityLogError(
        '活動記録システムが初期化されていません', 
        'SYSTEM_NOT_INITIALIZED'
      );
    }

    console.log('🔗 Discord Botへの統合を開始...');

    // DailyReportSenderの初期化（Botが提供された場合）
    if (bot) {
      this.dailyReportSender = new DailyReportSender(this, bot);
      this.dynamicReportScheduler.setReportSender(this.dailyReportSender);
      console.log('✅ DailyReportSender初期化完了');
    }

    // 既存のmessageCreateリスナーを一時的に無効化
    const existingListeners = client.listeners('messageCreate');
    client.removeAllListeners('messageCreate');

    // 活動記録システムのメッセージハンドラーを最優先で追加
    client.on('messageCreate', async (message: Message) => {
      const handled = await this.handleMessage(message);
      
      // 活動記録システムで処理されなかった場合は既存のハンドラーに委譲
      if (!handled) {
        for (const listener of existingListeners) {
          try {
            await (listener as Function)(message);
          } catch (error) {
            console.error('❌ レガシーハンドラーエラー:', error);
          }
        }
      }
    });

    // ボタンインタラクションハンドラーを追加（TODO機能）
    client.on('interactionCreate', async (interaction) => {
      if (interaction.isButton()) {
        await this.handleButtonInteraction(interaction);
      }
    });

    console.log('✅ Discord Bot統合完了（活動記録システム + TODO機能統合）');
  }

  /**
   * メッセージを処理（既存システムとの互換性を保持）
   * @returns 活動記録システムで処理された場合true、そうでなければfalse
   */
  async handleMessage(message: Message): Promise<boolean> {
    try {
      console.log('🔍 [活動記録] メッセージ受信:', {
        authorId: message.author?.id,
        authorTag: message.author?.tag,
        isBot: message.author?.bot,
        isDM: message.channel.isDMBased(),
        content: message.content,
        timestamp: new Date().toISOString()
      });

      // Bot自身のメッセージは無視
      if (message.author.bot) {
        console.log('  ↳ [活動記録] Botメッセージのため無視');
        return false;
      }

      // DMのみを処理（ギルドチャンネルは無視）
      if (message.guild) {
        console.log('  ↳ [活動記録] ギルドメッセージのため無視（DMのみ処理）');
        return false;
      }

      const userId = message.author.id;
      const content = message.content.trim();
      const timezone = await this.getUserTimezone(userId);

      // マルチユーザー対応: 新規ユーザーの自動登録
      const isNewUser = await this.ensureUserRegistered(userId, message.author.username);
      
      // 新規ユーザーの場合、まずウェルカムメッセージを送信
      if (isNewUser && !content.startsWith('!')) {
        const welcomeMessage = this.getWelcomeMessage();
        try {
          await message.reply(welcomeMessage);
          console.log(`🎉 ウェルカムメッセージ送信完了: ${userId}`);
          // ウェルカムメッセージ送信後、通常の処理も継続
        } catch (error) {
          console.error('❌ ウェルカムメッセージ送信エラー:', error);
        }
      }
      
      console.log(`✅ [活動記録] 処理対象ユーザー: ${userId}`);
      console.log(`✅ [活動記録] 処理対象メッセージ: "${content}"`)

      // コマンド処理
      if (content.startsWith('!')) {
        console.log(`🔧 [活動記録] コマンド検出: "${content}"`);
        await this.handleCommand(message, userId, content, timezone);
        return true;
      }

      // 通常のメッセージはAI分類を優先し、分類結果に基づいて適切に記録
      if (content.length > 0 && content.length <= 2000) {
        console.log(`🤖 メッセージ分類処理開始: ${userId}`);
        
        // 🟢 Green Phase: AI分類をMessageSelectionHandlerに置き換え
        await this.messageSelectionHandler.processNonCommandMessage(message, userId, timezone);
        
        console.log(`✅ メッセージ分類処理完了: ${userId}`);
        return true;
      }

      return false; // 処理対象外

    } catch (error) {
      console.error('❌ メッセージ処理エラー:', error);
      
      // エラーを適切にユーザーに通知
      const errorMessage = error instanceof ActivityLogError 
        ? `❌ ${error.message}`
        : '❌ メッセージ処理中にエラーが発生しました。';
        
      try {
        await message.reply(errorMessage);
      } catch (replyError) {
        console.error('❌ エラー返信失敗:', replyError);
      }
      
      return false; // エラーのため未処理扱い
    }
  }

  /**
   * コマンド処理
   */
  private async handleCommand(message: Message, userId: string, content: string, timezone: string): Promise<void> {
    const parts = content.slice(1).split(' ');
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    console.log(`🎮 コマンド処理: ${command} (${userId}), args: [${args.join(', ')}]`);

    switch (command) {
      case 'edit':
      case '編集':
        await this.editHandler.handle(message, userId, args, timezone);
        break;

      case 'summary':
      case 'サマリー':
        await this.summaryHandler.handle(message, userId, args, timezone);
        break;

      case 'logs':
      case 'ログ':
        await this.logsHandler.handle(message, userId, args, timezone);
        break;

      case 'help':
      case 'ヘルプ':
        await this.showGeneralHelp(message);
        break;

      case 'status':
      case 'ステータス':
        await this.showSystemStatus(message, userId);
        break;

      case 'cost':
      case 'コスト':
        await this.handleCostCommand(message, userId, timezone);
        break;

      case 'timezone':
      case 'タイムゾーン':
        await this.timezoneHandler.handle(message, userId, args);
        break;

      case 'gap':
      case 'ギャップ':
        console.log(`🔧 gapコマンド実行: ユーザー=${userId}, タイムゾーン=${timezone}, ハンドラー存在=${!!this.gapHandler}`);
        await this.gapHandler.handle(message, userId, args, timezone);
        break;

      case 'unmatched':
      case 'マッチング':
      case 'match':
        console.log(`🔗 unmatchedコマンド実行: ユーザー=${userId}, タイムゾーン=${timezone}, ハンドラー存在=${!!this.unmatchedHandler}`);
        await this.unmatchedHandler.handle(message, userId, args, timezone);
        break;

      case 'todo':
      case 'タスク':
        console.log(`📋 todoコマンド実行: ユーザー=${userId}, タイムゾーン=${timezone}`);
        await this.todoHandler.handleCommand(message, userId, args, timezone);
        break;

      case 'profile':
      case 'プロファイル':
        console.log(`📊 profileコマンド実行: ユーザー=${userId}, タイムゾーン=${timezone}`);
        await this.profileHandler.handle(message, userId, args, timezone);
        break;

      case 'memo':
      case 'メモ':
        console.log(`📝 memoコマンド実行: ユーザー=${userId}, タイムゾーン=${timezone}`);
        await this.memoHandler.handleCommand(message, args);
        break;

      default:
        // 他のコマンドは既存システムに委譲または無視
        console.log(`📝 未対応コマンド: ${command}`);
        break;
    }
  }

  /**
   * ボタンインタラクションを処理（TODO機能）
   */
  async handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
    try {
      // マルチユーザー対応: 全ユーザーがボタンを使用可能
      const userId = interaction.user.id;
      const timezone = await this.getUserTimezone(userId);
      
      console.log(`🔘 ボタンインタラクション処理: ${userId} - ${interaction.customId}`);
      
      // 🟢 Green Phase: MessageSelectionのボタンかTODOボタンかを判定
      if (interaction.customId.startsWith('select_')) {
        // MessageSelectionHandlerに委譲
        await this.messageSelectionHandler.handleButtonInteraction(interaction, userId, timezone);
      } else {
        // TODOハンドラーに委譲（既存機能）
        await this.todoHandler.handleButtonInteraction(interaction, userId, timezone);
      }
      
    } catch (error) {
      console.error('❌ ボタンインタラクション処理エラー:', error);
      
      if (!interaction.replied) {
        try {
          await interaction.reply({ 
            content: '❌ ボタン操作の処理中にエラーが発生しました。', 
            ephemeral: true 
          });
        } catch (replyError) {
          console.error('❌ エラー返信失敗:', replyError);
        }
      }
    }
  }

  /**
   * 活動を記録
   */
  private async recordActivity(message: Message, userId: string, content: string, timezone: string): Promise<void> {
    try {
      console.log(`📝 活動記録: ${userId} - ${content.substring(0, 50)}...`);

      // 活動を記録
      const log = await this.activityLogService.recordActivity(userId, content, timezone);

      // キャッシュ無効化はシンプルサマリーでは不要
      console.log(`📋 ログ記録完了: ${userId} ${log.businessDate}`);

      // 記録完了の確認（デバッグモードのみ）
      if (this.config.debugMode) {
        await message.react('✅');
      }

      // 自動分析が有効な場合、バックグラウンドで分析をトリガー
      if (this.config.enableAutoAnalysis) {
        this.triggerAutoAnalysis(userId, log.businessDate, timezone).catch(error => {
          console.warn('⚠️ 自動分析エラー:', error);
        });
      }

    } catch (error) {
      console.error('❌ 活動記録エラー:', error);
      throw error;
    }
  }

  /**
   * 自動分析をトリガー（バックグラウンド処理）
   */
  private async triggerAutoAnalysis(userId: string, businessDate: string, timezone: string): Promise<void> {
    // シャットダウン中は新しい分析を開始しない
    if (this.isShuttingDown) {
      return;
    }

    // 完全非同期化：メインスレッドをブロックしない
    const immediateHandle = setImmediate(async () => {
      try {
        // シャットダウン中はスキップ
        if (this.isShuttingDown) {
          return;
        }

        // 今日のログ数をチェック
        const logs = await this.activityLogService.getLogsForDate(userId, businessDate, timezone);
        
        // シンプルサマリーでは自動分析は不要
        console.log(`📋 活動ログ登録完了: ${userId} (${logs.length}件目)`);
      } catch (error) {
        console.warn('⚠️ 自動分析トリガー失敗:', error);
      } finally {
        // 完了したタスクを管理セットから除去
        this.pendingAnalysisTasks.delete(immediateHandle);
      }
    });
    
    // タスクを管理セットに追加
    this.pendingAnalysisTasks.add(immediateHandle);
    
    // メインスレッドは即座に制御を返す
  }

  /**
   * システム全般のヘルプを表示
   */
  private async showGeneralHelp(message: Message): Promise<void> {
    const helpMessage = `🤖 **TimeLogger 活動記録システム**

**📝 活動記録**
メッセージを送信するだけで自動記録されます
例: 「プログラミングをしています」

**⚡ 主要コマンド**
\`!summary\` - 今日の活動サマリー表示
\`!profile\` - ユーザープロファイル表示
\`!edit\` - ログの編集・削除
\`!logs\` - 生ログの表示・検索
\`!gap\` - 未記録時間の検出・記録
\`!cost\` - API使用コスト確認
\`!timezone\` - タイムゾーン表示・検索・設定
\`!status\` - システム状態確認

**📊 分析機能**
・カテゴリ別時間集計
・タイムライン生成
・生産性分析
・改善提案

**💡 使い方のコツ**
・具体的な活動内容を記録
・「会議」「休憩」「作業」など分かりやすく
・編集機能で後から修正可能

各コマンドの詳細は \`!<コマンド> help\` で確認できます。`;

    await message.reply(helpMessage);
  }

  /**
   * システムステータスを表示
   */
  private async showSystemStatus(message: Message, userId: string): Promise<void> {
    try {
      const stats = await this.activityLogService.getStatistics(userId);
      const isConnected = await this.repository.isConnected();
      
      const statusMessage = `📊 **システムステータス**

**🔗 データベース**: ${isConnected ? '✅ 接続中' : '❌ 切断'}
**📝 総記録数**: ${stats.totalLogs}件
**📅 今日の記録**: ${stats.todayLogs}件
**📈 今週の記録**: ${stats.weekLogs}件

**⚙️ 設定**
・タイムゾーン: ${this.config.defaultTimezone}
・自動分析: ${this.config.enableAutoAnalysis ? '有効' : '無効'}
・デバッグモード: ${this.config.debugMode ? '有効' : '無効'}

**🕐 システム時刻**: ${new Date().toLocaleString('ja-JP', { timeZone: this.config.defaultTimezone })}`;

      await message.reply(statusMessage);
    } catch (error) {
      console.error('❌ ステータス表示エラー:', error);
      await message.reply('❌ ステータス情報の取得に失敗しました。');
    }
  }

  /**
   * コストレポートを取得
   */
  async getCostReport(userId: string, timezone: string): Promise<string> {
    try {
      // GeminiService経由でコストレポートを取得
      return await this.geminiService.getDailyCostReport(userId, timezone);
    } catch (error) {
      console.error('❌ コストレポート取得エラー:', error);
      return '❌ コストレポートの取得に失敗しました。';
    }
  }

  /**
   * リポジトリインスタンスを取得
   */
  getRepository(): any {
    return this.repository;
  }

  /**
   * TimezoneHandlerにタイムゾーン変更コールバックを設定（EnhancedScheduler連携用）
   */
  setTimezoneChangeCallback(callback: (userId: string, oldTimezone: string | null, newTimezone: string) => Promise<void>): void {
    if (this.timezoneHandler) {
      this.timezoneHandler.setTimezoneChangeCallback(callback);
      console.log('📅 TimezoneHandlerにコールバックを設定しました');
    } else {
      console.warn('⚠️ TimezoneHandlerが初期化されていません');
    }
  }

  /**
   * 日次サマリーを生成して文字列として取得
   * 自動送信用のメソッド
   */
  async generateDailySummaryText(userId: string, timezone: string): Promise<string> {
    try {
      if (!this.summaryHandler) {
        throw new Error('サマリーハンドラーが初期化されていません');
      }

      // モックメッセージオブジェクトを作成
      let summaryText = '';
      
      // プログレスメッセージモック
      const mockProgressMessage = {
        edit: async (content: string) => {
          summaryText = content; // 最終的なサマリーテキストを保存
          return mockProgressMessage;
        }
      };
      
      const mockMessage = {
        reply: async (content: string) => {
          return mockProgressMessage; // プログレスメッセージを返す
        }
      };
      
      // サマリーハンドラーを使って今日のサマリーを生成
      await this.summaryHandler.handle(mockMessage as any, userId, [], timezone);
      
      return summaryText || '🌅 今日一日お疲れさまでした！\n\nサマリーの詳細は `!summary` コマンドで確認できます。';
    } catch (error) {
      console.error('❌ 日次サマリーテキスト生成エラー:', error);
      return '🌅 今日一日お疲れさまでした！\n\nサマリーの詳細は `!summary` コマンドで確認できます。';
    }
  }

  /**
   * システムを正常にシャットダウン
   */
  async shutdown(): Promise<void> {
    try {
      console.log('🔄 活動記録システムのシャットダウンを開始...');

      // シャットダウンフラグを設定
      this.isShuttingDown = true;

      // 実行中の非同期分析タスクをキャンセル
      for (const handle of this.pendingAnalysisTasks) {
        clearImmediate(handle);
      }
      this.pendingAnalysisTasks.clear();
      console.log('✅ 非同期分析タスクをクリーンアップしました');

      // TODOハンドラーのクリーンアップ
      if (this.todoHandler && typeof this.todoHandler.destroy === 'function') {
        this.todoHandler.destroy();
        console.log('✅ TODOハンドラーをクリーンアップしました');
      }

      if (this.repository) {
        await this.repository.close();
        console.log('✅ データベース接続を閉じました');
      }

      this.isInitialized = false;
      console.log('✅ 活動記録システムのシャットダウン完了');
    } catch (error) {
      console.error('❌ シャットダウンエラー:', error);
      throw error;
    }
  }

  /**
   * システムの健全性チェック
   */
  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      const details: any = {
        initialized: this.isInitialized,
        database: false,
        services: false,
        handlers: false
      };

      if (this.isInitialized) {
        // データベース接続チェック
        details.database = await this.repository.isConnected();

        // サービス存在チェック
        details.services = !!(this.activityLogService);

        // ハンドラー存在チェック
        details.handlers = !!(this.editHandler && this.summaryHandler && this.logsHandler && this.timezoneHandler);
      }

      const healthy = details.initialized && details.database && details.services && details.handlers;

      return { healthy, details };
    } catch (error) {
      console.error('❌ ヘルスチェックエラー:', error);
      return { 
        healthy: false, 
        details: { error: String(error) } 
      };
    }
  }

  /**
   * 設定を取得
   */
  getConfig(): ActivityLoggingConfig {
    return { ...this.config };
  }

  /**
   * 統計情報を取得
   */
  async getSystemStats(): Promise<any> {
    if (!this.isInitialized) {
      throw new ActivityLogError('システムが初期化されていません', 'SYSTEM_NOT_INITIALIZED');
    }

    try {
      // リポジトリから全体統計を取得
      const totalUsers = await this.repository.getLogCount(''); // 全ユーザー
      const totalLogs = await this.repository.getLogCount('');
      
      return {
        totalUsers,
        totalLogs,
        isInitialized: this.isInitialized,
        uptime: process.uptime(),
        config: {
          enableAutoAnalysis: this.config.enableAutoAnalysis,
          debugMode: this.config.debugMode,
          defaultTimezone: this.config.defaultTimezone
        }
      };
    } catch (error) {
      console.error('❌ システム統計取得エラー:', error);
      throw new ActivityLogError('システム統計の取得に失敗しました', 'GET_SYSTEM_STATS_ERROR', { error });
    }
  }

  /**
   * コストコマンドを処理
   * @param message Discordメッセージ
   * @param userId ユーザーID
   * @param timezone タイムゾーン
   */
  private async handleCostCommand(message: Message, userId: string, timezone: string): Promise<void> {
    try {
      console.log(`💰 コスト情報要求: ${userId}, timezone: ${timezone}`);
      
      // GeminiServiceが利用可能かチェック
      if (!this.geminiService) {
        console.error('❌ GeminiServiceが初期化されていません');
        await message.reply('❌ コスト情報の取得機能が利用できません。');
        return;
      }

      console.log('🔍 GeminiService利用可能、コストレポート生成中...');

      // API使用コストレポートを生成
      const costReport = await this.geminiService.getDailyCostReport(userId, timezone);
      
      console.log(`📊 コストレポート生成完了: ${costReport.substring(0, 100)}...`);

      // Discordに送信
      await message.reply(costReport);
      
      console.log(`✅ コストレポート送信完了: ${userId}`);
      
    } catch (error) {
      console.error('❌ コストコマンドエラー:', error);
      console.error('❌ エラー詳細:', {
        name: (error as Error).name,
        message: (error as Error).message,
        stack: (error as Error).stack?.split('\n').slice(0, 3)
      });
      await message.reply('❌ コスト情報の取得中にエラーが発生しました。しばらく後でもう一度お試しください。');
    }
  }


  /**
   * ユーザーのタイムゾーンを取得
   * @param userId ユーザーID
   * @returns タイムゾーン文字列
   */
  private async getUserTimezone(userId: string): Promise<string> {
    try {
      // データベースからユーザーのタイムゾーンを取得
      if ('getUserTimezone' in this.repository) {
        const dbTimezone = await (this.repository as any).getUserTimezone(userId);
        if (dbTimezone) {
          return dbTimezone;
        }
      }

      // フォールバック: デフォルト値を使用
      return this.config.defaultTimezone;
    } catch (error) {
      console.error('❌ タイムゾーン取得エラー:', error);
      return this.config.defaultTimezone;
    }
  }

  /**
   * ユーザーの登録状態を確認し、未登録の場合は自動登録
   * @returns 新規ユーザーの場合true、既存ユーザーの場合false
   */
  private async ensureUserRegistered(userId: string, username: string): Promise<boolean> {
    try {
      // IUserRepositoryメソッドを使用
      const userExists = await (this.repository as any).userExists(userId);
      
      if (!userExists) {
        await (this.repository as any).registerUser(userId, username);
        console.log(`🎉 新規ユーザー自動登録: ${userId} (${username})`);
        return true; // 新規ユーザー
      } else {
        // 最終利用日時を更新
        await (this.repository as any).updateLastSeen(userId);
        return false; // 既存ユーザー
      }
    } catch (error) {
      console.error('❌ ユーザー登録確認エラー:', error);
      // 登録エラーは処理を止めない（ログ記録は継続）
      return false;
    }
  }

  /**
   * ウェルカムメッセージの生成
   */
  private getWelcomeMessage(): string {
    return `
🎉 **TimeLoggerへようこそ！**

アカウントを自動作成しました。

📊 **アカウント情報**
タイムゾーン: Asia/Tokyo
登録日: ${new Date().toLocaleDateString('ja-JP')}

📝 **使い方**
- 活動記録: そのままメッセージを送信
- 今日のサマリー: \`!summary\`
- プロファイル確認: \`!profile\`
- コマンド一覧: \`!help\`

さっそく今日の活動を記録してみましょう！
    `.trim();
  }


  /**
   * 全ユーザーのタイムゾーン情報を取得（Bot用）
   */
  async getAllUserTimezones(): Promise<Array<{ user_id: string; timezone: string }>> {
    if (!this.isInitialized) {
      throw new ActivityLogError('システムが初期化されていません', 'SYSTEM_NOT_INITIALIZED');
    }

    try {
      // スケジューラー用のメソッドを使用
      return await this.repository.getAllUserTimezonesForScheduler();
    } catch (error) {
      console.error('❌ 全ユーザータイムゾーン取得エラー:', error);
      throw new ActivityLogError('全ユーザータイムゾーンの取得に失敗しました', 'GET_ALL_USER_TIMEZONES_ERROR', { error });
    }
  }

  /**
   * システムリソースをクリーンアップ（TODO機能統合対応）
   */
  async destroy(): Promise<void> {
    try {
      console.log('🧹 活動記録システムのクリーンアップ開始...');

      // TODO機能ハンドラーのクリーンアップ
      if (this.todoHandler && typeof this.todoHandler.destroy === 'function') {
        this.todoHandler.destroy();
        console.log('✅ TODO機能ハンドラークリーンアップ完了');
      }

      // データベースリポジトリのクリーンアップ
      if (this.repository && typeof this.repository.close === 'function') {
        await this.repository.close();
        console.log('✅ データベース接続クリーンアップ完了');
      }

      this.isInitialized = false;
      console.log('🎉 活動記録システムクリーンアップ完了');

    } catch (error) {
      console.error('❌ システムクリーンアップエラー:', error);
      throw new ActivityLogError(
        'システムクリーンアップに失敗しました', 
        'SYSTEM_CLEANUP_ERROR', 
        { error }
      );
    }
  }
}

/**
 * デフォルト設定を生成
 */
export function createDefaultConfig(databasePath: string, geminiApiKey: string): ActivityLoggingConfig {
  return {
    databasePath,
    geminiApiKey,
    debugMode: process.env.NODE_ENV !== 'production',
    defaultTimezone: 'Asia/Tokyo',
    enableAutoAnalysis: true,
    cacheValidityMinutes: 60,
    targetUserId: '' // マルチユーザー対応により削除（レガシー設定）
  };
}

/**
 * 活動記録システム統合のファクトリー関数
 */
export async function createActivityLoggingIntegration(config: ActivityLoggingConfig): Promise<ActivityLoggingIntegration> {
  const integration = new ActivityLoggingIntegration(config);
  await integration.initialize();
  return integration;
}