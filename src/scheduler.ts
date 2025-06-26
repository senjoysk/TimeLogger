import * as cron from 'node-cron';
import { TaskLoggerBot } from './bot';
import { config } from './config';
import { isWorkingHours, getTodaySummaryTime } from './utils/timeUtils';

/**
 * スケジュール管理クラス
 * 30分間隔の問いかけと日次サマリーの自動実行を管理
 */
export class Scheduler {
  private bot: TaskLoggerBot;
  private jobs: Map<string, cron.ScheduledTask> = new Map();

  constructor(bot: TaskLoggerBot) {
    this.bot = bot;
  }

  /**
   * 全てのスケジュールを開始
   */
  public start(): void {
    console.log('⏰ スケジューラーを開始します...');
    
    this.startActivityPromptSchedule();
    this.startDailySummarySchedule();
    
    console.log('✅ 全てのスケジュールが開始されました');
    this.logScheduleInfo();
  }

  /**
   * 全てのスケジュールを停止
   */
  public stop(): void {
    console.log('🛑 スケジューラーを停止します...');
    
    for (const [name, job] of this.jobs) {
      job.stop();
      console.log(`  ✅ ${name} を停止しました`);
    }
    
    this.jobs.clear();
    console.log('✅ 全てのスケジュールが停止されました');
  }

  /**
   * 30分間隔の活動問いかけスケジュールを開始
   * 毎時0分と30分に実行
   */
  private startActivityPromptSchedule(): void {
    // JSTの平日9:00-17:59はUTCの0:00-8:59
    // 毎時0分と30分に実行
    const cronPattern = '0,30 0-8 * * 1-5'; // UTCで月-金の0:00-8:59
    
    const job = cron.schedule(cronPattern, async () => {
      try {
        console.log('⏰ 30分間隔の問いかけスケジュールが実行されました (UTC)');
        await this.bot.sendActivityPrompt();
      } catch (error) {
        console.error('❌ 問いかけスケジュール実行エラー:', error);
      }
    }, {
      scheduled: true,
    });

    this.jobs.set('activityPrompt', job);
    console.log(`  ✅ 30分間隔問いかけスケジュール (UTC: ${cronPattern}) を開始しました`);
  }

  /**
   * 日次サマリースケジュールを開始
   * 毎日18:00 JST (09:00 UTC) に実行
   */
  private startDailySummarySchedule(): void {
    // 毎日09:00 UTC (18:00 JST) に実行するcron式
    const cronPattern = '0 9 * * *';
    
    const job = cron.schedule(cronPattern, async () => {
      try {
        console.log('📊 日次サマリースケジュールが実行されました (UTC)');
        await this.bot.sendDailySummary();
      } catch (error) {
        console.error('❌ 日次サマリースケジュール実行エラー:', error);
      }
    }, {
      scheduled: true,
    });

    this.jobs.set('dailySummary', job);
    console.log(`  ✅ 日次サマリースケジュール (UTC: ${cronPattern}) を開始しました`);
  }

  /**
   * スケジュール情報をログ出力
   */
  private logScheduleInfo(): void {
    console.log('\n📅 スケジュール情報:');
    console.log(`  🔔 問いかけ時間: 平日 ${config.app.workingHours.start}:00-${config.app.workingHours.end}:00 (毎時0分・30分)`);
    console.log(`  📊 サマリー時間: 毎日 ${config.app.summaryTime.hour}:00`);
    console.log(`  🕐 タイムゾーン: Asia/Tokyo`);
    
    // 次回実行時刻の予測
    const now = new Date();
    const nextPromptTime = this.getNextPromptTime(now);
    const nextSummaryTime = getTodaySummaryTime();
    
    console.log(`  ⏰ 次回問いかけ予定: ${nextPromptTime.toLocaleString('ja-JP')}`);
    console.log(`  📊 次回サマリー予定: ${nextSummaryTime.toLocaleString('ja-JP')}`);
  }

  /**
   * 次回の問いかけ時刻を計算
   * @param now 現在時刻
   * @returns 次回の問いかけ時刻
   */
  private getNextPromptTime(now: Date): Date {
    const next = new Date(now);
    const minutes = now.getMinutes();
    
    if (minutes < 30) {
      // 30分まで
      next.setMinutes(30, 0, 0);
    } else {
      // 次の時間の0分まで
      next.setHours(next.getHours() + 1);
      next.setMinutes(0, 0, 0);
    }
    
    return next;
  }

  /**
   * 現在のスケジュール状態を取得
   * @returns スケジュール状態の情報
   */
  public getStatus(): { name: string; isRunning: boolean }[] {
    const status: { name: string; isRunning: boolean }[] = [];
    
    for (const [name, job] of this.jobs) {
      status.push({
        name,
        // node-cronのScheduledTaskには running プロパティがないため
        // ジョブが存在していれば実行中とみなす
        isRunning: true,
      });
    }
    
    return status;
  }

  /**
   * 特定のスケジュールを手動実行（テスト用）
   * @param scheduleName スケジュール名
   */
  public async executeManually(scheduleName: string): Promise<void> {
    console.log(`🔧 手動実行: ${scheduleName}`);
    
    try {
      switch (scheduleName) {
        case 'activityPrompt':
          await this.bot.sendActivityPrompt();
          break;
        case 'dailySummary':
          await this.bot.sendDailySummary();
          break;
        default:
          throw new Error(`未知のスケジュール名: ${scheduleName}`);
      }
      
      console.log(`✅ ${scheduleName} の手動実行が完了しました`);
    } catch (error) {
      console.error(`❌ ${scheduleName} の手動実行に失敗しました:`, error);
    }
  }
}