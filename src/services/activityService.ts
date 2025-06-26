import { v4 as uuidv4 } from 'uuid';
import { ActivityRecord } from '../types';
import { Database } from '../database/database';
import { GeminiService } from './geminiService';
import { getCurrentTimeSlot, getTimeSlotForDate, formatDateTime } from '../utils/timeUtils';

/**
 * 活動記録管理サービス
 * ユーザーの活動記録の処理、解析、保存を統括
 */
export class ActivityService {
  private database: Database;
  private geminiService: GeminiService;

  constructor(database: Database, geminiService: GeminiService) {
    this.database = database;
    this.geminiService = geminiService;
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
    inputTime: Date = new Date()
  ): Promise<ActivityRecord> {
    try {
      console.log(`📝 活動記録を処理開始: ${userInput}`);

      // 投稿時刻に基づいて適切な時間枠を決定
      const timeSlot = this.determineTimeSlot(inputTime);
      const timeSlotString = formatDateTime(timeSlot.start);

      // 同じ時間枠の既存記録を取得（追加投稿の場合の文脈情報として使用）
      const existingRecords = await this.database.getActivityRecordsByTimeSlot(
        userId,
        timeSlotString
      );

      // Gemini で活動内容を解析
      const analysis = await this.geminiService.analyzeActivity(
        userInput,
        timeSlot.label,
        existingRecords
      );

      // 活動記録オブジェクトを作成
      const activityRecord: ActivityRecord = {
        id: uuidv4(),
        userId,
        timeSlot: timeSlotString,
        originalText: userInput.trim(),
        analysis,
        createdAt: formatDateTime(new Date()),
        updatedAt: formatDateTime(new Date()),
      };

      // データベースに保存
      await this.database.saveActivityRecord(activityRecord);

      console.log(`✅ 活動記録を保存しました: ${activityRecord.id}`);
      return activityRecord;

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
  public async getTodayActivities(userId: string): Promise<ActivityRecord[]> {
    try {
      const activities = await this.database.getActivityRecords(userId);
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
      const activities = await this.database.getActivityRecordsByTimeSlot(userId, timeSlot);
      return activities;
    } catch (error) {
      console.error('❌ 時間枠別活動記録取得エラー:', error);
      throw error;
    }
  }

  /**
   * 投稿時刻に基づいて適切な30分枠を決定
   * 投稿が時間枠内（例：14:00-14:29）であれば現在の枠
   * 投稿が時間枠外（例：14:30以降）であれば前の枠に記録
   */
  private determineTimeSlot(inputTime: Date) {
    const currentSlot = getCurrentTimeSlot();
    const inputSlot = getTimeSlotForDate(inputTime);

    // 投稿時刻が現在の30分枠の開始時刻以降の場合
    if (inputTime >= currentSlot.start) {
      // 前の30分枠に記録（要件: 追加投稿は前の30分枠として扱う）
      const previousSlot = new Date(inputSlot.start);
      previousSlot.setMinutes(previousSlot.getMinutes() - 30);
      
      return getTimeSlotForDate(previousSlot);
    } else {
      // 投稿時刻の30分枠に記録
      return inputSlot;
    }
  }

  /**
   * 活動記録の統計情報を取得
   * @param userId ユーザーID
   * @returns 統計情報
   */
  public async getActivityStats(userId: string): Promise<{
    totalRecords: number;
    totalMinutes: number;
    categoryCounts: { [category: string]: number };
    averageProductivity: number;
  }> {
    try {
      const activities = await this.getTodayActivities(userId);
      
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
   * 今日の活動記録一覧を Discord 形式でフォーマット
   * @param userId ユーザーID
   * @returns フォーマットされた活動記録一覧
   */
  public async formatTodayActivities(userId: string): Promise<string> {
    try {
      const activities = await this.getTodayActivities(userId);
      
      if (activities.length === 0) {
        return '今日の活動記録はまだありません。';
      }

      const stats = await this.getActivityStats(userId);
      
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