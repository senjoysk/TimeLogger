/**
 * 分析チャンクマネージャー
 * ログの時間帯別分割とチャンク結果の統合を担当
 */

import { toZonedTime } from 'date-fns-tz';
import { GenerativeModel } from '@google/generative-ai';
import {
  ActivityLog,
  DailyAnalysisResult,
  GeminiAnalysisResponse,
  CategorySummary,
  TimeDistribution,
  AnalysisInsight,
  ActivityLogError
} from '../../types/activityLog';
import { IGeminiPromptBuilder } from './geminiPromptBuilder';
import { IGeminiResponseProcessor } from './geminiResponseProcessor';
import { AnalysisResultConverter } from './analysisResultConverter';
import { logger } from '../../utils/logger';

/**
 * チャンクマネージャーインターフェース
 */
export interface IAnalysisChunkManager {
  /**
   * 分割分析を実行
   * @param logs 活動ログ
   * @param timezone タイムゾーン
   * @param businessDate 業務日
   * @returns 分析結果
   */
  analyzeInChunks(logs: ActivityLog[], timezone: string, businessDate: string): Promise<DailyAnalysisResult>;
}

/**
 * AnalysisChunkManager の実装
 * 単一責任: ログ分割・並行処理・結果統合
 */
export class AnalysisChunkManager implements IAnalysisChunkManager {
  private resultConverter: AnalysisResultConverter;

  constructor(
    private model: GenerativeModel,
    private promptBuilder: IGeminiPromptBuilder,
    private responseProcessor: IGeminiResponseProcessor
  ) {
    this.resultConverter = new AnalysisResultConverter();
  }

  /**
   * 分割分析を実行
   */
  async analyzeInChunks(logs: ActivityLog[], timezone: string, businessDate: string): Promise<DailyAnalysisResult> {
    try {
      // 時間帯別にログを分割
      const chunks = this.splitLogsByTimeRange(logs, timezone);
      
      logger.info('CHUNK_ANALYSIS', `🔄 分割分析: ${chunks.length}チャンクに分割`);
      
      // 各チャンクをバッチ並行分析（40-60%性能向上、API制限考慮）
      const chunkResults = await this.processBatchAnalysis(chunks, timezone, businessDate);
      
      logger.info('CHUNK_ANALYSIS', `✅ チャンクバッチ並行分析完了: ${chunkResults.length}チャンク処理済み`);

      // チャンク結果を統合
      const mergedResult = this.mergeChunkResults(chunkResults);
      
      // DailyAnalysisResult形式に変換
      return this.resultConverter.convertToDailyAnalysisResult(mergedResult, businessDate, logs.length);
    } catch (error) {
      logger.error('CHUNK_ANALYSIS', '❌ 分割分析エラー:', error as Error);
      throw new ActivityLogError('分割分析の実行に失敗しました', 'CHUNK_ANALYSIS_ERROR', { error });
    }
  }

  /**
   * ログを時間帯別に分割
   */
  private splitLogsByTimeRange(logs: ActivityLog[], timezone: string): Array<{
    timeRange: string;
    logs: ActivityLog[];
  }> {
    const chunks: Array<{ timeRange: string; logs: ActivityLog[] }> = [];
    
    // 時間帯を定義
    const timeRanges = [
      { name: '早朝（5:00-9:00）', start: 5, end: 9 },
      { name: '午前（9:00-12:00）', start: 9, end: 12 },
      { name: '午後（13:00-17:00）', start: 13, end: 17 },
      { name: '夕方（17:00-21:00）', start: 17, end: 21 },
      { name: '夜間（21:00-24:00）', start: 21, end: 24 }
    ];

    for (const range of timeRanges) {
      const rangeLogs = logs.filter(log => {
        const inputTime = new Date(log.inputTimestamp);
        const localTime = toZonedTime(inputTime, timezone);
        const hour = localTime.getHours();
        return hour >= range.start && hour < range.end;
      });

      if (rangeLogs.length > 0) {
        chunks.push({
          timeRange: range.name,
          logs: rangeLogs
        });
      }
    }

    return chunks;
  }

  /**
   * バッチ並行分析を処理
   */
  private async processBatchAnalysis(
    chunks: Array<{ timeRange: string; logs: ActivityLog[] }>,
    timezone: string,
    businessDate: string
  ): Promise<GeminiAnalysisResponse[]> {
    const chunkResults: GeminiAnalysisResponse[] = [];
    const BATCH_SIZE = 3; // API制限を考慮したバッチサイズ
    
    logger.info('CHUNK_ANALYSIS', `🚀 チャンクバッチ並行分析開始: ${chunks.length}チャンク、バッチサイズ${BATCH_SIZE}`);
    
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      
      logger.info('CHUNK_ANALYSIS', `📊 バッチ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(chunks.length / BATCH_SIZE)}処理中: チャンク${i + 1}-${Math.min(i + batch.length, chunks.length)}`);
      
      const batchPromises = batch.map(async (chunk, batchIndex) => {
        const globalIndex = i + batchIndex;
        return await this.analyzeChunk(chunk, timezone, businessDate, globalIndex, chunks.length);
      });
      
      const batchResults = await Promise.all(batchPromises);
      chunkResults.push(...batchResults);
      
      logger.info('CHUNK_ANALYSIS', `✅ バッチ${Math.floor(i / BATCH_SIZE) + 1}完了: ${batchResults.length}チャンク処理済み`);
    }
    
    return chunkResults;
  }

  /**
   * 個別チャンクを分析
   */
  private async analyzeChunk(
    chunk: { timeRange: string; logs: ActivityLog[] },
    timezone: string,
    businessDate: string,
    globalIndex: number,
    totalChunks: number
  ): Promise<GeminiAnalysisResponse> {
    logger.info('CHUNK_ANALYSIS', `📊 チャンク${globalIndex + 1}/${totalChunks}を分析: ${chunk.logs.length}件`);
    
    const prompt = this.promptBuilder.buildChunkPrompt(chunk.logs, timezone, chunk.timeRange, businessDate);
    
    const result = await this.model.generateContent(prompt);
    const response = result.response;

    // トークン使用量記録は削除済み

    const responseText = response.text();
    
    // デバッグ情報: チャンクレスポンステキストの詳細
    logger.debug('CHUNK_ANALYSIS', `📝 チャンク${globalIndex + 1}レスポンス詳細: 文字数=${responseText.length}, 最後の50文字="${responseText.slice(-50)}"`);
    
    // 不完全なJSONの検出
    if (!responseText.trim().endsWith('}')) {
      logger.warn('CHUNK_ANALYSIS', `⚠️ チャンク${globalIndex + 1}のレスポンスが不完全です`);
    }
    
    return this.responseProcessor.parseGeminiResponse(responseText);
  }

  /**
   * チャンク結果を統合
   */
  private mergeChunkResults(chunkResults: GeminiAnalysisResponse[]): GeminiAnalysisResponse {
    // カテゴリを統合
    const mergedCategories = this.mergeCategories(chunkResults);
    
    // タイムラインを統合（時刻順）
    const mergedTimeline = chunkResults
      .flatMap(result => result.timeline)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    // 時間分布を統合
    const mergedTimeDistribution = this.mergeTimeDistribution(chunkResults);

    // 洞察を統合
    const mergedInsights = this.mergeInsights(chunkResults);

    // 警告を統合
    const mergedWarnings = chunkResults.flatMap(result => result.warnings);

    // 全体の信頼度（平均）
    const avgConfidence = chunkResults.reduce((sum, r) => sum + r.confidence, 0) / chunkResults.length;

    return {
      categories: Array.from(mergedCategories.values()),
      timeline: mergedTimeline,
      timeDistribution: mergedTimeDistribution,
      insights: mergedInsights,
      warnings: mergedWarnings,
      confidence: avgConfidence
    };
  }

  /**
   * カテゴリを統合
   */
  private mergeCategories(chunkResults: GeminiAnalysisResponse[]): Map<string, CategorySummary> {
    const mergedCategories = new Map<string, CategorySummary>();
    
    for (const result of chunkResults) {
      for (const category of result.categories) {
        const key = `${category.category}-${category.subCategory || ''}`;
        
        if (mergedCategories.has(key)) {
          const existing = mergedCategories.get(key)!;
          existing.estimatedMinutes += category.estimatedMinutes;
          existing.logCount += category.logCount;
          existing.representativeActivities = [
            ...existing.representativeActivities,
            ...category.representativeActivities
          ].slice(0, 5); // 最大5件
        } else {
          mergedCategories.set(key, { ...category });
        }
      }
    }

    return mergedCategories;
  }

  /**
   * 時間分布を統合
   */
  private mergeTimeDistribution(chunkResults: GeminiAnalysisResponse[]): TimeDistribution {
    const mergedTimeDistribution: TimeDistribution = {
      totalEstimatedMinutes: 0,
      workingMinutes: 0,
      breakMinutes: 0,
      unaccountedMinutes: 0,
      overlapMinutes: 0
    };

    for (const result of chunkResults) {
      mergedTimeDistribution.totalEstimatedMinutes += result.timeDistribution.totalEstimatedMinutes;
      mergedTimeDistribution.workingMinutes += result.timeDistribution.workingMinutes;
      mergedTimeDistribution.breakMinutes += result.timeDistribution.breakMinutes;
      mergedTimeDistribution.unaccountedMinutes += result.timeDistribution.unaccountedMinutes;
      mergedTimeDistribution.overlapMinutes += result.timeDistribution.overlapMinutes;
    }

    return mergedTimeDistribution;
  }

  /**
   * 洞察を統合
   */
  private mergeInsights(chunkResults: GeminiAnalysisResponse[]): AnalysisInsight {
    // 最初のチャンクのものを使用し、提案を統合
    const firstInsight = chunkResults[0]?.insights || {
      productivityScore: 70,
      workBalance: {
        focusTimeRatio: 0.5,
        meetingTimeRatio: 0.2,
        breakTimeRatio: 0.2,
        adminTimeRatio: 0.1
      },
      suggestions: [],
      highlights: [],
      motivation: '今日もお疲れさまでした！'
    };

    const allSuggestions = chunkResults.flatMap(r => r.insights.suggestions);
    const allHighlights = chunkResults.flatMap(r => r.insights.highlights);

    firstInsight.suggestions = [...new Set(allSuggestions)].slice(0, 3);
    firstInsight.highlights = [...new Set(allHighlights)].slice(0, 3);

    return firstInsight;
  }
}