/**
 * 活動ログとTODO相関分析サービス
 * 
 * このサービスは活動記録とTODO管理を統合的に分析し、
 * ユーザーの生産性向上のためのインサイトを提供します。
 * 
 * 主な機能:
 * - 活動ログとTODOの類似度計算と相関分析
 * - TODO完了の自動提案
 * - 活動ログとTODOの自動関連付け
 * - 生産性インサイトの生成
 */

import { ActivityLog } from '../types/activityLog';
import { Todo } from '../types/todo';
import {
  ActivityTodoCorrelationResult,
  ActivityTodoCorrelation,
  CorrelationStats,
  TodoCompletionSuggestion,
  ProductivityInsights,
  AutoLinkResult,
  CorrelationAnalysisConfig,
  SimilarityScore
} from '../types/correlation';
import { ITodoRepository } from '../repositories/interfaces';

/**
 * デフォルト設定定数
 */
const DEFAULT_CONFIG: CorrelationAnalysisConfig = {
  minSimilarityThreshold: 0.3,
  autoLinkThreshold: 0.3,
  keywordWeight: 0.5,
  semanticWeight: 0.4,
  temporalWeight: 0.1,
  maxAnalysisDays: 7
};

/**
 * 重要キーワード定数
 */
const IMPORTANT_KEYWORDS = [
  'プレゼン', '資料', '作成', 'レポート', '企画書', 
  'ドキュメント', 'タスク', '完了', '調査', '書いて', '書く'
];

/**
 * 完了を示すキーワード定数
 */
const COMPLETION_KEYWORDS = {
  STRONG: ['完了', '終了', '終わった'],
  MEDIUM: ['できた', 'した'],
  WEAK: ['させた', 'まし', 'ました', '完成']
};

/**
 * 活動ログとTODO相関分析サービス
 */
export class ActivityTodoCorrelationService {
  private config: CorrelationAnalysisConfig;

  constructor(
    private repository: ITodoRepository & {
      getActivityRecords(userId: string, timezone: string, businessDate?: string): Promise<ActivityLog[]>;
      updateTodo(id: string, update: any): Promise<void>;
    },
    config?: Partial<CorrelationAnalysisConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 活動ログとTODOの相関を分析
   */
  async analyzeActivityTodoCorrelation(
    userId: string,
    businessDate: string,
    timezone: string
  ): Promise<ActivityTodoCorrelationResult> {
    // 活動ログとTODOを取得
    const activities = await this.repository.getActivityRecords(userId, timezone, businessDate);
    const todos = await this.repository.getTodosByUserId(userId);

    const correlations: ActivityTodoCorrelation[] = [];

    // 各活動ログと各TODOの相関を計算
    for (const activity of activities) {
      for (const todo of todos) {
        const similarity = this.calculateSimilarity(activity, todo);
        
        if (similarity.overall >= this.config.minSimilarityThreshold) {
          correlations.push({
            activityId: activity.id,
            todoId: todo.id,
            similarity: similarity.overall,
            reason: this.generateCorrelationReason(similarity),
            isAlreadyLinked: todo.relatedActivityId === activity.id,
            recommendedAction: this.determineRecommendedAction(similarity.overall)
          });
        }
      }
    }

    const stats: CorrelationStats = {
      totalActivities: activities.length,
      totalTodos: todos.length,
      correlatedPairs: correlations.length,
      autoLinkRecommendations: correlations.filter(c => c.recommendedAction === 'link').length,
      manualReviewRecommendations: correlations.filter(c => c.recommendedAction === 'review').length
    };

    return {
      correlations,
      stats,
      analysisTimestamp: new Date().toISOString()
    };
  }

  /**
   * TODO完了の提案を生成
   */
  async suggestTodoCompletions(
    userId: string,
    businessDate: string,
    timezone: string
  ): Promise<TodoCompletionSuggestion[]> {
    const activities = await this.repository.getActivityRecords(userId, timezone, businessDate);
    const todos = await this.repository.getTodosByUserId(userId);
    
    const suggestions: TodoCompletionSuggestion[] = [];

    for (const todo of todos) {
      if (todo.status === 'completed' || todo.status === 'cancelled') {
        continue;
      }

      // この TODO に関連する活動を探す
      const relatedActivities = activities.filter(activity => {
        const similarity = this.calculateSimilarity(activity, todo);
        return similarity.overall > 0.3; // 閾値を下げて関連活動を見つけやすくする
      });

      if (relatedActivities.length > 0) {
        const completionConfidence = this.calculateCompletionConfidence(todo, relatedActivities);
        
        if (completionConfidence > 0.3) {
          suggestions.push({
            todoId: todo.id,
            todoContent: todo.content,
            completionConfidence,
            reason: this.generateCompletionReason(relatedActivities),
            relatedActivityIds: relatedActivities.map(a => a.id),
            suggestedCompletionTime: this.suggestCompletionTime(relatedActivities)
          });
        }
      }
    }

    return suggestions;
  }

  /**
   * 生産性インサイトを生成
   */
  async generateProductivityInsights(
    userId: string,
    businessDate: string,
    timezone: string
  ): Promise<ProductivityInsights> {
    const activities = await this.repository.getActivityRecords(userId, timezone, businessDate);
    const todos = await this.repository.getTodosByUserId(userId);

    const todosForDate = todos.filter(todo => 
      todo.createdAt.startsWith(businessDate) || 
      (todo.completedAt && todo.completedAt.startsWith(businessDate))
    );

    const completedTodos = todosForDate.filter(todo => todo.status === 'completed');
    const completionRate = todosForDate.length > 0 ? completedTodos.length / todosForDate.length : 0;

    const totalActivityTime = activities.reduce((sum, activity) => 
      sum + (activity.totalMinutes || 0), 0
    );

    const averageTaskDuration = completedTodos.length > 0 
      ? totalActivityTime / completedTodos.length 
      : 0;

    // 時間帯別の生産性分析（簡易実装）
    const mostProductiveHours = this.analyzeMostProductiveHours(activities);

    const efficiencyScore = this.calculateEfficiencyScore(completionRate, averageTaskDuration);

    const recommendations = this.generateRecommendations(completionRate, efficiencyScore);

    return {
      completionRate,
      averageTaskDuration,
      mostProductiveHours,
      efficiencyScore,
      recommendations,
      performanceTrend: 'stable' // 簡易実装、将来的には履歴データから計算
    };
  }

  /**
   * 活動ログとTODOを自動的に関連付け
   */
  async autoLinkActivitiesToTodos(
    userId: string,
    businessDate: string,
    timezone: string
  ): Promise<AutoLinkResult[]> {
    const correlationResult = await this.analyzeActivityTodoCorrelation(userId, businessDate, timezone);
    
    const results: AutoLinkResult[] = [];

    for (const correlation of correlationResult.correlations) {
      if (correlation.recommendedAction === 'link' && !correlation.isAlreadyLinked) {
        try {
          await this.repository.updateTodo(correlation.todoId, {
            relatedActivityId: correlation.activityId
          });

          results.push({
            activityId: correlation.activityId,
            todoId: correlation.todoId,
            confidence: correlation.similarity,
            reason: correlation.reason,
            success: true
          });
        } catch (error) {
          results.push({
            activityId: correlation.activityId,
            todoId: correlation.todoId,
            confidence: correlation.similarity,
            reason: correlation.reason,
            success: false,
            error: error instanceof Error ? error.message : '不明なエラー'
          });
        }
      }
    }

    return results;
  }

  /**
   * 活動ログとTODOの類似度を計算
   */
  private calculateSimilarity(activity: ActivityLog, todo: Todo): SimilarityScore {
    // キーワード一致度の計算
    const activityKeywords = this.extractKeywords(activity.content);
    const todoKeywords = this.extractKeywords(todo.content);
    const commonKeywords = activityKeywords.filter(kw => todoKeywords.includes(kw));
    const keywordScore = commonKeywords.length > 0 
      ? commonKeywords.length / Math.max(activityKeywords.length, todoKeywords.length)
      : 0;

    // 意味的類似度の計算（簡易実装）
    const semanticScore = this.calculateSemanticSimilarity(activity.content, todo.content);

    // 時間的近接度の計算
    const temporalScore = this.calculateTemporalProximity(activity, todo);

    // 重み付き総合スコア
    const overall = 
      keywordScore * this.config.keywordWeight +
      semanticScore * this.config.semanticWeight +
      temporalScore * this.config.temporalWeight;

    return {
      overall: Math.min(1, overall),
      keyword: keywordScore,
      semantic: semanticScore,
      temporal: temporalScore,
      details: {
        commonKeywords,
        timeDifferenceMinutes: this.calculateTimeDifference(activity, todo),
        algorithm: 'weighted_combined'
      }
    };
  }

  /**
   * キーワード抽出（簡易実装）
   */
  private extractKeywords(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 2)
      .slice(0, 10); // 最大10個のキーワード
  }

  /**
   * 意味的類似度計算（改良版）
   */
  private calculateSemanticSimilarity(text1: string, text2: string): number {
    const words1 = new Set(this.extractKeywords(text1));
    const words2 = new Set(this.extractKeywords(text2));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    // Jaccard係数 + 部分文字列マッチングで類似度を向上
    let jaccardScore = union.size > 0 ? intersection.size / union.size : 0;
    
    // 部分文字列マッチング（より柔軟な一致）
    let substringScore = 0;
    const text1Lower = text1.toLowerCase();
    const text2Lower = text2.toLowerCase();
    
    // 共通の重要キーワードを検出
    
    for (const keyword of IMPORTANT_KEYWORDS) {
      if (text1Lower.includes(keyword) && text2Lower.includes(keyword)) {
        substringScore += 0.3;
      }
    }
    
    return Math.min(1, jaccardScore + substringScore);
  }

  /**
   * 時間的近接度計算
   */
  private calculateTemporalProximity(activity: ActivityLog, todo: Todo): number {
    const timeDiff = this.calculateTimeDifference(activity, todo);
    
    // 24時間以内なら高スコア、それを超えると指数関数的に減少
    if (timeDiff <= 1440) { // 24時間
      return 1 - (timeDiff / 1440);
    } else {
      return Math.exp(-(timeDiff - 1440) / 1440);
    }
  }

  /**
   * 時間差計算（分）
   */
  private calculateTimeDifference(activity: ActivityLog, todo: Todo): number {
    const activityTime = new Date(activity.inputTimestamp).getTime();
    const todoTime = new Date(todo.createdAt).getTime();
    
    return Math.abs(activityTime - todoTime) / (1000 * 60);
  }

  /**
   * 推奨アクションを決定
   */
  private determineRecommendedAction(similarity: number): 'link' | 'ignore' | 'review' {
    if (similarity >= this.config.autoLinkThreshold) {
      return 'link';
    } else if (similarity >= this.config.minSimilarityThreshold) {
      return 'review';
    } else {
      return 'ignore';
    }
  }

  /**
   * 相関理由の生成
   */
  private generateCorrelationReason(similarity: SimilarityScore): string {
    const reasons: string[] = [];
    
    if (similarity.keyword > 0.3) {
      reasons.push(`共通キーワード: ${similarity.details.commonKeywords.join(', ')}`);
    }
    
    if (similarity.semantic > 0.5) {
      reasons.push('内容の意味的類似性が高い');
    }
    
    if (similarity.temporal > 0.7) {
      reasons.push('時間的に近接している');
    }
    
    return reasons.length > 0 ? reasons.join('; ') : '類似性が検出されました';
  }

  /**
   * TODO完了の確信度計算
   */
  private calculateCompletionConfidence(todo: Todo, activities: ActivityLog[]): number {
    let confidence = 0;
    
    for (const activity of activities) {
      const content = activity.content.toLowerCase();
      
      // 完了を示すキーワードの検出
      if (COMPLETION_KEYWORDS.STRONG.some(kw => content.includes(kw))) {
        confidence += 0.4;
      }
      
      if (COMPLETION_KEYWORDS.MEDIUM.some(kw => content.includes(kw))) {
        confidence += 0.3;
      }
      
      if (COMPLETION_KEYWORDS.WEAK.some(kw => content.includes(kw))) {
        confidence += 0.2;
      }
      
      // TODOの内容との一致度
      const similarity = this.calculateSemanticSimilarity(activity.content, todo.content);
      confidence += similarity * 0.5; // 類似度の重みを増加
    }
    
    return Math.min(1, confidence);
  }

  /**
   * 完了理由の生成
   */
  private generateCompletionReason(activities: ActivityLog[]): string {
    const completionKeywords = activities.flatMap(activity => {
      const content = activity.content.toLowerCase();
      const keywords = [];
      
      if (content.includes('完了')) keywords.push('完了');
      if (content.includes('終了')) keywords.push('終了');
      if (content.includes('できた')) keywords.push('実行完了');
      
      return keywords;
    });
    
    return completionKeywords.length > 0 
      ? `活動ログに${completionKeywords.join('、')}の記録があります`
      : '関連する活動が記録されています';
  }

  /**
   * 完了時刻の提案
   */
  private suggestCompletionTime(activities: ActivityLog[]): string {
    // 最も新しい関連活動の終了時刻を使用
    const latestActivity = activities.reduce((latest, current) => 
      new Date(current.inputTimestamp) > new Date(latest.inputTimestamp) ? current : latest
    );
    
    return latestActivity.endTime || latestActivity.inputTimestamp;
  }

  /**
   * 最も生産的な時間帯の分析
   */
  private analyzeMostProductiveHours(activities: ActivityLog[]): string[] {
    const hourlyProductivity = new Map<number, number>();
    
    activities.forEach(activity => {
      const hour = new Date(activity.inputTimestamp).getUTCHours();
      const productivity = activity.totalMinutes || 0;
      
      hourlyProductivity.set(hour, (hourlyProductivity.get(hour) || 0) + productivity);
    });
    
    // 上位3時間を返す
    return Array.from(hourlyProductivity.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([hour]) => `${hour}:00-${hour + 1}:00`);
  }

  /**
   * 効率性スコア計算
   */
  private calculateEfficiencyScore(completionRate: number, averageTaskDuration: number): number {
    // 完了率と平均タスク時間を考慮したスコア（0-100）
    const rateScore = completionRate * 60; // 完了率の貢献度60%
    
    // 平均タスク時間のスコア（短いほど高評価、但し極端に短いのは低評価）
    let durationScore = 0;
    if (averageTaskDuration > 0) {
      if (averageTaskDuration <= 60) {
        durationScore = 40; // 理想的
      } else if (averageTaskDuration <= 120) {
        durationScore = 30; // 良好
      } else {
        durationScore = 20; // 改善の余地あり
      }
    }
    
    return Math.round(rateScore + durationScore);
  }

  /**
   * 改善推奨事項の生成
   */
  private generateRecommendations(completionRate: number, efficiencyScore: number): string[] {
    const recommendations: string[] = [];
    
    if (completionRate < 0.5) {
      recommendations.push('TODO の優先順位を明確にして、重要なタスクから取り組みましょう');
      recommendations.push('大きなタスクを小さな単位に分割することをお勧めします');
    }
    
    if (efficiencyScore < 60) {
      recommendations.push('タスクの実行時間を見直し、効率化できる部分を探してみましょう');
    }
    
    if (completionRate > 0.8 && efficiencyScore > 80) {
      recommendations.push('素晴らしい効率性です！この調子を維持してください');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('良いペースで進んでいます。継続して頑張りましょう');
    }
    
    return recommendations;
  }
}