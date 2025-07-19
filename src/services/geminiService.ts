import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { config } from '../config';
import { IApiCostRepository } from '../repositories/interfaces';
import { ApiCostMonitor } from './apiCostMonitor';
import { toZonedTime, format } from 'date-fns-tz';
import { ClassificationResult, MessageClassification } from '../types/todo';
import { withErrorHandling, AppError, ErrorType } from '../utils/errorHandler';

/**
 * Google Gemini API サービスクラス
 * 活動記録の解析とサマリー生成を行う
 */
export class GeminiService {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;
  private costMonitor: ApiCostMonitor;

  constructor(costRepository: IApiCostRepository) {
    // Gemini API の初期化
    this.genAI = new GoogleGenerativeAI(config.gemini.apiKey);
    this.model = this.genAI.getGenerativeModel({ 
      model: config.gemini.model,
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024,
      },
    });

    // コスト監視の初期化
    this.costMonitor = new ApiCostMonitor(costRepository);
    
    console.log('✅ GeminiService が初期化されました');
  }

  /**
   * API使用量統計を取得
   */
  public async getCostStats() {
    return await this.costMonitor.getTodayStats();
  }

  /**
   * 日次コストレポートを取得
   */
  public async getDailyCostReport(userId: string, timezone: string): Promise<string> {
    return await this.costMonitor.generateDailyReport(timezone);
  }

  /**
   * コスト警告をチェック
   */
  public async checkCostAlerts(userId: string, timezone: string) {
    return await this.costMonitor.checkCostAlerts(timezone);
  }

  /**
   * メッセージをAIで分類
   * @param message ユーザーメッセージ
   * @returns 分類結果
   */
  public async classifyMessageWithAI(message: string): Promise<ClassificationResult> {
    try {
      return await withErrorHandling(
        async () => {
          console.log(`🤖 メッセージ分類開始: "${message.substring(0, 50)}..."`);

          const prompt = this.buildClassificationPrompt(message);
          
          // Gemini API 呼び出し
          const result = await this.model.generateContent(prompt);
          const response = result.response;

          // トークン使用量を記録
          if (response.usageMetadata) {
            const { promptTokenCount, candidatesTokenCount } = response.usageMetadata;
            await this.costMonitor.recordApiCall('classifyMessage', promptTokenCount, candidatesTokenCount);
          }

          const responseText = response.text();
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
1. "activity_log" - 過去の活動や作業の記録・報告
2. "todo_creation" - 新しいタスクやTODOの作成依頼
3. "todo_inquiry" - 既存のTODOの確認・検索・状況確認
4. "gap_report" - 作業の隙間時間や休憩時間の報告
5. "other" - その他のメッセージ

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
      const parsed = JSON.parse(jsonText);

      // 分類の妥当性チェック
      const validClassifications: MessageClassification[] = [
        'TODO', 'ACTIVITY_LOG', 'MEMO', 'UNCERTAIN'
      ];
      
      if (!validClassifications.includes(parsed.classification)) {
        console.warn(`無効な分類: ${parsed.classification}, デフォルトを使用`);
        parsed.classification = 'UNCERTAIN';
      }

      // 信頼度の妥当性チェック
      const confidence = Math.max(0, Math.min(1, parseFloat(parsed.confidence) || 0.5));
      
      // 優先度の妥当性チェック
      const priority = this.validatePriority(parsed.priority);

      return {
        classification: parsed.classification as MessageClassification,
        confidence,
        priority,
        reason: parsed.reasoning || '分類理由が提供されませんでした'
      };

    } catch (error) {
      console.error('分類レスポンスのパースエラー:', error);
      console.log('元のレスポンス:', response);
      
      // パースエラー時はデフォルト値を返す
      return {
        classification: 'UNCERTAIN',
        confidence: 0.3,
        priority: 2,
        reason: 'レスポンスの解析に失敗したため、デフォルト分類を適用'
      };
    }
  }

  /**
   * 優先度の妥当性をチェック
   */
  private validatePriority(priority: any): number {
    const p = parseInt(priority);
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
        reason: 'キーワードベース分類（TODO）'
      };
    }
    
    if (lowerMessage.includes('メモ') || lowerMessage.includes('覚え') || 
        lowerMessage.includes('記録')) {
      return {
        classification: 'MEMO',
        confidence: 0.7,
        priority: 2,
        reason: 'キーワードベース分類（メモ）'
      };
    }

    // デフォルトは活動ログ
    return {
      classification: 'ACTIVITY_LOG',
      confidence: 0.6,
      priority: 2,
      reason: 'キーワードベース分類（デフォルト：活動ログ）'
    };
  }

  /**
   * テキストのトークン数を推定（概算）
   */
  private estimateTokens(text: string): number {
    // 大まかな推定：日本語は1文字約1.5トークン、英語は4文字約1トークン
    const japaneseChars = (text.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g) || []).length;
    const otherChars = text.length - japaneseChars;
    return Math.ceil(japaneseChars * 1.5 + otherChars / 4);
  }

  // 以下は互換性のための古いメソッドスタブ（deprecated）
  /**
   * @deprecated このメソッドは廃止予定です
   */
  public async analyzeActivity(
    userInput: string,
    timeSlot: string,
    previousActivities: any[] = [],
    timezone: string
  ): Promise<any> {
    console.warn('❌ analyzeActivity method is deprecated and should not be used');
    throw new Error('Method analyzeActivity is deprecated');
  }
}