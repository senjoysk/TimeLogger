/**
 * 🟢 Green Phase: ActivityLogFormattingService
 * フォーマット処理専門サービス - 最小限の実装でテストを通す
 */

import { toZonedTime, format } from 'date-fns-tz';
import { ActivityLog } from '../types/activityLog';

/**
 * 活動ログフォーマット専門サービス
 * 単一責任原則に従い、表示用フォーマット処理のみを担当
 */
export class ActivityLogFormattingService {

  /**
   * Discord用の編集ログ一覧文字列を生成
   * @param logs ActivityLog配列
   * @param timezone ユーザーのタイムゾーン
   * @returns フォーマットされた文字列
   */
  formatLogsForEdit(logs: ActivityLog[], timezone: string): string {
    if (logs.length === 0) {
      return '📝 今日の活動ログはまだありません。';
    }

    const formatted = logs.map((log, index) => {
      const inputTime = new Date(log.inputTimestamp);
      const localTime = toZonedTime(inputTime, timezone);
      const timeStr = format(localTime, 'HH:mm', { timeZone: timezone });
      
      // 内容を50文字で切り詰め
      const contentPreview = log.content.length > 50 
        ? log.content.substring(0, 47) + '...'
        : log.content;
      
      return `${index + 1}. [${timeStr}] ${contentPreview}`;
    }).join('\n');

    return `📝 **今日の活動ログ一覧:**\n\n${formatted}\n\n**使用方法:**\n\`!edit <番号> <新しい内容>\` - ログを編集\n\`!edit delete <番号>\` - ログを削除`;
  }

  /**
   * Discord用の検索結果文字列を生成
   * @param logs 検索結果のActivityLog配列
   * @param query 検索クエリ
   * @param timezone ユーザーのタイムゾーン
   * @returns フォーマットされた文字列
   */
  formatSearchResults(logs: ActivityLog[], query: string, timezone: string): string {
    if (logs.length === 0) {
      return `🔍 「${query}」に一致するログが見つかりませんでした。`;
    }

    const formatted = logs.slice(0, 10).map((log) => {
      const inputTime = new Date(log.inputTimestamp);
      const localTime = toZonedTime(inputTime, timezone);
      const timeStr = format(localTime, 'MM/dd HH:mm', { timeZone: timezone });
      
      // 内容を80文字で切り詰め
      const contentPreview = log.content.length > 80 
        ? log.content.substring(0, 77) + '...'
        : log.content;
      
      return `• [${timeStr}] ${contentPreview}`;
    }).join('\n');

    const moreText = logs.length > 10 ? `\n\n他 ${logs.length - 10} 件の結果があります。` : '';

    return `🔍 **「${query}」の検索結果:** ${logs.length}件\n\n${formatted}${moreText}`;
  }
}