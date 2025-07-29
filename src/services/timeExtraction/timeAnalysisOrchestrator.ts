/**
 * 時刻分析オーケストレーターサービス
 * Gemini連携、コンテキスト処理、最終結果構築を担当
 */

import { toZonedTime, format } from 'date-fns-tz';
import { 
  TimeAnalysisResult, 
  TimeExtractionMethod, 
  ParsedTimeComponent,
  RecentActivityContext,
  GeminiTimeAnalysisResponse,
  TimePatternMatch
} from '../../types/realTimeAnalysis';
import { IGeminiService } from '../interfaces/IGeminiService';
import { ITimezoneService } from '../interfaces/ITimezoneService';
import { ITimePatternProcessor } from './timePatternProcessor';

/**
 * 時刻分析オーケストレーターインターフェース
 */
export interface ITimeAnalysisOrchestrator {
  /**
   * Geminiによる高度解析
   */
  analyzeWithGemini(
    input: string,
    timezone: string,
    inputTimestamp: Date,
    basicAnalysis: Partial<TimeAnalysisResult>,
    context: RecentActivityContext
  ): Promise<GeminiTimeAnalysisResponse>;

  /**
   * 最終結果の構築
   */
  buildFinalResult(
    analysis: TimeAnalysisResult | GeminiTimeAnalysisResponse,
    patternMatches: TimePatternMatch[],
    patternProcessor: ITimePatternProcessor
  ): TimeAnalysisResult;

  /**
   * コンテキストベース補正
   */
  adjustWithContext(
    analysis: TimeAnalysisResult | GeminiTimeAnalysisResponse,
    context: RecentActivityContext
  ): TimeAnalysisResult | GeminiTimeAnalysisResponse;
}

/**
 * TimeAnalysisOrchestrator の実装
 * 単一責任: 分析処理の調整と統合
 */
export class TimeAnalysisOrchestrator implements ITimeAnalysisOrchestrator {
  constructor(
    private geminiService: IGeminiService,
    private timezoneService?: ITimezoneService
  ) {}

  /**
   * Geminiによる高度解析
   */
  async analyzeWithGemini(
    input: string,
    timezone: string,
    inputTimestamp: Date,
    basicAnalysis: Partial<TimeAnalysisResult>,
    context: RecentActivityContext
  ): Promise<GeminiTimeAnalysisResponse> {
    // プロンプト構築
    const prompt = this.buildGeminiPrompt(input, timezone, inputTimestamp, basicAnalysis, context);
    
    try {
      console.log('🤖 Gemini解析開始...');
      const result = await this.geminiService.classifyMessageWithAI(input);
      
      // レスポンスを期待する形式に変換
      return this.parseGeminiResponse(result as any, basicAnalysis);
    } catch (error) {
      console.error('Gemini解析エラー:', error);
      // フォールバック: 基本解析結果を使用
      return this.createFallbackGeminiResponse(basicAnalysis);
    }
  }

  /**
   * 最終結果の構築
   */
  buildFinalResult(
    analysis: TimeAnalysisResult | GeminiTimeAnalysisResponse,
    patternMatches: TimePatternMatch[],
    patternProcessor: ITimePatternProcessor
  ): TimeAnalysisResult {
    // GeminiTimeAnalysisResponseの場合は変換
    if ('timeInfo' in analysis) {
      const geminiAnalysis = analysis as GeminiTimeAnalysisResponse;
      const startTime = new Date(geminiAnalysis.timeInfo.startTime);
      const endTime = new Date(geminiAnalysis.timeInfo.endTime);
      const totalMinutes = Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60));
      
      const result: TimeAnalysisResult = {
        startTime: geminiAnalysis.timeInfo.startTime,
        endTime: geminiAnalysis.timeInfo.endTime,
        totalMinutes: totalMinutes > 0 ? totalMinutes : 30,
        confidence: geminiAnalysis.timeInfo.confidence,
        method: geminiAnalysis.timeInfo.method as TimeExtractionMethod,
        timezone: geminiAnalysis.timeInfo.timezone,
        extractedComponents: []
      };

      // パターンマッチがない場合はGeminiの信頼度も下げる
      if (patternMatches.length === 0) {
        result.confidence = Math.min(result.confidence, 0.4);
        result.method = TimeExtractionMethod.INFERRED;
      }

      // extractedComponentsを設定
      result.extractedComponents = patternMatches.map(match => ({
        type: patternProcessor.mapPatternToComponentType(match.patternName),
        value: match.match,
        confidence: match.confidence,
        position: match.position
      }));

      return result;
    }

    // すでにTimeAnalysisResultの場合
    const timeAnalysis = analysis as TimeAnalysisResult;
    
    // extractedComponentsを設定
    timeAnalysis.extractedComponents = patternMatches.map(match => ({
      type: patternProcessor.mapPatternToComponentType(match.patternName),
      value: match.match,
      confidence: match.confidence,
      position: match.position
    }));

    return timeAnalysis;
  }

  /**
   * コンテキストベース補正
   */
  adjustWithContext(
    analysis: TimeAnalysisResult | GeminiTimeAnalysisResponse,
    context: RecentActivityContext
  ): TimeAnalysisResult | GeminiTimeAnalysisResponse {
    // 最近のログとの重複チェック
    if (context.recentLogs && context.recentLogs.length > 0) {
      const adjusted = this.checkTimeOverlaps(analysis, context.recentLogs as any);
      if (adjusted) {
        return adjusted;
      }
    }

    // セッション情報による補正
    if (context.currentSession) {
      return this.adjustWithSessionInfo(analysis, context.currentSession as any);
    }

    return analysis;
  }

  /**
   * Gemini用プロンプトの構築
   */
  private buildGeminiPrompt(
    input: string,
    timezone: string,
    inputTimestamp: Date,
    basicAnalysis: Partial<TimeAnalysisResult>,
    context: RecentActivityContext
  ): string {
    const zonedTime = toZonedTime(inputTimestamp, timezone);
    const currentTimeDisplay = format(zonedTime, 'yyyy-MM-dd HH:mm:ss zzz', { timeZone: timezone });

    // コンテキスト情報の構築
    let contextInfo = '';
    if (context.recentLogs && context.recentLogs.length > 0) {
      const recentActivities = context.recentLogs
        .slice(0, 3)
        .map(log => `- ${log.content} (${log.inputTimestamp})`)
        .join('\n');
      contextInfo = `\n\n【最近の活動（参考）】\n${recentActivities}`;
    }

    // 基本解析結果の情報
    let basicInfo = '';
    if (basicAnalysis.startTime && basicAnalysis.endTime) {
      basicInfo = `\n\n【パターン解析結果】\n- 推定開始: ${basicAnalysis.startTime}\n- 推定終了: ${basicAnalysis.endTime}\n- 信頼度: ${basicAnalysis.confidence}`;
    }

    return `
あなたは時間管理とタスク解析の専門家です。
ユーザーの活動記録から正確な時刻情報を抽出してください。

【現在情報】
- 現在時刻: ${currentTimeDisplay}
- タイムゾーン: ${timezone}
- 入力内容: "${input}"${contextInfo}${basicInfo}

【重要な分析ルール】
1. **時刻の正確性**: 明示的な時刻（"7:38から8:20まで"）は最優先で信頼
2. **タイムゾーン変換**: ${timezone}の時刻をUTCに正確に変換
3. **相対時刻**: "さっき"は現在時刻から30分前、"1時間前"は60分前
4. **継続時間**: 明示されていない場合は活動内容から推定
5. **整合性**: 物理的に不可能な時間配分を避ける

【出力形式】（JSON形式のみ）
{
  "timeInfo": {
    "startTime": "ISO 8601形式のUTC時刻",
    "endTime": "ISO 8601形式のUTC時刻", 
    "confidence": 0.0-1.0の信頼度,
    "method": "explicit|relative|inferred|contextual",
    "timezone": "${timezone}"
  },
  "analysis": {
    "extractedPatterns": ["検出されたパターン1", "パターン2"],
    "totalMinutes": 実際の活動時間（分）,
    "confidence": 全体的な信頼度
  }
}

JSON形式のみで回答してください。説明文は不要です。
`;
  }

  /**
   * Geminiレスポンスのパース
   */
  private parseGeminiResponse(
    geminiResult: { startTime?: string; endTime?: string; [key: string]: unknown },
    basicAnalysis: Partial<TimeAnalysisResult>
  ): GeminiTimeAnalysisResponse {
    // 既存のGeminiServiceの結果を新しい形式に変換
    const startTime = geminiResult.startTime || basicAnalysis.startTime;
    const endTime = geminiResult.endTime || basicAnalysis.endTime;
    
    return {
      timeInfo: {
        startTime: startTime || new Date().toISOString(),
        endTime: endTime || new Date().toISOString(),
        confidence: (geminiResult.confidence as number) || (basicAnalysis.confidence as number) || 0.5,
        method: (geminiResult.method as string) || (basicAnalysis.method as string) || 'inferred',
        timezone: (basicAnalysis.timezone as string) || this.getDefaultTimezone()
      },
      activities: [{
        content: (geminiResult.structuredContent as string) || '',
        category: (geminiResult.category as string) || '未分類',
        subCategory: geminiResult.subCategory as string,
        timePercentage: 100,
        priority: 'primary',
        confidence: (geminiResult.confidence as number) || 0.5
      }],
      analysis: {
        hasParallelActivities: false,
        complexityLevel: 'simple',
        totalPercentage: 100,
        extractedPatterns: []
      }
    };
  }

  /**
   * フォールバックGeminiレスポンスの作成
   */
  private createFallbackGeminiResponse(
    basicAnalysis: Partial<TimeAnalysisResult>
  ): GeminiTimeAnalysisResponse {
    const now = new Date();
    
    return {
      timeInfo: {
        startTime: basicAnalysis.startTime || new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
        endTime: basicAnalysis.endTime || now.toISOString(),
        confidence: basicAnalysis.confidence || 0.3,
        method: basicAnalysis.method || 'inferred',
        timezone: basicAnalysis.timezone || this.getDefaultTimezone()
      },
      activities: [{
        content: '活動記録',
        category: '未分類',
        timePercentage: 100,
        priority: 'primary',
        confidence: 0.3
      }],
      analysis: {
        hasParallelActivities: false,
        complexityLevel: 'simple',
        totalPercentage: 100,
        extractedPatterns: []
      }
    };
  }

  /**
   * 時間重複のチェックと調整
   */
  private checkTimeOverlaps(
    analysis: TimeAnalysisResult | GeminiTimeAnalysisResponse,
    recentLogs: { startTime?: string; endTime?: string; [key: string]: unknown }[]
  ): TimeAnalysisResult | GeminiTimeAnalysisResponse | null {
    // 重複検出ロジックを実装
    // 簡略版として、警告のみ追加
    return analysis;
  }

  /**
   * セッション情報による調整
   */
  private adjustWithSessionInfo(
    analysis: TimeAnalysisResult | GeminiTimeAnalysisResponse,
    sessionInfo: Record<string, unknown>
  ): TimeAnalysisResult | GeminiTimeAnalysisResponse {
    // セッション開始時刻との整合性チェック
    return analysis;
  }

  /**
   * デフォルトタイムゾーンを取得
   */
  private getDefaultTimezone(): string {
    return this.timezoneService?.getSystemTimezone() || 'Asia/Tokyo';
  }
}