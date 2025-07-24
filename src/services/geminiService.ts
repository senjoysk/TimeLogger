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
          
          // プロンプトのログ出力
          console.log('📤 [Gemini API] 通常メッセージ分類プロンプト:');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log(prompt);
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          
          // Gemini API 呼び出し
          const result = await this.model.generateContent(prompt);
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

    // デフォルトは活動ログ
    return {
      classification: 'ACTIVITY_LOG',
      confidence: 0.6,
      priority: 2,
      reason: 'キーワードベース分類（デフォルト：活動ログ）',
      analysis: '特定のキーワードが検出されなかったため、活動ログとして分類しました'
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

  /**
   * リマインダーReplyメッセージを時間範囲付きで分析
   */
  public async classifyMessageWithReminderContext(
    messageContent: string,
    timeRange: { start: Date; end: Date }
  ): Promise<ClassificationResult & { contextType: 'REMINDER_REPLY' }> {
    const prompt = this.buildReminderContextPrompt(messageContent, timeRange);
    
    // プロンプトのログ出力
    console.log('📤 [Gemini API] リマインダーReply分析プロンプト:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(prompt);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    try {
      const result = await this.model.generateContent(prompt);
      const responseText = result.response.text();
      
      // レスポンスのログ出力
      console.log('📥 [Gemini API] リマインダーReply分析レスポンス:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(responseText);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      // トークン使用量の記録
      const inputTokens = this.estimateTokens(prompt);
      const outputTokens = this.estimateTokens(responseText);
      await this.costMonitor.recordApiCall('classifyMessage', inputTokens, outputTokens);
      
      // レスポンスをパース
      const analysis = this.parseClassificationResponse(responseText);
      
      return {
        ...analysis,
        contextType: 'REMINDER_REPLY',
        analysis: `${analysis.analysis} (時間範囲: ${this.formatTimeRange(timeRange)})`
      };
    } catch (error) {
      console.error('❌ リマインダーコンテキスト分析エラー:', error);
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
  public async classifyMessageWithNearbyReminderContext(
    messageContent: string,
    reminderTime: Date,
    timeDiff: number
  ): Promise<ClassificationResult & { contextType: 'POST_REMINDER' }> {
    const prompt = this.buildNearbyReminderContextPrompt(messageContent, reminderTime, timeDiff);
    
    // プロンプトのログ出力
    console.log('📤 [Gemini API] リマインダー直後メッセージ分析プロンプト:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(prompt);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    try {
      const result = await this.model.generateContent(prompt);
      const responseText = result.response.text();
      
      // レスポンスのログ出力
      console.log('📥 [Gemini API] リマインダー直後メッセージ分析レスポンス:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(responseText);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      // トークン使用量の記録
      const inputTokens = this.estimateTokens(prompt);
      const outputTokens = this.estimateTokens(responseText);
      await this.costMonitor.recordApiCall('classifyMessage', inputTokens, outputTokens);
      
      // レスポンスをパース
      const analysis = this.parseClassificationResponse(responseText);
      
      return {
        ...analysis,
        contextType: 'POST_REMINDER',
        analysis: `${analysis.analysis} (リマインダー${timeDiff}分後の投稿)`
      };
    } catch (error) {
      console.error('❌ リマインダー近接分析エラー:', error);
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
  public buildReminderContextPrompt(messageContent: string, timeRange: { start: Date; end: Date }): string {
    const startTime = timeRange.start.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
    const endTime = timeRange.end.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
    
    return `
このメッセージは${startTime}から${endTime}までの30分間の活動についてのリマインダーへの返信です。

ユーザーメッセージ: "${messageContent}"

この時間帯の活動内容として記録し、以下の形式で応答してください：

分類: ACTIVITY_LOG | TODO | MEMO | UNCERTAIN
信頼度: 0.0-1.0の数値
分析: 活動内容の詳細な説明（時間範囲を考慮して解釈）

リマインダーへの返信であることを踏まえ、指定された時間範囲での活動として解釈してください。
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

分類: ACTIVITY_LOG | TODO | MEMO | UNCERTAIN
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