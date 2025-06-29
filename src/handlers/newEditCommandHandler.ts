/**
 * 新活動記録編集コマンドハンドラー
 * 自然言語ログ方式に対応
 */

import { Message } from 'discord.js';
import { IActivityLogService } from '../services/activityLogService';
import {
  EditLogRequest,
  DeleteLogRequest,
  ActivityLogError
} from '../types/activityLog';

/**
 * 編集コマンドの種類
 */
export type EditCommandType = 'list' | 'edit' | 'delete' | 'help';

/**
 * 編集コマンドの解析結果
 */
export interface ParsedEditCommand {
  type: EditCommandType;
  logIndex?: number;        // ユーザー表示用の番号（1ベース）
  logId?: string;          // 実際のログID
  newContent?: string;     // 新しい内容
  error?: string;          // パースエラーメッセージ
}

/**
 * 新編集コマンドハンドラーインターフェース
 */
export interface INewEditCommandHandler {
  /**
   * 編集コマンドを処理
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
 * NewEditCommandHandlerの実装
 */
export class NewEditCommandHandler implements INewEditCommandHandler {
  constructor(
    private activityLogService: IActivityLogService
  ) {}

  /**
   * 編集コマンドを処理
   */
  async handle(message: Message, userId: string, args: string[], timezone: string): Promise<void> {
    try {
      console.log(`✏️ 編集コマンド処理開始: ${userId} ${args.join(' ')}`);

      // コマンドを解析
      const parsedCommand = this.parseEditCommand(args);

      if (parsedCommand.error) {
        await message.reply(`❌ ${parsedCommand.error}\n\n使用方法: \`!edit\` でヘルプを確認してください。`);
        return;
      }

      // コマンドタイプ別に処理
      switch (parsedCommand.type) {
        case 'list':
          await this.showEditableList(message, userId, timezone);
          break;
        
        case 'edit':
          await this.editLog(message, userId, parsedCommand, timezone);
          break;
        
        case 'delete':
          await this.deleteLog(message, userId, parsedCommand, timezone);
          break;
        
        case 'help':
          await this.showHelp(message);
          break;
        
        default:
          await this.showHelp(message);
      }
    } catch (error) {
      console.error('❌ 編集コマンド処理エラー:', error);
      
      const errorMessage = error instanceof ActivityLogError 
        ? `❌ ${error.message}`
        : '❌ 編集コマンドの処理中にエラーが発生しました。';
        
      await message.reply(errorMessage);
    }
  }

  /**
   * 編集可能なログ一覧を表示
   */
  private async showEditableList(message: Message, userId: string, timezone: string): Promise<void> {
    try {
      const logs = await this.activityLogService.getLogsForEdit(userId, timezone);
      
      if (logs.length === 0) {
        await message.reply('📝 今日の活動ログはまだありません。\n\n活動内容を自由に投稿すると記録されます！');
        return;
      }

      const formattedList = this.activityLogService.formatLogsForEdit(logs, timezone);
      
      await message.reply(formattedList);
      
      console.log(`📋 編集リスト表示: ${userId} - ${logs.length}件`);
    } catch (error) {
      console.error('❌ 編集リスト表示エラー:', error);
      throw new ActivityLogError('ログ一覧の表示に失敗しました', 'SHOW_EDIT_LIST_ERROR', { error });
    }
  }

  /**
   * ログを編集
   */
  private async editLog(message: Message, userId: string, parsedCommand: ParsedEditCommand, timezone: string): Promise<void> {
    try {
      if (!parsedCommand.logIndex || !parsedCommand.newContent) {
        throw new ActivityLogError('編集に必要な情報が不足しています', 'INSUFFICIENT_EDIT_INFO');
      }

      // ログIDを取得
      const logs = await this.activityLogService.getLogsForEdit(userId, timezone);
      
      if (parsedCommand.logIndex < 1 || parsedCommand.logIndex > logs.length) {
        throw new ActivityLogError(`ログ番号が無効です。1〜${logs.length}の範囲で指定してください。`, 'INVALID_LOG_INDEX');
      }

      const targetLog = logs[parsedCommand.logIndex - 1];
      const oldContent = targetLog.content;

      // 編集リクエストを作成
      const editRequest: EditLogRequest = {
        logId: targetLog.id,
        newContent: parsedCommand.newContent,
        timezone
      };

      // ログを編集
      const updatedLog = await this.activityLogService.editLog(editRequest);

      // 成功メッセージを送信
      const successMessage = `✅ **ログを編集しました！**

**変更前:**
${oldContent}

**変更後:**
${updatedLog.content}

編集が完了しました。分析結果も更新されます。`;

      await message.reply(successMessage);
      
      console.log(`✏️ ログ編集完了: ${userId} ${targetLog.id}`);
    } catch (error) {
      console.error('❌ ログ編集エラー:', error);
      throw error instanceof ActivityLogError ? error :
        new ActivityLogError('ログの編集に失敗しました', 'EDIT_LOG_ERROR', { error });
    }
  }

  /**
   * ログを削除
   */
  private async deleteLog(message: Message, userId: string, parsedCommand: ParsedEditCommand, timezone: string): Promise<void> {
    try {
      if (!parsedCommand.logIndex) {
        throw new ActivityLogError('削除するログ番号が指定されていません', 'MISSING_DELETE_INDEX');
      }

      // ログIDを取得
      const logs = await this.activityLogService.getLogsForEdit(userId, timezone);
      
      if (parsedCommand.logIndex < 1 || parsedCommand.logIndex > logs.length) {
        throw new ActivityLogError(`ログ番号が無効です。1〜${logs.length}の範囲で指定してください。`, 'INVALID_DELETE_INDEX');
      }

      const targetLog = logs[parsedCommand.logIndex - 1];
      const deletedContent = targetLog.content;

      // 削除リクエストを作成
      const deleteRequest: DeleteLogRequest = {
        logId: targetLog.id,
        timezone
      };

      // ログを削除
      await this.activityLogService.deleteLog(deleteRequest);

      // 成功メッセージを送信
      const successMessage = `🗑️ **ログを削除しました！**

**削除されたログ:**
${deletedContent}

削除が完了しました。分析結果も更新されます。
※削除したログは復元できませんのでご注意ください。`;

      await message.reply(successMessage);
      
      console.log(`🗑️ ログ削除完了: ${userId} ${targetLog.id}`);
    } catch (error) {
      console.error('❌ ログ削除エラー:', error);
      throw error instanceof ActivityLogError ? error :
        new ActivityLogError('ログの削除に失敗しました', 'DELETE_LOG_ERROR', { error });
    }
  }

  /**
   * コマンドの使用方法を表示
   */
  async showHelp(message: Message): Promise<void> {
    const helpMessage = `📝 **活動ログ編集コマンド**

**基本的な使い方:**
\`!edit\` - 今日のログ一覧を表示（番号付き）
\`!edit <番号> <新しい内容>\` - ログを編集
\`!edit delete <番号>\` - ログを削除

**使用例:**
\`!edit\` → ログ一覧表示
\`!edit 3 会議に参加していました\` → 3番目のログを編集
\`!edit delete 5\` → 5番目のログを削除

**注意事項:**
• 今日のログのみ編集・削除できます
• 削除したログは復元できません
• 編集・削除後は分析結果も自動更新されます
• ログ番号は一覧表示時の番号を使用してください

**その他:**
\`!logs\` - 今日の生ログ一覧表示
\`!summary\` - 最新の分析結果表示`;

    await message.reply(helpMessage);
  }

  /**
   * 編集コマンドを解析
   */
  private parseEditCommand(args: string[]): ParsedEditCommand {
    // 引数がない場合は一覧表示
    if (args.length === 0) {
      return { type: 'list' };
    }

    const firstArg = args[0].toLowerCase();

    // ヘルプ表示
    if (firstArg === 'help' || firstArg === 'h' || firstArg === '?' || firstArg === 'ヘルプ') {
      return { type: 'help' };
    }

    // 削除コマンド
    if (firstArg === 'delete' || firstArg === 'del' || firstArg === 'd' || firstArg === '削除') {
      if (args.length < 2) {
        return { 
          type: 'delete', 
          error: '削除するログ番号を指定してください。例: `!edit delete 3`' 
        };
      }

      const logIndex = parseInt(args[1]);
      if (isNaN(logIndex) || logIndex < 1) {
        return { 
          type: 'delete', 
          error: '有効なログ番号を指定してください。例: `!edit delete 3`' 
        };
      }

      return { 
        type: 'delete', 
        logIndex 
      };
    }

    // 編集コマンド
    const logIndex = parseInt(firstArg);
    if (isNaN(logIndex) || logIndex < 1) {
      return { 
        type: 'edit', 
        error: '有効なログ番号を指定してください。例: `!edit 3 新しい内容`' 
      };
    }

    if (args.length < 2) {
      return { 
        type: 'edit', 
        error: '新しい内容を入力してください。例: `!edit 3 新しい内容`' 
      };
    }

    const newContent = args.slice(1).join(' ').trim();
    if (newContent.length === 0) {
      return { 
        type: 'edit', 
        error: '新しい内容が空です。内容を入力してください。' 
      };
    }

    if (newContent.length > 2000) {
      return { 
        type: 'edit', 
        error: '内容が長すぎます。2000文字以内で入力してください。' 
      };
    }

    return { 
      type: 'edit', 
      logIndex, 
      newContent 
    };
  }

  /**
   * 現在のログ数を取得（バリデーション用）
   */
  private async getCurrentLogCount(userId: string, timezone: string): Promise<number> {
    try {
      const logs = await this.activityLogService.getLogsForEdit(userId, timezone);
      return logs.length;
    } catch (error) {
      console.error('❌ ログ数取得エラー:', error);
      return 0;
    }
  }

  /**
   * 編集権限をチェック（将来の拡張用）
   */
  private async checkEditPermission(userId: string, logId: string): Promise<boolean> {
    // 現在は所有者のみ編集可能
    // 将来的にはより複雑な権限管理を実装可能
    try {
      const logs = await this.activityLogService.getLatestLogs(userId, 100);
      return logs.some(log => log.id === logId && log.userId === userId);
    } catch (error) {
      console.error('❌ 編集権限チェックエラー:', error);
      return false;
    }
  }

  /**
   * 編集履歴を記録（将来の拡張用）
   */
  private async recordEditHistory(userId: string, logId: string, oldContent: string, newContent: string): Promise<void> {
    // 将来的に編集履歴をトラッキングする場合の実装場所
    console.log(`📝 編集履歴: ${userId} ${logId} "${oldContent}" -> "${newContent}"`);
  }
}