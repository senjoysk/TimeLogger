/**
 * プロファイルコマンドハンドラー
 * ユーザープロファイル表示・管理機能を提供
 */

import { Message } from 'discord.js';
import { ICommandHandler } from './interfaces';
import { SqliteActivityLogRepository } from '../repositories/sqliteActivityLogRepository';
import { UserProfileDetails, UserStats, ProfileDisplayFormat } from '../types/userProfile';
import { withErrorHandling, ErrorType } from '../utils/errorHandler';
import { toZonedTime, format } from 'date-fns-tz';

/**
 * プロファイルコマンドハンドラー実装
 */
export class ProfileCommandHandler implements ICommandHandler {
  constructor(
    private repository: SqliteActivityLogRepository
  ) {}

  /**
   * コマンドを処理
   */
  async handle(message: Message, userId: string, args: string[], timezone: string): Promise<void> {
    await withErrorHandling(async () => {
      console.log(`📊 [プロファイル] コマンド実行開始: ${userId}`);

      // サブコマンドの処理
      const subCommand = args[0]?.toLowerCase();
      
      switch (subCommand) {
        case 'stats':
          await this.handleStatsCommand(message, userId, timezone);
          break;
        case 'info':
          await this.handleInfoCommand(message, userId, timezone);
          break;
        default:
          await this.handleProfileCommand(message, userId, timezone);
          break;
      }
    }, ErrorType.SYSTEM, { userId, operation: 'プロファイル情報の取得' });
  }

  /**
   * 基本プロファイル情報を表示
   */
  private async handleProfileCommand(message: Message, userId: string, timezone: string): Promise<void> {
    // ユーザー詳細情報を取得
    const profileDetails = await this.getUserProfileDetails(userId, timezone);
    
    // プロファイル表示フォーマットを生成
    const displayFormat = await this.formatProfileDisplay(profileDetails);
    
    // Discord埋め込みメッセージを生成
    const embed = this.createProfileEmbed(displayFormat);
    
    await message.reply({ embeds: [embed] });
    console.log(`✅ [プロファイル] プロファイル情報送信完了: ${userId}`);
  }

  /**
   * 統計情報のみを表示
   */
  private async handleStatsCommand(message: Message, userId: string, timezone: string): Promise<void> {
    const stats = await this.getUserStats(userId);
    const embed = this.createStatsEmbed(stats, timezone);
    
    await message.reply({ embeds: [embed] });
    console.log(`✅ [プロファイル] 統計情報送信完了: ${userId}`);
  }

  /**
   * 基本情報のみを表示
   */
  private async handleInfoCommand(message: Message, userId: string, timezone: string): Promise<void> {
    const userInfo = await this.repository.getUserInfo(userId);
    if (!userInfo) {
      await message.reply('❌ ユーザー情報が見つかりませんでした。');
      return;
    }

    const embed = this.createInfoEmbed(userInfo, timezone);
    await message.reply({ embeds: [embed] });
    console.log(`✅ [プロファイル] 基本情報送信完了: ${userId}`);
  }

  /**
   * ユーザープロファイル詳細情報を取得
   */
  private async getUserProfileDetails(userId: string, timezone: string): Promise<UserProfileDetails> {
    const userInfo = await this.repository.getUserInfo(userId);
    if (!userInfo) {
      throw new Error(`ユーザー情報が見つかりません: ${userId}`);
    }

    const stats = await this.getUserStats(userId);

    return {
      user_id: userInfo.user_id,
      timezone: userInfo.timezone,
      created_at: userInfo.created_at,
      updated_at: userInfo.updated_at,
      stats,
      is_active: true
    };
  }

  /**
   * ユーザー統計情報を取得
   */
  private async getUserStats(userId: string): Promise<UserStats> {
    const now = new Date();
    const today = format(now, 'yyyy-MM-dd');
    
    // 今週の開始日を計算
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    const weekStartStr = format(weekStart, 'yyyy-MM-dd');
    
    // 今月の開始日を計算
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthStartStr = format(monthStart, 'yyyy-MM-dd');

    // 活動ログの統計を取得
    const [
      totalLogs,
      monthlyLogs,
      weeklyLogs,
      dailyLogs,
      firstLog,
      lastLog
    ] = await Promise.all([
      this.getLogCount(userId),
      this.getLogCount(userId, monthStartStr),
      this.getLogCount(userId, weekStartStr),
      this.getLogCount(userId, today),
      this.getFirstLogDate(userId),
      this.getLastLogDate(userId)
    ]);

    // TODOの統計を取得
    const todoStats = await this.getTodoStats(userId);

    return {
      total_logs: totalLogs,
      monthly_logs: monthlyLogs,
      weekly_logs: weeklyLogs,
      daily_logs: dailyLogs,
      total_todos: todoStats.total,
      completed_todos: todoStats.completed,
      in_progress_todos: todoStats.in_progress,
      first_log_date: firstLog,
      last_log_date: lastLog
    };
  }

  /**
   * 指定期間のログ数を取得
   */
  private async getLogCount(userId: string, fromDate?: string): Promise<number> {
    let sql = 'SELECT COUNT(*) as count FROM activity_logs WHERE user_id = ? AND is_deleted = 0';
    const params = [userId];

    if (fromDate) {
      sql += ' AND business_date >= ?';
      params.push(fromDate);
    }

    const result = await this.repository.getQuery(sql, params);
    return result?.count || 0;
  }

  /**
   * 最初のログ日時を取得
   */
  private async getFirstLogDate(userId: string): Promise<string | undefined> {
    const sql = 'SELECT MIN(input_timestamp) as first_date FROM activity_logs WHERE user_id = ? AND is_deleted = 0';
    const result = await this.repository.getQuery(sql, [userId]);
    return result?.first_date;
  }

  /**
   * 最後のログ日時を取得
   */
  private async getLastLogDate(userId: string): Promise<string | undefined> {
    const sql = 'SELECT MAX(input_timestamp) as last_date FROM activity_logs WHERE user_id = ? AND is_deleted = 0';
    const result = await this.repository.getQuery(sql, [userId]);
    return result?.last_date;
  }

  /**
   * TODO統計を取得
   */
  private async getTodoStats(userId: string): Promise<{
    total: number;
    completed: number;
    in_progress: number;
  }> {
    const sql = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress
      FROM todo_tasks 
      WHERE user_id = ? AND is_deleted = 0
    `;
    
    const result = await this.repository.getQuery(sql, [userId]);
    return {
      total: result?.total || 0,
      completed: result?.completed || 0,
      in_progress: result?.in_progress || 0
    };
  }

  /**
   * プロファイル表示フォーマットを生成
   */
  private async formatProfileDisplay(profile: UserProfileDetails): Promise<ProfileDisplayFormat> {
    const completionRate = profile.stats.total_todos > 0 
      ? Math.round((profile.stats.completed_todos / profile.stats.total_todos) * 100) 
      : 0;

    return {
      basic_info: {
        user_id: profile.user_id,
        username: profile.username || 'Unknown',
        timezone: profile.timezone,
        registration_date: profile.created_at,
        last_activity: profile.stats.last_log_date || 'なし'
      },
      statistics: {
        total_logs: profile.stats.total_logs,
        monthly_logs: profile.stats.monthly_logs,
        weekly_logs: profile.stats.weekly_logs,
        daily_logs: profile.stats.daily_logs,
        todo_summary: {
          total: profile.stats.total_todos,
          completed: profile.stats.completed_todos,
          in_progress: profile.stats.in_progress_todos,
          completion_rate: completionRate
        }
      },
      settings: {
        timezone: profile.timezone,
        is_active: profile.is_active ?? true
      }
    };
  }

  /**
   * プロファイル埋め込みメッセージを作成
   */
  private createProfileEmbed(display: ProfileDisplayFormat): any {
    const registrationDate = new Date(display.basic_info.registration_date).toLocaleDateString('ja-JP');
    const lastActivity = display.basic_info.last_activity !== 'なし' 
      ? new Date(display.basic_info.last_activity).toLocaleString('ja-JP')
      : 'なし';

    return {
      color: 0x3498db,
      title: '📊 プロファイル情報',
      fields: [
        {
          name: '👤 基本情報',
          value: [
            `**ユーザーID:** ${display.basic_info.user_id}`,
            `**ユーザー名:** ${display.basic_info.username}`,
            `**登録日:** ${registrationDate}`,
            `**最終活動:** ${lastActivity}`
          ].join('\n'),
          inline: false
        },
        {
          name: '⚙️ 設定',
          value: [
            `**タイムゾーン:** ${display.settings.timezone}`,
            `**ステータス:** ${display.settings.is_active ? '🟢 アクティブ' : '🔴 非アクティブ'}`
          ].join('\n'),
          inline: true
        },
        {
          name: '📈 活動統計',
          value: [
            `**総ログ数:** ${display.statistics.total_logs.toLocaleString()}件`,
            `**今月のログ数:** ${display.statistics.monthly_logs.toLocaleString()}件`,
            `**今週のログ数:** ${display.statistics.weekly_logs.toLocaleString()}件`,
            `**今日のログ数:** ${display.statistics.daily_logs.toLocaleString()}件`
          ].join('\n'),
          inline: true
        },
        {
          name: '✅ TODO統計',
          value: [
            `**総TODO数:** ${display.statistics.todo_summary.total.toLocaleString()}件`,
            `**完了済み:** ${display.statistics.todo_summary.completed.toLocaleString()}件`,
            `**進行中:** ${display.statistics.todo_summary.in_progress.toLocaleString()}件`,
            `**完了率:** ${display.statistics.todo_summary.completion_rate}%`
          ].join('\n'),
          inline: false
        }
      ],
      footer: {
        text: '!profile stats または !profile info で詳細情報を表示'
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 統計情報埋め込みメッセージを作成
   */
  private createStatsEmbed(stats: UserStats, timezone: string): any {
    return {
      color: 0x2ecc71,
      title: '📈 統計情報',
      fields: [
        {
          name: '活動ログ統計',
          value: [
            `総ログ数: ${stats.total_logs.toLocaleString()}件`,
            `今月: ${stats.monthly_logs.toLocaleString()}件`,
            `今週: ${stats.weekly_logs.toLocaleString()}件`,
            `今日: ${stats.daily_logs.toLocaleString()}件`
          ].join('\n'),
          inline: true
        },
        {
          name: 'TODO統計',
          value: [
            `総TODO数: ${stats.total_todos.toLocaleString()}件`,
            `完了済み: ${stats.completed_todos.toLocaleString()}件`,
            `進行中: ${stats.in_progress_todos.toLocaleString()}件`
          ].join('\n'),
          inline: true
        }
      ],
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 基本情報埋め込みメッセージを作成
   */
  private createInfoEmbed(userInfo: any, timezone: string): any {
    const registrationDate = new Date(userInfo.created_at).toLocaleDateString('ja-JP');
    const lastUpdate = new Date(userInfo.updated_at).toLocaleString('ja-JP');

    return {
      color: 0x9b59b6,
      title: '👤 基本情報',
      fields: [
        {
          name: 'ユーザー情報',
          value: [
            `**ユーザーID:** ${userInfo.user_id}`,
            `**タイムゾーン:** ${userInfo.timezone}`,
            `**登録日:** ${registrationDate}`,
            `**最終更新:** ${lastUpdate}`
          ].join('\n'),
          inline: false
        }
      ],
      timestamp: new Date().toISOString()
    };
  }

  /**
   * ヘルプメッセージを取得
   */
  getHelp(): string {
    return `**!profile** - プロファイル情報を表示
**!profile stats** - 統計情報のみを表示
**!profile info** - 基本情報のみを表示

プロファイル機能では、あなたの活動ログとTODOの統計情報を確認できます。`;
  }
}