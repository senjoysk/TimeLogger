/**
 * Gemini APIレスポンス処理サービス
 * レスポンスのバリデーションと正規化を担当
 */

import { ClassificationResult } from '../../types/todo';

/**
 * Gemini APIレスポンス処理サービスインターフェース
 */
export interface IGeminiResponseProcessor {
  /**
   * レスポンスをバリデーションして正規化
   * @param response レスポンス文字列
   * @returns 正規化された分類結果
   */
  validateAndNormalizeResponse(response: string): ClassificationResult;
}

/**
 * GeminiResponseProcessor の実装
 * 単一責任: APIレスポンスのバリデーションと正規化
 */
export class GeminiResponseProcessor implements IGeminiResponseProcessor {
  /**
   * レスポンスをバリデーションして正規化
   */
  public validateAndNormalizeResponse(response: string): ClassificationResult {
    try {
      // JSONブロックを抽出
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('JSONレスポンスが見つかりません');
      }

      const jsonText = jsonMatch[0];
      // JSON.parseの結果は動的な型のため、unknownとして扱う
      const parsed = JSON.parse(jsonText) as unknown;

      // Record型として扱って型安全にアクセス
      const data = parsed as Record<string, unknown>;

      // バリデーションと正規化
      const classification = this.validateClassification(data.classification);
      const confidence = this.validateConfidence(data.confidence);
      const priority = this.validatePriority(data.priority);
      const reason = String(data.reasoning || data.reason || '分類理由が提供されませんでした');
      const analysis = String(data.analysis || data.reasoning || '分析結果が取得できませんでした');

      return {
        classification,
        confidence,
        priority,
        reason,
        analysis
      };

    } catch (error) {
      console.error('レスポンス処理エラー:', error);
      console.log('元のレスポンス:', response);
      
      // エラー時はデフォルト値を返す
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
   * 分類をバリデーション
   */
  private validateClassification(classification: unknown): 'TODO' | 'MEMO' | 'UNCERTAIN' {
    const validClassifications = ['TODO', 'MEMO', 'UNCERTAIN'];
    const classStr = String(classification).toUpperCase();
    
    return validClassifications.includes(classStr) 
      ? classStr as 'TODO' | 'MEMO' | 'UNCERTAIN'
      : 'UNCERTAIN';
  }

  /**
   * 信頼度をバリデーション
   */
  private validateConfidence(confidence: unknown): number {
    const conf = parseFloat(String(confidence));
    return isNaN(conf) ? 0.5 : Math.max(0, Math.min(1, conf));
  }

  /**
   * 優先度をバリデーション
   */
  private validatePriority(priority: unknown): number {
    const prio = parseInt(String(priority), 10);
    return (isNaN(prio) || prio < 1 || prio > 5) ? 3 : prio;
  }
}