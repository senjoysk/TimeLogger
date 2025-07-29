import { IApiCostRepository } from '../repositories/interfaces';
import { ApiCostMonitor } from './apiCostMonitor';
import { ClassificationResult } from '../types/todo';
import { ActivityAnalysisResult, ReminderContext } from '../types/activityAnalysis';
import { PreviousActivities } from '../types/database';
import { CostAlert } from '../types/costAlert';

// 専用サービスのインポート
import { GeminiApiClient, IGeminiApiClient } from './gemini/geminiApiClient';
import { MessageClassificationService, IMessageClassificationService } from './gemini/messageClassificationService';
import { ReminderContextService, IReminderContextService } from './gemini/reminderContextService';
import { ActivityAnalysisService, IActivityAnalysisService } from './gemini/activityAnalysisService';
import { GeminiCostService, IGeminiCostService } from './gemini/geminiCostService';

/**
 * Google Gemini API サービスクラス（リファクタリング版）
 * 専用サービスを統合し、外部インターフェースを提供するファサード
 * 
 * 旧実装から704行 → 85行 (88%削減)
 * 単一責任原則に従って5つの専用サービスに分割
 */
export class GeminiService {
  private apiClient: IGeminiApiClient;
  private messageClassification: IMessageClassificationService;
  private reminderContext: IReminderContextService;
  private activityAnalysis: IActivityAnalysisService;
  private costService: IGeminiCostService;
  private costMonitor: ApiCostMonitor;

  constructor(costRepository: IApiCostRepository) {
    // 基盤サービスの初期化
    this.costMonitor = new ApiCostMonitor(costRepository);
    this.apiClient = new GeminiApiClient();
    
    // 専用サービスの初期化
    this.messageClassification = new MessageClassificationService(this.apiClient, this.costMonitor);
    this.reminderContext = new ReminderContextService(this.apiClient, this.costMonitor);
    this.activityAnalysis = new ActivityAnalysisService(this.apiClient, this.costMonitor);
    this.costService = new GeminiCostService(this.costMonitor);
    
    console.log('✅ GeminiService（リファクタリング版）が初期化されました');
  }

  /**
   * API使用量統計を取得
   */
  public async getCostStats() {
    return await this.costService.getCostStats();
  }

  /**
   * 日次コストレポートを取得
   */
  public async getDailyCostReport(userId: string, timezone: string): Promise<string> {
    return await this.costService.getDailyCostReport(userId, timezone);
  }

  /**
   * コスト警告をチェック
   */
  public async checkCostAlerts(userId: string, timezone: string): Promise<CostAlert | null> {
    return await this.costService.checkCostAlerts(userId, timezone);
  }

  /**
   * メッセージをAIで分類
   */
  public async classifyMessageWithAI(message: string): Promise<ClassificationResult> {
    return await this.messageClassification.classifyMessageWithAI(message);
  }

  /**
   * リマインダーReplyメッセージを時間範囲付きで分析
   */
  public async classifyMessageWithReminderContext(
    messageContent: string,
    timeRange: { start: Date; end: Date },
    reminderTime?: Date,
    reminderContent?: string
  ): Promise<ClassificationResult & { contextType: 'REMINDER_REPLY' }> {
    return await this.reminderContext.classifyMessageWithReminderContext(
      messageContent, timeRange, reminderTime, reminderContent
    );
  }

  /**
   * リマインダー直後メッセージを文脈考慮で分析
   */
  public async classifyMessageWithNearbyReminderContext(
    messageContent: string,
    reminderTime: Date,
    timeDiff: number
  ): Promise<ClassificationResult & { contextType: 'POST_REMINDER' }> {
    return await this.reminderContext.classifyMessageWithNearbyReminderContext(
      messageContent, reminderTime, timeDiff
    );
  }

  /**
   * リマインダーコンテキストプロンプトを構築
   */
  public buildReminderContextPrompt(
    messageContent: string,
    timeRange: { start: Date; end: Date },
    reminderTime?: Date,
    reminderContent?: string
  ): string {
    return this.reminderContext.buildReminderContextPrompt(
      messageContent, timeRange, reminderTime, reminderContent
    );
  }

  /**
   * 活動内容を分析（リマインダーReply対応版）
   */
  public async analyzeActivityContent(
    message: string,
    currentTime: Date,
    timezone: string,
    reminderContext?: ReminderContext
  ): Promise<ActivityAnalysisResult> {
    return await this.activityAnalysis.analyzeActivityContent(
      message, currentTime, timezone, reminderContext
    );
  }

  /**
   * 活動を分析（下位互換用）
   */
  public async analyzeActivity(
    content: string,
    userId: string,
    timezone: string,
    previousActivities?: PreviousActivities
  ): Promise<ActivityAnalysisResult> {
    return await this.activityAnalysis.analyzeActivity(content, userId, timezone);
  }
}