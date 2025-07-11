import { Message } from 'discord.js';
import { IUserRepository } from '../repositories/interfaces';
import { UserProfile, ProfileDisplayOptions, DEFAULT_PROFILE_OPTIONS, UserActivityStats } from '../types/userProfile';
import { withErrorHandling, AppError, ErrorType } from '../utils/errorHandler';

/**
 * プロファイル表示コマンドハンドラー
 */
export class ProfileCommandHandler {
  private repository: IUserRepository;

  constructor(repository: IUserRepository) {
    this.repository = repository;
  }

  /**
   * !profileコマンドの処理
   */
  async handle(message: Message, userId: string, args: string[], timezone: string): Promise<void> {
    await withErrorHandling(async () => {
      console.log(`📊 プロファイル表示要求: ${userId}, オプション: [${args.join(', ')}]`);
      
      // オプション解析
      const options = this.parseOptions(args);
      
      // ユーザー情報とプロファイルを取得
      const userInfo = await this.repository.getUserInfo(userId);
      if (!userInfo) {
        await message.reply('❌ ユーザー情報が見つかりません。初回利用の場合は何かメッセージを送信してください。');
        return;
      }
      
      const stats = await this.repository.getUserStats(userId);
      
      const profile: UserProfile = {
        userId: userInfo.userId,
        username: userInfo.username,
        timezone: userInfo.timezone,
        registrationDate: userInfo.createdAt,
        lastSeenAt: userInfo.lastSeen,
        isActive: userInfo.isActive,
        stats
      };
      
      // プロファイル表示
      const profileText = this.formatProfile(profile, options);
      await message.reply(profileText);
      
      console.log(`✅ プロファイル表示完了: ${userId}`);
      
    }, ErrorType.DISCORD, { userId });
  }

  /**
   * プロファイル表示オプションの解析
   */
  private parseOptions(args: string[]): ProfileDisplayOptions {
    return {
      includeStats: !args.includes('--no-stats'),
      includeSettings: !args.includes('--no-settings'),
      includeRecentActivity: args.includes('--recent'),
      compact: args.includes('--compact')
    };
  }

  /**
   * プロファイル情報のフォーマット
   */
  private formatProfile(profile: UserProfile, options: ProfileDisplayOptions): string {
    const sections: string[] = [];
    
    try {
      // 基本情報
      sections.push('📊 **プロファイル情報**\n');
      
      sections.push('👤 **基本情報**');
      sections.push(`ユーザーID: \`${profile.userId}\``);
      if (profile.username) {
        sections.push(`ユーザー名: ${profile.username}`);
      }
      sections.push(`登録日: ${this.formatDate(profile.registrationDate)}`);
      sections.push(`最終利用: ${this.formatDate(profile.lastSeenAt)}`);
      sections.push('');
      
      // 設定情報
      if (options.includeSettings) {
        sections.push('⚙️ **設定**');
        sections.push(`タイムゾーン: ${profile.timezone}`);
        sections.push('');
      }
      
      // 統計情報
      if (options.includeStats && profile.stats) {
        this.formatStatsSection(sections, profile.stats, options.compact);
      }
      
      return sections.join('\n');
    } catch (error) {
      console.error('❌ プロファイル情報フォーマットエラー:', error);
      return '❌ プロファイル情報の表示中にエラーが発生しました。';
    }
  }

  /**
   * 統計情報セクションのフォーマット（リファクタリング）
   */
  private formatStatsSection(sections: string[], stats: UserActivityStats, compact: boolean): void {
    sections.push('📈 **統計**');
    sections.push(`総ログ数: ${stats.totalLogs.toLocaleString()}件`);
    sections.push(`今月のログ数: ${stats.thisMonthLogs.toLocaleString()}件`);
    sections.push(`今週のログ数: ${stats.thisWeekLogs.toLocaleString()}件`);
    sections.push(`今日のログ数: ${stats.todayLogs.toLocaleString()}件`);
    
    if (!compact) {
      sections.push(`1日平均: ${stats.avgLogsPerDay.toFixed(1)}件`);
      sections.push(`最も活発な時間: ${stats.mostActiveHour}時台`);
      sections.push(`総記録時間: ${Math.round(stats.totalMinutesLogged / 60)}時間`);
      
      if (stats.longestActiveDay && stats.longestActiveDay.logCount > 0) {
        sections.push(`最大ログ日: ${stats.longestActiveDay.date} (${stats.longestActiveDay.logCount}件)`);
      }
    }
  }

  /**
   * 日付のフォーマット（エラーハンドリング強化）
   */
  private formatDate(dateString: string): string {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        console.warn('⚠️ 無効な日付文字列:', dateString);
        return '不明';
      }
      return date.toLocaleString('ja-JP', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      console.error('❌ 日付フォーマットエラー:', error);
      return '不明';
    }
  }
}