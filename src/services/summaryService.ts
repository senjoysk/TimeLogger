import { DailySummary, ActivityRecord, CategoryTotal, SubCategoryTotal } from '../types';
import { IDatabaseRepository, IAnalysisService } from '../repositories/interfaces';
import { getCurrentBusinessDate } from '../utils/timeUtils';

/**
 * 日次サマリー管理サービス
 * 一日の活動記録を集計し、AI で感想と励ましメッセージを生成
 */
export class SummaryService {
  private repository: IDatabaseRepository;
  private analysisService: IAnalysisService;

  constructor(repository: IDatabaseRepository, analysisService: IAnalysisService) {
    this.repository = repository;
    this.analysisService = analysisService;
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
      const activities = await this.repository.getActivityRecords(userId, timezone, businessDate);
      
      if (activities.length === 0) {
        console.log('活動記録がないため、空のサマリーを生成します');
        return this.createEmptySummary(businessDate);
      }

      // AI でサマリーを生成
      const summary = await this.analysisService.generateDailySummary(activities, businessDate);

      // データベースに保存
      await this.repository.saveDailySummary(summary, timezone);

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
      const existingSummary = await this.repository.getDailySummary(userId, timezone, businessDate);
      
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

    // カテゴリを詳細表示（2段階の粒度）
    const categoryBreakdown = this.buildDetailedCategoryBreakdown(summary.categoryTotals);

    return [
      '📊 **今日の活動サマリー**',
      '',
      `⏱️ 総活動時間: **${totalTimeStr}**`,
      '',
      '📋 **活動内訳**',
      categoryBreakdown,
    ].join('\n');
  }

  /**
   * 詳細なカテゴリ内訳を構築（2段階の粒度）
   * @param categoryTotals カテゴリ別集計
   * @returns フォーマットされた内訳文字列
   */
  private buildDetailedCategoryBreakdown(categoryTotals: CategoryTotal[]): string {
    // カテゴリを時間順でソート
    const sortedCategories = categoryTotals.sort((a, b) => b.totalMinutes - a.totalMinutes);
    
    const categoryLines: string[] = [];
    
    sortedCategories.forEach(cat => {
      const hours = Math.floor(cat.totalMinutes / 60);
      const minutes = cat.totalMinutes % 60;
      const timeStr = hours > 0 ? `${hours}h${minutes}m` : `${minutes}m`;
      
      // メインカテゴリ行を追加
      categoryLines.push(`• **${cat.category}**: ${timeStr}`);
      
      // サブカテゴリがある場合は詳細表示
      if (cat.subCategories && cat.subCategories.length > 0) {
        cat.subCategories.forEach(sub => {
          const subHours = Math.floor(sub.totalMinutes / 60);
          const subMinutes = sub.totalMinutes % 60;
          const subTimeStr = subHours > 0 ? `${subHours}h${subMinutes}m` : `${subMinutes}m`;
          
          categoryLines.push(`  - ${sub.subCategory}: ${subTimeStr}`);
        });
      }
    });
    
    return categoryLines.join('\n');
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
      const activities = await this.repository.getActivityRecords(userId, timezone, businessDate);
      
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