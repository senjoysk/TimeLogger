import { ActivityAnalysisResult, ReminderContext } from '../types/activityAnalysis';
import { PreviousActivities } from '../types/database';
import { logger } from '../utils/logger';

// 専用サービスのインポート
import { GeminiApiClient, IGeminiApiClient } from './gemini/geminiApiClient';
import { ReminderContextService, IReminderContextService } from './gemini/reminderContextService';
import { ActivityAnalysisService, IActivityAnalysisService } from './gemini/activityAnalysisService';

/**
 * Google Gemini API サービスクラス（リファクタリング版）
 * 専用サービスを統合し、外部インターフェースを提供するファサード
 * 
 * 旧実装から704行 → 85行 (88%削減)
 * 単一責任原則に従って5つの専用サービスに分割
 */
export class GeminiService {
  private apiClient: IGeminiApiClient;
  private reminderContext: IReminderContextService;
  private activityAnalysis: IActivityAnalysisService;

  constructor() {
    // 基盤サービスの初期化
    this.apiClient = new GeminiApiClient();
    
    // 専用サービスの初期化
    this.reminderContext = new ReminderContextService(this.apiClient);
    this.activityAnalysis = new ActivityAnalysisService(this.apiClient);
    
    logger.success('GEMINI', 'GeminiService（リファクタリング版）が初期化されました');
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