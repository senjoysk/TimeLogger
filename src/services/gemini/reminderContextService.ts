/**
 * リマインダーコンテキストサービス
 * リマインダー関連の特殊な文脈処理を担当
 */

import { IGeminiApiClient } from './geminiApiClient';
import { ApiCostMonitor } from '../apiCostMonitor';
import { ClassificationResult } from '../../types/todo';
import { AppError, ErrorType } from '../../utils/errorHandler';
import { logger } from '../../utils/logger';

/**
 * リマインダーコンテキストサービスインターフェース
 */
export interface IReminderContextService {
  /**
   * リマインダーReplyメッセージを時間範囲付きで分析
   * @param messageContent メッセージ内容
   * @param timeRange 時間範囲
   * @param reminderTime リマインダー時刻（オプション）
   * @param reminderContent リマインダー内容（オプション）
   * @returns 分析結果
   */
  classifyMessageWithReminderContext(
    messageContent: string,
    timeRange: { start: Date; end: Date },
    reminderTime?: Date,
    reminderContent?: string
  ): Promise<ClassificationResult & { contextType: 'REMINDER_REPLY' }>;

  /**
   * リマインダー直後メッセージを文脈考慮で分析
   * @param messageContent メッセージ内容
   * @param reminderTime リマインダー時刻
   * @param timeDiff 時間差（分）
   * @returns 分析結果
   */
  classifyMessageWithNearbyReminderContext(
    messageContent: string,
    reminderTime: Date,
    timeDiff: number
  ): Promise<ClassificationResult & { contextType: 'POST_REMINDER' }>;

  /**
   * リマインダーReply用のプロンプトを構築
   * @param messageContent メッセージ内容
   * @param timeRange 時間範囲
   * @param reminderTime リマインダー時刻（オプション）
   * @param reminderContent リマインダー内容（オプション）
   * @returns 構築されたプロンプト
   */
  buildReminderContextPrompt(
    messageContent: string,
    timeRange: { start: Date; end: Date },
    reminderTime?: Date,
    reminderContent?: string
  ): string;
}

/**
 * ReminderContextService の実装
 * 単一責任: リマインダー関連の特殊な文脈処理
 */
export class ReminderContextService implements IReminderContextService {
  constructor(
    private geminiClient: IGeminiApiClient,
    private costMonitor: ApiCostMonitor
  ) {}

  /**
   * リマインダーReplyメッセージを時間範囲付きで分析
   */
  async classifyMessageWithReminderContext(
    messageContent: string,
    timeRange: { start: Date; end: Date },
    reminderTime?: Date,
    reminderContent?: string
  ): Promise<ClassificationResult & { contextType: 'REMINDER_REPLY' }> {
    const prompt = this.buildReminderContextPrompt(messageContent, timeRange, reminderTime, reminderContent);
    
    // プロンプトのログ出力
    logger.debug('REMINDER_CONTEXT', '📤 [Gemini API] リマインダーReply分析プロンプト:');
    logger.debug('REMINDER_CONTEXT', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.debug('REMINDER_CONTEXT', prompt);
    logger.debug('REMINDER_CONTEXT', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    try {
      const result = await this.geminiClient.generateContent(prompt);
      const responseText = result.response.text();
      
      // レスポンスのログ出力
      logger.debug('REMINDER_CONTEXT', '📥 [Gemini API] リマインダーReply分析レスポンス:');
      logger.debug('REMINDER_CONTEXT', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      logger.debug('REMINDER_CONTEXT', responseText);
      logger.debug('REMINDER_CONTEXT', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      // トークン使用量の記録
      const inputTokens = this.geminiClient.estimateTokens(prompt);
      const outputTokens = this.geminiClient.estimateTokens(responseText);
      await this.costMonitor.recordApiCall('classifyMessage', inputTokens, outputTokens);
      
      // レスポンスをパース
      const analysis = this.parseClassificationResponse(responseText);
      
      return {
        ...analysis,
        contextType: 'REMINDER_REPLY',
        analysis: `${analysis.analysis} (時間範囲: ${this.formatTimeRange(timeRange)})`
      };
    } catch (error) {
      logger.error('REMINDER_CONTEXT', '❌ リマインダーコンテキスト分析エラー:', error as Error);
      throw new AppError(
        'リマインダーコンテキスト分析に失敗しました',
        ErrorType.API,
        { error, messageContent, timeRange }
      );
    }
  }

  /**
   * リマインダー直後メッセージを文脈考慮で分析
   */
  async classifyMessageWithNearbyReminderContext(
    messageContent: string,
    reminderTime: Date,
    timeDiff: number
  ): Promise<ClassificationResult & { contextType: 'POST_REMINDER' }> {
    const prompt = this.buildNearbyReminderContextPrompt(messageContent, reminderTime, timeDiff);
    
    // プロンプトのログ出力
    logger.debug('REMINDER_CONTEXT', '📤 [Gemini API] リマインダー直後メッセージ分析プロンプト:');
    logger.debug('REMINDER_CONTEXT', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.debug('REMINDER_CONTEXT', prompt);
    logger.debug('REMINDER_CONTEXT', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    try {
      const result = await this.geminiClient.generateContent(prompt);
      const responseText = result.response.text();
      
      // レスポンスのログ出力
      logger.debug('REMINDER_CONTEXT', '📥 [Gemini API] リマインダー直後メッセージ分析レスポンス:');
      logger.debug('REMINDER_CONTEXT', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      logger.debug('REMINDER_CONTEXT', responseText);
      logger.debug('REMINDER_CONTEXT', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      // トークン使用量の記録
      const inputTokens = this.geminiClient.estimateTokens(prompt);
      const outputTokens = this.geminiClient.estimateTokens(responseText);
      await this.costMonitor.recordApiCall('classifyMessage', inputTokens, outputTokens);
      
      // レスポンスをパース
      const analysis = this.parseClassificationResponse(responseText);
      
      return {
        ...analysis,
        contextType: 'POST_REMINDER',
        analysis: `${analysis.analysis} (リマインダー${timeDiff}分後の投稿)`
      };
    } catch (error) {
      logger.error('REMINDER_CONTEXT', '❌ リマインダー近接分析エラー:', error as Error);
      throw new AppError(
        'リマインダー近接分析に失敗しました',
        ErrorType.API,
        { error, messageContent, reminderTime, timeDiff }
      );
    }
  }

  /**
   * リマインダーReply用のプロンプトを構築
   */
  buildReminderContextPrompt(
    messageContent: string, 
    timeRange: { start: Date; end: Date },
    reminderTime?: Date,
    reminderContent?: string
  ): string {
    const startTimeStr = timeRange.start.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
    const endTimeStr = timeRange.end.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
    const reminderTimeStr = reminderTime ? reminderTime.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '';
    
    return `
あなたは時間管理アシスタントです。以下は30分間隔のリマインダーへの返信です。

【リマインダー情報】
- リマインダー送信時刻: ${reminderTimeStr}
- 対象時間範囲: ${startTimeStr} - ${endTimeStr} (30分間)
- リマインダーメッセージ: "${reminderContent || 'この30分、何してた？'}"

【ユーザーの返信】
"${messageContent}"

【分析指示】
1. この返信は上記30分間の活動についての報告として解釈してください
2. 時間範囲を明確に意識した活動内容の分析を行ってください
3. リマインダーへの返信という文脈を考慮してください

【出力形式】（JSON形式）
{
  "classification": "TODO|MEMO|UNCERTAIN",
  "confidence": 0.0-1.0の信頼度,
  "priority": 1-5の優先度,
  "reasoning": "分類理由",
  "analysis": "活動内容の詳細分析（時間範囲と文脈を明記）",
  "timeContextAnalysis": "時間範囲との関連性分析",
  "reminderResponseQuality": "リマインダーへの返信としての適切性評価"
}

JSON形式のみで回答してください。
    `.trim();
  }

  /**
   * リマインダー近接メッセージ用のプロンプトを構築
   */
  private buildNearbyReminderContextPrompt(messageContent: string, reminderTime: Date, timeDiff: number): string {
    const reminderTimeStr = reminderTime.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
    const targetStart = new Date(reminderTime.getTime() - 30 * 60 * 1000);
    const targetStartStr = targetStart.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
    
    return `
このメッセージは${reminderTimeStr}のリマインダー直後（${timeDiff}分後）の投稿です。
リマインダーの対象時間帯: ${targetStartStr} - ${reminderTimeStr}

ユーザーメッセージ: "${messageContent}"

文脈から、この投稿がリマインダー対象時間帯の活動について言及している可能性を考慮して分析してください。

分類: TODO | MEMO | UNCERTAIN
信頼度: 0.0-1.0の数値
分析: 活動内容の詳細な説明（時間的文脈を考慮）

リマインダー直後の投稿であることを踏まえ、過去の活動への言及である可能性を検討してください。
    `.trim();
  }

  /**
   * 時間範囲をユーザー向けにフォーマット
   */
  private formatTimeRange(timeRange: { start: Date; end: Date }): string {
    const startTime = timeRange.start.toLocaleString('ja-JP', { 
      timeZone: 'Asia/Tokyo',
      hour: '2-digit',
      minute: '2-digit'
    });
    const endTime = timeRange.end.toLocaleString('ja-JP', { 
      timeZone: 'Asia/Tokyo',
      hour: '2-digit',
      minute: '2-digit'
    });
    return `${startTime}-${endTime}`;
  }

  /**
   * 分類レスポンスをパース（共通処理）
   */
  private parseClassificationResponse(response: string): ClassificationResult {
    try {
      // JSONブロックを抽出
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('JSONレスポンスが見つかりません');
      }

      const jsonText = jsonMatch[0];
      const parsed = JSON.parse(jsonText);

      return {
        classification: parsed.classification || 'UNCERTAIN',
        confidence: Math.max(0, Math.min(1, parseFloat(String(parsed.confidence)) || 0.5)),
        priority: this.validatePriority(parsed.priority),
        reason: parsed.reasoning || '分類理由が提供されませんでした',
        analysis: parsed.analysis || parsed.reasoning || '分析結果が取得できませんでした'
      };

    } catch (error) {
      logger.error('REMINDER_CONTEXT', '分類レスポンスのパースエラー:', error as Error);
      logger.debug('REMINDER_CONTEXT', '元のレスポンス:', { response });
      
      // パースエラー時はデフォルト値を返す
      return {
        classification: 'UNCERTAIN',
        confidence: 0.3,
        priority: 2,
        reason: 'レスポンスの解析に失敗したため、デフォルト分類を適用',
        analysis: 'レスポンスの解析に失敗したため、分析結果を取得できませんでした'
      };
    }
  }

  /**
   * 優先度の妥当性をチェック
   */
  private validatePriority(priority: unknown): number {
    const p = parseInt(String(priority), 10);
    return (p >= 1 && p <= 5) ? p : 3; // デフォルトは中優先度
  }
}