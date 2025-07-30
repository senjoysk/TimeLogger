/**
 * 時刻整合性検証サービス
 * 時刻情報と活動内容の論理的整合性をチェック・警告
 */

import { 
  TimeAnalysisResult,
  ActivityDetail,
  AnalysisWarning,
  WarningType,
  WarningLevel,
  RecentActivityContext,
  DetailedActivityAnalysis,
  RealTimeAnalysisError,
  RealTimeAnalysisErrorCode
} from '../types/realTimeAnalysis';
import { logger } from '../utils/logger';

/**
 * 時刻整合性検証クラス
 */
export class TimeConsistencyValidator {
  
  /**
   * メイン検証メソッド - 全体的な整合性をチェック
   */
  async validateConsistency(
    timeAnalysis: TimeAnalysisResult,
    activities: ActivityDetail[],
    context: RecentActivityContext,
    originalInput: string
  ): Promise<ValidationResult> {
    try {
      logger.info('TIME_VALIDATOR', '🔍 時刻整合性検証開始...');
      
      const warnings: AnalysisWarning[] = [];
      
      // 1. 基本的な時刻整合性チェック
      warnings.push(...this.validateBasicTimeConsistency(timeAnalysis));
      
      // 2. 活動時間の物理的整合性チェック
      warnings.push(...this.validateActivityTimeConsistency(timeAnalysis, activities));
      
      // 3. 履歴との整合性チェック  
      warnings.push(...this.validateHistoricalConsistency(timeAnalysis, context));
      
      // 4. 入力内容との整合性チェック
      warnings.push(...this.validateInputConsistency(timeAnalysis, activities, originalInput));
      
      // 5. 並列活動の論理的整合性チェック
      warnings.push(...this.validateParallelActivityConsistency(activities, timeAnalysis));
      
      // 6. 総合的な信頼度評価
      const overallConfidence = this.calculateOverallConfidence(timeAnalysis, activities, warnings);
      
      const result: ValidationResult = {
        isValid: warnings.filter(w => w.level === WarningLevel.ERROR).length === 0,
        warnings: warnings.filter(w => w.level !== WarningLevel.INFO), // INFOレベルは除外
        overallConfidence,
        recommendations: this.generateRecommendations(warnings, timeAnalysis),
        validationSummary: this.createValidationSummary(warnings, overallConfidence)
      };
      
      logger.info('TIME_VALIDATOR', `✅ 整合性検証完了: ${warnings.length}件の警告, 信頼度: ${overallConfidence}`);
      return result;
      
    } catch (error) {
      logger.error('TIME_VALIDATOR', '❌ 整合性検証エラー:', error as Error);
      throw new RealTimeAnalysisError(
        '時刻整合性の検証に失敗しました',
        RealTimeAnalysisErrorCode.VALIDATION_FAILED,
        { error, timeAnalysis, activities }
      );
    }
  }
  
  /**
   * 基本的な時刻整合性チェック
   */
  private validateBasicTimeConsistency(timeAnalysis: TimeAnalysisResult): AnalysisWarning[] {
    const warnings: AnalysisWarning[] = [];
    
    // 1. 開始・終了時刻の基本チェック
    const startTime = new Date(timeAnalysis.startTime);
    const endTime = new Date(timeAnalysis.endTime);
    
    if (startTime >= endTime) {
      warnings.push({
        type: WarningType.TIME_INCONSISTENCY,
        level: WarningLevel.ERROR,
        message: '開始時刻が終了時刻と同じか、それより後になっています',
        details: {
          startTime: timeAnalysis.startTime,
          endTime: timeAnalysis.endTime,
          suggestion: '時刻を確認して修正してください'
        }
      });
    }
    
    // 2. 活動時間の妥当性チェック
    const actualMinutes = (endTime.getTime() - startTime.getTime()) / (1000 * 60);
    
    if (Math.abs(actualMinutes - timeAnalysis.totalMinutes) > 1) {
      warnings.push({
        type: WarningType.TIME_CALCULATION_ERROR,
        level: WarningLevel.WARNING,
        message: '計算された時間と実際の時間差が一致しません',
        details: {
          calculatedMinutes: timeAnalysis.totalMinutes,
          actualMinutes: Math.round(actualMinutes),
          difference: Math.abs(actualMinutes - timeAnalysis.totalMinutes)
        }
      });
    }
    
    // 3. 異常に長い／短い活動時間
    if (timeAnalysis.totalMinutes > 480) { // 8時間以上
      warnings.push({
        type: WarningType.DURATION_SUSPICIOUS,
        level: WarningLevel.WARNING,
        message: '活動時間が異常に長く設定されています（8時間以上）',
        details: {
          totalMinutes: timeAnalysis.totalMinutes,
          suggestion: '活動時間を再確認してください'
        }
      });
    }
    
    if (timeAnalysis.totalMinutes < 1) {
      warnings.push({
        type: WarningType.DURATION_SUSPICIOUS,
        level: WarningLevel.WARNING,
        message: '活動時間が1分未満です',
        details: {
          totalMinutes: timeAnalysis.totalMinutes,
          suggestion: '最低1分以上の活動時間を設定してください'
        }
      });
    }
    
    // 4. 信頼度の低い時刻抽出
    if (timeAnalysis.confidence < 0.5) {
      warnings.push({
        type: WarningType.LOW_CONFIDENCE,
        level: WarningLevel.INFO,
        message: '時刻抽出の信頼度が低めです',
        details: {
          confidence: timeAnalysis.confidence,
          method: timeAnalysis.method,
          suggestion: 'より具体的な時刻表現を使用することを推奨します'
        }
      });
    }
    
    return warnings;
  }
  
  /**
   * 活動時間の物理的整合性チェック
   */
  private validateActivityTimeConsistency(
    timeAnalysis: TimeAnalysisResult,
    activities: ActivityDetail[]
  ): AnalysisWarning[] {
    const warnings: AnalysisWarning[] = [];
    
    // 1. 時間配分の合計チェック
    const totalPercentage = activities.reduce((sum, activity) => sum + activity.timePercentage, 0);
    const totalMinutes = activities.reduce((sum, activity) => sum + (activity.actualMinutes || 0), 0);
    
    if (Math.abs(totalPercentage - 100) > 1) {
      warnings.push({
        type: WarningType.TIME_DISTRIBUTION_ERROR,
        level: WarningLevel.ERROR,
        message: '活動の時間配分の合計が100%になっていません',
        details: {
          totalPercentage,
          expectedPercentage: 100,
          activities: activities.map(a => ({ content: a.content, percentage: a.timePercentage }))
        }
      });
    }
    
    if (Math.abs(totalMinutes - timeAnalysis.totalMinutes) > 2) {
      warnings.push({
        type: WarningType.TIME_DISTRIBUTION_ERROR,
        level: WarningLevel.WARNING,
        message: '活動時間の合計が総活動時間と一致しません',
        details: {
          totalActivityMinutes: totalMinutes,
          expectedTotalMinutes: timeAnalysis.totalMinutes,
          difference: Math.abs(totalMinutes - timeAnalysis.totalMinutes)
        }
      });
    }
    
    // 2. 個別活動の妥当性チェック
    activities.forEach((activity, index) => {
      // 異常に短い活動
      if (activity.actualMinutes && activity.actualMinutes < 1 && activity.timePercentage > 5) {
        warnings.push({
          type: WarningType.ACTIVITY_DURATION_SUSPICIOUS,
          level: WarningLevel.WARNING,
          message: `活動${index + 1}の時間が異常に短く設定されています`,
          details: {
            activityContent: activity.content,
            actualMinutes: activity.actualMinutes,
            timePercentage: activity.timePercentage
          }
        });
      }
      
      // 信頼度の低い活動
      if (activity.confidence < 0.4) {
        warnings.push({
          type: WarningType.LOW_CONFIDENCE,
          level: WarningLevel.INFO,
          message: `活動${index + 1}の分析信頼度が低めです`,
          details: {
            activityContent: activity.content,
            confidence: activity.confidence,
            suggestion: 'より具体的な活動内容の記録を推奨します'
          }
        });
      }
    });
    
    return warnings;
  }
  
  /**
   * 履歴との整合性チェック
   */
  private validateHistoricalConsistency(
    timeAnalysis: TimeAnalysisResult,
    context: RecentActivityContext
  ): AnalysisWarning[] {
    const warnings: AnalysisWarning[] = [];
    
    if (!context.recentLogs || context.recentLogs.length === 0) {
      return warnings;
    }
    
    const currentStart = new Date(timeAnalysis.startTime);
    const currentEnd = new Date(timeAnalysis.endTime);
    
    // 最近のログとの時間重複チェック
    context.recentLogs.forEach((recentLog, index) => {
      if (!recentLog.startTime || !recentLog.endTime) return;
      
      const recentStart = new Date(recentLog.startTime);
      const recentEnd = new Date(recentLog.endTime);
      
      // 完全重複チェック
      if (currentStart.getTime() === recentStart.getTime() && 
          currentEnd.getTime() === recentEnd.getTime()) {
        warnings.push({
          type: WarningType.DUPLICATE_TIME_ENTRY,
          level: WarningLevel.ERROR,
          message: '同じ時間帯の活動が既に記録されています',
          details: {
            existingEntry: recentLog.content,
            timeRange: `${recentLog.startTime} - ${recentLog.endTime}`,
            suggestion: '重複していないか確認してください'
          }
        });
      }
      
      // 部分重複チェック
      const overlapMinutes = this.calculateTimeOverlap(currentStart, currentEnd, recentStart, recentEnd);
      if (overlapMinutes > 0) {
        warnings.push({
          type: WarningType.TIME_OVERLAP,
          level: WarningLevel.WARNING,
          message: `最近の活動記録と${overlapMinutes}分重複しています`,
          details: {
            existingEntry: recentLog.content,
            overlapMinutes,
            suggestion: '時刻を確認するか、並列活動として記録することを検討してください'
          }
        });
      }
    });
    
    return warnings;
  }
  
  /**
   * 時間重複の計算
   */
  private calculateTimeOverlap(
    start1: Date, end1: Date, 
    start2: Date, end2: Date
  ): number {
    const overlapStart = new Date(Math.max(start1.getTime(), start2.getTime()));
    const overlapEnd = new Date(Math.min(end1.getTime(), end2.getTime()));
    
    if (overlapStart < overlapEnd) {
      return Math.round((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60));
    }
    
    return 0;
  }
  
  /**
   * 入力内容との整合性チェック
   */
  private validateInputConsistency(
    timeAnalysis: TimeAnalysisResult,
    activities: ActivityDetail[],
    originalInput: string
  ): AnalysisWarning[] {
    const warnings: AnalysisWarning[] = [];
    
    // 1. 入力に含まれる時刻表現と解析結果の整合性
    const explicitTimePattern = /(\d{1,2}):(\d{2})\s*[-〜～から]\s*(\d{1,2}):(\d{2})/;
    const timeMatch = originalInput.match(explicitTimePattern);
    
    if (timeMatch && timeAnalysis.method === 'explicit') {
      const inputStartHour = parseInt(timeMatch[1], 10);
      const inputStartMinute = parseInt(timeMatch[2], 10);
      const inputEndHour = parseInt(timeMatch[3], 10);
      const inputEndMinute = parseInt(timeMatch[4], 10);
      
      const analysisStart = new Date(timeAnalysis.startTime);
      const analysisEnd = new Date(timeAnalysis.endTime);
      
      // タイムゾーンを考慮した時刻比較
      const inputStartTime = new Date(analysisStart);
      inputStartTime.setHours(inputStartHour, inputStartMinute, 0, 0);
      
      const inputEndTime = new Date(analysisEnd);
      inputEndTime.setHours(inputEndHour, inputEndMinute, 0, 0);
      
      if (inputEndTime <= inputStartTime) {
        inputEndTime.setDate(inputEndTime.getDate() + 1);
      }
      
      // 5分以上の差異があれば警告
      const startDiffMinutes = Math.abs(analysisStart.getTime() - inputStartTime.getTime()) / (1000 * 60);
      const endDiffMinutes = Math.abs(analysisEnd.getTime() - inputEndTime.getTime()) / (1000 * 60);
      
      if (startDiffMinutes > 5 || endDiffMinutes > 5) {
        warnings.push({
          type: WarningType.INPUT_ANALYSIS_MISMATCH,
          level: WarningLevel.WARNING,
          message: '入力された時刻と解析結果に差異があります',
          details: {
            inputTimeRange: `${timeMatch[1]}:${timeMatch[2]}-${timeMatch[3]}:${timeMatch[4]}`,
            analysisTimeRange: `${analysisStart.toLocaleTimeString()}-${analysisEnd.toLocaleTimeString()}`,
            startDiffMinutes: Math.round(startDiffMinutes),
            endDiffMinutes: Math.round(endDiffMinutes)
          }
        });
      }
    }
    
    // 2. 活動内容の完全性チェック  
    const totalActivityLength = activities.reduce((sum, activity) => sum + activity.content.length, 0);
    const inputLength = originalInput.length;
    
    if (totalActivityLength < inputLength * 0.5) {
      warnings.push({
        type: WarningType.CONTENT_ANALYSIS_INCOMPLETE,
        level: WarningLevel.INFO,
        message: '入力内容の一部が活動分析に反映されていない可能性があります',
        details: {
          originalInputLength: inputLength,
          analyzedContentLength: totalActivityLength,
          suggestion: '分析結果を確認し、必要に応じて手動で補完してください'
        }
      });
    }
    
    return warnings;
  }
  
  /**
   * 並列活動の論理的整合性チェック
   */
  private validateParallelActivityConsistency(
    activities: ActivityDetail[],
    timeAnalysis: TimeAnalysisResult
  ): AnalysisWarning[] {
    const warnings: AnalysisWarning[] = [];
    
    if (activities.length <= 1) {
      return warnings;
    }
    
    // 1. 物理的に不可能な並列活動の検出
    const physicallyConflictingCategories = [
      ['会議', '開発'],
      ['移動', '会議'],
      ['食事', '会議']
    ];
    
    const categories = activities.map(a => a.category);
    
    physicallyConflictingCategories.forEach(conflictPair => {
      if (categories.includes(conflictPair[0]) && categories.includes(conflictPair[1])) {
        const activity1 = activities.find(a => a.category === conflictPair[0]);
        const activity2 = activities.find(a => a.category === conflictPair[1]);
        
        if (activity1 && activity2 && 
            activity1.timePercentage > 20 && activity2.timePercentage > 20) {
          warnings.push({
            type: WarningType.PARALLEL_ACTIVITY_CONFLICT,
            level: WarningLevel.WARNING,
            message: `${conflictPair[0]}と${conflictPair[1]}の並列実行は物理的に困難です`,
            details: {
              conflictingActivities: [activity1.content, activity2.content],
              timePercentages: [activity1.timePercentage, activity2.timePercentage],
              suggestion: '時間配分を見直すか、活動内容を確認してください'
            }
          });
        }
      }
    });
    
    // 2. 時間配分の妥当性チェック（並列活動の場合）
    const highPercentageActivities = activities.filter(a => a.timePercentage > 50);
    
    if (highPercentageActivities.length > 2) {
      warnings.push({
        type: WarningType.TIME_DISTRIBUTION_UNREALISTIC,
        level: WarningLevel.WARNING,
        message: '50%以上の時間を占める活動が3つ以上あります',
        details: {
          highPercentageActivities: highPercentageActivities.map(a => ({
            content: a.content,
            percentage: a.timePercentage
          })),
          suggestion: '時間配分を再検討してください'
        }
      });
    }
    
    return warnings;
  }
  
  /**
   * 総合的な信頼度評価
   */
  private calculateOverallConfidence(
    timeAnalysis: TimeAnalysisResult,
    activities: ActivityDetail[],
    warnings: AnalysisWarning[]
  ): number {
    let confidence = timeAnalysis.confidence;
    
    // 活動分析の信頼度を加味
    const avgActivityConfidence = activities.reduce((sum, a) => sum + (a.confidence || 0.5), 0) / activities.length;
    confidence = (confidence + avgActivityConfidence) / 2;
    
    // 警告レベルに応じて信頼度を調整
    const errorCount = warnings.filter(w => w.level === WarningLevel.ERROR).length;
    const warningCount = warnings.filter(w => w.level === WarningLevel.WARNING).length;
    
    confidence -= (errorCount * 0.2) + (warningCount * 0.1);
    
    // 信頼度の下限を0.1に設定
    return Math.max(0.1, Math.min(1.0, confidence));
  }
  
  /**
   * 推奨事項の生成
   */
  private generateRecommendations(
    warnings: AnalysisWarning[],
    timeAnalysis: TimeAnalysisResult
  ): string[] {
    const recommendations: string[] = [];
    
    if (warnings.some(w => w.type === WarningType.TIME_INCONSISTENCY)) {
      recommendations.push('時刻の記録形式を統一し、開始時刻と終了時刻を明確に記載してください');
    }
    
    if (warnings.some(w => w.type === WarningType.LOW_CONFIDENCE)) {
      recommendations.push('「9:00から10:30まで」のような具体的な時刻表現を使用してください');
    }
    
    if (warnings.some(w => w.type === WarningType.TIME_OVERLAP)) {
      recommendations.push('重複する時間帯がある場合は、並列活動として明確に記載してください');
    }
    
    if (warnings.some(w => w.type === WarningType.PARALLEL_ACTIVITY_CONFLICT)) {
      recommendations.push('物理的に同時実行が困難な活動の時間配分を見直してください');
    }
    
    if (timeAnalysis.method === 'inferred' && timeAnalysis.confidence < 0.6) {
      recommendations.push('より正確な時刻追跡のため、活動開始時に時刻を記録することを推奨します');
    }
    
    return recommendations;
  }
  
  /**
   * 検証サマリーの作成
   */
  private createValidationSummary(warnings: AnalysisWarning[], overallConfidence: number): string {
    const errorCount = warnings.filter(w => w.level === WarningLevel.ERROR).length;
    const warningCount = warnings.filter(w => w.level === WarningLevel.WARNING).length;
    
    if (errorCount > 0) {
      return `検証完了: ${errorCount}件の重大な問題を検出しました。修正をお勧めします。`;
    } else if (warningCount > 0) {
      return `検証完了: ${warningCount}件の注意事項があります。確認をお勧めします。`;
    } else if (overallConfidence >= 0.8) {
      return '検証完了: 時刻と活動記録の整合性に問題はありません。';
    } else {
      return '検証完了: 大きな問題はありませんが、信頼度向上の余地があります。';
    }
  }
}

// ===== 検証結果の型定義 =====

interface ValidationResult {
  isValid: boolean;
  warnings: AnalysisWarning[];
  overallConfidence: number;
  recommendations: string[];
  validationSummary: string;
}