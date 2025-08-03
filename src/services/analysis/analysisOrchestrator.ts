/**
 * 分析オーケストレーター
 * 統合分析の全体フロー制御とキャッシュ管理を担当
 */

import { IActivityLogRepository } from '../../repositories/activityLogRepository';
import {
  ActivityLog,
  DailyAnalysisResult,
  AnalysisRequest,
  ActivityLogError
} from '../../types/activityLog';
import { GeminiPromptBuilder } from './geminiPromptBuilder';
import { GeminiResponseProcessor } from './geminiResponseProcessor';
import { AnalysisChunkManager } from './analysisChunkManager';
import { AnalysisResultConverter } from './analysisResultConverter';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { config } from '../../config';
import { logger } from '../../utils/logger';

/**
 * 分析オーケストレーターインターフェース
 */
export interface IAnalysisOrchestrator {
  /**
   * 指定日の統合分析を実行
   * @param request 分析リクエスト
   * @returns 分析結果
   */
  analyzeDaily(request: AnalysisRequest): Promise<DailyAnalysisResult>;

  /**
   * 分析結果のキャッシュをチェック
   * @param userId ユーザーID
   * @param businessDate 業務日
   * @returns キャッシュされた分析結果（null if not found/invalid）
   */
  getCachedAnalysis(userId: string, businessDate: string): Promise<DailyAnalysisResult | null>;
}

/**
 * AnalysisOrchestrator の実装
 * 単一責任: 分析フローの制御とキャッシュ管理
 */
export class AnalysisOrchestrator implements IAnalysisOrchestrator {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;
  private promptBuilder: GeminiPromptBuilder;
  private responseProcessor: GeminiResponseProcessor;
  private chunkManager: AnalysisChunkManager;
  private resultConverter: AnalysisResultConverter;

  constructor(
    private repository: IActivityLogRepository
  ) {
    // Gemini API の初期化
    this.genAI = new GoogleGenerativeAI(config.gemini.apiKey);
    
    // Gemini 1.5 Flash モデルを使用（統合分析に最適化）
    this.model = this.genAI.getGenerativeModel({ 
      model: 'gemini-1.5-flash',
      generationConfig: {
        temperature: 0.2, // 一貫性重視でより低い温度
        topP: 0.9,
        maxOutputTokens: 2000, // 詳細な分析結果のため増量
      },
    });
    
    // 専門化されたサービスクラスを初期化
    this.promptBuilder = new GeminiPromptBuilder();
    this.responseProcessor = new GeminiResponseProcessor();
    this.chunkManager = new AnalysisChunkManager(this.model, this.promptBuilder, this.responseProcessor);
    this.resultConverter = new AnalysisResultConverter();
  }

  /**
   * 指定日の統合分析を実行
   */
  async analyzeDaily(request: AnalysisRequest): Promise<DailyAnalysisResult> {
    try {
      logger.info('ANALYSIS_ORCHESTRATOR', `🧠 統合分析開始: [${request.businessDate}] ${request.userId}`);

      // キャッシュチェック（forceRefreshが指定されていない場合）
      if (!request.forceRefresh) {
        const cached = await this.getCachedAnalysis(request.userId, request.businessDate);
        if (cached) {
          logger.info('ANALYSIS_ORCHESTRATOR', `⚡ キャッシュから分析結果を返却: [${request.businessDate}]`);
          return cached;
        }
      }

      // ログを取得
      const logs = await this.repository.getLogsByDate(request.userId, request.businessDate);
      
      if (logs.length === 0) {
        logger.info('ANALYSIS_ORCHESTRATOR', `📝 ログが見つかりません: [${request.businessDate}]`);
        return this.resultConverter.createEmptyAnalysis(request.businessDate);
      }

      // 分析戦略を決定して実行
      const analysisResult = await this.executeAnalysisStrategy(logs, request);

      // 分析結果をキャッシュに保存
      await this.saveCacheResult(request, analysisResult, logs.length);

      logger.info('ANALYSIS_ORCHESTRATOR', `✅ 統合分析完了: [${request.businessDate}] ${analysisResult.categories.length}カテゴリ, ${analysisResult.timeline.length}タイムライン`);
      
      return analysisResult;
    } catch (error) {
      logger.error('ANALYSIS_ORCHESTRATOR', '❌ 統合分析エラー:', error as Error);
      throw error instanceof ActivityLogError ? error :
        new ActivityLogError('統合分析の実行に失敗しました', 'UNIFIED_ANALYSIS_ERROR', { error, request });
    }
  }

  /**
   * 分析結果のキャッシュをチェック
   */
  async getCachedAnalysis(userId: string, businessDate: string): Promise<DailyAnalysisResult | null> {
    try {
      // 現在のログ数を取得
      const currentLogCount = await this.repository.getLogCountByDate(userId, businessDate);
      
      // キャッシュの有効性をチェック
      const isValid = await this.repository.isCacheValid(userId, businessDate, currentLogCount);
      
      if (!isValid) {
        return null;
      }

      // 有効なキャッシュを取得
      const cache = await this.repository.getAnalysisCache(userId, businessDate);
      return cache?.analysisResult || null;
    } catch (error) {
      logger.error('ANALYSIS_ORCHESTRATOR', '❌ キャッシュチェックエラー:', error as Error);
      return null; // エラー時はキャッシュを使用しない
    }
  }

  /**
   * 分析戦略を決定して実行
   */
  private async executeAnalysisStrategy(
    logs: ActivityLog[], 
    request: AnalysisRequest
  ): Promise<DailyAnalysisResult> {
    // トークン数をチェックして分析方法を決定
    const tokenCount = this.resultConverter.estimateTokenCount(logs);
    const maxTokens = 6000; // 安全なトークン制限

    if (tokenCount <= maxTokens) {
      // 一括分析
      logger.info('ANALYSIS_ORCHESTRATOR', `📊 一括分析実行: ${logs.length}件のログ, 推定${tokenCount}トークン`);
      return await this.executeBulkAnalysis(logs, request.timezone, request.businessDate);
    } else {
      // 分割分析
      logger.info('ANALYSIS_ORCHESTRATOR', `📊 分割分析実行: ${logs.length}件のログ, 推定${tokenCount}トークン`);
      return await this.chunkManager.analyzeInChunks(logs, request.timezone, request.businessDate);
    }
  }

  /**
   * 一括分析を実行
   */
  private async executeBulkAnalysis(
    logs: ActivityLog[], 
    timezone: string, 
    businessDate: string
  ): Promise<DailyAnalysisResult> {
    try {
      const prompt = this.promptBuilder.buildUnifiedPrompt(logs, timezone, businessDate);
      
      // デバッグ情報: プロンプトサイズと内容
      logger.debug('ANALYSIS_ORCHESTRATOR', `📝 プロンプトサイズ: ${prompt.length}文字, 推定トークン: ${Math.ceil(prompt.length / 4)}`);
      logger.debug('ANALYSIS_ORCHESTRATOR', `📝 送信プロンプト詳細:\n${prompt}`);
      
      // Gemini API 呼び出し
      const result = await this.model.generateContent(prompt);
      const response = result.response;

      // トークン使用量記録は削除済み

      const responseText = response.text();
      
      // デバッグ情報: レスポンステキストの詳細
      logger.debug('ANALYSIS_ORCHESTRATOR', `📝 Geminiレスポンス詳細: 文字数=${responseText.length}, 最後の100文字="${responseText.slice(-100)}"`);
      
      // レスポンスをパース
      const geminiResponse = this.responseProcessor.parseGeminiResponse(responseText);
      
      // DailyAnalysisResult形式に変換
      return this.resultConverter.convertToDailyAnalysisResult(geminiResponse, businessDate, logs.length);
    } catch (error) {
      logger.error('ANALYSIS_ORCHESTRATOR', '❌ 一括分析エラー:', error as Error);
      throw new ActivityLogError('一括分析の実行に失敗しました', 'BULK_ANALYSIS_ERROR', { error });
    }
  }

  /**
   * キャッシュ結果を保存
   */
  private async saveCacheResult(
    request: AnalysisRequest,
    analysisResult: DailyAnalysisResult,
    logCount: number
  ): Promise<void> {
    try {
      await this.repository.saveAnalysisCache({
        userId: request.userId,
        businessDate: request.businessDate,
        analysisResult,
        logCount
      });
    } catch (error) {
      logger.warn('ANALYSIS_ORCHESTRATOR', '⚠️ キャッシュ保存失敗:', { error });
      // キャッシュ保存の失敗は分析結果に影響しないため、警告のみ
    }
  }
}