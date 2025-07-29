/**
 * メッセージ分類サービス
 * ユーザーメッセージのAI分類処理を担当
 */

import { IGeminiApiClient } from './geminiApiClient';
import { ApiCostMonitor } from '../apiCostMonitor';
import { ClassificationResult, MessageClassification } from '../../types/todo';
import { ClassificationAIResponse } from '../../types/aiResponse';
import { withErrorHandling, ErrorType } from '../../utils/errorHandler';

/**
 * メッセージ分類サービスインターフェース
 */
export interface IMessageClassificationService {
  /**
   * メッセージをAIで分類
   * @param message ユーザーメッセージ
   * @returns 分類結果
   */
  classifyMessageWithAI(message: string): Promise<ClassificationResult>;
}

/**
 * MessageClassificationService の実装
 * 単一責任: メッセージのAI分類処理
 */
export class MessageClassificationService implements IMessageClassificationService {
  constructor(
    private geminiClient: IGeminiApiClient,
    private costMonitor: ApiCostMonitor
  ) {}

  /**
   * メッセージをAIで分類
   */
  async classifyMessageWithAI(message: string): Promise<ClassificationResult> {
    try {
      return await withErrorHandling(
        async () => {
          console.log(`🤖 メッセージ分類開始: "${message.substring(0, 50)}..."`);

          const prompt = this.buildClassificationPrompt(message);
          
          // プロンプトのログ出力
          console.log('📤 [Gemini API] 通常メッセージ分類プロンプト:');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log(prompt);
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          
          // Gemini API 呼び出し
          const result = await this.geminiClient.generateContent(prompt);
          const response = result.response;

          // トークン使用量を記録
          if (response.usageMetadata) {
            const { promptTokenCount, candidatesTokenCount } = response.usageMetadata;
            await this.costMonitor.recordApiCall('classifyMessage', promptTokenCount, candidatesTokenCount);
          }

          const responseText = response.text();
          
          // レスポンスのログ出力
          console.log('📥 [Gemini API] 通常メッセージ分類レスポンス:');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log(responseText);
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          
          const classification = this.parseClassificationResponse(responseText);
          
          console.log('✅ メッセージ分類完了:', classification);
          return classification;
        },
        ErrorType.API,
        { 
          operation: 'classifyMessage',
          messageLength: message.length,
          details: { message: message.substring(0, 100) }
        }
      );
    } catch (error) {
      // エラー時はフォールバック分類を返す
      console.log('🔄 フォールバック分類を実行');
      return this.fallbackClassification(message);
    }
  }

  /**
   * メッセージ分類用プロンプトを構築
   */
  private buildClassificationPrompt(message: string): string {
    return `
あなたは時間管理アシスタントです。ユーザーのメッセージを分析して、以下の分類のいずれかに分類してください。

分類カテゴリ:
1. "todo_creation" - 新しいタスクやTODOの作成依頼
2. "todo_inquiry" - 既存のTODOの確認・検索・状況確認
3. "memo" - メモや覚え書きの保存
4. "other" - その他のメッセージ

メッセージ: "${message}"

以下のJSON形式で回答してください:
{
  "classification": "分類カテゴリ",
  "confidence": 0.0〜1.0の信頼度,
  "priority": 1〜5の優先度(1=低, 5=高),
  "reasoning": "分類理由の説明"
}

回答は必ずJSONのみで、他のテキストは含めないでください。`;
  }

  /**
   * 分類レスポンスをパース
   */
  private parseClassificationResponse(response: string): ClassificationResult {
    try {
      // JSONブロックを抽出
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('JSONレスポンスが見つかりません');
      }

      const jsonText = jsonMatch[0];
      const parsed = JSON.parse(jsonText) as ClassificationAIResponse;

      // 分類の妥当性チェック
      const validClassifications: MessageClassification[] = [
        'TODO', 'MEMO', 'UNCERTAIN'
      ];
      
      if (!validClassifications.includes(parsed.classification)) {
        console.warn(`無効な分類: ${parsed.classification}, デフォルトを使用`);
        parsed.classification = 'UNCERTAIN';
      }

      // 信頼度の妥当性チェック
      const confidence = Math.max(0, Math.min(1, parseFloat(String(parsed.confidence)) || 0.5));
      
      // 優先度の妥当性チェック
      const priority = this.validatePriority(parsed.priority);

      return {
        classification: parsed.classification as MessageClassification,
        confidence,
        priority,
        reason: parsed.reasoning || '分類理由が提供されませんでした',
        analysis: parsed.analysis || parsed.reasoning || '分析結果が取得できませんでした'
      };

    } catch (error) {
      console.error('分類レスポンスのパースエラー:', error);
      console.log('元のレスポンス:', response);
      
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

  /**
   * フォールバック分類（エラー時）
   */
  private fallbackClassification(message: string): ClassificationResult {
    // 簡単なキーワードベース分類
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('todo') || lowerMessage.includes('タスク') || 
        lowerMessage.includes('やること') || lowerMessage.includes('作業')) {
      return {
        classification: 'TODO',
        confidence: 0.6,
        priority: 3,
        reason: 'キーワードベース分類（TODO）',
        analysis: 'TODOキーワードが検出されたため、タスク作成として分類しました'
      };
    }
    
    if (lowerMessage.includes('メモ') || lowerMessage.includes('覚え') || 
        lowerMessage.includes('記録')) {
      return {
        classification: 'MEMO',
        confidence: 0.7,
        priority: 2,
        reason: 'キーワードベース分類（メモ）',
        analysis: 'メモ関連キーワードが検出されたため、メモとして分類しました'
      };
    }

    // デフォルトは不明
    return {
      classification: 'UNCERTAIN',
      confidence: 0.4,
      priority: 2,
      reason: 'キーワードベース分類（デフォルト：不明）',
      analysis: '特定のキーワードが検出されなかったため、不明として分類しました'
    };
  }
}