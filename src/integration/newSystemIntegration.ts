/**
 * 新活動記録システム統合クラス
 * 既存のDiscord Botに新しい自然言語ログシステムを統合
 */

import { Client, Message } from 'discord.js';
// Removed better-sqlite3 import - using sqlite3 via repository
import { SqliteActivityLogRepository } from '../repositories/sqliteActivityLogRepository';
import { ActivityLogService } from '../services/activityLogService';
import { UnifiedAnalysisService } from '../services/unifiedAnalysisService';
import { AnalysisCacheService } from '../services/analysisCacheService';
import { NewEditCommandHandler } from '../handlers/newEditCommandHandler';
import { NewSummaryHandler } from '../handlers/newSummaryHandler';
import { LogsCommandHandler } from '../handlers/logsCommandHandler';
import { GeminiService } from '../services/geminiService';
import { ActivityLogError } from '../types/activityLog';

/**
 * 統合設定インターフェース
 */
export interface IntegrationConfig {
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
  /** 対象ユーザーID */
  targetUserId: string;
}

/**
 * 新システム統合クラス
 */
export class NewSystemIntegration {
  // サービス層
  private repository!: SqliteActivityLogRepository;
  private activityLogService!: ActivityLogService;
  private geminiService!: GeminiService;
  private unifiedAnalysisService!: UnifiedAnalysisService;
  private analysisCacheService!: AnalysisCacheService;

  // ハンドラー層
  private editHandler!: NewEditCommandHandler;
  private summaryHandler!: NewSummaryHandler;
  private logsHandler!: LogsCommandHandler;

  // 設定
  private config: IntegrationConfig;
  private isInitialized: boolean = false;

  constructor(config: IntegrationConfig) {
    this.config = config;
  }

  /**
   * 新システムを初期化
   */
  async initialize(): Promise<void> {
    try {
      console.log('🚀 新活動記録システムの初期化を開始...');

      // 1. データベース接続とRepository初期化
      this.repository = new SqliteActivityLogRepository(this.config.databasePath);
      // Repository is initialized in constructor
      console.log('✅ データベース接続完了');

      // 2. サービス層の初期化
      this.activityLogService = new ActivityLogService(this.repository);
      
      // Create a mock cost repository for the integration
      const mockCostRepository = {
        recordApiCall: async () => {},
        getTodayStats: async () => ({
          totalCalls: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          estimatedCost: 0,
          operationBreakdown: {}
        }),
        checkCostAlerts: async () => null,
        generateDailyReport: async () => 'No cost data available'
      };
      
      this.geminiService = new GeminiService(mockCostRepository);
      
      this.analysisCacheService = new AnalysisCacheService(
        this.repository,
        { maxAgeMinutes: this.config.cacheValidityMinutes }
      );
      
      this.unifiedAnalysisService = new UnifiedAnalysisService(
        this.repository,
        mockCostRepository
      );
      console.log('✅ サービス層初期化完了');

      // 3. ハンドラー層の初期化
      this.editHandler = new NewEditCommandHandler(this.activityLogService);
      this.summaryHandler = new NewSummaryHandler(
        this.unifiedAnalysisService, 
        this.activityLogService
      );
      this.logsHandler = new LogsCommandHandler(this.activityLogService);
      console.log('✅ ハンドラー層初期化完了');

      this.isInitialized = true;
      console.log('🎉 新活動記録システム初期化完了！');

    } catch (error) {
      console.error('❌ 新システム初期化エラー:', error);
      throw new ActivityLogError(
        '新システムの初期化に失敗しました', 
        'INTEGRATION_INIT_ERROR', 
        { error }
      );
    }
  }

  /**
   * Discord Botにメッセージハンドラーを統合
   * 既存のハンドラーより優先して処理
   */
  integrateWithBot(client: Client): void {
    if (!this.isInitialized) {
      throw new ActivityLogError(
        '新システムが初期化されていません', 
        'SYSTEM_NOT_INITIALIZED'
      );
    }

    console.log('🔗 Discord Botへの統合を開始...');

    // 既存のmessageCreateリスナーを一時的に無効化
    const existingListeners = client.listeners('messageCreate');
    client.removeAllListeners('messageCreate');

    // 新システムのメッセージハンドラーを最優先で追加
    client.on('messageCreate', async (message: Message) => {
      const handled = await this.handleMessage(message);
      
      // 新システムで処理されなかった場合は既存のハンドラーに委譲
      if (!handled) {
        for (const listener of existingListeners) {
          try {
            await (listener as Function)(message);
          } catch (error) {
            console.error('❌ 旧システムハンドラーエラー:', error);
          }
        }
      }
    });

    console.log('✅ Discord Bot統合完了（新システム優先モード）');
  }

  /**
   * メッセージを処理（既存システムとの互換性を保持）
   * @returns 新システムで処理された場合true、そうでなければfalse
   */
  private async handleMessage(message: Message): Promise<boolean> {
    try {
      console.log('🔍 [新システム] メッセージ受信:', {
        authorId: message.author?.id,
        authorTag: message.author?.tag,
        isBot: message.author?.bot,
        isDM: message.channel.isDMBased(),
        content: message.content,
        timestamp: new Date().toISOString()
      });

      // Bot自身のメッセージは無視
      if (message.author.bot) {
        console.log('  ↳ [新システム] Botメッセージのため無視');
        return false;
      }

      // DMのみを処理（ギルドチャンネルは無視）
      if (message.guild) {
        console.log('  ↳ [新システム] ギルドメッセージのため無視（DMのみ処理）');
        return false;
      }

      const userId = message.author.id;
      const content = message.content.trim();
      const timezone = this.config.defaultTimezone; // 設定から取得、将来的にはユーザー設定に

      // 対象ユーザーのみ処理
      if (userId !== this.config.targetUserId) {
        console.log(`  ↳ [新システム] 対象外ユーザー (受信: ${userId}, 期待: ${this.config.targetUserId})`);
        return false;
      }

      console.log(`✅ [新システム] 処理対象メッセージ: "${content}"`)

      // コマンド処理
      if (content.startsWith('!')) {
        await this.handleCommand(message, userId, content, timezone);
        return true;
      }

      // 通常のメッセージを活動ログとして記録
      if (content.length > 0 && content.length <= 2000) {
        await this.recordActivity(message, userId, content, timezone);
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

    console.log(`🎮 コマンド処理: ${command} (${userId})`);

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

      default:
        // 他のコマンドは既存システムに委譲または無視
        console.log(`📝 未対応コマンド: ${command}`);
        break;
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
    try {
      // 今日のログ数をチェック
      const logs = await this.activityLogService.getLogsForDate(userId, businessDate, timezone);
      
      // 一定数のログが蓄積された場合のみ分析実行
      if (logs.length >= 5 && logs.length % 5 === 0) {
        console.log(`🔄 自動分析開始: ${userId} ${businessDate} (${logs.length}件)`);
        
        await this.unifiedAnalysisService.analyzeDaily({
          userId,
          businessDate,
          timezone,
          forceRefresh: false
        });
        
        console.log(`✅ 自動分析完了: ${userId} ${businessDate}`);
      }
    } catch (error) {
      console.warn('⚠️ 自動分析失敗:', error);
    }
  }

  /**
   * システム全般のヘルプを表示
   */
  private async showGeneralHelp(message: Message): Promise<void> {
    const helpMessage = `🤖 **TimeLogger 新システム**

**📝 活動記録**
メッセージを送信するだけで自動記録されます
例: 「プログラミングをしています」

**⚡ 主要コマンド**
\`!summary\` - 今日の活動サマリー表示
\`!edit\` - ログの編集・削除
\`!logs\` - 生ログの表示・検索

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
   * システムを正常にシャットダウン
   */
  async shutdown(): Promise<void> {
    try {
      console.log('🔄 新システムのシャットダウンを開始...');

      if (this.repository) {
        await this.repository.close();
        console.log('✅ データベース接続を閉じました');
      }

      this.isInitialized = false;
      console.log('✅ 新システムのシャットダウン完了');
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
        details.services = !!(this.activityLogService && this.unifiedAnalysisService);

        // ハンドラー存在チェック
        details.handlers = !!(this.editHandler && this.summaryHandler && this.logsHandler);
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
  getConfig(): IntegrationConfig {
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
}

/**
 * デフォルト設定を生成
 */
export function createDefaultConfig(databasePath: string, geminiApiKey: string): IntegrationConfig {
  return {
    databasePath,
    geminiApiKey,
    debugMode: process.env.NODE_ENV !== 'production',
    defaultTimezone: 'Asia/Tokyo',
    enableAutoAnalysis: true,
    cacheValidityMinutes: 60,
    targetUserId: process.env.TARGET_USER_ID || '770478489203507241' // 設定ファイルから取得
  };
}

/**
 * 新システム統合のファクトリー関数
 */
export async function createNewSystemIntegration(config: IntegrationConfig): Promise<NewSystemIntegration> {
  const integration = new NewSystemIntegration(config);
  await integration.initialize();
  return integration;
}