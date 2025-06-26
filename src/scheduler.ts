import * as cron from 'node-cron';
import { TaskLoggerBot } from './bot';
import { config } from './config';
import { Database } from './database/database';
import { toZonedTime } from 'date-fns-tz';

/**
 * スケジュール管理クラス
 * 30分間隔の問いかけと日次サマリーの自動実行を管理
 */
export class Scheduler {
  private bot: TaskLoggerBot;
  private db: Database;
  private jobs: Map<string, cron.ScheduledTask> = new Map();
  private userTimezones: Map<string, string> = new Map();

  constructor(bot: TaskLoggerBot) {
    this.bot = bot;
    this.db = new Database();
  }

  /**
   * 全てのスケジュールを開始
   */
  public async start(): Promise<void> {
    console.log('⏰ スケジューラーを開始します...');
    
    // ユーザーのタイムゾーンを取得
    await this.loadUserTimezones();
    
    this.startActivityPromptSchedule();
    this.startDailySummarySchedule();
    this.startApiCostReportSchedule();
    
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
   * 毎時0分と30分に実行（全タイムゾーンをカバー）
   */
  private startActivityPromptSchedule(): void {
    // 毎時0分と30分に実行し、各ユーザーのタイムゾーンで勤務時間かどうかチェック
    const cronPattern = '0,30 * * * *'; // 毎時0分と30分
    
    const job = cron.schedule(cronPattern, async () => {
      try {
        const now = new Date();
        console.log(`⏰ 30分間隔の問いかけチェック (UTC: ${now.toISOString()})`);
        
        // 各ユーザーについてタイムゾーンをチェック
        for (const [userId, timezone] of this.userTimezones) {
          const localTime = toZonedTime(now, timezone);
          const hours = localTime.getHours();
          const day = localTime.getDay();
          
          // 平日（月-金）の勤務時間内かチェック
          if (day >= 1 && day <= 5 && hours >= config.app.workingHours.start && hours < config.app.workingHours.end) {
            console.log(`  → ${userId} (${timezone}): 勤務時間内です`);
            // 現在の実装では単一ユーザー向けのためbot.sendActivityPrompt()を使用
            // マルチユーザー対応時はユーザー別メソッドを実装
            await this.bot.sendActivityPrompt();
          }
        }
      } catch (error) {
        console.error('❌ 問いかけスケジュール実行エラー:', error);
      }
    }, {
      scheduled: true,
    });

    this.jobs.set('activityPrompt', job);
    console.log(`  ✅ 30分間隔問いかけスケジュール (${cronPattern}) を開始しました`);
  }

  /**
   * 日次サマリースケジュールを開始
   * 毎時0分に実行し、各ユーザーのタイムゾーンで18:00かチェック
   */
  private startDailySummarySchedule(): void {
    // 毎時0分に実行
    const cronPattern = '0 * * * *';
    
    const job = cron.schedule(cronPattern, async () => {
      try {
        const now = new Date();
        console.log(`📊 日次サマリーチェック (UTC: ${now.toISOString()})`);
        
        // 各ユーザーについてタイムゾーンをチェック
        for (const [userId, timezone] of this.userTimezones) {
          const localTime = toZonedTime(now, timezone);
          const hours = localTime.getHours();
          
          // 該当タイムゾーンで18:00かチェック
          if (hours === config.app.summaryTime.hour) {
            console.log(`  → ${userId} (${timezone}): サマリー時刻です`);
            // 現在の実装では単一ユーザー向けのためbot.sendDailySummary()を使用
            // マルチユーザー対応時はユーザー別メソッドを実装
            await this.bot.sendDailySummary();
          }
        }
      } catch (error) {
        console.error('❌ 日次サマリースケジュール実行エラー:', error);
      }
    }, {
      scheduled: true,
    });

    this.jobs.set('dailySummary', job);
    console.log(`  ✅ 日次サマリースケジュール (${cronPattern}) を開始しました`);
  }

  private startApiCostReportSchedule(): void {
    // 毎時5分に実行し、各ユーザーのタイムゾーンで18:05かチェック
    const cronPattern = '5 * * * *';

    const job = cron.schedule(cronPattern, async () => {
      try {
        const now = new Date();
        console.log(`💰 APIコストレポートチェック (UTC: ${now.toISOString()})`);
        
        // 各ユーザーについてタイムゾーンをチェック
        for (const [userId, timezone] of this.userTimezones) {
          const localTime = toZonedTime(now, timezone);
          const hours = localTime.getHours();
          const minutes = localTime.getMinutes();
          
          // 該当タイムゾーンで18:05かチェック
          if (hours === config.app.summaryTime.hour && minutes === 5) {
            console.log(`  → ${userId} (${timezone}): APIコストレポート時刻です`);
            // 現在の実装では単一ユーザー向けのためbot.sendApiCostReport()を使用
            // マルチユーザー対応時はユーザー別メソッドを実装
            await this.bot.sendApiCostReport();
          }
        }
      } catch (error) {
        console.error('❌ APIコストレポートスケジュール実行エラー:', error);
      }
    }, {
      scheduled: true,
    });

    this.jobs.set('apiCostReport', job);
    console.log(`  ✅ APIコストレポートスケジュール (${cronPattern}) を開始しました`);
  }

  /**
   * スケジュール情報をログ出力
   */
  private logScheduleInfo(): void {
    console.log('\n📅 スケジュール情報:');
    console.log(`  🔔 問いかけ時間: 平日 ${config.app.workingHours.start}:00-${config.app.workingHours.end}:00 (毎時0分・30分)`);
    console.log(`  📊 サマリー時間: 毎日 ${config.app.summaryTime.hour}:00`);
    console.log(`  🌍 対応ユーザー数: ${this.userTimezones.size}`);
    
    // 各ユーザーのタイムゾーン情報を表示
    for (const [userId, timezone] of this.userTimezones) {
      const now = new Date();
      const localTime = toZonedTime(now, timezone);
      console.log(`  👤 ${userId}: ${timezone} (現在時刻: ${localTime.toLocaleString()})`);
    }
  }

  /**
   * ユーザーのタイムゾーン情報を読み込む
   */
  private async loadUserTimezones(): Promise<void> {
    try {
      // 現在はシングルユーザー対応のため、設定ファイルのユーザーIDのみ取得
      const userId = config.discord.targetUserId;
      const timezone = await this.db.getUserTimezone(userId);
      this.userTimezones.set(userId, timezone);
      console.log(`  → ユーザー ${userId} のタイムゾーン: ${timezone}`);
    } catch (error) {
      console.error('❌ タイムゾーン情報の読み込みエラー:', error);
      // エラー時はデフォルトのタイムゾーンを使用
      this.userTimezones.set(config.discord.targetUserId, 'Asia/Tokyo');
    }
  }
  

  /**
   * 現在のスケジュール状態を取得
   * @returns スケジュール状態の情報
   */
  public getStatus(): { name: string; isRunning: boolean }[] {
    const status: { name: string; isRunning: boolean }[] = [];
    
    for (const [name] of this.jobs) {
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