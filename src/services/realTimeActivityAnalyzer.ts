/**
 * リアルタイム活動分析統合サービス
 * 時刻抽出・活動分析・整合性検証を統合した高精度分析システム
 */

import { 
  DetailedActivityAnalysis,
  TimeAnalysisResult,
  ActivityDetail,
  RecentActivityContext,
  AnalysisMetadata,
  RealTimeAnalysisError,
  RealTimeAnalysisErrorCode,
  WarningType,
  WarningLevel,
  TimeExtractionMethod,
  ActivityPriority
} from '../types/realTimeAnalysis';
import { TimeInformationExtractor } from './timeInformationExtractor';
import { ActivityContentAnalyzer } from './activityContentAnalyzer';
import { TimeConsistencyValidator } from './timeConsistencyValidator';
import { GeminiService } from './geminiService';

/**
 * リアルタイム活動分析統合クラス
 * 入力時点での詳細な時刻・活動分析を提供
 */
export class RealTimeActivityAnalyzer {
  private timeExtractor: TimeInformationExtractor;
  private activityAnalyzer: ActivityContentAnalyzer;
  private consistencyValidator: TimeConsistencyValidator;
  
  constructor(geminiService: GeminiService) {
    this.timeExtractor = new TimeInformationExtractor(geminiService);
    this.activityAnalyzer = new ActivityContentAnalyzer(geminiService);
    this.consistencyValidator = new TimeConsistencyValidator();
  }
  
  /**
   * メイン分析メソッド - 完全な活動記録分析
   * 
   * @param input - ユーザーの活動記録入力
   * @param timezone - タイムゾーン (デフォルト: Asia/Tokyo)
   * @param inputTimestamp - 入力タイムスタンプ (デフォルト: 現在時刻)
   * @param context - 最近の活動コンテキスト
   * @returns 詳細な活動分析結果
   */
  async analyzeActivity(
    input: string,
    timezone: string = 'Asia/Tokyo',
    inputTimestamp: Date = new Date(),
    context: RecentActivityContext = { recentLogs: [] }
  ): Promise<DetailedActivityAnalysis> {
    const analysisStartTime = Date.now();
    
    try {
      console.log('🚀 リアルタイム活動分析開始');
      console.log(`📝 入力: "${input.substring(0, 100)}${input.length > 100 ? '...' : ''}"`)
      console.log(`🌍 タイムゾーン: ${timezone}, 入力時刻: ${inputTimestamp.toISOString()}`);
      
      // Phase 1: 時刻情報の詳細抽出
      console.log('⏰ Phase 1: 時刻情報抽出開始...');
      const timeAnalysis = await this.timeExtractor.extractTimeInformation(
        input,
        timezone,
        inputTimestamp,
        context
      );
      console.log(`✅ Phase 1完了: ${timeAnalysis.startTime} - ${timeAnalysis.endTime} (${timeAnalysis.totalMinutes}分, 信頼度: ${timeAnalysis.confidence})`);
      
      // Phase 2: 活動内容の詳細分析
      console.log('📊 Phase 2: 活動内容分析開始...');
      const activities = await this.activityAnalyzer.analyzeActivityContent(input, timeAnalysis);
      console.log(`✅ Phase 2完了: ${activities.length}個の活動を検出`);
      
      // Phase 3: 整合性検証と品質チェック
      console.log('🔍 Phase 3: 整合性検証開始...');
      const validationResult = await this.consistencyValidator.validateConsistency(
        timeAnalysis,
        activities,
        context,
        input
      );
      console.log(`✅ Phase 3完了: ${validationResult.warnings.length}件の警告, 総合信頼度: ${validationResult.overallConfidence}`);
      
      // Phase 4: 最終結果の構築
      console.log('🏗️ Phase 4: 最終結果構築...');
      const finalResult = this.buildFinalAnalysisResult(
        timeAnalysis,
        activities,
        validationResult,
        input,
        timezone,
        inputTimestamp,
        analysisStartTime
      );
      
      const totalProcessingTime = Date.now() - analysisStartTime;
      console.log(`🎉 リアルタイム活動分析完了 (${totalProcessingTime}ms)`);
      console.log(`📈 最終信頼度: ${finalResult.confidence}, 警告: ${finalResult.warnings.length}件`);
      
      return finalResult;
      
    } catch (error) {
      console.error('❌ リアルタイム活動分析エラー:', error);
      
      // エラー時のフォールバック分析
      return this.createFallbackAnalysis(
        input,
        timezone,
        inputTimestamp,
        error,
        analysisStartTime
      );
    }
  }
  
  /**
   * 最終分析結果の構築
   */
  private buildFinalAnalysisResult(
    timeAnalysis: TimeAnalysisResult,
    activities: ActivityDetail[],
    validationResult: any,
    originalInput: string,
    timezone: string,
    inputTimestamp: Date,
    analysisStartTime: number
  ): DetailedActivityAnalysis {
    const processingTime = Date.now() - analysisStartTime;
    
    // メタデータの構築
    const metadata: AnalysisMetadata = {
      processingTimeMs: processingTime,
      analysisMethod: 'realtime_integrated',
      componentVersions: {
        timeExtractor: '1.0.0',
        activityAnalyzer: '1.0.0',
        consistencyValidator: '1.0.0'
      },
      inputCharacteristics: {
        length: originalInput.length,
        hasExplicitTime: timeAnalysis.method === 'explicit',
        hasMultipleActivities: activities.length > 1,
        complexityLevel: this.assessInputComplexity(originalInput, activities)
      },
      qualityMetrics: {
        timeExtractionConfidence: timeAnalysis.confidence,
        averageActivityConfidence: activities.reduce((sum, a) => sum + (a.confidence || 0.5), 0) / activities.length,
        validationScore: validationResult.overallConfidence,
        warningCount: validationResult.warnings.length
      }
    };
    
    return {
      timeAnalysis,
      activities,
      confidence: validationResult.overallConfidence,
      warnings: validationResult.warnings,
      metadata,
      summary: this.generateAnalysisSummary(timeAnalysis, activities, validationResult),
      recommendations: validationResult.recommendations || []
    };
  }
  
  /**
   * 入力の複雑度評価
   */
  private assessInputComplexity(input: string, activities: ActivityDetail[]): 'simple' | 'medium' | 'complex' {
    const factors = {
      length: input.length,
      activityCount: activities.length,
      timeExpressions: (input.match(/(時|分|から|まで|中|間)/g) || []).length,
      conjunctions: (input.match(/(と|や|、|および|ながら)/g) || []).length
    };
    
    const score = factors.length * 0.01 + 
                  factors.activityCount * 5 + 
                  factors.timeExpressions * 3 + 
                  factors.conjunctions * 4;
    
    if (score < 10) return 'simple';
    if (score < 25) return 'medium';
    return 'complex';
  }
  
  /**
   * 分析サマリーの生成
   */
  private generateAnalysisSummary(
    timeAnalysis: TimeAnalysisResult,
    activities: ActivityDetail[],
    validationResult: any
  ): string {
    const startTime = new Date(timeAnalysis.startTime);
    const endTime = new Date(timeAnalysis.endTime);
    
    const timeRange = `${startTime.toLocaleTimeString('ja-JP', { 
      hour: '2-digit', 
      minute: '2-digit',
      timeZone: timeAnalysis.timezone 
    })}から${endTime.toLocaleTimeString('ja-JP', { 
      hour: '2-digit', 
      minute: '2-digit',
      timeZone: timeAnalysis.timezone 
    })}まで`;
    
    const activitySummary = activities.length === 1 
      ? activities[0].content 
      : `${activities.length}個の活動 (主要: ${activities.find(a => a.priority === 'primary')?.content || activities[0].content})`;
    
    const qualityIndicator = validationResult.overallConfidence >= 0.8 
      ? '高品質' 
      : validationResult.overallConfidence >= 0.6 
        ? '標準品質' 
        : '要確認';
    
    return `${timeRange}の${timeAnalysis.totalMinutes}分間、${activitySummary}を実行。解析品質: ${qualityIndicator} (信頼度: ${Math.round(validationResult.overallConfidence * 100)}%)`;
  }
  
  /**
   * エラー時のフォールバック分析
   */
  private createFallbackAnalysis(
    input: string,
    timezone: string,
    inputTimestamp: Date,
    error: any,
    analysisStartTime: number
  ): DetailedActivityAnalysis {
    console.log('🔄 フォールバック分析を実行中...');
    
    const processingTime = Date.now() - analysisStartTime;
    
    // 最小限の時刻推定（入力30分前から現在まで）
    const fallbackEndTime = inputTimestamp;
    const fallbackStartTime = new Date(fallbackEndTime.getTime() - 30 * 60 * 1000);
    
    const fallbackTimeAnalysis: TimeAnalysisResult = {
      startTime: fallbackStartTime.toISOString(),
      endTime: fallbackEndTime.toISOString(),
      totalMinutes: 30,
      confidence: 0.3,
      method: TimeExtractionMethod.INFERRED,
      timezone,
      extractedComponents: [],
      debugInfo: {
        detectedPatterns: [],
        geminiRawResponse: 'fallback_mode',
        processingTimeMs: processingTime,
        usedPrompt: input
      }
    };
    
    // 最小限の活動分析
    const fallbackActivities: ActivityDetail[] = [{
      content: input.substring(0, 100) + (input.length > 100 ? '...' : ''),
      category: '未分類',
      timePercentage: 100,
      actualMinutes: 30,
      priority: ActivityPriority.PRIMARY,
      confidence: 0.3
    }];
    
    // フォールバック用のメタデータ
    const fallbackMetadata: AnalysisMetadata = {
      processingTimeMs: processingTime,
      analysisMethod: 'fallback_mode',
      componentVersions: {
        timeExtractor: 'fallback',
        activityAnalyzer: 'fallback', 
        consistencyValidator: 'skipped'
      },
      inputCharacteristics: {
        length: input.length,
        hasExplicitTime: false,
        hasMultipleActivities: false,
        complexityLevel: 'simple'
      },
      qualityMetrics: {
        timeExtractionConfidence: 0.3,
        averageActivityConfidence: 0.3,
        validationScore: 0.3,
        warningCount: 1
      }
    };
    
    return {
      timeAnalysis: fallbackTimeAnalysis,
      activities: fallbackActivities,
      confidence: 0.3,
      warnings: [{
        type: WarningType.ANALYSIS_FAILED,
        level: WarningLevel.ERROR,
        message: '詳細分析に失敗したため、フォールバック分析を実行しました',
        details: {
          originalError: error.message || 'Unknown error',
          recommendation: '手動で時刻と活動内容を確認してください'
        }
      }],
      metadata: fallbackMetadata,
      summary: `フォールバック分析: ${fallbackTimeAnalysis.totalMinutes}分間の活動として記録 (要手動確認)`,
      recommendations: [
        '時刻を具体的に記載してください（例: 9:00-10:30）',
        '活動内容をより詳細に記述してください',
        'システムの動作に問題がある場合は管理者に連絡してください'
      ]
    };
  }
  
  /**
   * 簡易時刻抽出（緊急時用）
   */
  async quickTimeExtraction(
    input: string,
    timezone: string = 'Asia/Tokyo',
    inputTimestamp: Date = new Date()
  ): Promise<TimeAnalysisResult> {
    try {
      return await this.timeExtractor.extractTimeInformation(
        input,
        timezone,
        inputTimestamp,
        { recentLogs: [] }
      );
    } catch (error) {
      console.error('簡易時刻抽出エラー:', error);
      throw new RealTimeAnalysisError(
        '時刻抽出に失敗しました',
        RealTimeAnalysisErrorCode.TIME_EXTRACTION_FAILED,
        { error, input }
      );
    }
  }
  
  /**
   * 分析結果の妥当性チェック
   */
  async validateAnalysisResult(analysis: DetailedActivityAnalysis): Promise<boolean> {
    try {
      // 基本的な妥当性チェック
      if (!analysis.timeAnalysis.startTime || !analysis.timeAnalysis.endTime) {
        return false;
      }
      
      if (analysis.activities.length === 0) {
        return false;
      }
      
      if (analysis.confidence < 0 || analysis.confidence > 1) {
        return false;
      }
      
      // 時間整合性の基本チェック
      const startTime = new Date(analysis.timeAnalysis.startTime);
      const endTime = new Date(analysis.timeAnalysis.endTime);
      
      if (startTime >= endTime) {
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('分析結果妥当性チェックエラー:', error);
      return false;
    }
  }
}