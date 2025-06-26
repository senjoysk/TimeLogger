import { DailySummary, ActivityRecord, CategoryTotal } from '../types';
import { Database } from '../database/database';
import { GeminiService } from './geminiService';
import { getCurrentBusinessDate } from '../utils/timeUtils';

/**
 * 日次サマリー管理サービス
 * 一日の活動記録を集計し、Gemini で感想と励ましメッセージを生成
 */
export class SummaryService {
  private database: Database;
  private geminiService: GeminiService;

  constructor(database: Database, geminiService: GeminiService) {
    this.database = database;
    this.geminiService = geminiService;
  }

  /**
   * 指定ユーザーの日次サマリーを生成
   * @param userId ユーザーID
   * @param businessDate 業務日（省略時は今日）
   * @returns 生成された日次サマリー
   */
  public async generateDailySummary(
    userId: string,
    timezone: string,
    businessDate: string = getCurrentBusinessDate(timezone)
  ): Promise<DailySummary> {
    try {
      console.log(`📊 日次サマリーを生成中: ${businessDate}`);

      // 指定日の活動記録を取得
      const activities = await this.database.getActivityRecords(userId, timezone, businessDate);
      
      if (activities.length === 0) {
        console.log('活動記録がないため、空のサマリーを生成します');
        return this.createEmptySummary(businessDate);
      }

      // Gemini でサマリーを生成
      const summary = await this.geminiService.generateDailySummary(activities, businessDate);

      // データベースに保存
      await this.database.saveDailySummary(summary, timezone);

      console.log(`✅ 日次サマリーを生成・保存しました: ${businessDate}`);
      return summary;

    } catch (error) {
      console.error('❌ 日次サマリー生成エラー:', error);
      throw error;
    }
  }

  /**
   * 指定ユーザーの日次サマリーを取得（存在しない場合は生成）
   * @param userId ユーザーID
   * @param businessDate 業務日（省略時は今日）
   * @returns 日次サマリー
   */
  public async getDailySummary(
    userId: string,
    timezone: string,
    businessDate: string = getCurrentBusinessDate(timezone)
  ): Promise<DailySummary> {
    try {
      // 既存のサマリーを確認
      const existingSummary = await this.database.getDailySummary(userId, timezone, businessDate);
      
      if (existingSummary) {
        console.log(`📊 既存の日次サマリーを取得: ${businessDate}`);
        return existingSummary;
      }

      // 存在しない場合は新規生成
      console.log(`📊 日次サマリーが存在しないため新規生成: ${businessDate}`);
      return await this.generateDailySummary(userId, timezone, businessDate);

    } catch (error) {
      console.error('❌ 日次サマリー取得エラー:', error);
      throw error;
    }
  }

  /**
   * 日次サマリーを Discord 形式でフォーマット
   * @param summary 日次サマリー
   * @returns フォーマットされた文字列
   */
  public formatDailySummary(summary: DailySummary, timezone: string): string {
    const date = new Date(summary.date).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
      timeZone: timezone
    });

    // カテゴリ別集計の表示
    const categoryList = summary.categoryTotals
      .sort((a, b) => b.totalMinutes - a.totalMinutes) // 時間順でソート
      .map(cat => {
        const hours = Math.floor(cat.totalMinutes / 60);
        const minutes = cat.totalMinutes % 60;
        const timeStr = hours > 0 ? `${hours}時間${minutes}分` : `${minutes}分`;
        const productivity = '★'.repeat(Math.round(cat.averageProductivity));
        
        return `**${cat.category}**: ${timeStr} (${cat.recordCount}回) ${productivity}`;
      })
      .join('\n');

    // 総時間の表示
    const totalHours = Math.floor(summary.totalMinutes / 60);
    const totalMinutesRemainder = summary.totalMinutes % 60;
    const totalTimeStr = totalHours > 0 
      ? `${totalHours}時間${totalMinutesRemainder}分` 
      : `${totalMinutesRemainder}分`;

    return [
      `📊 **${date} 活動サマリー**`,
      '',
      `⏱️ **総活動時間**: ${totalTimeStr}`,
      '',
      '📋 **カテゴリ別集計**',
      categoryList,
      '',
      '💭 **今日の振り返り**',
      summary.insights,
      '',
      '🌟 **明日への一言**',
      summary.motivation,
      '',
      `📝 *${new Date(summary.generatedAt).toLocaleString('ja-JP', { timeZone: timezone })} に生成*`,
    ].join('\n');
  }

  /**
   * 簡潔な日次サマリーを生成（自動送信用）
   * @param summary 日次サマリー
   * @returns 簡潔なフォーマットの文字列
   */
  public formatBriefSummary(summary: DailySummary): string {
    const totalHours = Math.floor(summary.totalMinutes / 60);
    const totalMinutesRemainder = summary.totalMinutes % 60;
    const totalTimeStr = totalHours > 0 
      ? `${totalHours}時間${totalMinutesRemainder}分` 
      : `${totalMinutesRemainder}分`;

    // 上位3カテゴリのみ表示
    const topCategories = summary.categoryTotals
      .sort((a, b) => b.totalMinutes - a.totalMinutes)
      .slice(0, 3)
      .map(cat => {
        const hours = Math.floor(cat.totalMinutes / 60);
        const minutes = cat.totalMinutes % 60;
        const timeStr = hours > 0 ? `${hours}h${minutes}m` : `${minutes}m`;
        return `${cat.category}(${timeStr})`;
      })
      .join(', ');

    return [
      '🌅 **今日一日お疲れさまでした！**',
      '',
      `⏱️ 総活動時間: **${totalTimeStr}**`,
      `📊 主な活動: ${topCategories}`,
      '',
      `💭 ${summary.insights}`,
      '',
      `🌟 ${summary.motivation}`,
    ].join('\n');
  }

  /**
   * カテゴリ別の詳細統計を取得
   * @param userId ユーザーID
   * @param businessDate 業務日
   * @returns カテゴリ別統計情報
   */
  public async getCategoryStats(
    userId: string,
    timezone: string,
    businessDate: string = getCurrentBusinessDate(timezone)
  ): Promise<{
    categories: CategoryTotal[];
    mostProductiveCategory: string;
    totalActivities: number;
    averageActivityDuration: number;
  }> {
    try {
      const activities = await this.database.getActivityRecords(userId, timezone, businessDate);
      
      if (activities.length === 0) {
        return {
          categories: [],
          mostProductiveCategory: '記録なし',
          totalActivities: 0,
          averageActivityDuration: 0,
        };
      }

      // カテゴリ別集計
      const categoryMap = new Map<string, {
        totalMinutes: number;
        recordCount: number;
        productivitySum: number;
      }>();

      activities.forEach(activity => {
        const category = activity.analysis.category;
        const existing = categoryMap.get(category) || {
          totalMinutes: 0,
          recordCount: 0,
          productivitySum: 0,
        };

        existing.totalMinutes += activity.analysis.estimatedMinutes;
        existing.recordCount += 1;
        existing.productivitySum += activity.analysis.productivityLevel;
        
        categoryMap.set(category, existing);
      });

      const categories = Array.from(categoryMap.entries()).map(([category, data]) => ({
        category,
        totalMinutes: data.totalMinutes,
        recordCount: data.recordCount,
        averageProductivity: Math.round(data.productivitySum / data.recordCount * 10) / 10,
      }));

      // 最も生産性の高いカテゴリを特定
      const mostProductiveCategory = categories.reduce((prev, current) => 
        prev.averageProductivity > current.averageProductivity ? prev : current
      ).category;

      // 平均活動時間
      const totalMinutes = activities.reduce((sum, a) => sum + a.analysis.estimatedMinutes, 0);
      const averageActivityDuration = Math.round(totalMinutes / activities.length);

      return {
        categories: categories.sort((a, b) => b.totalMinutes - a.totalMinutes),
        mostProductiveCategory,
        totalActivities: activities.length,
        averageActivityDuration,
      };

    } catch (error) {
      console.error('❌ カテゴリ統計取得エラー:', error);
      throw error;
    }
  }

  /**
   * 活動記録がない場合の空のサマリーを作成
   */
  private createEmptySummary(businessDate: string): DailySummary {
    return {
      date: businessDate,
      categoryTotals: [],
      totalMinutes: 0,
      insights: '今日は活動記録がありませんでした。明日はぜひ記録してみましょう！',
      motivation: '新しい一日、新しい可能性。明日も素晴らしい日になりますように！',
      generatedAt: new Date().toISOString(),
    };
  }
}