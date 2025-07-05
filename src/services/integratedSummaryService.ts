/**
 * 統合サマリーサービス
 * 
 * 活動ログとTODO情報を統合し、包括的なサマリーと
 * 生産性インサイトを提供するサービス
 */

import { format, toZonedTime } from 'date-fns-tz';
import { ActivityLog, DailyAnalysisResult, AnalysisRequest } from '../types/activityLog';
import { Todo, TodoStatus } from '../types/todo';
import { 
  IntegratedSummaryResult,
  TodoSummary,
  CorrelationInsights,
  ProductivityMetrics,
  IntegratedRecommendation,
  WeeklyIntegratedSummary,
  WeeklyMetrics,
  WeeklyTrend,
  WeeklyInsight,
  IntegratedMetrics,
  PriorityDistribution,
  StatusTransition,
  ActivityPattern
} from '../types/integratedSummary';
import { ActivityTodoCorrelationService } from './activityTodoCorrelationService';
import { IUnifiedAnalysisService } from './unifiedAnalysisService';

/**
 * 統合サマリーサービスインターフェース
 */
export interface IIntegratedSummaryService {
  /**
   * 統合サマリーを生成
   */
  generateIntegratedSummary(userId: string, businessDate: string, timezone: string): Promise<IntegratedSummaryResult>;
  
  /**
   * Discord用フォーマット
   */
  formatIntegratedSummaryForDiscord(summary: IntegratedSummaryResult, timezone: string): string;
  
  /**
   * 統合メトリクス計算
   */
  calculateIntegratedMetrics(userId: string, businessDate: string, timezone: string): Promise<IntegratedMetrics>;
  
  /**
   * 週次統合サマリー生成
   */
  generateWeeklySummary(userId: string, endDate: string, timezone: string): Promise<WeeklyIntegratedSummary>;
}

/**
 * IntegratedSummaryServiceの実装
 */
export class IntegratedSummaryService implements IIntegratedSummaryService {
  constructor(
    private repository: {
      getLogsByDate(userId: string, businessDate: string): Promise<ActivityLog[]>;
      getTodosByUserId(userId: string): Promise<Todo[]>;
      getTodosByDateRange(userId: string, startDate: string, endDate: string): Promise<Todo[]>;
    },
    private correlationService: ActivityTodoCorrelationService,
    private unifiedAnalysisService: IUnifiedAnalysisService
  ) {}

  /**
   * 統合サマリーを生成
   */
  async generateIntegratedSummary(
    userId: string, 
    businessDate: string, 
    timezone: string
  ): Promise<IntegratedSummaryResult> {
    try {
      console.log(`📊 統合サマリー生成開始: ${userId} ${businessDate}`);

      // 並行して各種データを取得・分析
      const [
        activitySummary,
        todoSummary,
        correlationInsights,
        productivityMetrics
      ] = await Promise.all([
        this.generateActivitySummary(userId, businessDate, timezone),
        this.generateTodoSummary(userId, businessDate, timezone),
        this.generateCorrelationInsights(userId, businessDate, timezone),
        this.generateProductivityMetrics(userId, businessDate, timezone)
      ]);

      // 統合推奨事項を生成
      const recommendations = this.generateIntegratedRecommendations(
        activitySummary,
        todoSummary,
        correlationInsights,
        productivityMetrics
      );

      const result: IntegratedSummaryResult = {
        businessDate,
        activitySummary,
        todoSummary,
        correlationInsights,
        productivityMetrics,
        recommendations,
        generatedAt: new Date().toISOString()
      };

      console.log(`✅ 統合サマリー生成完了: ${userId} ${businessDate}`);
      return result;

    } catch (error) {
      console.error('❌ 統合サマリー生成エラー:', error);
      throw error;
    }
  }

  /**
   * 活動サマリーを生成
   */
  private async generateActivitySummary(
    userId: string, 
    businessDate: string, 
    timezone: string
  ): Promise<DailyAnalysisResult> {
    const analysisRequest: AnalysisRequest = {
      userId,
      businessDate,
      timezone,
      forceRefresh: false
    };

    return await this.unifiedAnalysisService.analyzeDaily(analysisRequest);
  }

  /**
   * TODOサマリーを生成
   */
  private async generateTodoSummary(
    userId: string, 
    businessDate: string, 
    timezone: string
  ): Promise<TodoSummary> {
    // 当日関連のTODOを取得（作成日または完了日が対象日）
    const allTodos = await this.repository.getTodosByUserId(userId);
    const relevantTodos = allTodos.filter(todo => {
      const createdDate = todo.createdAt.split('T')[0];
      const completedDate = todo.completedAt ? todo.completedAt.split('T')[0] : null;
      return createdDate === businessDate || completedDate === businessDate;
    });

    const totalTodos = relevantTodos.length;
    const completedTodos = relevantTodos.filter(todo => todo.status === 'completed').length;
    const inProgressTodos = relevantTodos.filter(todo => todo.status === 'in_progress').length;
    const pendingTodos = relevantTodos.filter(todo => todo.status === 'pending').length;
    
    const completionRate = totalTodos > 0 ? completedTodos / totalTodos : 0;
    
    const aiClassifiedCount = relevantTodos.filter(todo => 
      todo.sourceType === 'ai_classified' || todo.sourceType === 'ai_suggested'
    ).length;
    const manualCreatedCount = relevantTodos.filter(todo => 
      todo.sourceType === 'manual'
    ).length;

    const averagePriority = totalTodos > 0 
      ? relevantTodos.reduce((sum, todo) => sum + todo.priority, 0) / totalTodos 
      : 0;

    const priorityDistribution = this.calculatePriorityDistribution(relevantTodos);
    const statusTransitions = this.calculateStatusTransitions(relevantTodos, businessDate);

    return {
      totalTodos,
      completedTodos,
      inProgressTodos,
      pendingTodos,
      completionRate,
      aiClassifiedCount,
      manualCreatedCount,
      averagePriority,
      priorityDistribution,
      statusTransitions
    };
  }

  /**
   * 相関インサイトを生成
   */
  private async generateCorrelationInsights(
    userId: string, 
    businessDate: string, 
    timezone: string
  ): Promise<CorrelationInsights> {
    const [correlationResult, completionSuggestions] = await Promise.all([
      this.correlationService.analyzeActivityTodoCorrelation(userId, businessDate, timezone),
      this.correlationService.suggestTodoCompletions(userId, businessDate, timezone)
    ]);

    // 活動パターンを分析（簡易実装）
    const activityPatterns: ActivityPattern[] = [
      {
        type: 'deep_work',
        description: '集中作業時間',
        frequency: 3,
        relatedActivities: 5,
        todoRelevance: 0.8
      }
    ];

    return {
      correlatedPairs: correlationResult.stats.correlatedPairs,
      autoLinkOpportunities: correlationResult.stats.autoLinkRecommendations,
      completionSuggestions,
      activityPatterns,
      timeAllocationAlignment: 0.75 // 簡易実装
    };
  }

  /**
   * 生産性メトリクスを生成
   */
  private async generateProductivityMetrics(
    userId: string, 
    businessDate: string, 
    timezone: string
  ): Promise<ProductivityMetrics> {
    const productivityInsights = await this.correlationService.generateProductivityInsights(
      userId, businessDate, timezone
    );

    return {
      overallScore: productivityInsights.efficiencyScore,
      todoCompletionRate: productivityInsights.completionRate,
      averageTaskDuration: productivityInsights.averageTaskDuration,
      efficiencyTrend: productivityInsights.performanceTrend,
      mostProductiveHours: productivityInsights.mostProductiveHours,
      focusTimeRatio: 0.7, // 簡易実装
      interruptionCount: 3, // 簡易実装
      taskSwitchingFrequency: 5 // 簡易実装
    };
  }

  /**
   * 統合推奨事項を生成
   */
  private generateIntegratedRecommendations(
    activitySummary: DailyAnalysisResult,
    todoSummary: TodoSummary,
    correlationInsights: CorrelationInsights,
    productivityMetrics: ProductivityMetrics
  ): IntegratedRecommendation[] {
    const recommendations: IntegratedRecommendation[] = [];

    // TODO完了率に基づく推奨
    if (todoSummary.completionRate < 0.5) {
      recommendations.push({
        type: 'todo_optimization',
        content: 'TODO完了率が低いです。タスクを小さく分割することを検討してください',
        priority: 'high',
        expectedImpact: '完了率15%向上',
        implementationDifficulty: 'easy',
        evidenceSource: [`完了率: ${Math.round(todoSummary.completionRate * 100)}%`]
      });
    }

    // 生産性スコアに基づく推奨
    if (productivityMetrics.overallScore < 70) {
      recommendations.push({
        type: 'focus_improvement',
        content: '集中時間を増やすため、通知をオフにして作業に取り組みましょう',
        priority: 'medium',
        expectedImpact: '生産性スコア10ポイント向上',
        implementationDifficulty: 'easy',
        evidenceSource: [`生産性スコア: ${productivityMetrics.overallScore}`]
      });
    }

    // 相関が少ない場合の推奨
    if (correlationInsights.correlatedPairs === 0) {
      recommendations.push({
        type: 'workflow_efficiency',
        content: '活動ログとTODOの関連性を高めるため、作業時に関連TODOを意識してください',
        priority: 'low',
        expectedImpact: 'ワークフロー効率10%向上',
        implementationDifficulty: 'medium',
        evidenceSource: ['活動とTODOの相関が見つかりませんでした']
      });
    }

    // デフォルト推奨事項
    if (recommendations.length === 0) {
      recommendations.push({
        type: 'time_management',
        content: '良いペースで進んでいます。この調子を維持しましょう',
        priority: 'low',
        expectedImpact: '現在の生産性維持',
        implementationDifficulty: 'easy',
        evidenceSource: ['全体的なパフォーマンスが良好']
      });
    }

    return recommendations;
  }

  /**
   * Discord用フォーマット
   */
  formatIntegratedSummaryForDiscord(summary: IntegratedSummaryResult, timezone: string): string {
    const sections: string[] = [];

    // ヘッダー
    const dateStr = this.formatBusinessDate(summary.businessDate, timezone);
    sections.push(`📊 **${dateStr}の統合サマリー**`);

    // TODO概要
    const todoSummary = summary.todoSummary;
    const completionPercent = Math.round(todoSummary.completionRate * 100);
    sections.push(`\n📝 **TODO概要**`);
    sections.push(`• 総数: ${todoSummary.totalTodos}件 | 完了: ${todoSummary.completedTodos}件 (${completionPercent}%)`);
    sections.push(`• 進行中: ${todoSummary.inProgressTodos}件 | 保留: ${todoSummary.pendingTodos}件`);

    if (todoSummary.aiClassifiedCount > 0) {
      sections.push(`• AI分類: ${todoSummary.aiClassifiedCount}件 | 手動作成: ${todoSummary.manualCreatedCount}件`);
    }

    // 活動概要
    const activitySummary = summary.activitySummary;
    if (activitySummary.timeDistribution.totalEstimatedMinutes > 0) {
      const totalHours = Math.floor(activitySummary.timeDistribution.totalEstimatedMinutes / 60);
      const totalMinutes = activitySummary.timeDistribution.totalEstimatedMinutes % 60;
      const timeText = totalHours > 0 ? `${totalHours}時間${totalMinutes}分` : `${totalMinutes}分`;
      
      sections.push(`\n⏱️ **活動概要**`);
      sections.push(`• 総活動時間: ${timeText} | 記録数: ${activitySummary.totalLogCount}件`);
    }

    // 相関分析
    const correlationInsights = summary.correlationInsights;
    sections.push(`\n🔗 **相関分析**`);
    sections.push(`• 関連ペア: ${correlationInsights.correlatedPairs}件`);
    
    if (correlationInsights.completionSuggestions.length > 0) {
      sections.push(`• 完了提案: ${correlationInsights.completionSuggestions.length}件`);
    }

    // 生産性スコア
    const productivityMetrics = summary.productivityMetrics;
    const scoreEmoji = this.getProductivityEmoji(productivityMetrics.overallScore);
    sections.push(`\n⭐ **生産性評価**`);
    sections.push(`${scoreEmoji} 総合スコア: **${productivityMetrics.overallScore}**/100`);
    sections.push(`• 完了率: ${Math.round(productivityMetrics.todoCompletionRate * 100)}% | 効率性: ${productivityMetrics.efficiencyTrend === 'improving' ? '向上中' : productivityMetrics.efficiencyTrend === 'declining' ? '低下中' : '安定'}`);

    // 推奨事項
    if (summary.recommendations.length > 0) {
      sections.push(`\n💡 **推奨事項**`);
      const topRecommendations = summary.recommendations
        .filter(r => r.priority === 'high' || r.priority === 'medium')
        .slice(0, 2);
      
      for (const rec of topRecommendations) {
        const priorityEmoji = rec.priority === 'high' ? '🔥' : '💭';
        sections.push(`${priorityEmoji} ${rec.content}`);
      }
    }

    // フッター
    const generatedTime = new Date(summary.generatedAt);
    const generatedLocal = toZonedTime(generatedTime, timezone);
    const generatedStr = format(generatedLocal, 'HH:mm', { timeZone: timezone });
    sections.push(`\n🤖 ${generatedStr}に生成 | 統合分析`);

    const result = sections.join('\n');
    
    // Discord文字数制限対応（2000文字）
    return result.length > 2000 ? result.substring(0, 1997) + '...' : result;
  }

  /**
   * 統合メトリクス計算
   */
  async calculateIntegratedMetrics(
    userId: string, 
    businessDate: string, 
    timezone: string
  ): Promise<IntegratedMetrics> {
    // 簡易実装 - 実際の実装では詳細な計算を行う
    return {
      todoActivityAlignment: 0.75,
      completionPredictionAccuracy: 0.8,
      timeEstimationAccuracy: 0.7,
      workflowEfficiency: 0.85,
      planExecutionRate: 0.9
    };
  }

  /**
   * 週次統合サマリー生成
   */
  async generateWeeklySummary(
    userId: string, 
    endDate: string, 
    timezone: string
  ): Promise<WeeklyIntegratedSummary> {
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 6);
    const startDateStr = startDate.toISOString().split('T')[0];

    // 7日間の日別サマリーを生成
    const dailySummaries: IntegratedSummaryResult[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(endDate);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      try {
        const dailySummary = await this.generateIntegratedSummary(userId, dateStr, timezone);
        dailySummaries.unshift(dailySummary);
      } catch (error) {
        console.warn(`日別サマリー生成スキップ: ${dateStr}`, error);
      }
    }

    // 週次メトリクス計算
    const weeklyMetrics = this.calculateWeeklyMetrics(dailySummaries);
    const weeklyTrends = this.calculateWeeklyTrends(dailySummaries);
    const weeklyInsights = this.generateWeeklyInsights(dailySummaries, weeklyMetrics);
    const nextWeekRecommendations = this.generateNextWeekRecommendations(weeklyMetrics, weeklyTrends);

    return {
      period: {
        startDate: startDateStr,
        endDate
      },
      dailySummaries,
      weeklyMetrics,
      weeklyTrends,
      weeklyInsights,
      nextWeekRecommendations
    };
  }

  /**
   * 優先度分布を計算
   */
  private calculatePriorityDistribution(todos: Todo[]): PriorityDistribution {
    return {
      high: todos.filter(todo => todo.priority >= 2).length,
      medium: todos.filter(todo => todo.priority === 1).length,
      low: todos.filter(todo => todo.priority <= 0).length
    };
  }

  /**
   * ステータス変更履歴を計算
   */
  private calculateStatusTransitions(todos: Todo[], businessDate: string): StatusTransition[] {
    // 簡易実装 - 実際にはDBの履歴テーブルから取得
    return todos.filter(todo => todo.status === 'completed').map(todo => ({
      todoId: todo.id,
      fromStatus: 'pending',
      toStatus: 'completed',
      timestamp: todo.completedAt || todo.updatedAt,
      durationMinutes: 60 // 簡易実装
    }));
  }

  /**
   * 週次メトリクス計算
   */
  private calculateWeeklyMetrics(dailySummaries: IntegratedSummaryResult[]): WeeklyMetrics {
    const validSummaries = dailySummaries.filter(s => s.todoSummary.totalTodos > 0);
    
    if (validSummaries.length === 0) {
      return {
        averageCompletionRate: 0,
        totalActivityMinutes: 0,
        totalTodos: 0,
        completedTodos: 0,
        averageProductivityScore: 0,
        mostProductiveDay: '',
        mostEfficientTimeSlot: ''
      };
    }

    const averageCompletionRate = validSummaries.reduce((sum, s) => 
      sum + s.todoSummary.completionRate, 0) / validSummaries.length;
    
    const totalActivityMinutes = dailySummaries.reduce((sum, s) => 
      sum + s.activitySummary.timeDistribution.totalEstimatedMinutes, 0);
    
    const totalTodos = dailySummaries.reduce((sum, s) => sum + s.todoSummary.totalTodos, 0);
    const completedTodos = dailySummaries.reduce((sum, s) => sum + s.todoSummary.completedTodos, 0);
    
    const averageProductivityScore = validSummaries.reduce((sum, s) => 
      sum + s.productivityMetrics.overallScore, 0) / validSummaries.length;

    const mostProductiveDay = validSummaries.reduce((best, current) => 
      current.productivityMetrics.overallScore > best.productivityMetrics.overallScore ? current : best
    ).businessDate;

    return {
      averageCompletionRate,
      totalActivityMinutes,
      totalTodos,
      completedTodos,
      averageProductivityScore,
      mostProductiveDay,
      mostEfficientTimeSlot: '09:00-10:00' // 簡易実装
    };
  }

  /**
   * 週次トレンド計算
   */
  private calculateWeeklyTrends(dailySummaries: IntegratedSummaryResult[]): WeeklyTrend[] {
    // 簡易実装
    return [
      {
        metric: '完了率',
        direction: 'up',
        changePercent: 5,
        description: '週を通して完了率が向上しています'
      }
    ];
  }

  /**
   * 週次インサイト生成
   */
  private generateWeeklyInsights(
    dailySummaries: IntegratedSummaryResult[], 
    weeklyMetrics: WeeklyMetrics
  ): WeeklyInsight[] {
    const insights: WeeklyInsight[] = [];

    if (weeklyMetrics.averageCompletionRate > 0.8) {
      insights.push({
        type: 'strength',
        title: '高い完了率',
        description: '週を通して安定してタスクを完了できています',
        relatedData: { completionRate: weeklyMetrics.averageCompletionRate }
      });
    }

    return insights;
  }

  /**
   * 来週への推奨事項生成
   */
  private generateNextWeekRecommendations(
    weeklyMetrics: WeeklyMetrics,
    weeklyTrends: WeeklyTrend[]
  ): IntegratedRecommendation[] {
    return [
      {
        type: 'time_management',
        content: '来週も現在のペースを維持して頑張りましょう',
        priority: 'medium',
        expectedImpact: '生産性維持',
        implementationDifficulty: 'easy',
        evidenceSource: ['週次パフォーマンス分析']
      }
    ];
  }

  /**
   * 生産性スコアに基づく絵文字を取得
   */
  private getProductivityEmoji(score: number): string {
    if (score >= 90) return '🚀';
    if (score >= 80) return '⭐';
    if (score >= 70) return '👍';
    if (score >= 60) return '📈';
    if (score >= 50) return '📊';
    return '💤';
  }

  /**
   * 業務日をフォーマット
   */
  private formatBusinessDate(businessDate: string, timezone: string): string {
    try {
      const date = new Date(businessDate + 'T12:00:00');
      const localDate = toZonedTime(date, timezone);
      return format(localDate, 'yyyy/MM/dd', { timeZone: timezone });
    } catch (error) {
      return businessDate;
    }
  }
}