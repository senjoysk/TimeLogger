import { v4 as uuidv4 } from 'uuid';
import { ActivityRecord, ActivityAnalysis } from '../types';
import { IDatabaseRepository, IAnalysisService } from '../repositories/interfaces';
import { getCurrentTimeSlot, formatDateTime } from '../utils/timeUtils';

/**
 * 活動記録管理サービス
 * ユーザーの活動記録の処理、解析、保存を統括
 */
export class ActivityService {
  private repository: IDatabaseRepository;
  private analysisService: IAnalysisService;

  constructor(repository: IDatabaseRepository, analysisService: IAnalysisService) {
    this.repository = repository;
    this.analysisService = analysisService;
  }

  /**
   * 新しい活動記録を処理
   * @param userId ユーザーID
   * @param userInput ユーザーからの投稿内容
   * @param inputTime 投稿時刻（未指定の場合は現在時刻）
   * @returns 処理結果の活動記録
   */
  public async processActivityRecord(
    userId: string,
    userInput: string,
    timezone: string,
    inputTime: Date = new Date()
  ): Promise<ActivityRecord[]> {
    try {
      console.log(`📝 活動記録を処理開始: ${userInput}`);

      // コンテキストとして最近の活動記録を取得（直近3件）
      const recentActivities = await this.getRecentActivities(userId, timezone, 3);

      // AI で活動内容を解析 (時間情報も含む)
      const analysis = await this.analysisService.analyzeActivity(userInput, '', recentActivities, timezone);

      const startTime = analysis.startTime ? new Date(analysis.startTime) : inputTime;
      const endTime = analysis.endTime ? new Date(analysis.endTime) : new Date(startTime.getTime() + 30 * 60000);

      // 活動がまたがるタイムスロットを計算
      const timeSlots = this.calculateTimeSlots(startTime, endTime, timezone);
      const totalSlots = timeSlots.length;

      const createdRecords: ActivityRecord[] = [];

      for (let i = 0; i < totalSlots; i++) {
        const slot = timeSlots[i];
        const timeSlotString = formatDateTime(slot.start, timezone);

        // 各スロットの活動時間を計算
        const slotEndTime = new Date(slot.start.getTime() + 30 * 60000);
        const effectiveStartTime = i === 0 ? startTime : slot.start;
        const effectiveEndTime = i === totalSlots - 1 ? endTime : slotEndTime;
        const estimatedMinutes = Math.round((effectiveEndTime.getTime() - effectiveStartTime.getTime()) / 60000);

        const recordAnalysis: ActivityAnalysis = {
          ...analysis,
          estimatedMinutes: Math.max(1, estimatedMinutes), // 少なくとも1分とする
        };

        const activityRecord: ActivityRecord = {
          id: uuidv4(),
          userId,
          timeSlot: timeSlotString,
          originalText: userInput.trim(),
          analysis: recordAnalysis,
          category: recordAnalysis.category, // データベース保存用
          subCategory: recordAnalysis.subCategory, // データベース保存用
          createdAt: formatDateTime(new Date(), 'UTC'),
          updatedAt: formatDateTime(new Date(), 'UTC'),
        };

        await this.repository.saveActivityRecord(activityRecord, timezone);
        createdRecords.push(activityRecord);
        console.log(`✅ 活動記録を保存しました: ${activityRecord.id} for time slot ${timeSlotString}`);
      }

      return createdRecords;

    } catch (error) {
      console.error('❌ 活動記録処理エラー:', error);
      throw error;
    }
  }

  /**
   * 指定ユーザーの今日の活動記録を取得
   * @param userId ユーザーID
   * @returns 今日の活動記録リスト
   */
  public async getTodayActivities(userId: string, timezone: string): Promise<ActivityRecord[]> {
    try {
      const activities = await this.repository.getActivityRecords(userId, timezone);
      console.log(`📋 今日の活動記録を取得: ${activities.length}件`);
      return activities;
    } catch (error) {
      console.error('❌ 活動記録取得エラー:', error);
      throw error;
    }
  }

  /**
   * 特定の時間枠の活動記録を取得
   * @param userId ユーザーID
   * @param timeSlot 時間枠の開始時刻
   * @returns 指定時間枠の活動記録リスト
   */
  public async getActivitiesByTimeSlot(
    userId: string,
    timeSlot: string
  ): Promise<ActivityRecord[]> {
    try {
      const activities = await this.repository.getActivityRecordsByTimeSlot(userId, timeSlot);
      return activities;
    } catch (error) {
      console.error('❌ 時間枠別活動記録取得エラー:', error);
      throw error;
    }
  }

  /**
   * 投稿時刻に基づいて適切な30分枠を決定
   * 30分以内の活動は1つのスロットに記録
   */
  private calculateTimeSlots(startTime: Date, endTime: Date, timezone: string): { start: Date; label: string }[] {
    // 活動時間が30分以内の場合は1つのスロットにまとめる
    const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60));
    
    if (durationMinutes <= 30) {
      // 開始時刻の30分境界に揃える
      const aligned = new Date(startTime);
      const minutes = aligned.getMinutes();
      const alignedMinutes = minutes < 30 ? 0 : 30;
      aligned.setMinutes(alignedMinutes, 0, 0);
      
      const slotLabel = formatDateTime(aligned, timezone);
      return [{
        start: aligned,
        label: slotLabel
      }];
    }

    // 30分を超える場合は複数のスロットに分割
    const slots = [];
    let current = new Date(startTime);
    
    // 現在時刻を30分単位の境界に揃える
    const minutes = current.getMinutes();
    const alignedMinutes = minutes < 30 ? 0 : 30;
    current.setMinutes(alignedMinutes, 0, 0);

    while (current < endTime) {
      const slotLabel = formatDateTime(current, timezone);
      slots.push({
        start: new Date(current),
        label: slotLabel
      });
      current = new Date(current.getTime() + 30 * 60000);
    }

    return slots;
  }

  /**
   * 活動記録の統計情報を取得
   * @param userId ユーザーID
   * @returns 統計情報
   */
  public async getActivityStats(userId: string, timezone: string): Promise<{
    totalRecords: number;
    totalMinutes: number;
    categoryCounts: { [category: string]: number };
    averageProductivity: number;
  }> {
    try {
      const activities = await this.getTodayActivities(userId, timezone);
      
      const stats = {
        totalRecords: activities.length,
        totalMinutes: activities.reduce((sum, a) => sum + a.analysis.estimatedMinutes, 0),
        categoryCounts: {} as { [category: string]: number },
        averageProductivity: 0,
      };

      // カテゴリ別カウントと平均生産性の計算
      let productivitySum = 0;
      activities.forEach(activity => {
        const category = activity.analysis.category;
        stats.categoryCounts[category] = (stats.categoryCounts[category] || 0) + 1;
        productivitySum += activity.analysis.productivityLevel;
      });

      if (activities.length > 0) {
        stats.averageProductivity = Math.round(productivitySum / activities.length * 10) / 10;
      }

      return stats;

    } catch (error) {
      console.error('❌ 統計情報取得エラー:', error);
      throw error;
    }
  }

  /**
   * 活動記録の詳細文字列を生成（Discord表示用）
   * @param record 活動記録
   * @returns フォーマットされた文字列
   */
  public formatActivityRecord(record: ActivityRecord): string {
    const productivity = '★'.repeat(record.analysis.productivityLevel);
    const subCategory = record.analysis.subCategory 
      ? ` > ${record.analysis.subCategory}` 
      : '';

    return [
      `**${record.timeSlot.split(' ')[1]}** [${record.analysis.category}${subCategory}]`,
      `📝 ${record.originalText}`,
      `⏱️ ${record.analysis.estimatedMinutes}分 ${productivity} (${record.analysis.productivityLevel}/5)`,
      `💡 ${record.analysis.structuredContent}`,
    ].join('\n');
  }

  /**
   * 最近の活動記録を取得（コンテキスト用）
   * @param userId ユーザーID
   * @param timezone タイムゾーン
   * @param limit 取得件数
   * @returns 最近の活動記録リスト
   */
  public async getRecentActivities(userId: string, timezone: string, limit: number = 3): Promise<ActivityRecord[]> {
    try {
      // 今日の活動記録を取得
      const activities = await this.repository.getActivityRecords(userId, timezone);
      
      // 作成日時でソートして最新のものから取得
      const sortedActivities = activities
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, limit);

      console.log(`📋 最近の活動記録を取得: ${sortedActivities.length}件 (上限: ${limit}件)`);
      return sortedActivities;
    } catch (error) {
      console.error('❌ 最近の活動記録取得エラー:', error);
      return [];
    }
  }

  /**
   * 今日の活動記録一覧を Discord 形式でフォーマット
   * @param userId ユーザーID
   * @returns フォーマットされた活動記録一覧
   */
  public async formatTodayActivities(userId: string, timezone: string): Promise<string> {
    try {
      const activities = await this.getTodayActivities(userId, timezone);
      
      if (activities.length === 0) {
        return '今日の活動記録はまだありません。';
      }

      const stats = await this.getActivityStats(userId, timezone);
      
      const header = [
        '📋 **今日の活動記録**',
        `総記録数: ${stats.totalRecords}件 | 総活動時間: ${stats.totalMinutes}分 | 平均生産性: ${stats.averageProductivity}/5`,
        '',
      ].join('\n');

      const recordList = activities
        .map(record => this.formatActivityRecord(record))
        .join('\n\n---\n\n');

      return header + recordList;

    } catch (error) {
      console.error('❌ 活動記録フォーマット エラー:', error);
      return '活動記録の取得中にエラーが発生しました。';
    }
  }
}