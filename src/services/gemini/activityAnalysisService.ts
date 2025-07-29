/**
 * 活動分析サービス
 * 活動内容の詳細分析を担当
 */

import { IGeminiApiClient } from './geminiApiClient';
import { ApiCostMonitor } from '../apiCostMonitor';
import { ActivityAnalysisResult, ReminderContext } from '../../types/activityAnalysis';
import { ActivityAnalysisAIResponse } from '../../types/aiResponse';
import { AppError, ErrorType } from '../../utils/errorHandler';

/**
 * 活動分析サービスインターフェース
 */
export interface IActivityAnalysisService {
  /**
   * 活動内容を分析（リマインダーReply対応版）
   * @param message メッセージ
   * @param currentTime 現在時刻
   * @param timezone タイムゾーン
   * @param reminderContext リマインダーコンテキスト（オプション）
   * @returns 活動分析結果
   */
  analyzeActivityContent(
    message: string,
    currentTime: Date,
    timezone: string,
    reminderContext?: ReminderContext
  ): Promise<ActivityAnalysisResult>;

  /**
   * 活動を分析（下位互換用）
   * @param content 活動内容
   * @param userId ユーザーID
   * @param timezone タイムゾーン
   * @returns 活動分析結果
   */
  analyzeActivity(
    content: string,
    userId: string,
    timezone: string
  ): Promise<ActivityAnalysisResult>;
}

/**
 * ActivityAnalysisService の実装
 * 単一責任: 活動内容の詳細分析
 */
export class ActivityAnalysisService implements IActivityAnalysisService {
  constructor(
    private geminiClient: IGeminiApiClient,
    private costMonitor: ApiCostMonitor
  ) {}

  /**
   * 活動内容を分析（リマインダーReply対応版）
   */
  async analyzeActivityContent(
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
      const result = await this.geminiClient.generateContent(prompt);
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
   * 活動を分析（下位互換用）
   */
  async analyzeActivity(
    content: string,
    userId: string,
    timezone: string
  ): Promise<ActivityAnalysisResult> {
    // analyzeActivityContentメソッドに委譲
    return this.analyzeActivityContent(
      content,
      new Date(),
      timezone
    );
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
}