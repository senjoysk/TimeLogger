/**
 * 時刻パターン処理サービス
 * パターンマッチングと各種時刻パターンの処理を担当
 */

import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { 
  TimeAnalysisResult, 
  TimeExtractionMethod, 
  ParsedTimeComponent,
  TimeComponentType,
  TimePatternMatch
} from '../../types/realTimeAnalysis';
import { TimePatternMatcher, TIME_EXPRESSION_NORMALIZER } from '../../utils/timePatterns';

/**
 * 時刻パターン処理サービスインターフェース
 */
export interface ITimePatternProcessor {
  /**
   * 入力文字列を正規化
   */
  normalizeInput(input: string): string;

  /**
   * パターンマッチング結果の基本解析
   */
  analyzePatternMatches(
    matches: TimePatternMatch[],
    inputTimestamp: Date,
    timezone: string
  ): Partial<TimeAnalysisResult>;

  /**
   * パターンマッチを実行
   */
  matchPatterns(input: string): TimePatternMatch[];

  /**
   * パターン名をTimeComponentTypeにマッピング
   */
  mapPatternToComponentType(patternName: string): TimeComponentType;
}

/**
 * TimePatternProcessor の実装
 * 単一責任: 時刻パターンの認識と処理
 */
export class TimePatternProcessor implements ITimePatternProcessor {
  private patternMatcher: TimePatternMatcher;

  constructor() {
    this.patternMatcher = new TimePatternMatcher();
  }

  /**
   * 入力文字列の正規化
   */
  public normalizeInput(input: string): string {
    let normalized = input;

    // 基本的な正規化
    normalized = TIME_EXPRESSION_NORMALIZER.normalize(normalized);
    normalized = TIME_EXPRESSION_NORMALIZER.clarifyVagueExpressions(normalized);

    // 時刻記録特有の前処理
    normalized = this.preprocessTimeLog(normalized);

    return normalized.trim();
  }

  /**
   * パターンマッチを実行
   */
  public matchPatterns(input: string): TimePatternMatch[] {
    return this.patternMatcher.matchPatterns(input);
  }

  /**
   * パターンマッチング結果の基本解析
   */
  public analyzePatternMatches(
    matches: TimePatternMatch[],
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
   * パターン名をTimeComponentTypeにマッピング
   */
  public mapPatternToComponentType(patternName: string): TimeComponentType {
    if (patternName.includes('range')) return TimeComponentType.START_TIME;
    if (patternName.includes('duration')) return TimeComponentType.DURATION;
    if (patternName.includes('relative')) return TimeComponentType.RELATIVE_TIME;
    if (patternName.includes('period')) return TimeComponentType.TIME_PERIOD;
    return TimeComponentType.START_TIME;
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
   * パターンから時刻を抽出
   */
  private extractTimeFromPattern(
    match: TimePatternMatch,
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
    match: TimePatternMatch,
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
      startTimeZoned.setHours(parsed.startHour!, parsed.startMinute || 0, 0, 0);
      
      const endTimeZoned = new Date(inputTime);
      endTimeZoned.setHours(parsed.endHour || parsed.startHour!, parsed.endMinute || 0, 0, 0);

      // 深夜をまたぐ時刻範囲の処理
      if (parsed.startHour! >= 22 && (parsed.endHour || 0) <= 6) {
        // 23:30から0:30のような場合：終了時刻を翌日とみなす
        endTimeZoned.setDate(endTimeZoned.getDate() + 1);
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
    match: TimePatternMatch,
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
    match: TimePatternMatch,
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
    match: TimePatternMatch,
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
}