import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { config } from '../config';
import { IApiCostRepository } from '../repositories/interfaces';
import { ApiCostMonitor } from './apiCostMonitor';
import { toZonedTime, format } from 'date-fns-tz';
import { ClassificationResult, MessageClassification } from '../types/todo';
import { withErrorHandling, AppError, ErrorType } from '../utils/errorHandler';
import { ActivityAnalysisResult, ReminderContext } from '../types/activityAnalysis';
import { PreviousActivities } from '../types/database';
import { CostAlert } from '../types/costAlert';
import { ClassificationAIResponse, ActivityAnalysisAIResponse } from '../types/aiResponse';

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
  public async checkCostAlerts(userId: string, timezone: string): Promise<CostAlert | null> {
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

    // デフォルトは不明
    return {
      classification: 'UNCERTAIN',
      confidence: 0.4,
      priority: 2,
      reason: 'キーワードベース分類（デフォルト：不明）',
      analysis: '特定のキーワードが検出されなかったため、不明として分類しました'
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
    timeRange: { start: Date; end: Date },
    reminderTime?: Date,
    reminderContent?: string
  ): Promise<ClassificationResult & { contextType: 'REMINDER_REPLY' }> {
    const prompt = this.buildReminderContextPrompt(messageContent, timeRange, reminderTime, reminderContent);
    
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
  public buildReminderContextPrompt(
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
   * 活動内容を分析（リマインダーReply対応版）
   */
  public async analyzeActivityContent(
    message: string,
    currentTime: Date,
    timezone: string,
    reminderContext?: ReminderContext
  ): Promise<ActivityAnalysisResult> {
    const prompt = reminderContext?.isReminderReply
      ? this.buildReminderActivityAnalysisPrompt(message, currentTime, timezone, reminderContext)
      : this.buildGeneralActivityAnalysisPrompt(message, currentTime, timezone);
    
    // ログ出力
    const logTitle = reminderContext?.isReminderReply 
      ? 'リマインダーReply活動分析' 
      : '通常活動分析';
      
    console.log(`📤 [Gemini API] ${logTitle}プロンプト:`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(prompt);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    try {
      const result = await this.model.generateContent(prompt);
      const responseText = result.response.text();
      
      console.log(`📥 [Gemini API] ${logTitle}レスポンス:`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(responseText);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      // トークン使用量の記録
      if (result.response.usageMetadata) {
        const { promptTokenCount, candidatesTokenCount } = result.response.usageMetadata;
        await this.costMonitor.recordApiCall('analyzeActivity', promptTokenCount, candidatesTokenCount);
      }
      
      return this.parseActivityAnalysisResponse(responseText);
    } catch (error) {
      console.error('❌ 活動分析エラー:', error);
      throw new AppError(
        '活動分析に失敗しました',
        ErrorType.API,
        { error, message, reminderContext }
      );
    }
  }

  /**
   * リマインダーReply用の詳細プロンプト
   */
  private buildReminderActivityAnalysisPrompt(
    message: string,
    currentTime: Date,
    timezone: string,
    context: ReminderContext
  ): string {
    const startTime = context.timeRange!.start.toLocaleString('ja-JP', { timeZone: timezone });
    const endTime = context.timeRange!.end.toLocaleString('ja-JP', { timeZone: timezone });
    const reminderTime = context.reminderTime!.toLocaleString('ja-JP', { timeZone: timezone });
    
    return `
あなたは時間管理の専門家です。以下はリマインダーへの返信として報告された活動内容です。

【リマインダー情報】
- リマインダー送信時刻: ${reminderTime}
- 対象時間範囲: ${startTime} - ${endTime} (30分間)
- リマインダー内容: "${context.reminderContent || 'この30分、何してた？'}"

【ユーザーの返信】
"${message}"

【分析タスク】
1. 活動時間の確定
   - 時間範囲は上記の30分間として確定
   - メッセージ内に別の時間情報があれば補足として記録

2. 活動内容の抽出
   - 30分間で行った活動を具体的に抽出
   - 複数の活動がある場合は時間配分も推定

3. 活動の分類
   - 適切なカテゴリーに分類（開発、会議、調査、管理、休憩など）
   - 30分という時間枠での妥当性も評価

【出力形式】（JSON）
{
  "timeEstimation": {
    "startTime": "${context.timeRange!.start.toISOString()}",
    "endTime": "${context.timeRange!.end.toISOString()}",
    "duration": 30,
    "confidence": 1.0,
    "source": "reminder_reply"
  },
  "activityContent": {
    "mainActivity": "30分間のメイン活動の明確な説明",
    "subActivities": ["サブ活動1", "サブ活動2"],
    "structuredContent": "30分間の活動の構造化された詳細説明"
  },
  "activityCategory": {
    "primaryCategory": "開発|会議|調査|管理|休憩|その他",
    "subCategory": "より具体的なサブカテゴリー",
    "tags": ["関連タグ1", "関連タグ2"]
  },
  "analysisMetadata": {
    "confidence": 0.9,
    "reminderReplyContext": true,
    "warnings": ["警告がある場合のみ"]
  }
}

JSON形式のみで回答してください。説明文は不要です。`.trim();
  }

  /**
   * 通常メッセージ用のプロンプト
   */
  private buildGeneralActivityAnalysisPrompt(
    message: string,
    currentTime: Date,
    timezone: string
  ): string {
    const currentTimeStr = currentTime.toLocaleString('ja-JP', { timeZone: timezone });
    
    return `
あなたは時間管理の専門家です。以下のメッセージから活動情報を分析してください。

【現在時刻】
${currentTimeStr}

【ユーザーメッセージ】
"${message}"

【分析タスク】
1. 活動時間の推定
   - メッセージから時間情報を抽出（「午前中」「さっき」「2時間」「14:00-16:00」など）
   - 曖昧な表現も現在時刻を基準に具体的な時刻に変換
   - 開始時刻、終了時刻、継続時間を推定

2. 活動内容の抽出
   - 主要な活動を明確に抽出
   - 複数の活動がある場合は分離して特定
   - 構造化された説明文を生成

3. 活動の分類
   - 適切なカテゴリーに分類（開発、会議、調査、管理、休憩など）
   - サブカテゴリーも可能な限り特定
   - 関連するタグを抽出

【出力形式】（JSON）
{
  "timeEstimation": {
    "startTime": "ISO 8601形式（推定できない場合はnull）",
    "endTime": "ISO 8601形式（推定できない場合はnull）",
    "duration": 分単位の数値（推定できない場合はnull）,
    "confidence": 0.0-1.0の信頼度,
    "source": "ai_estimation"
  },
  "activityContent": {
    "mainActivity": "メインの活動内容の明確な説明",
    "subActivities": ["サブ活動1", "サブ活動2"],
    "structuredContent": "活動の構造化された詳細説明"
  },
  "activityCategory": {
    "primaryCategory": "開発|会議|調査|管理|休憩|その他",
    "subCategory": "より具体的なサブカテゴリー",
    "tags": ["関連タグ1", "関連タグ2"]
  },
  "analysisMetadata": {
    "confidence": 0.0-1.0,
    "reminderReplyContext": false,
    "warnings": ["推定が困難な場合の警告"]
  }
}

JSON形式のみで回答してください。説明文は不要です。`.trim();
  }

  /**
   * 活動分析レスポンスのパース
   */
  private parseActivityAnalysisResponse(response: string): ActivityAnalysisResult {
    try {
      // JSONブロックを抽出
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('JSONレスポンスが見つかりません');
      }

      const jsonText = jsonMatch[0];
      const parsed = JSON.parse(jsonText) as ActivityAnalysisAIResponse;

      // 必須フィールドの検証とデフォルト値設定
      return {
        timeEstimation: {
          startTime: parsed.timeEstimation?.startTime || undefined,
          endTime: parsed.timeEstimation?.endTime || undefined,
          duration: parsed.timeEstimation?.duration || undefined,
          confidence: Math.max(0, Math.min(1, parsed.timeEstimation?.confidence || 0.5)),
          source: (parsed.timeEstimation?.source || 'ai_estimation') as 'reminder_reply' | 'ai_estimation' | 'user_specified'
        },
        activityContent: {
          mainActivity: parsed.activityContent?.mainActivity || '活動内容を特定できませんでした',
          subActivities: parsed.activityContent?.subActivities || [],
          structuredContent: parsed.activityContent?.structuredContent || parsed.activityContent?.mainActivity || '詳細な分析を取得できませんでした'
        },
        activityCategory: {
          primaryCategory: parsed.activityCategory?.primaryCategory || 'その他',
          subCategory: parsed.activityCategory?.subCategory || undefined,
          tags: parsed.activityCategory?.tags || []
        },
        analysisMetadata: {
          confidence: Math.max(0, Math.min(1, parsed.analysisMetadata?.confidence || 0.5)),
          reminderReplyContext: parsed.analysisMetadata?.reminderReplyContext || false,
          warnings: parsed.analysisMetadata?.warnings || []
        }
      };

    } catch (error) {
      console.error('活動分析レスポンスのパースエラー:', error);
      console.log('元のレスポンス:', response);
      
      // パースエラー時はデフォルト値を返す
      return {
        timeEstimation: {
          confidence: 0.1,
          source: 'ai_estimation'
        },
        activityContent: {
          mainActivity: 'レスポンスの解析に失敗しました',
          subActivities: [],
          structuredContent: 'AI分析結果を取得できませんでした'
        },
        activityCategory: {
          primaryCategory: 'その他',
          tags: []
        },
        analysisMetadata: {
          confidence: 0.1,
          warnings: ['レスポンスの解析に失敗しました']
        }
      };
    }
  }

  /**
   * 活動を分析
   * @param content 活動内容
   * @param userId ユーザーID
   * @param timezone タイムゾーン
   * @param previousActivities 過去の活動データ（オプション）
   * @returns 活動分析結果
   */
  public async analyzeActivity(
    content: string,
    userId: string,
    timezone: string,
    previousActivities?: PreviousActivities
  ): Promise<ActivityAnalysisResult> {
    // analyzeActivityContentメソッドに委譲
    return this.analyzeActivityContent(
      content,
      new Date(),
      timezone
    );
  }
}