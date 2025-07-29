/**
 * 統合分析サービス
 * 自然言語ログを統合的に分析してタイムライン・カテゴリ別時間配分を生成
 * 
 * リファクタリング版: 単一責任原則に従って分析オーケストレーターに委譲
 */

import { IActivityLogRepository } from '../repositories/activityLogRepository';
import { IApiCostRepository } from '../repositories/interfaces';
import {
  ActivityLog,
  DailyAnalysisResult,
  AnalysisRequest
} from '../types/activityLog';
import { AnalysisOrchestrator, IAnalysisOrchestrator } from './analysis/analysisOrchestrator';

/**
 * 統合分析サービスインターフェース
 */
export interface IUnifiedAnalysisService {
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

  /**
   * トークン数を推定
   * @param logs 分析対象ログ
   * @returns 推定トークン数
   */
  estimateTokenCount(logs: ActivityLog[]): number;
}

/**
 * UnifiedAnalysisServiceの実装
 * リファクタリング版: AnalysisOrchestratorに責任を委譲
 */
export class UnifiedAnalysisService implements IUnifiedAnalysisService {
  private orchestrator: IAnalysisOrchestrator;

  constructor(
    repository: IActivityLogRepository,
    costRepository: IApiCostRepository
  ) {
    // 分析オーケストレーターに全責任を委譲
    this.orchestrator = new AnalysisOrchestrator(repository, costRepository);
  }

  /**
   * 指定日の統合分析を実行
   */
  async analyzeDaily(request: AnalysisRequest): Promise<DailyAnalysisResult> {
    return await this.orchestrator.analyzeDaily(request);
  }

  /**
   * 分析結果のキャッシュをチェック
   */
  async getCachedAnalysis(userId: string, businessDate: string): Promise<DailyAnalysisResult | null> {
    return await this.orchestrator.getCachedAnalysis(userId, businessDate);
  }

  /**
   * トークン数を推定
   */
  estimateTokenCount(logs: ActivityLog[]): number {
    // 簡易的なトークン数推定（日本語は1文字≒1.5トークン）
    const totalChars = logs.reduce((sum, log) => sum + log.content.length, 0);
    const promptOverhead = 2000; // プロンプト固定部分
    
    return Math.ceil(totalChars * 1.5) + promptOverhead;
  }
}