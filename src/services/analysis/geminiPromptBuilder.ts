/**
 * Gemini プロンプトビルダー
 * 統合分析・チャンク分析用のプロンプト構築を担当
 */

import { toZonedTime, format } from 'date-fns-tz';
import { ActivityLog } from '../../types/activityLog';

/**
 * プロンプトビルダーインターフェース
 */
export interface IGeminiPromptBuilder {
  /**
   * 統合分析用プロンプトを構築
   * @param logs 活動ログ
   * @param timezone タイムゾーン
   * @param businessDate 業務日
   * @returns 構築されたプロンプト
   */
  buildUnifiedPrompt(logs: ActivityLog[], timezone: string, businessDate: string): string;

  /**
   * チャンク分析用プロンプトを構築
   * @param logs 活動ログ
   * @param timezone タイムゾーン
   * @param timeRange 時間範囲
   * @param businessDate 業務日
   * @returns 構築されたプロンプト
   */
  buildChunkPrompt(logs: ActivityLog[], timezone: string, timeRange: string, businessDate: string): string;
}

/**
 * GeminiPromptBuilder の実装
 * 単一責任: プロンプト構築とタイムゾーン変換例生成
 */
export class GeminiPromptBuilder implements IGeminiPromptBuilder {
  /**
   * 統合分析用プロンプトを構築
   */
  buildUnifiedPrompt(logs: ActivityLog[], timezone: string, businessDate: string): string {
    // 現在時刻の情報
    const now = new Date();
    const zonedNow = toZonedTime(now, timezone);
    const localTimeDisplay = format(zonedNow, 'yyyy-MM-dd HH:mm:ss zzz', { timeZone: timezone });

    // ログを時系列順にソート
    const sortedLogs = [...logs].sort((a, b) => 
      new Date(a.inputTimestamp).getTime() - new Date(b.inputTimestamp).getTime()
    );

    // ログリストを構築
    const logList = this.buildLogList(sortedLogs, timezone);

    // タイムゾーンに基づくUTC変換例を計算
    const tzExamples = this.getTimezoneConversionExamples(timezone, businessDate);

    return `
あなたは時間管理とタスク解析の専門家です。
ユーザーの1日の活動ログを統合的に分析し、正確な時間配分とタイムラインを生成してください。

【分析日時情報】
業務日: ${businessDate}
現在時刻: ${localTimeDisplay}
ユーザータイムゾーン: ${timezone}
対象ログ数: ${logs.length}件

【活動ログ一覧】（投稿時刻順）
${logList}

【極めて重要な時刻処理ルール】
1. **ログ内の時刻は全て ${timezone} タイムゾーンの時刻です**
2. **ログ内に記載された時刻（例: 10:20-10:50）は絶対に変更しないでください**
3. **出力時はこれらの時刻をUTCに正確に変換してください**
   ${tzExamples}
4. **投稿時刻は参考情報です。活動の実際の時刻はログ内容に記載された時刻です**
5. **必ず上記の変換例に従って、${timezone}の時刻をUTCに変換してください**

【重要な分析指針】
1. **時間解釈の精度**：
   - 「14:00-15:30は会議」→明確な時間範囲として解釈
   - 「いま30分休憩していた」→投稿時刻から30分前〜投稿時刻
   - 「午前中ずっとプログラミング」→9:00-12:00頃と推定
   - 「さっき〇〇した」→投稿時刻の直近30分〜1時間前と推定

2. **重複・矛盾の検出**：
   - 同じ時間帯に複数の活動が記録されている場合を検出
   - 明らかに矛盾する時間記録を警告

3. **未記録時間の推定**：
   - 記録されていない時間帯を特定
   - 通常の勤務時間（9:00-18:00）との比較

4. **信頼度評価**：
   - 明示的時刻（例：14:00-15:30）→高信頼度
   - 相対時刻（例：いま30分）→中信頼度  
   - 曖昧表現（例：午前中）→低信頼度

${this.getOutputFormatTemplate()}

必ずJSON形式のみで回答してください。説明文は不要です。
`;
  }

  /**
   * チャンク分析用プロンプトを構築
   */
  buildChunkPrompt(logs: ActivityLog[], timezone: string, timeRange: string, businessDate: string): string {
    const logList = this.buildLogList(logs, timezone);

    // タイムゾーンに基づくUTC変換例を計算
    const tzExamples = this.getTimezoneConversionExamples(timezone, businessDate);

    return `
${timeRange}の活動ログを分析してください。

【対象時間帯】: ${timeRange}
【業務日】: ${businessDate} 
【ユーザータイムゾーン】: ${timezone}
【ログ一覧】:
${logList}

【極めて重要な時刻処理ルール】
1. **ログ内の時刻は全て ${timezone} タイムゾーンの時刻です**
2. **ログ内に記載された時刻は絶対に変更しないでください**
3. **出力時はこれらの時刻をUTCに正確に変換してください**
   ${tzExamples}
4. **必ず上記の変換例に従って、${timezone}の時刻をUTCに変換してください**

この時間帯の活動を分析し、カテゴリ分類とタイムラインを生成してください。
出力形式は統合分析と同じJSON形式です。
`;
  }

  /**
   * ログリストを構築
   */
  private buildLogList(logs: ActivityLog[], timezone: string): string {
    return logs.map((log, index) => {
      const inputTime = new Date(log.inputTimestamp);
      const localTime = toZonedTime(inputTime, timezone);
      const timeStr = format(localTime, 'HH:mm', { timeZone: timezone });
      
      return `${index + 1}. [${timeStr}投稿] ${log.content}`;
    }).join('\n');
  }

  /**
   * 出力フォーマットテンプレートを取得
   */
  private getOutputFormatTemplate(): string {
    return `
【出力形式】（必ずJSON形式で回答してください）
{
  "categories": [
    {
      "category": "カテゴリ名",
      "subCategory": "サブカテゴリ名",
      "estimatedMinutes": 推定時間（分）,
      "confidence": 信頼度（0-1）,
      "logCount": 関連ログ数,
      "representativeActivities": ["代表的な活動1", "代表的な活動2"]
    }
  ],
  "timeline": [
    {
      "startTime": "開始時刻（ISO 8601形式、UTC）",
      "endTime": "終了時刻（ISO 8601形式、UTC）", 
      "category": "カテゴリ名",
      "subCategory": "サブカテゴリ名",
      "content": "活動内容",
      "confidence": 時間推定信頼度（0-1）,
      "sourceLogIds": ["元ログのID1", "元ログのID2"]
    }
  ],
  "timeDistribution": {
    "totalEstimatedMinutes": 総推定時間,
    "workingMinutes": 作業時間,
    "breakMinutes": 休憩時間,
    "unaccountedMinutes": 未記録時間,
    "overlapMinutes": 重複時間
  },
  "insights": {
    "productivityScore": 生産性スコア（0-100）,
    "workBalance": {
      "focusTimeRatio": 集中作業時間割合,
      "meetingTimeRatio": 会議時間割合,
      "breakTimeRatio": 休憩時間割合,
      "adminTimeRatio": 管理業務時間割合
    },
    "suggestions": ["改善提案1", "改善提案2"],
    "highlights": ["今日のハイライト1", "今日のハイライト2"],
    "motivation": "明日への励ましメッセージ"
  },
  "warnings": [
    {
      "type": "警告タイプ（time_overlap/time_gap/inconsistent_input等）",
      "level": "警告レベル（info/warning/error）",
      "message": "警告メッセージ",
      "details": {
        "affectedTimeRange": "影響を受ける時間範囲",
        "suggestions": ["対処提案1", "対処提案2"],
        "otherDetails": "その他の詳細情報"
      }
    }
  ],
  "confidence": 全体分析信頼度（0-1）
}`;
  }

  /**
   * タイムゾーン変換例を生成
   */
  private getTimezoneConversionExamples(timezone: string, businessDate: string): string {
    // 業務日の代表的な時刻での変換例を生成
    const exampleTimes = ['09:00', '10:20', '12:00', '14:30', '17:00'];
    const examples = exampleTimes.map(localTime => {
      // ローカル時刻をDateオブジェクトに変換
      const localDateTime = new Date(`${businessDate}T${localTime}:00`);
      // タイムゾーンを考慮してUTCに変換
      const utcTime = toZonedTime(localDateTime, 'UTC');
      const localInTz = toZonedTime(localDateTime, timezone);
      
      // タイムゾーンオフセットを計算
      const offset = (localInTz.getTime() - utcTime.getTime()) / (1000 * 60 * 60);
      
      // UTC時刻を計算（ローカル時刻からオフセットを引く）
      const [hours, minutes] = localTime.split(':').map(Number);
      let utcHours = hours - Math.floor(offset);
      let utcMinutes = minutes - (offset % 1) * 60;
      
      // 分の調整
      if (utcMinutes < 0) {
        utcMinutes += 60;
        utcHours -= 1;
      } else if (utcMinutes >= 60) {
        utcMinutes -= 60;
        utcHours += 1;
      }
      
      // 時間の調整（24時間形式）
      if (utcHours < 0) {
        utcHours += 24;
      } else if (utcHours >= 24) {
        utcHours -= 24;
      }
      
      const utcTimeStr = `${String(utcHours).padStart(2, '0')}:${String(Math.round(utcMinutes)).padStart(2, '0')}`;
      return `   - ${timezone}の${localTime} → UTC ${utcTimeStr}`;
    }).join('\n');
    
    return examples;
  }
}