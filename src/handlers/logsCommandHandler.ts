/**
 * ログ表示コマンドハンドラー
 * 生ログの表示・検索機能
 */

import { Message } from 'discord.js';
import { toZonedTime, format } from 'date-fns-tz';
import { IActivityLogService } from '../services/activityLogService';
import {
  ActivityLog,
  ActivityLogError
} from '../types/activityLog';

/**
 * ログコマンドの種類
 */
export type LogsCommandType = 'today' | 'date' | 'search' | 'latest' | 'stats' | 'help';

/**
 * ログコマンドの解析結果
 */
export interface ParsedLogsCommand {
  type: LogsCommandType;
  targetDate?: string;      // YYYY-MM-DD形式
  searchQuery?: string;     // 検索クエリ
  limit?: number;           // 表示件数制限
  error?: string;           // パースエラーメッセージ
}

/**
 * ログコマンドハンドラーインターフェース
 */
export interface ILogsCommandHandler {
  /**
   * ログコマンドを処理
   * @param message Discordメッセージ
   * @param userId ユーザーID
   * @param args コマンド引数
   * @param timezone ユーザーのタイムゾーン
   */
  handle(message: Message, userId: string, args: string[], timezone: string): Promise<void>;

  /**
   * コマンドの使用方法を表示
   * @param message Discordメッセージ
   */
  showHelp(message: Message): Promise<void>;
}

/**
 * LogsCommandHandlerの実装
 */
export class LogsCommandHandler implements ILogsCommandHandler {
  constructor(
    private activityLogService: IActivityLogService
  ) {}

  /**
   * ログコマンドを処理
   */
  async handle(message: Message, userId: string, args: string[], timezone: string): Promise<void> {
    try {
      console.log(`📋 ログコマンド処理開始: ${userId} ${args.join(' ')}`);

      // コマンドを解析
      const parsedCommand = this.parseLogsCommand(args);

      if (parsedCommand.error) {
        await message.reply(`❌ ${parsedCommand.error}\n\n使用方法: \`!logs help\` でヘルプを確認してください。`);
        return;
      }

      // コマンドタイプ別に処理
      switch (parsedCommand.type) {
        case 'today':
          await this.showTodayLogs(message, userId, timezone);
          break;
        
        case 'date':
          await this.showDateLogs(message, userId, parsedCommand.targetDate!, timezone);
          break;
        
        case 'search':
          await this.searchLogs(message, userId, parsedCommand.searchQuery!, timezone);
          break;
        
        case 'latest':
          await this.showLatestLogs(message, userId, parsedCommand.limit || 10, timezone);
          break;
        
        case 'stats':
          await this.showStatistics(message, userId);
          break;
        
        case 'help':
          await this.showHelp(message);
          break;
        
        default:
          await this.showTodayLogs(message, userId, timezone);
      }
    } catch (error) {
      console.error('❌ ログコマンド処理エラー:', error);
      
      const errorMessage = error instanceof ActivityLogError 
        ? `❌ ${error.message}`
        : '❌ ログの取得中にエラーが発生しました。';
        
      await message.reply(errorMessage);
    }
  }

  /**
   * 今日のログを表示
   */
  private async showTodayLogs(message: Message, userId: string, timezone: string): Promise<void> {
    try {
      const logs = await this.activityLogService.getLogsForDate(userId, undefined, timezone);
      
      if (logs.length === 0) {
        await message.reply('📝 今日の活動ログはまだありません。\n\n活動内容を自由に投稿すると記録されます！');
        return;
      }

      const formattedLogs = this.formatLogsDisplay(logs, timezone, '今日');
      await message.reply(formattedLogs);
      
      console.log(`📋 今日のログ表示: ${userId} - ${logs.length}件`);
    } catch (error) {
      console.error('❌ 今日のログ表示エラー:', error);
      throw new ActivityLogError('今日のログの表示に失敗しました', 'SHOW_TODAY_LOGS_ERROR', { error });
    }
  }

  /**
   * 指定日のログを表示
   */
  private async showDateLogs(message: Message, userId: string, targetDate: string, timezone: string): Promise<void> {
    try {
      const logs = await this.activityLogService.getLogsForDate(userId, targetDate, timezone);
      
      if (logs.length === 0) {
        const dateLabel = this.formatDateLabel(targetDate, timezone);
        await message.reply(`📝 ${dateLabel}の活動ログはありません。`);
        return;
      }

      const dateLabel = this.formatDateLabel(targetDate, timezone);
      const formattedLogs = this.formatLogsDisplay(logs, timezone, dateLabel);
      await message.reply(formattedLogs);
      
      console.log(`📋 指定日ログ表示: ${userId} ${targetDate} - ${logs.length}件`);
    } catch (error) {
      console.error('❌ 指定日ログ表示エラー:', error);
      throw new ActivityLogError('指定日のログの表示に失敗しました', 'SHOW_DATE_LOGS_ERROR', { error });
    }
  }

  /**
   * ログを検索
   */
  private async searchLogs(message: Message, userId: string, query: string, timezone: string): Promise<void> {
    try {
      const logs = await this.activityLogService.searchLogs(userId, query, timezone, 20);
      
      if (logs.length === 0) {
        await message.reply(`🔍 「${query}」に一致するログが見つかりませんでした。\n\n異なるキーワードで検索してみてください。`);
        return;
      }

      const formattedResults = this.activityLogService.formatSearchResults(logs, query, timezone);
      await message.reply(formattedResults);
      
      console.log(`🔍 ログ検索: ${userId} "${query}" - ${logs.length}件ヒット`);
    } catch (error) {
      console.error('❌ ログ検索エラー:', error);
      throw new ActivityLogError('ログの検索に失敗しました', 'SEARCH_LOGS_ERROR', { error });
    }
  }

  /**
   * 最新のログを表示
   */
  private async showLatestLogs(message: Message, userId: string, limit: number, timezone: string): Promise<void> {
    try {
      const logs = await this.activityLogService.getLatestLogs(userId, limit);
      
      if (logs.length === 0) {
        await message.reply('📝 まだ活動ログがありません。\n\n活動内容を自由に投稿すると記録されます！');
        return;
      }

      const formattedLogs = this.formatLogsDisplay(logs, timezone, `最新${logs.length}件`);
      await message.reply(formattedLogs);
      
      console.log(`📌 最新ログ表示: ${userId} - ${logs.length}件`);
    } catch (error) {
      console.error('❌ 最新ログ表示エラー:', error);
      throw new ActivityLogError('最新ログの表示に失敗しました', 'SHOW_LATEST_LOGS_ERROR', { error });
    }
  }

  /**
   * 統計情報を表示
   */
  private async showStatistics(message: Message, userId: string): Promise<void> {
    try {
      const stats = await this.activityLogService.getStatistics(userId);
      
      const statsMessage = `📊 **活動ログ統計**

📝 **総記録数**: ${stats.totalLogs}件
📅 **今日の記録**: ${stats.todayLogs}件
📈 **今週の記録**: ${stats.weekLogs}件
📊 **平均記録数**: ${stats.averageLogsPerDay}件/日

💡 **使用状況**:
${this.getUsageInsight(stats)}

**コマンド例**:
\`!logs\` - 今日のログ表示
\`!logs search キーワード\` - ログ検索
\`!summary\` - 分析結果表示`;

      await message.reply(statsMessage);
      
      console.log(`📊 統計情報表示: ${userId}`);
    } catch (error) {
      console.error('❌ 統計情報表示エラー:', error);
      throw new ActivityLogError('統計情報の表示に失敗しました', 'SHOW_STATISTICS_ERROR', { error });
    }
  }

  /**
   * ログ一覧をフォーマット
   */
  private formatLogsDisplay(logs: ActivityLog[], timezone: string, title: string): string {
    const header = `📋 **${title}のログ** (${logs.length}件)`;
    
    if (logs.length === 0) {
      return `${header}\n\nログがありません。`;
    }

    // 入力時刻順でソート
    const sortedLogs = [...logs].sort((a, b) => 
      new Date(a.inputTimestamp).getTime() - new Date(b.inputTimestamp).getTime()
    );

    const formattedLogs = sortedLogs.map((log, index) => {
      // inputTimestampはUTC形式で保存されている
      const inputTime = new Date(log.inputTimestamp);
      
      // ユーザーのタイムゾーンで時刻を表示
      const userLocalTime = toZonedTime(inputTime, timezone);
      const timeStr = format(userLocalTime, 'HH:mm', { timeZone: timezone });
      
      // 内容を80文字で切り詰め
      const contentPreview = log.content.length > 80 
        ? log.content.substring(0, 77) + '...'
        : log.content;
      
      return `**[${timeStr}]** ${contentPreview}`;
    }).join('\n');

    const footer = `\n💡 **操作**: \`!edit\` でログ編集 | \`!summary\` で分析結果表示`;

    return `${header}\n\n${formattedLogs}${footer}`;
  }

  /**
   * 日付ラベルをフォーマット
   */
  private formatDateLabel(dateStr: string, timezone: string): string {
    try {
      const date = new Date(dateStr + 'T12:00:00');
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const todayStr = format(today, 'yyyy-MM-dd');
      const yesterdayStr = format(yesterday, 'yyyy-MM-dd');

      if (dateStr === todayStr) {
        return '今日';
      } else if (dateStr === yesterdayStr) {
        return '昨日';
      } else {
        const localDate = toZonedTime(date, timezone);
        return format(localDate, 'M月d日(E)', { timeZone: timezone });
      }
    } catch (error) {
      console.error('❌ 日付ラベルフォーマットエラー:', error);
      return dateStr;
    }
  }

  /**
   * 使用状況の洞察を生成
   */
  private getUsageInsight(stats: any): string {
    if (stats.totalLogs === 0) {
      return '📝 記録を始めましょう！活動内容を投稿してください。';
    }

    if (stats.todayLogs === 0) {
      return '📅 今日はまだ記録がありません。活動を記録してみましょう。';
    }

    if (stats.todayLogs >= 10) {
      return '🎉 今日は活発に記録されています！素晴らしいです。';
    }

    if (stats.averageLogsPerDay >= 5) {
      return '📈 継続的に記録されています。この調子で続けましょう！';
    }

    if (stats.weekLogs > 0) {
      return '💪 記録習慣が身についてきています。続けることが大切です。';
    }

    return '📊 記録データが蓄積されています。分析結果も確認してみてください。';
  }

  /**
   * コマンドの使用方法を表示
   */
  async showHelp(message: Message): Promise<void> {
    const helpMessage = `📋 **活動ログ表示コマンド**

**基本的な使い方:**
\`!logs\` - 今日のログ一覧を表示
\`!logs <日付>\` - 指定日のログを表示
\`!logs search <キーワード>\` - ログを検索
\`!logs latest <件数>\` - 最新のログを表示
\`!logs stats\` - 統計情報を表示

**使用例:**
\`!logs\` → 今日のログ
\`!logs 2025-06-27\` → 6月27日のログ
\`!logs yesterday\` → 昨日のログ
\`!logs search 会議\` → 「会議」を含むログを検索
\`!logs latest 5\` → 最新5件のログ
\`!logs stats\` → 統計情報

**日付指定方法:**
• \`YYYY-MM-DD\` 形式 (例: 2025-06-27)
• \`today\` / \`今日\`
• \`yesterday\` / \`昨日\`
• \`-数字\` (例: -1 は1日前)

**検索機能:**
• 部分一致で検索されます
• 大文字・小文字は区別されません
• 複数のキーワードはスペースで区切って入力

**その他のコマンド:**
\`!edit\` - ログの編集・削除
\`!summary\` - 分析結果の表示
\`!summary <日付>\` - 指定日の分析結果`;

    await message.reply(helpMessage);
  }

  /**
   * ログコマンドを解析
   */
  private parseLogsCommand(args: string[]): ParsedLogsCommand {
    // 引数がない場合は今日のログ
    if (args.length === 0) {
      return { type: 'today' };
    }

    const firstArg = args[0].toLowerCase();

    // ヘルプ表示
    if (firstArg === 'help' || firstArg === 'h' || firstArg === '?' || firstArg === 'ヘルプ') {
      return { type: 'help' };
    }

    // 統計情報
    if (firstArg === 'stats' || firstArg === 'statistics' || firstArg === '統計' || firstArg === 'stat') {
      return { type: 'stats' };
    }

    // 検索
    if (firstArg === 'search' || firstArg === 'find' || firstArg === '検索') {
      if (args.length < 2) {
        return { 
          type: 'search', 
          error: '検索キーワードを指定してください。例: `!logs search 会議`' 
        };
      }

      const searchQuery = args.slice(1).join(' ').trim();
      if (searchQuery.length === 0) {
        return { 
          type: 'search', 
          error: '検索キーワードが空です。' 
        };
      }

      return { 
        type: 'search', 
        searchQuery 
      };
    }

    // 最新ログ
    if (firstArg === 'latest' || firstArg === 'recent' || firstArg === '最新') {
      let limit = 10; // デフォルト

      if (args.length >= 2) {
        const limitArg = parseInt(args[1]);
        if (!isNaN(limitArg) && limitArg > 0 && limitArg <= 50) {
          limit = limitArg;
        } else {
          return { 
            type: 'latest', 
            error: '表示件数は1〜50の数値で指定してください。例: `!logs latest 10`' 
          };
        }
      }

      return { 
        type: 'latest', 
        limit 
      };
    }

    // 今日
    if (firstArg === 'today' || firstArg === '今日') {
      return { type: 'today' };
    }

    // 昨日
    if (firstArg === 'yesterday' || firstArg === '昨日') {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const targetDate = format(yesterday, 'yyyy-MM-dd');
      
      return { 
        type: 'date', 
        targetDate 
      };
    }

    // 相対日付 (-1, -2 など)
    if (firstArg.match(/^-\d+$/)) {
      const daysBack = parseInt(firstArg.substring(1));
      if (daysBack > 0 && daysBack <= 30) {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() - daysBack);
        const dateStr = format(targetDate, 'yyyy-MM-dd');
        
        return { 
          type: 'date', 
          targetDate: dateStr 
        };
      } else {
        return { 
          type: 'date', 
          error: '相対日付は1〜30日前まで指定できます。例: `-1`, `-7`' 
        };
      }
    }

    // 日付形式 (YYYY-MM-DD)
    if (firstArg.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const dateStr = firstArg;
      
      // 日付の妥当性チェック
      const date = new Date(dateStr + 'T12:00:00');
      if (isNaN(date.getTime())) {
        return { 
          type: 'date', 
          error: '無効な日付形式です。YYYY-MM-DD形式で入力してください。例: `2025-06-27`' 
        };
      }

      // 未来日チェック
      const today = new Date();
      if (date > today) {
        return { 
          type: 'date', 
          error: '未来の日付は指定できません。' 
        };
      }

      return { 
        type: 'date', 
        targetDate: dateStr 
      };
    }

    // その他の形式
    return { 
      type: 'date', 
      error: `無効な指定です。使用できる形式:
• \`today\` / \`今日\`
• \`yesterday\` / \`昨日\`  
• \`YYYY-MM-DD\` (例: 2025-06-27)
• \`search キーワード\` (検索)
• \`latest 件数\` (最新ログ)
• \`stats\` (統計情報)` 
    };
  }
}