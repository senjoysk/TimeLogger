/**
 * 統合サマリーサービス
 * 
 * 活動ログとTODO情報を統合し、基本的なサマリーを提供するサービス
 * 軽量で高速な日次レポート機能
 */

import { format, toZonedTime } from 'date-fns-tz';
import { ActivityLog, DailyAnalysisResult, AnalysisRequest } from '../types/activityLog';
import { Todo, TodoStatus } from '../types/todo';
import { 
  IntegratedSummaryResult,
  TodoSummary,
  PriorityDistribution,
  StatusTransition
} from '../types/integratedSummary';
import { IUnifiedAnalysisService } from './unifiedAnalysisService';
import { logger } from '../utils/logger';

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
      logger.info('INTEGRATED_SUMMARY_SERVICE', `統合サマリー生成開始: ${userId} ${businessDate}`);

      // 📊 STEP 1: 全体最適化 - 必要なデータを一括取得（DB アクセス最小化）
      const [activities, todos] = await Promise.all([
        this.repository.getLogsByDate(userId, businessDate),
        this.repository.getTodosByUserId(userId)
      ]);

      logger.debug('INTEGRATED_SUMMARY_SERVICE', `データ一括取得完了: 活動ログ${activities.length}件、TODO${todos.length}件`);

      // 📊 STEP 2: 基本的なサマリーを生成
      const [
        activitySummary,
        todoSummary
      ] = await Promise.all([
        this.generateActivitySummary(userId, businessDate, timezone),
        this.generateTodoSummaryWithData(userId, businessDate, timezone, todos)
      ]);

      const result: IntegratedSummaryResult = {
        businessDate,
        activitySummary,
        todoSummary,
        generatedAt: new Date().toISOString()
      };

      logger.success('INTEGRATED_SUMMARY_SERVICE', `統合サマリー生成完了: ${userId} ${businessDate}`);
      return result;

    } catch (error) {
      logger.error('INTEGRATED_SUMMARY_SERVICE', '統合サマリー生成エラー', error as Error);
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
    // パフォーマンス最適化: メモリ内フィルタリングをDB直接クエリに変更
    const relevantTodos = await this.repository.getTodosByDateRange(userId, businessDate, businessDate);

    return this.generateTodoSummaryWithData(userId, businessDate, timezone, relevantTodos);
  }

  /**
   * TODOサマリーを生成（データ重複排除最適化版）
   */
  private generateTodoSummaryWithData(
    userId: string, 
    businessDate: string, 
    timezone: string,
    allTodos: Todo[]
  ): TodoSummary {
    // 当日関連のTODOをフィルタリング（作成日または完了日が対象日）
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



    // フッター
    const generatedTime = new Date(summary.generatedAt);
    const generatedLocal = toZonedTime(generatedTime, timezone);
    const generatedStr = format(generatedLocal, 'HH:mm', { timeZone: timezone });
    sections.push(`\n🤖 ${generatedStr}に生成 | 基本サマリー`);

    const result = sections.join('\n');
    
    // Discord文字数制限対応（2000文字）
    return result.length > 2000 ? result.substring(0, 1997) + '...' : result;
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