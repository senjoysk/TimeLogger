/**
 * サマリーコマンドハンドラー
 * シンプルな日次サマリー生成（完了TODO + 活動ログ一覧）
 */

import { Message } from 'discord.js';
import { toZonedTime, format } from 'date-fns-tz';
import { IActivityLogService } from '../services/activityLogService';
import { ActivityLog, ActivityLogError } from '../types/activityLog';
import { logger } from '../utils/logger';
import { Todo } from '../types/todo';

/**
 * サマリーコマンドの種類
 */
export type SummaryCommandType = 'today' | 'date' | 'help';

/**
 * サマリーコマンドの解析結果
 */
export interface ParsedSummaryCommand {
  type: SummaryCommandType;
  targetDate?: string;      // YYYY-MM-DD形式
  forceRefresh?: boolean;   // キャッシュを無視して再分析
  error?: string;           // パースエラーメッセージ
}

/**
 * サマリーハンドラーインターフェース
 */
export interface ISummaryHandler {
  /**
   * サマリーコマンドを処理
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
 * SummaryHandlerの実装
 */
export class SummaryHandler implements ISummaryHandler {
  constructor(
    private activityLogService: IActivityLogService,
    private repository: {
      getLogsByDate(userId: string, businessDate: string): Promise<ActivityLog[]>;
      getTodosByUserId(userId: string): Promise<Todo[]>;
    }
  ) {}

  /**
   * サマリーコマンドを処理
   */
  async handle(message: Message, userId: string, args: string[], timezone: string): Promise<void> {
    try {
      logger.debug('HANDLER', `📊 サマリーコマンド処理開始: ${userId} ${args.join(' ')}`);

      // コマンドを解析
      const parsedCommand = this.parseSummaryCommand(args, timezone);

      if (parsedCommand.error) {
        await message.reply(`❌ ${parsedCommand.error}\n\n使用方法: \`!summary help\` でヘルプを確認してください。`);
        return;
      }

      // コマンドタイプ別に処理
      switch (parsedCommand.type) {
        case 'today':
        case 'date':
          await this.generateSimpleSummary(message, userId, parsedCommand, timezone);
          break;
        
        case 'help':
          await this.showHelp(message);
          break;
        
        default:
          await this.generateSimpleSummary(message, userId, { type: 'today' }, timezone);
      }
    } catch (error) {
      logger.error('HANDLER', '❌ サマリーコマンド処理エラー:', error);
      
      const errorMessage = error instanceof ActivityLogError 
        ? `❌ ${error.message}`
        : '❌ サマリー生成中にエラーが発生しました。';
        
      await message.reply(errorMessage);
    }
  }

  /**
   * シンプルサマリーを生成・表示
   */
  private async generateSimpleSummary(message: Message, userId: string, parsedCommand: ParsedSummaryCommand, timezone: string): Promise<void> {
    try {
      // 対象日を決定
      const targetDate = parsedCommand.targetDate || this.activityLogService.calculateBusinessDate(timezone).businessDate;

      // 進行状況メッセージを送信
      const progressMessage = await message.reply('📋 データを取得中です...');

      // データを並行取得
      const [activityLogs, todos] = await Promise.all([
        this.repository.getLogsByDate(userId, targetDate),
        this.repository.getTodosByUserId(userId)
      ]);

      // 当日完了したTODOをフィルタリング
      const completedTodos = todos.filter(todo => {
        if (todo.status !== 'completed' || !todo.completedAt) return false;
        const completedDate = todo.completedAt.split('T')[0];
        return completedDate === targetDate;
      });

      // 結果をフォーマットして送信
      const formattedSummary = this.formatSimpleSummary(targetDate, activityLogs, completedTodos, timezone);
      
      await progressMessage.edit(formattedSummary);
      
      logger.debug('HANDLER', `📊 シンプルサマリー生成完了: ${userId} ${targetDate}`);
    } catch (error) {
      logger.error('HANDLER', '❌ サマリー生成エラー:', error);
      throw error instanceof ActivityLogError ? error :
        new ActivityLogError('サマリーの生成に失敗しました', 'GENERATE_SUMMARY_ERROR', { error });
    }
  }



  /**
   * シンプルサマリーをDiscord用にフォーマット
   */
  private formatSimpleSummary(targetDate: string, activityLogs: ActivityLog[], completedTodos: Todo[], timezone: string): string {
    const sections: string[] = [];

    // ヘッダー
    const dateStr = this.formatBusinessDate(targetDate, timezone);
    sections.push(`📋 **${dateStr}の活動サマリー**`);

    // 完了したTODO一覧
    sections.push(`\n✅ **完了したTODO (${completedTodos.length}件)**`);
    if (completedTodos.length > 0) {
      // 完了時刻でソート
      const sortedTodos = completedTodos.sort((a, b) => {
        const timeA = a.completedAt || a.updatedAt;
        const timeB = b.completedAt || b.updatedAt;
        return timeA.localeCompare(timeB);
      });

      for (const todo of sortedTodos) {
        const completedTime = new Date(todo.completedAt || todo.updatedAt);
        const localTime = toZonedTime(completedTime, timezone);
        const timeStr = format(localTime, 'HH:mm', { timeZone: timezone });
        
        sections.push(`• ${timeStr}: ${todo.content}`);
      }
    } else {
      sections.push('• 完了したTODOはありません');
    }

    // 活動ログ一覧
    sections.push(`\n📝 **活動ログ (${activityLogs.length}件)**`);
    if (activityLogs.length > 0) {
      // 時刻でソート
      const sortedLogs = activityLogs.sort((a, b) => {
        return a.inputTimestamp.localeCompare(b.inputTimestamp);
      });

      for (const log of sortedLogs) {
        const displayEntry = this.formatActivityLogEntry(log, timezone);
        sections.push(`• ${displayEntry}`);
      }
    } else {
      sections.push('• 活動ログはありません');
    }

    // フッター情報
    const now = new Date();
    const localNow = toZonedTime(now, timezone);
    const generatedStr = format(localNow, 'HH:mm', { timeZone: timezone });
    
    sections.push(`\n🤖 ${generatedStr}に生成 | TODO: ${completedTodos.length}件 | ログ: ${activityLogs.length}件`);

    return sections.join('\n');
  }



  /**
   * 活動ログエントリーをフォーマット（starttime - endtime : 活動内容 形式）
   */
  private formatActivityLogEntry(log: ActivityLog, timezone: string): string {
    // AI分析済みの場合は start_time, end_time を使用
    if (log.startTime && log.endTime) {
      const startTime = new Date(log.startTime);
      const endTime = new Date(log.endTime);
      const localStartTime = toZonedTime(startTime, timezone);
      const localEndTime = toZonedTime(endTime, timezone);
      const startStr = format(localStartTime, 'HH:mm', { timeZone: timezone });
      const endStr = format(localEndTime, 'HH:mm', { timeZone: timezone });
      
      // contentから時刻情報を除去
      const cleanContent = this.removeTimeFromContent(log.content);
      return `${startStr} - ${endStr} : ${cleanContent}`;
    }
    
    // 開始時刻のみ
    if (log.startTime && !log.endTime) {
      const startTime = new Date(log.startTime);
      const localStartTime = toZonedTime(startTime, timezone);
      const startStr = format(localStartTime, 'HH:mm', { timeZone: timezone });
      
      const cleanContent = this.removeTimeFromContent(log.content);
      return `${startStr} - : ${cleanContent}`;
    }
    
    // 終了時刻のみ
    if (!log.startTime && log.endTime) {
      const endTime = new Date(log.endTime);
      const localEndTime = toZonedTime(endTime, timezone);
      const endStr = format(localEndTime, 'HH:mm', { timeZone: timezone });
      
      const cleanContent = this.removeTimeFromContent(log.content);
      return `- ${endStr} : ${cleanContent}`;
    }
    
    // 未分析（時刻情報なし）の場合は活動内容のみ
    return log.content;
  }

  /**
   * contentから時刻情報を除去
   */
  private removeTimeFromContent(content: string): string {
    // 様々な時刻表記パターンを除去
    let cleanContent = content;
    
    // HH:MM-HH:MM形式（例: 10:00-10:30, 9:15-11:45）
    cleanContent = cleanContent.replace(/^\d{1,2}:\d{2}-\d{1,2}:\d{2}\s*/, '');
    
    // HH:MM〜HH:MM形式（例: 10:00〜10:30）
    cleanContent = cleanContent.replace(/^\d{1,2}:\d{2}〜\d{1,2}:\d{2}\s*/, '');
    
    // HH:MM ~ HH:MM形式（例: 10:00 ~ 10:30）
    cleanContent = cleanContent.replace(/^\d{1,2}:\d{2}\s*~\s*\d{1,2}:\d{2}\s*/, '');
    
    // HH:MM to HH:MM形式（例: 10:00 to 10:30）
    cleanContent = cleanContent.replace(/^\d{1,2}:\d{2}\s*to\s*\d{1,2}:\d{2}\s*/, '');
    
    // HH:MM-形式（開始時刻のみ、例: 10:00-）
    cleanContent = cleanContent.replace(/^\d{1,2}:\d{2}-\s*/, '');
    
    // -HH:MM形式（終了時刻のみ、例: -10:30）
    cleanContent = cleanContent.replace(/^-\d{1,2}:\d{2}\s*/, '');
    
    return cleanContent.trim();
  }

  /**
   * 業務日をユーザーフレンドリーにフォーマット
   */
  private formatBusinessDate(businessDate: string, timezone: string): string {
    try {
      const date = new Date(businessDate + 'T12:00:00');
      const localDate = toZonedTime(date, timezone);
      
      // 実際の日付を表示（yyyy/MM/dd形式）
      return format(localDate, 'yyyy/MM/dd', { timeZone: timezone });
    } catch (error) {
      logger.error('HANDLER', '❌ 日付フォーマットエラー:', error);
      return businessDate;
    }
  }

  /**
   * コマンドの使用方法を表示
   */
  async showHelp(message: Message): Promise<void> {
    const helpMessage = `📊 **活動サマリーコマンド**

**基本的な使い方:**
\`!summary\` - 今日の活動サマリーを表示
\`!summary <日付>\` - 指定日のサマリーを表示
\`!summary refresh\` - キャッシュを無視して再分析

**使用例:**
\`!summary\` → 今日のサマリー
\`!summary refresh\` → 今日のサマリー（再分析）
\`!summary yesterday\` → 昨日のサマリー
\`!summary 2025-06-27\` → 6月27日のサマリー
\`!summary -3\` → 3日前のサマリー

**日付指定方法:**
• \`YYYY-MM-DD\` 形式 (例: 2025-06-27)
• \`today\` / \`今日\` / \`yesterday\` / \`昨日\`
• 相対指定: \`-1\` (1日前), \`-2\` (2日前)

**サマリー内容:**
📝 完了したTODO一覧
📊 活動ログ一覧`;

    await message.reply(helpMessage);
  }

  /**
   * サマリーコマンドを解析
   */
  private parseSummaryCommand(args: string[], timezone: string): ParsedSummaryCommand {
    // 引数がない場合は今日のサマリー
    if (args.length === 0) {
      return { type: 'today' };
    }

    const firstArg = args[0].toLowerCase();

    // ヘルプ表示
    if (firstArg === 'help' || firstArg === 'h' || firstArg === '?' || firstArg === 'ヘルプ') {
      return { type: 'help' };
    }

    // リフレッシュ（キャッシュ無視）
    if (firstArg === 'refresh') {
      return { type: 'today', forceRefresh: true };
    }

    // 今日
    if (firstArg === 'today' || firstArg === '今日') {
      return { type: 'today' };
    }

    // 昨日
    if (firstArg === 'yesterday' || firstArg === '昨日') {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const businessInfo = this.activityLogService.calculateBusinessDate(timezone, yesterday.toISOString());
      
      return { 
        type: 'date', 
        targetDate: businessInfo.businessDate 
      };
    }

    // 相対日付 (-1, -2 など)
    if (firstArg.match(/^-\d+$/)) {
      const daysBack = parseInt(firstArg.substring(1));
      if (daysBack > 0 && daysBack <= 30) {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() - daysBack);
        const businessInfo = this.activityLogService.calculateBusinessDate(timezone, targetDate.toISOString());
        
        return { 
          type: 'date', 
          targetDate: businessInfo.businessDate 
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

      // 過去すぎる日付チェック（1年前まで）
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      if (date < oneYearAgo) {
        return { 
          type: 'date', 
          error: '1年以上前の日付は指定できません。' 
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
      error: `無効な日付指定です。使用できる形式:
• \`today\` / \`今日\`
• \`yesterday\` / \`昨日\`  
• \`YYYY-MM-DD\` (例: 2025-06-27)
• \`-数字\` (例: -1 は1日前)` 
    };
  }

}