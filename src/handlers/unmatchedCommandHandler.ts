/**
 * マッチング待ちログコマンドハンドラー
 * 開始・終了ログのマッチング機能
 */

import { Message } from 'discord.js';
import { toZonedTime, format } from 'date-fns-tz';
import { IActivityLogService } from '../services/activityLogService';
import {
  ActivityLog,
  ActivityLogError
} from '../types/activityLog';
import { logger } from '../utils/logger';

/**
 * Unmatchedコマンドの種類
 */
export type UnmatchedCommandType = 'list' | 'match' | 'help';

/**
 * Unmatchedコマンドの解析結果
 */
export interface ParsedUnmatchedCommand {
  type: UnmatchedCommandType;
  startLogId?: string;      // 開始ログID（match時）
  endLogId?: string;        // 終了ログID（match時）
  error?: string;           // パースエラーメッセージ
}

/**
 * マッチング待ちログコマンドハンドラーインターフェース
 */
export interface IUnmatchedCommandHandler {
  /**
   * unmatchedコマンドを処理
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
 * UnmatchedCommandHandlerの実装
 */
export class UnmatchedCommandHandler implements IUnmatchedCommandHandler {
  constructor(
    private activityLogService: IActivityLogService
  ) {}

  /**
   * unmatchedコマンドを処理
   */
  async handle(message: Message, userId: string, args: string[], timezone: string): Promise<void> {
    try {
      logger.debug('HANDLER', `🔗 マッチングコマンド処理開始: ${userId} ${args.join(' ')}`);

      // コマンドを解析
      const parsedCommand = this.parseUnmatchedCommand(args);

      if (parsedCommand.error) {
        await message.reply(`❌ ${parsedCommand.error}\n\n使用方法: \`!unmatched help\` でヘルプを確認してください。`);
        return;
      }

      // コマンドタイプ別に処理
      switch (parsedCommand.type) {
        case 'list':
          await this.showUnmatchedLogs(message, userId, timezone);
          break;
        
        case 'match':
          await this.matchLogs(message, userId, parsedCommand.startLogId!, parsedCommand.endLogId!, timezone);
          break;
        
        case 'help':
          await this.showHelp(message);
          break;
        
        default:
          await this.showUnmatchedLogs(message, userId, timezone);
      }
    } catch (error) {
      logger.error('HANDLER', '❌ マッチングコマンド処理エラー:', error);
      
      const errorMessage = error instanceof ActivityLogError 
        ? `❌ ${error.message}`
        : '❌ マッチング処理中にエラーが発生しました。';
        
      await message.reply(errorMessage);
    }
  }

  /**
   * マッチング待ちログを表示
   */
  private async showUnmatchedLogs(message: Message, userId: string, timezone: string): Promise<void> {
    try {
      const unmatchedLogs = await this.activityLogService.getUnmatchedLogs(userId, timezone);
      
      if (unmatchedLogs.length === 0) {
        await message.reply('🎉 すべてのログがマッチング済みです！\n\n新しく開始・終了ログを記録すると、自動的にマッチングが試行されます。');
        return;
      }

      const formattedLogs = this.formatUnmatchedLogsDisplay(unmatchedLogs, timezone);
      await message.reply(formattedLogs);
      
      logger.debug('HANDLER', `🔍 マッチング待ちログ表示: ${userId} - ${unmatchedLogs.length}件`);
    } catch (error) {
      logger.error('HANDLER', '❌ マッチング待ちログ表示エラー:', error);
      throw new ActivityLogError('マッチング待ちログの表示に失敗しました', 'SHOW_UNMATCHED_LOGS_ERROR', { error });
    }
  }

  /**
   * ログを手動でマッチング
   */
  private async matchLogs(message: Message, userId: string, startLogId: string, endLogId: string, timezone: string): Promise<void> {
    try {
      const result = await this.activityLogService.manualMatchLogs(startLogId, endLogId, userId);
      
      // マッチング結果を表示
      const startTime = this.formatLogTime(result.startLog, timezone);
      const endTime = this.formatLogTime(result.endLog, timezone);
      
      const successMessage = `✅ **ログマッチング完了**

🎯 **開始ログ**: ${startTime} ${result.startLog.content}
🏁 **終了ログ**: ${endTime} ${result.endLog.content}
📊 **類似度スコア**: ${(result.startLog.similarityScore || 0).toFixed(2)}

💡 このペアは今後のサマリー生成で活動時間として計算されます。`;

      await message.reply(successMessage);
      
      logger.debug('HANDLER', `🔗 手動マッチング成功: ${userId} ${startLogId} ↔️ ${endLogId}`);
    } catch (error) {
      logger.error('HANDLER', '❌ 手動マッチングエラー:', error);
      
      if (error instanceof ActivityLogError) {
        let userFriendlyMessage = '';
        
        switch (error.code) {
          case 'LOG_NOT_FOUND':
            userFriendlyMessage = '指定されたログが見つかりません。ログIDを確認してください。';
            break;
          case 'UNAUTHORIZED_MATCH':
            userFriendlyMessage = '他のユーザーのログをマッチングすることはできません。';
            break;
          case 'INVALID_LOG_TYPE_FOR_MATCH':
            userFriendlyMessage = '開始ログ（start_only）と終了ログ（end_only）のみマッチングできます。';
            break;
          case 'ALREADY_MATCHED':
            userFriendlyMessage = '既にマッチング済みのログは再マッチングできません。';
            break;
          default:
            userFriendlyMessage = error.message;
        }
        
        await message.reply(`❌ ${userFriendlyMessage}\n\n\`!unmatched\` でマッチング可能なログを確認してください。`);
      } else {
        throw new ActivityLogError('手動マッチングに失敗しました', 'MANUAL_MATCH_ERROR', { error });
      }
    }
  }

  /**
   * マッチング待ちログ一覧をフォーマット
   */
  private formatUnmatchedLogsDisplay(logs: ActivityLog[], timezone: string): string {
    const header = `🔗 **マッチング待ちログ** (${logs.length}件)`;
    
    if (logs.length === 0) {
      return `${header}\n\nマッチング待ちのログがありません。`;
    }

    // ログタイプ別に分類
    const startLogs = logs.filter(log => log.logType === 'start_only');
    const endLogs = logs.filter(log => log.logType === 'end_only');

    let formattedOutput = header + '\n\n';

    // 開始ログの表示
    if (startLogs.length > 0) {
      formattedOutput += `🎯 **開始ログ** (${startLogs.length}件)\n`;
      startLogs.forEach(log => {
        const time = this.formatLogTime(log, timezone);
        const activityInfo = log.activityKey ? ` [${log.activityKey}]` : '';
        formattedOutput += `**ID: ${log.id.slice(-8)}** - ${time} ${log.content}${activityInfo}\n`;
      });
      formattedOutput += '\n';
    }

    // 終了ログの表示
    if (endLogs.length > 0) {
      formattedOutput += `🏁 **終了ログ** (${endLogs.length}件)\n`;
      endLogs.forEach(log => {
        const time = this.formatLogTime(log, timezone);
        const activityInfo = log.activityKey ? ` [${log.activityKey}]` : '';
        formattedOutput += `**ID: ${log.id.slice(-8)}** - ${time} ${log.content}${activityInfo}\n`;
      });
      formattedOutput += '\n';
    }

    // 使用方法の説明
    formattedOutput += `**💡 手動マッチング方法:**
\`!unmatched match <開始ログID> <終了ログID>\`

**例:** \`!unmatched match ${startLogs[0]?.id.slice(-8) || 'abc12345'} ${endLogs[0]?.id.slice(-8) || 'def67890'}\`

**📝 自動マッチング:** 類似度が高い場合は自動的にマッチングされます
**🔄 再表示:** \`!unmatched\` でリストを更新`;

    return formattedOutput;
  }

  /**
   * ログの時刻をフォーマット
   */
  private formatLogTime(log: ActivityLog, timezone: string): string {
    try {
      // start_timeがある場合はそれを使用、なければinputTimestampを使用
      const timeToFormat = log.startTime || log.inputTimestamp;
      const time = toZonedTime(new Date(timeToFormat), timezone);
      const timeStr = format(time, 'HH:mm', { timeZone: timezone });
      
      // 日付が今日でない場合は日付も表示
      const today = format(new Date(), 'yyyy-MM-dd');
      const logDate = format(time, 'yyyy-MM-dd', { timeZone: timezone });
      
      if (logDate !== today) {
        const dateStr = format(time, 'M/d', { timeZone: timezone });
        return `[${dateStr} ${timeStr}]`;
      }
      
      return `[${timeStr}]`;
    } catch (error) {
      logger.error('HANDLER', '❌ 時刻フォーマットエラー:', error);
      return '[--:--]';
    }
  }

  /**
   * コマンドの使用方法を表示
   */
  async showHelp(message: Message): Promise<void> {
    const helpMessage = `🔗 **マッチング待ちログ管理コマンド**

**基本的な使い方:**
\`!unmatched\` - マッチング待ちログの一覧表示
\`!unmatched match <開始ID> <終了ID>\` - 手動でログをマッチング

**使用例:**
\`!unmatched\` → マッチング待ちログ一覧
\`!unmatched match abc12345 def67890\` → 指定IDのログをマッチング

**📋 ログIDについて:**
• ログ一覧で表示される8桁の短縮IDを使用
• 例: \`abc12345\` (実際のIDの末尾8文字)

**🤖 自動マッチングについて:**
• 開始・終了ログを記録時に自動的に判定
• 類似度スコア > 0.8 の場合、自動マッチング
• 手動マッチングで任意のペアを作成可能

**🎯 マッチング対象:**
• **開始ログ**: 「始める」「開始」「スタート」「今から」等
• **終了ログ**: 「終える」「終了」「完了」「やめる」等
• **完結ログ**: 「○時から○時まで」等（マッチング対象外）

**📊 活用方法:**
• マッチングされたログペアは作業時間として計算
• \`!summary\` で詳細な分析結果を確認
• 効率的な時間追跡が可能

**その他のコマンド:**
\`!logs\` - ログ一覧表示
\`!summary\` - 分析結果表示
\`!edit\` - ログ編集`;

    await message.reply(helpMessage);
  }

  /**
   * unmatchedコマンドを解析
   */
  private parseUnmatchedCommand(args: string[]): ParsedUnmatchedCommand {
    // 引数がない場合はリスト表示
    if (args.length === 0) {
      return { type: 'list' };
    }

    const firstArg = args[0].toLowerCase();

    // ヘルプ表示
    if (firstArg === 'help' || firstArg === 'h' || firstArg === '?' || firstArg === 'ヘルプ') {
      return { type: 'help' };
    }

    // リスト表示
    if (firstArg === 'list' || firstArg === 'show' || firstArg === '一覧' || firstArg === 'リスト') {
      return { type: 'list' };
    }

    // 手動マッチング
    if (firstArg === 'match' || firstArg === 'link' || firstArg === 'connect' || firstArg === 'マッチ' || firstArg === '結合') {
      if (args.length < 3) {
        return { 
          type: 'match', 
          error: '開始ログIDと終了ログIDを指定してください。例: `!unmatched match abc12345 def67890`' 
        };
      }

      const startLogId = args[1].trim();
      const endLogId = args[2].trim();

      // IDの形式チェック（最低限）
      if (startLogId.length < 3 || endLogId.length < 3) {
        return { 
          type: 'match', 
          error: 'ログIDは3文字以上である必要があります。`!unmatched` でIDを確認してください。' 
        };
      }

      // 同じIDチェック
      if (startLogId === endLogId) {
        return { 
          type: 'match', 
          error: '開始ログIDと終了ログIDは異なる必要があります。' 
        };
      }

      return { 
        type: 'match', 
        startLogId,
        endLogId 
      };
    }

    // その他の形式
    return { 
      type: 'list', 
      error: `無効な指定です。使用できるコマンド:
• \`!unmatched\` - マッチング待ちログ一覧
• \`!unmatched match <開始ID> <終了ID>\` - 手動マッチング
• \`!unmatched help\` - ヘルプ表示` 
    };
  }
}