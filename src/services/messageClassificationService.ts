/**
 * メッセージ分類サービス
 * AI判定によるメッセージの自動分類を担当
 */

import { MessageClassification, ClassificationResult } from '../types/todo';
import { IGeminiService } from './interfaces/IGeminiService';
import { logger } from '../utils/logger';

export interface IMessageClassificationService {
  /**
   * メッセージを分類
   */
  classifyMessage(message: string): Promise<ClassificationResult>;

  /**
   * ユーザーフィードバックによる分類精度改善
   */
  improveClassificationAccuracy(
    message: string, 
    actualClass: MessageClassification
  ): Promise<void>;

  /**
   * 分類信頼度の閾値を取得
   */
  getClassificationConfidenceThresholds(): Promise<{
    todo: number;
    activityLog: number;
    memo: number;
    uncertain: number;
  }>;
}

/**
 * メッセージ分類サービスの実装
 * Gemini AIを使用した自動分類
 */
export class MessageClassificationService implements IMessageClassificationService {
  private geminiService?: IGeminiService;

  constructor(geminiService?: IGeminiService) {
    this.geminiService = geminiService;
  }
  private readonly classificationPromptTemplate = `
以下のメッセージを分析して、以下の4つのカテゴリに分類してください：

1. **TODO**: 将来実行予定のタスク・作業
   - 例: "資料を作成する", "会議の準備をする", "〇〇を完了させる"
   
2. **ACTIVITY_LOG**: 削除済み（MessageSelectionHandlerで処理）
   - 例: "資料作成中", "会議に参加した", "〇〇を完了した"
   
3. **MEMO**: 参考情報・メモ
   - 例: "〇〇について調べた結果", "参考リンク", "アイデア"
   
4. **UNCERTAIN**: 判定が困難な場合

メッセージ: "{message}"

以下のJSON形式で回答してください：
{
  "classification": "TODO|MEMO|UNCERTAIN",
  "confidence": 0.85,
  "reason": "判定理由",
  "suggested_action": "推奨アクション（TODOの場合）",
  "priority": 0,
  "due_date_suggestion": null
}
`;

  // 分類信頼度の閾値
  private readonly confidenceThresholds = {
    todo: 0.7,
    activityLog: 0.7,
    memo: 0.5,
    uncertain: 0.3
  };

  /**
   * メッセージを分類
   */
  async classifyMessage(message: string): Promise<ClassificationResult> {
    try {
      // 空メッセージの処理
      if (!message.trim()) {
        return {
          classification: 'UNCERTAIN',
          confidence: 0,
          reason: 'メッセージが空です'
        };
      }

      // 極端に長いメッセージの処理
      if (message.length > 10000) {
        message = message.substring(0, 10000) + '...';
      }

      // パターンベースの事前判定
      const preClassification = this.preClassifyWithPatterns(message);
      if (preClassification) {
        return preClassification;
      }

      // AI分析を実行
      if (this.geminiService && this.geminiService.classifyMessageWithAI) {
        try {
          const aiResult = await this.geminiService.classifyMessageWithAI(message);
          logger.info('MESSAGE_CLASSIFIER', '🤖 Gemini AI分類結果:', { aiResult });
          return aiResult;
        } catch (error) {
          logger.warn('MESSAGE_CLASSIFIER', 'Gemini AI分類エラー、フォールバックを使用:', { error });
        }
      }
      
      // フォールバック: モック分析
      return this.mockAiClassification(message);
      
    } catch (error) {
      logger.error('MESSAGE_CLASSIFIER', 'メッセージ分類エラー:', error as Error);
      return {
        classification: 'UNCERTAIN',
        confidence: 0,
        reason: 'システムエラーが発生しました'
      };
    }
  }

  /**
   * パターンベースの事前分類
   */
  private preClassifyWithPatterns(message: string): ClassificationResult | null {
    const lowerMessage = message.toLowerCase();

    // TODO パターン
    const todoPatterns = [
      /する$/, /やる$/, /作成する/, /準備する/, /完了させる/,
      /までに/, /予定/, /する予定/, /しよう/, /するつもり/
    ];

    // ACTIVITY_LOG patterns removed
    const activityPatterns = [
      /した$/, /やった$/, /完了した/, /参加した/, /作成した/,
      /中$/, /している/, /していた/, /しました/
    ];

    // MEMO パターン
    const memoPatterns = [
      /参考/, /リンク/, /メモ/, /アイデア/, /調べた結果/,
      /について/, /〜とは/, /まとめ/
    ];

    // TODO判定
    if (todoPatterns.some(pattern => pattern.test(message))) {
      return {
        classification: 'TODO',
        confidence: 0.8,
        reason: 'TODO関連のキーワードが検出されました',
        suggestedAction: 'TODOリストに追加してタスク管理を開始',
        priority: this.extractPriority(message),
        dueDateSuggestion: this.extractDueDate(message)
      };
    }

    // ACTIVITY_LOG classification removed - now handled by MessageSelectionHandler

    // MEMO判定
    if (memoPatterns.some(pattern => pattern.test(message))) {
      return {
        classification: 'MEMO',
        confidence: 0.7,
        reason: 'メモ関連のキーワードが検出されました'
      };
    }

    return null;
  }

  /**
   * モックAI分類（後でGemini実装に置き換える）
   */
  private mockAiClassification(message: string): ClassificationResult {
    // 簡単なヒューリスティック分類
    const lowerMessage = message.toLowerCase();

    // 未来形・意図表現 → TODO
    if (/する|やる|つもり|予定|しよう/.test(message)) {
      return {
        classification: 'TODO',
        confidence: 0.75,
        reason: '将来の行動を示す表現が含まれています',
        suggestedAction: 'TODO登録を推奨します',
        priority: 0
      };
    }

    // Past tense expressions classification removed - now handled by MessageSelectionHandler

    // 情報・参考 → MEMO
    if (/参考|情報|メモ|リンク/.test(message)) {
      return {
        classification: 'MEMO',
        confidence: 0.6,
        reason: '参考情報やメモの特徴が含まれています'
      };
    }

    // その他 → UNCERTAIN
    return {
      classification: 'UNCERTAIN',
      confidence: 0.3,
      reason: '明確な分類パターンが見つかりませんでした'
    };
  }

  /**
   * 優先度を抽出
   */
  private extractPriority(message: string): number {
    if (/緊急|急ぎ|至急/.test(message)) return 1;
    if (/重要|大事/.test(message)) return 1;
    if (/後で|いつか/.test(message)) return -1;
    return 0;
  }

  /**
   * 期日を抽出
   */
  private extractDueDate(message: string): string | undefined {
    // 簡単な期日パターン認識
    if (/明日/.test(message)) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow.toISOString().split('T')[0];
    }
    
    if (/来週/.test(message)) {
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      return nextWeek.toISOString().split('T')[0];
    }

    return undefined;
  }

  /**
   * ユーザーフィードバックによる分類精度改善
   */
  async improveClassificationAccuracy(
    message: string, 
    actualClass: MessageClassification
  ): Promise<void> {
    // ALLOW_TODO: 機械学習による分類精度改善は将来の機能拡張として予定
    logger.info('MESSAGE_CLASSIFIER', `分類精度改善: "${message}" -> ${actualClass}`);
  }

  /**
   * 分類信頼度の閾値を取得
   */
  async getClassificationConfidenceThresholds(): Promise<{
    todo: number;
    activityLog: number;
    memo: number;
    uncertain: number;
  }> {
    return this.confidenceThresholds;
  }
}