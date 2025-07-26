/**
 * DynamicReportScheduler - 動的cronスケジューラーサービス
 * 
 * 🟢 Green Phase: テストを通すための最小限実装
 * 
 * 機能:
 * - ユーザーのタイムゾーン変更時の動的cron作成/削除
 * - UTC時刻ベースでの効率的なジョブ管理
 * - タイムゾーン→UTC変換とcronライフサイクル管理
 */

import * as cron from 'node-cron';
// import { toZonedTime } from 'date-fns-tz'; // 将来の拡張用

interface UtcTime {
  hour: number;
  minute: number;
}

interface UserTimezone {
  userId: string;
  timezone: string;
}

interface Repository {
  getAllUserTimezonesForScheduler(): Promise<UserTimezone[]>;
}

interface ReportSender {
  sendDailyReport(userId: string, timezone: string): Promise<void>;
}

interface DebugInfo {
  activeJobs: string[];
  timezoneUserMap: Record<string, string[]>;
  utcTimeToTimezones: Record<string, string[]>;
}

export class DynamicReportScheduler {
  private activeJobs: Map<string, cron.ScheduledTask> = new Map();
  private timezoneUserMap: Map<string, Set<string>> = new Map();
  private utcTimeToTimezones: Map<string, Set<string>> = new Map();
  private repository?: Repository;
  private reportSender?: ReportSender;

  /**
   * リポジトリを設定（テスト用）
   */
  setRepository(repository: Repository): void {
    this.repository = repository;
  }

  /**
   * レポート送信者を設定
   */
  setReportSender(reportSender: ReportSender): void {
    this.reportSender = reportSender;
  }

  /**
   * 初期化: 既存ユーザーのタイムゾーン分布を読み込み、必要なcronジョブを作成
   */
  async initialize(): Promise<void> {
    if (!this.repository) {
      console.warn('Repository not set, skipping initialization');
      return;
    }

    try {
      const userTimezones = await this.repository.getAllUserTimezonesForScheduler();
      
      // userTimezonesがnull、undefined、または配列でない場合の処理
      if (!userTimezones || !Array.isArray(userTimezones)) {
        console.warn('⚠️ userTimezones is not iterable or is null/undefined, skipping initialization');
        return;
      }
      
      for (const { userId, timezone } of userTimezones) {
        await this.onTimezoneChanged(userId, null, timezone);
      }
      
      console.log(`✅ DynamicReportScheduler initialized with ${userTimezones.length} users`);
    } catch (error) {
      console.error('❌ Failed to initialize DynamicReportScheduler:', error);
    }
  }

  /**
   * タイムゾーン変更時の動的cron再設定
   */
  async onTimezoneChanged(userId: string, oldTimezone: string | null, newTimezone: string): Promise<void> {
    try {
      // 無効なタイムゾーンのチェック
      const offsetMap: Record<string, number> = {
        'Asia/Tokyo': 9,
        'Asia/Seoul': 9, 
        'Asia/Kolkata': 5.5,
        'Europe/London': 0,
        'America/New_York': -5,
        'America/Los_Angeles': -8,
      };
      
      if (!(newTimezone in offsetMap)) {
        console.warn(`⚠️ Invalid timezone: ${newTimezone}, skipping`);
        return;
      }

      // 1. 古いタイムゾーンからユーザーを削除
      if (oldTimezone) {
        await this.removeUserFromTimezone(userId, oldTimezone);
      }

      // 2. 新しいタイムゾーンにユーザーを追加
      await this.addUserToTimezone(userId, newTimezone);

      console.log(`🔄 User ${userId}: ${oldTimezone || 'null'} → ${newTimezone}`);
    } catch (error) {
      console.error(`❌ Failed to handle timezone change for user ${userId}:`, error);
    }
  }

  /**
   * 特定タイムゾーンにユーザーを追加
   */
  private async addUserToTimezone(userId: string, timezone: string): Promise<void> {
    try {
      // UTC時刻を計算
      const utcTime = this.calculateUtcTimeFor1830(timezone);
      const utcKey = `${utcTime.hour}:${utcTime.minute}`;

      // タイムゾーン→ユーザーマッピングを更新
      if (!this.timezoneUserMap.has(timezone)) {
        this.timezoneUserMap.set(timezone, new Set());
      }
      this.timezoneUserMap.get(timezone)!.add(userId);

      // UTC時刻→タイムゾーンマッピングを更新
      if (!this.utcTimeToTimezones.has(utcKey)) {
        this.utcTimeToTimezones.set(utcKey, new Set());
      }
      this.utcTimeToTimezones.get(utcKey)!.add(timezone);

      // 新しいUTC時刻の場合、cronジョブを作成
      if (!this.activeJobs.has(utcKey)) {
        await this.setupCronForUtcTime(utcTime, utcKey);
      }
    } catch (error) {
      console.error(`❌ Failed to add user ${userId} to timezone ${timezone}:`, error);
    }
  }

  /**
   * 特定タイムゾーンからユーザーを削除
   */
  private async removeUserFromTimezone(userId: string, timezone: string): Promise<void> {
    try {
      const utcTime = this.calculateUtcTimeFor1830(timezone);
      const utcKey = `${utcTime.hour}:${utcTime.minute}`;

      // タイムゾーン→ユーザーマッピングから削除
      const users = this.timezoneUserMap.get(timezone);
      if (users) {
        users.delete(userId);
        
        // このタイムゾーンにユーザーがいなくなった場合
        if (users.size === 0) {
          this.timezoneUserMap.delete(timezone);
          
          // UTC時刻→タイムゾーンマッピングからも削除
          const timezones = this.utcTimeToTimezones.get(utcKey);
          if (timezones) {
            timezones.delete(timezone);
            
            // このUTC時刻を使うタイムゾーンがなくなった場合、cronジョブを削除
            if (timezones.size === 0) {
              await this.removeCronForUtcTime(utcKey);
              this.utcTimeToTimezones.delete(utcKey);
            }
          }
        }
      }
    } catch (error) {
      console.error(`❌ Failed to remove user ${userId} from timezone ${timezone}:`, error);
    }
  }

  /**
   * 特定UTC時刻に対するcronジョブ作成
   */
  private async setupCronForUtcTime(utcTime: UtcTime, utcKey: string): Promise<void> {
    try {
      const pattern = `${utcTime.minute} ${utcTime.hour} * * *`;
      
      const job = cron.schedule(pattern, async () => {
        await this.handleReportTime(utcTime);
      }, {
        scheduled: true,
      });

      this.activeJobs.set(utcKey, job);
      console.log(`✅ Created cron job: ${pattern} for UTC ${utcKey}`);
    } catch (error) {
      console.error(`❌ Failed to create cron job for UTC ${utcKey}:`, error);
      throw error; // テストでエラーハンドリングを確認するため
    }
  }

  /**
   * 不要になったcronジョブの削除
   */
  private async removeCronForUtcTime(utcKey: string): Promise<void> {
    try {
      const job = this.activeJobs.get(utcKey);
      if (job) {
        job.stop();
        this.activeJobs.delete(utcKey);
        console.log(`🗑️ Removed cron job: ${utcKey}`);
      }
    } catch (error) {
      console.error(`❌ Failed to remove cron job for UTC ${utcKey}:`, error);
    }
  }

  /**
   * レポート送信時刻の処理
   */
  private async handleReportTime(utcTime: UtcTime): Promise<void> {
    try {
      const utcKey = `${utcTime.hour}:${utcTime.minute}`;
      console.log(`📊 Report time reached: UTC ${utcKey}`);
      
      // このUTC時刻に該当するタイムゾーンのユーザーに送信
      const timezones = this.utcTimeToTimezones.get(utcKey);
      if (timezones) {
        for (const timezone of timezones) {
          const users = this.timezoneUserMap.get(timezone);
          if (users) {
            console.log(`📨 Sending reports for ${timezone} (${users.size} users)`);
            
            // 実際の送信処理
            if (this.reportSender) {
              for (const userId of users) {
                try {
                  await this.reportSender.sendDailyReport(userId, timezone);
                  console.log(`✅ Daily report sent to user ${userId} (${timezone})`);
                } catch (error) {
                  console.error(`❌ Failed to send daily report to user ${userId}:`, error);
                  // 個別のエラーでも他のユーザーへの送信は継続
                }
              }
            } else {
              console.warn(`⚠️ No report sender configured for ${timezone}`);
            }
          }
        }
      }
    } catch (error) {
      console.error(`❌ Failed to handle report time for UTC ${utcTime.hour}:${utcTime.minute}:`, error);
    }
  }

  /**
   * UTC時刻からタイムゾーンの18:30を計算
   */
  calculateUtcTimeFor1830(timezone: string): UtcTime {
    try {
      // 2024年1月1日の18:30を指定タイムゾーンで作成
      const year = 2024;
      const month = 0; // January (0-indexed)
      const day = 1;
      const hour = 18;
      const minute = 30;
      
      // タイムゾーンでの日時を作成し、UTC時刻に変換
      // new Date()でタイムゾーン付きの時刻を作成
      const localTime = new Date();
      localTime.setFullYear(year, month, day);
      localTime.setHours(hour, minute, 0, 0);
      
      // ローカル時刻からUTCオフセットを計算
      // 簡易実装: 主要タイムゾーンのオフセットを使用
      const offsetMap: Record<string, number> = {
        'Asia/Tokyo': 9,
        'Asia/Seoul': 9, 
        'Asia/Kolkata': 5.5,
        'Europe/London': 0,
        'America/New_York': -5,
        'America/Los_Angeles': -8,
      };
      
      const offset = offsetMap[timezone] || 0;
      
      // 時間部分と分部分を分けて計算
      const offsetHours = Math.floor(offset);
      const offsetMinutes = (offset % 1) * 60;
      
      let utcHour = hour - offsetHours;
      let utcMinute = minute - offsetMinutes;
      
      // 分のオーバーフロー/アンダーフローを処理
      if (utcMinute < 0) {
        utcMinute += 60;
        utcHour -= 1;
      } else if (utcMinute >= 60) {
        utcMinute -= 60;
        utcHour += 1;
      }
      
      // 時間の24時間範囲内に正規化
      while (utcHour < 0) utcHour += 24;
      while (utcHour >= 24) utcHour -= 24;
      
      return {
        hour: Math.floor(utcHour),
        minute: Math.floor(utcMinute)
      };
    } catch (error) {
      console.error(`❌ Failed to calculate UTC time for timezone ${timezone}:`, error);
      throw error;
    }
  }

  /**
   * アクティブなcronジョブ数を取得
   */
  getActiveJobCount(): number {
    return this.activeJobs.size;
  }

  /**
   * 特定のUTC時刻にジョブがあるかチェック
   */
  hasJobForUtcTime(hour: number, minute: number): boolean {
    const utcKey = `${hour}:${minute}`;
    return this.activeJobs.has(utcKey);
  }

  /**
   * 特定タイムゾーンのユーザー数を取得
   */
  getUserCountForTimezone(timezone: string): number {
    const users = this.timezoneUserMap.get(timezone);
    return users ? users.size : 0;
  }

  /**
   * アクティブなcronスケジュール一覧を取得
   */
  getActiveCronSchedule(): string[] {
    const schedules: string[] = [];
    for (const utcKey of this.activeJobs.keys()) {
      const [hour, minute] = utcKey.split(':').map(Number);
      schedules.push(`${minute} ${hour} * * *`);
    }
    return schedules.sort();
  }

  /**
   * タイムゾーン分布を取得
   */
  getTimezoneDistribution(): Record<string, number> {
    const distribution: Record<string, number> = {};
    for (const [timezone, users] of this.timezoneUserMap.entries()) {
      distribution[timezone] = users.size;
    }
    return distribution;
  }

  /**
   * デバッグ情報を取得
   */
  getDebugInfo(): DebugInfo {
    const activeJobs = Array.from(this.activeJobs.keys());
    
    const timezoneUserMap: Record<string, string[]> = {};
    for (const [timezone, users] of this.timezoneUserMap.entries()) {
      timezoneUserMap[timezone] = Array.from(users);
    }
    
    const utcTimeToTimezones: Record<string, string[]> = {};
    for (const [utcTime, timezones] of this.utcTimeToTimezones.entries()) {
      utcTimeToTimezones[utcTime] = Array.from(timezones);
    }

    return {
      activeJobs,
      timezoneUserMap,
      utcTimeToTimezones
    };
  }
}