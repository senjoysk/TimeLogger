/**
 * 時刻情報抽出サービス
 * ユーザー入力から時刻情報を高精度で抽出・解析
 */

import { toZonedTime, format, fromZonedTime } from 'date-fns-tz';
import { 
  TimeAnalysisResult, 
  TimeExtractionMethod, 
  ParsedTimeComponent,
  TimeComponentType,
  RecentActivityContext,
  GeminiTimeAnalysisResponse,
  RealTimeAnalysisError,
  RealTimeAnalysisErrorCode
} from '../types/realTimeAnalysis';
import { TimePatternMatcher, TIME_EXPRESSION_NORMALIZER } from '../utils/timePatterns';
import { GeminiService } from './geminiService';
import { ITimezoneService } from './interfaces/ITimezoneService';

/**
 * 時刻情報抽出クラス
 */
export class TimeInformationExtractor {
  private patternMatcher: TimePatternMatcher;

  constructor(
    private geminiService: GeminiService,
    private timezoneService?: ITimezoneService
  ) {
    this.patternMatcher = new TimePatternMatcher();
  }

  /**
   * メイン抽出メソッド - 時刻情報を抽出・解析
   */
  async extractTimeInformation(
    input: string,
    timezone: string,
    inputTimestamp: Date,
    context: RecentActivityContext
  ): Promise<TimeAnalysisResult> {
    const startTime = Date.now();

    try {
      // 1. 入力の正規化
      const normalizedInput = this.normalizeInput(input);
      // 2. パターンマッチングによる基本解析
      const patternMatches = this.patternMatcher.matchPatterns(normalizedInput);
      const basicAnalysis = this.analyzePatternMatches(patternMatches, inputTimestamp, timezone);

      let finalAnalysis: any;

      // 3. 基本解析の信頼度が高い場合はそれを優先、低い場合はGeminiを使用
      if (basicAnalysis.confidence && basicAnalysis.confidence > 0.6 && basicAnalysis.startTime) {
        finalAnalysis = {
          timeInfo: {
            startTime: basicAnalysis.startTime,
            endTime: basicAnalysis.endTime,
            confidence: basicAnalysis.confidence,
            method: basicAnalysis.method,
            timezone: basicAnalysis.timezone
          }
        };
      } else {
        // Geminiによる高度解析
        const geminiAnalysis = await this.analyzeWithGemini(
          normalizedInput, 
          timezone, 
          inputTimestamp, 
          basicAnalysis,
          context
        );
        
        // パターンマッチがない場合はGeminiの信頼度も下げる
        if (patternMatches.length === 0 || (basicAnalysis.confidence !== undefined && basicAnalysis.confidence <= 0.3)) {
          geminiAnalysis.timeInfo.confidence = Math.min(geminiAnalysis.timeInfo.confidence, 0.4);
          geminiAnalysis.timeInfo.method = TimeExtractionMethod.INFERRED;
        }
        
        finalAnalysis = geminiAnalysis;
      }

      // 4. コンテキストベース補正
      const contextAdjusted = this.adjustWithContext(finalAnalysis, context, inputTimestamp);

      // 5. 最終検証と結果構築
      const finalResult = this.buildFinalResult(
        contextAdjusted,
        patternMatches,
        normalizedInput,
        timezone,
        startTime
      );

      return finalResult;

    } catch (error) {
      console.error('❌ 時刻抽出エラー:', error);
      throw new RealTimeAnalysisError(
        '時刻情報の抽出に失敗しました',
        RealTimeAnalysisErrorCode.TIME_EXTRACTION_FAILED,
        { error, input, timezone }
      );
    }
  }

  /**
   * 入力文字列の正規化
   */
  private normalizeInput(input: string): string {
    let normalized = input;

    // 基本的な正規化
    normalized = TIME_EXPRESSION_NORMALIZER.normalize(normalized);
    normalized = TIME_EXPRESSION_NORMALIZER.clarifyVagueExpressions(normalized);

    // 時刻記録特有の前処理
    normalized = this.preprocessTimeLog(normalized);

    return normalized.trim();
  }

  /**
   * 時刻記録特有の前処理
   */
  private preprocessTimeLog(input: string): string {
    let processed = input;

    // タイムスタンプ形式の除去: "[08:19]" -> ""（角括弧必須）
    processed = processed.replace(/^\[\d{1,2}:\d{2}\]\s*/, '');

    // 冗長な表現の簡略化
    const simplifications = {
      'から始めて': 'から',
      'まで続けた': 'まで',
      'の間に': '中に',
      'について': 'を',
      '関して': 'を'
    };

    for (const [verbose, simple] of Object.entries(simplifications)) {
      processed = processed.replace(new RegExp(verbose, 'g'), simple);
    }

    return processed;
  }

  /**
   * パターンマッチング結果の基本解析
   */
  private analyzePatternMatches(
    matches: any[],
    inputTimestamp: Date,
    timezone: string
  ): Partial<TimeAnalysisResult> {
    if (matches.length === 0) {
      return {
        method: TimeExtractionMethod.INFERRED,
        confidence: 0.3
      };
    }

    // 最も信頼度の高いマッチを使用
    const bestMatch = matches.sort((a, b) => b.confidence - a.confidence)[0];
    
    // パターンに基づいて基本的な時刻を推定
    const result = this.extractTimeFromPattern(bestMatch, inputTimestamp, timezone);
    
    // 曖昧なパターンの場合は信頼度を下げる
    if (bestMatch.patternName === 'relative_vague' || bestMatch.confidence < 0.6) {
      result.confidence = Math.min(result.confidence || 0.5, 0.4);
    }
    
    return result;
  }

  /**
   * パターンから時刻を抽出
   */
  private extractTimeFromPattern(
    match: any,
    inputTimestamp: Date,
    timezone: string
  ): Partial<TimeAnalysisResult> {
    const zonedInputTime = toZonedTime(inputTimestamp, timezone);
    
    // パターンタイプに応じた処理
    switch (match.name || match.patternName) {
      case 'explicit_time_range_colon':
      case 'explicit_time_range_japanese':
      case 'explicit_time_range_simple':
        return this.handleExplicitTimeRange(match, zonedInputTime, timezone);
      
      case 'duration_hours':
      case 'duration_minutes':
      case 'duration_hours_minutes':
        return this.handleDurationPattern(match, zonedInputTime, timezone);
      
      case 'relative_recent_duration':
      case 'relative_ago':
        return this.handleRelativeTimePattern(match, zonedInputTime, timezone);
      
      case 'single_time_colon':
      case 'single_time_japanese':
        return this.handleSingleTimePattern(match, zonedInputTime, timezone);
      
      default:
        return {
          method: TimeExtractionMethod.INFERRED,
          confidence: 0.5
        };
    }
  }

  /**
   * 明示的時刻範囲の処理
   */
  private handleExplicitTimeRange(
    match: any,
    inputTime: Date,
    timezone: string
  ): Partial<TimeAnalysisResult> {
    try {
      // パース結果から時刻を抽出
      const parsed = match.parsed || match.parsedInfo;
      
      if (!parsed || parsed.startHour === undefined) {
        console.warn('明示的時刻範囲の解析に失敗:', match);
        return { confidence: 0.3 };
      }

      // タイムゾーン時刻として開始・終了時刻を構築
      const startTimeZoned = new Date(inputTime);
      startTimeZoned.setHours(parsed.startHour, parsed.startMinute || 0, 0, 0);
      
      const endTimeZoned = new Date(inputTime);
      endTimeZoned.setHours(parsed.endHour, parsed.endMinute || 0, 0, 0);

      // 深夜をまたぐ時刻範囲の処理
      if (parsed.startHour >= 22 && parsed.endHour <= 6) {
        // 23:30から0:30のような場合：開始時刻は前日、終了時刻は当日
        startTimeZoned.setDate(startTimeZoned.getDate() - 1);
      } else if (endTimeZoned <= startTimeZoned) {
        // 通常の日付境界の場合：終了時刻を翌日とみなす
        endTimeZoned.setDate(endTimeZoned.getDate() + 1);
      }

      // タイムゾーン時刻をUTCに変換
      const startTime = fromZonedTime(startTimeZoned, timezone);
      const endTime = fromZonedTime(endTimeZoned, timezone);


      const totalMinutes = Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60));

      return {
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        totalMinutes,
        method: TimeExtractionMethod.EXPLICIT,
        confidence: match.confidence || 0.9,
        timezone
      };
    } catch (error) {
      console.error('明示的時刻範囲の解析エラー:', error);
      return { confidence: 0.3 };
    }
  }

  /**
   * 単一時刻パターンの処理
   */
  private handleSingleTimePattern(
    match: any,
    inputTime: Date,
    timezone: string
  ): Partial<TimeAnalysisResult> {
    try {
      const parsed = match.parsed || match.parsedInfo;
      
      if (!parsed || parsed.startHour === undefined) {
        return { confidence: 0.3 };
      }

      // タイムゾーン時刻として開始・終了時刻を構築
      const startTimeZoned = new Date(inputTime);
      startTimeZoned.setHours(parsed.startHour, parsed.startMinute || 0, 0, 0);
      
      const endTimeZoned = new Date(inputTime);

      // 開始時刻が入力時刻より後の場合は前日とみなす
      if (startTimeZoned > endTimeZoned) {
        startTimeZoned.setDate(startTimeZoned.getDate() - 1);
      }

      // タイムゾーン時刻をUTCに変換
      const startTime = fromZonedTime(startTimeZoned, timezone);
      const endTime = fromZonedTime(endTimeZoned, timezone);

      const totalMinutes = Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60));

      return {
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        totalMinutes,
        method: TimeExtractionMethod.EXPLICIT,
        confidence: match.confidence || 0.7,
        timezone
      };
    } catch (error) {
      console.error('単一時刻の解析エラー:', error);
      return { confidence: 0.3 };
    }
  }

  /**
   * 継続時間パターンの処理
   */
  private handleDurationPattern(
    match: any,
    inputTime: Date,
    timezone: string
  ): Partial<TimeAnalysisResult> {
    try {
      const parsed = match.parsed || match.parsedInfo;
      
      if (!parsed || !parsed.durationMinutes) {
        return { confidence: 0.3 };
      }

      const durationMinutes = parsed.durationMinutes;

      // タイムゾーン時刻として終了・開始時刻を設定
      const endTimeZoned = new Date(inputTime);
      const startTimeZoned = new Date(endTimeZoned.getTime() - durationMinutes * 60 * 1000);

      // タイムゾーン時刻をUTCに変換
      const startTime = fromZonedTime(startTimeZoned, timezone);
      const endTime = fromZonedTime(endTimeZoned, timezone);

      return {
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        totalMinutes: durationMinutes,
        method: TimeExtractionMethod.RELATIVE,
        confidence: match.confidence || 0.7,
        timezone
      };
    } catch (error) {
      console.error('継続時間パターンの解析エラー:', error);
      return { confidence: 0.3 };
    }
  }

  /**
   * 相対時刻パターンの処理
   */
  private handleRelativeTimePattern(
    match: any,
    inputTime: Date,
    timezone: string
  ): Partial<TimeAnalysisResult> {
    try {
      const parsed = match.parsed || match.parsedInfo;
      
      if (!parsed || parsed.relativeMinutes === undefined) {
        return { confidence: 0.3 };
      }

      const relativeMinutes = Math.abs(parsed.relativeMinutes); // 負の値を正に変換

      // タイムゾーン時刻として終了時刻を設定
      const endTimeZoned = new Date(inputTime);
      const startTimeZoned = new Date(endTimeZoned.getTime() - relativeMinutes * 60 * 1000);

      // タイムゾーン時刻をUTCに変換
      const startTime = fromZonedTime(startTimeZoned, timezone);
      const endTime = fromZonedTime(endTimeZoned, timezone);

      return {
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        totalMinutes: relativeMinutes,
        method: TimeExtractionMethod.RELATIVE,
        confidence: match.confidence || 0.6,
        timezone
      };
    } catch (error) {
      console.error('相対時刻パターンの解析エラー:', error);
      return { confidence: 0.3 };
    }
  }

  /**
   * Geminiによる高度解析
   */
  private async analyzeWithGemini(
    input: string,
    timezone: string,
    inputTimestamp: Date,
    basicAnalysis: Partial<TimeAnalysisResult>,
    context: RecentActivityContext
  ): Promise<GeminiTimeAnalysisResponse> {
    // プロンプト構築（将来的にGemini直接呼び出し用）
    this.buildGeminiPrompt(input, timezone, inputTimestamp, basicAnalysis, context);
    
    try {
      console.log('🤖 Gemini解析開始...');
      const result = await this.geminiService.analyzeActivity(input, '', [], timezone);
      
      // レスポンスを期待する形式に変換
      return this.parseGeminiResponse(result, basicAnalysis);
    } catch (error) {
      console.error('Gemini解析エラー:', error);
      // フォールバック: 基本解析結果を使用
      return this.createFallbackGeminiResponse(basicAnalysis);
    }
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
    geminiResult: any,
    basicAnalysis: Partial<TimeAnalysisResult>
  ): GeminiTimeAnalysisResponse {
    // 既存のGeminiServiceの結果を新しい形式に変換
    const startTime = geminiResult.startTime || basicAnalysis.startTime;
    const endTime = geminiResult.endTime || basicAnalysis.endTime;
    
    return {
      timeInfo: {
        startTime: startTime || new Date().toISOString(),
        endTime: endTime || new Date().toISOString(),
        confidence: geminiResult.confidence || basicAnalysis.confidence || 0.5,
        method: geminiResult.method || basicAnalysis.method || 'inferred',
        timezone: basicAnalysis.timezone || this.getDefaultTimezone()
      },
      activities: [{
        content: geminiResult.structuredContent || '',
        category: geminiResult.category || '未分類',
        subCategory: geminiResult.subCategory,
        timePercentage: 100,
        priority: 'primary',
        confidence: geminiResult.confidence || 0.5
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
   * コンテキストベース補正
   */
  private adjustWithContext(
    geminiAnalysis: GeminiTimeAnalysisResponse,
    context: RecentActivityContext,
    inputTimestamp: Date
  ): GeminiTimeAnalysisResponse {
    // 最近のログとの重複チェック
    if (context.recentLogs && context.recentLogs.length > 0) {
      const adjusted = this.checkTimeOverlaps(geminiAnalysis, context.recentLogs);
      if (adjusted) {
        return adjusted;
      }
    }

    // セッション情報による補正
    if (context.currentSession) {
      return this.adjustWithSessionInfo(geminiAnalysis, context.currentSession);
    }

    return geminiAnalysis;
  }

  /**
   * 時間重複のチェックと調整
   */
  private checkTimeOverlaps(
    analysis: GeminiTimeAnalysisResponse,
    recentLogs: any[]
  ): GeminiTimeAnalysisResponse | null {
    // 重複検出ロジックを実装
    // 簡略版として、警告のみ追加
    return analysis;
  }

  /**
   * セッション情報による調整
   */
  private adjustWithSessionInfo(
    analysis: GeminiTimeAnalysisResponse,
    sessionInfo: any
  ): GeminiTimeAnalysisResponse {
    // セッション開始時刻との整合性チェック
    return analysis;
  }

  /**
   * 最終結果の構築
   */
  private buildFinalResult(
    analysis: GeminiTimeAnalysisResponse,
    patternMatches: any[],
    originalInput: string,
    timezone: string,
    startTime: number
  ): TimeAnalysisResult {
    const processingTime = Date.now() - startTime;

    // パターンマッチ結果をParsedTimeComponentに変換
    const extractedComponents: ParsedTimeComponent[] = patternMatches.map(match => ({
      type: this.mapPatternToComponentType(match.patternName),
      value: match.match,
      confidence: match.confidence,
      position: match.position
    }));

    return {
      startTime: analysis.timeInfo.startTime,
      endTime: analysis.timeInfo.endTime,
      totalMinutes: this.calculateMinutes(
        analysis.timeInfo.startTime,
        analysis.timeInfo.endTime
      ),
      confidence: analysis.timeInfo.confidence,
      method: analysis.timeInfo.method as TimeExtractionMethod,
      timezone: analysis.timeInfo.timezone,
      extractedComponents,
      debugInfo: {
        detectedPatterns: patternMatches.map(m => m.patternName),
        geminiRawResponse: JSON.stringify(analysis),
        processingTimeMs: processingTime,
        usedPrompt: originalInput
      }
    };
  }

  /**
   * パターン名をTimeComponentTypeにマッピング
   */
  private mapPatternToComponentType(patternName: string): TimeComponentType {
    if (patternName.includes('range')) return TimeComponentType.START_TIME;
    if (patternName.includes('duration')) return TimeComponentType.DURATION;
    if (patternName.includes('relative')) return TimeComponentType.RELATIVE_TIME;
    if (patternName.includes('period')) return TimeComponentType.TIME_PERIOD;
    return TimeComponentType.START_TIME;
  }

  /**
   * 時刻差分から分数を計算
   */
  private calculateMinutes(startTime: string, endTime: string): number {
    const start = new Date(startTime);
    const end = new Date(endTime);
    return Math.round((end.getTime() - start.getTime()) / (1000 * 60));
  }

  /**
   * デフォルトタイムゾーンを取得
   */
  private getDefaultTimezone(): string {
    return this.timezoneService?.getSystemTimezone() || 'Asia/Tokyo';
  }
}