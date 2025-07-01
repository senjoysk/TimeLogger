/**
 * 時刻パターン定義
 * 様々な時刻表現を検出するための正規表現パターン
 */

import { TimeComponentType, TimePatternMatch } from '../types/realTimeAnalysis';

/**
 * 時刻パターン定義
 */
export interface TimePattern {
  /** パターン名 */
  name: string;
  /** 正規表現 */
  regex: RegExp;
  /** 抽出するコンポーネントタイプ */
  componentType: TimeComponentType;
  /** 基本信頼度 */
  baseConfidence: number;
  /** パース関数 */
  parser: (match: RegExpMatchArray) => ParsedTimeInfo;
}

/**
 * パースされた時刻情報
 */
export interface ParsedTimeInfo {
  /** 開始時刻（24時間形式の時） */
  startHour?: number;
  /** 開始時刻（分） */
  startMinute?: number;
  /** 終了時刻（24時間形式の時） */
  endHour?: number;
  /** 終了時刻（分） */
  endMinute?: number;
  /** 継続時間（分） */
  durationMinutes?: number;
  /** 相対時刻（分前） */
  relativeMinutes?: number;
  /** 時間帯タイプ */
  periodType?: string;
  /** 追加情報 */
  additional?: Record<string, any>;
}

/**
 * 時刻パターンの定義
 */
export const TIME_PATTERNS: TimePattern[] = [
  // === 明示的時刻範囲パターン ===
  {
    name: 'explicit_time_range_colon',
    regex: /(\d{1,2}):(\d{2})\s*[-〜～から]\s*(\d{1,2}):(\d{2})/g,
    componentType: TimeComponentType.START_TIME,
    baseConfidence: 0.95,
    parser: (match) => ({
      startHour: parseInt(match[1], 10),
      startMinute: parseInt(match[2], 10),
      endHour: parseInt(match[3], 10),
      endMinute: parseInt(match[4], 10)
    })
  },
  {
    name: 'explicit_time_range_japanese',
    regex: /(\d{1,2})時(\d{1,2})?分?\s*[-〜～から]\s*(\d{1,2})時(\d{1,2})?分?/g,
    componentType: TimeComponentType.START_TIME,
    baseConfidence: 0.9,
    parser: (match) => ({
      startHour: parseInt(match[1], 10),
      startMinute: match[2] ? parseInt(match[2], 10) : 0,
      endHour: parseInt(match[3], 10),
      endMinute: match[4] ? parseInt(match[4], 10) : 0
    })
  },
  {
    name: 'explicit_time_range_simple',
    regex: /(\d{1,2})\s*[-〜～から]\s*(\d{1,2})/g,
    componentType: TimeComponentType.START_TIME,
    baseConfidence: 0.8,
    parser: (match) => ({
      startHour: parseInt(match[1], 10),
      startMinute: 0,
      endHour: parseInt(match[2], 10),
      endMinute: 0
    })
  },

  // === 単一時刻パターン ===
  {
    name: 'single_time_colon',
    regex: /(\d{1,2}):(\d{2})/g,
    componentType: TimeComponentType.START_TIME,
    baseConfidence: 0.7,
    parser: (match) => ({
      startHour: parseInt(match[1], 10),
      startMinute: parseInt(match[2], 10)
    })
  },
  {
    name: 'single_time_japanese',
    regex: /(\d{1,2})時(\d{1,2})?分?/g,
    componentType: TimeComponentType.START_TIME,
    baseConfidence: 0.7,
    parser: (match) => ({
      startHour: parseInt(match[1], 10),
      startMinute: match[2] ? parseInt(match[2], 10) : 0
    })
  },

  // === 継続時間パターン ===
  {
    name: 'duration_hours_minutes',
    regex: /(\d+)時間(\d+)分間?/g,
    componentType: TimeComponentType.DURATION,
    baseConfidence: 0.9,
    parser: (match) => ({
      durationMinutes: parseInt(match[1], 10) * 60 + parseInt(match[2], 10)
    })
  },
  {
    name: 'duration_hours',
    regex: /(\d+)時間/g,
    componentType: TimeComponentType.DURATION,
    baseConfidence: 0.85,
    parser: (match) => ({
      durationMinutes: parseInt(match[1], 10) * 60
    })
  },
  {
    name: 'duration_minutes',
    regex: /(\d+)分間?/g,
    componentType: TimeComponentType.DURATION,
    baseConfidence: 0.8,
    parser: (match) => ({
      durationMinutes: parseInt(match[1], 10)
    })
  },

  // === 相対時刻パターン ===
  {
    name: 'relative_recent_duration',
    regex: /(さっき|先ほど)\s*(\d+)\s*(分|時間)/g,
    componentType: TimeComponentType.RELATIVE_TIME,
    baseConfidence: 0.7,
    parser: (match) => {
      const value = parseInt(match[2], 10);
      const unit = match[3];
      return {
        relativeMinutes: -(unit === '時間' ? value * 60 : value)
      };
    }
  },
  {
    name: 'relative_ago',
    regex: /(\d+)\s*(分|時間)\s*前/g,
    componentType: TimeComponentType.RELATIVE_TIME,
    baseConfidence: 0.75,
    parser: (match) => {
      const value = parseInt(match[1], 10);
      const unit = match[2];
      return {
        relativeMinutes: -(unit === '時間' ? value * 60 : value)
      };
    }
  },
  {
    name: 'relative_vague',
    regex: /(さっき|先ほど|ちょっと前)/g,
    componentType: TimeComponentType.RELATIVE_TIME,
    baseConfidence: 0.5,
    parser: () => ({
      relativeMinutes: -30 // デフォルト30分前
    })
  },

  // === 時間帯パターン ===
  {
    name: 'time_period_morning',
    regex: /(午前中|朝|朝方)/g,
    componentType: TimeComponentType.TIME_PERIOD,
    baseConfidence: 0.6,
    parser: () => ({
      periodType: 'morning',
      startHour: 9,
      startMinute: 0,
      endHour: 12,
      endMinute: 0
    })
  },
  {
    name: 'time_period_afternoon',
    regex: /(午後|昼過ぎ|昼間)/g,
    componentType: TimeComponentType.TIME_PERIOD,
    baseConfidence: 0.6,
    parser: () => ({
      periodType: 'afternoon',
      startHour: 13,
      startMinute: 0,
      endHour: 17,
      endMinute: 0
    })
  },
  {
    name: 'time_period_evening',
    regex: /(夕方|夕刻|夜)/g,
    componentType: TimeComponentType.TIME_PERIOD,
    baseConfidence: 0.6,
    parser: () => ({
      periodType: 'evening',
      startHour: 17,
      startMinute: 0,
      endHour: 21,
      endMinute: 0
    })
  },
  {
    name: 'time_period_night',
    regex: /(夜中|深夜|夜遅く)/g,
    componentType: TimeComponentType.TIME_PERIOD,
    baseConfidence: 0.6,
    parser: () => ({
      periodType: 'night',
      startHour: 21,
      startMinute: 0,
      endHour: 23,
      endMinute: 59
    })
  },

  // === 複合パターン ===
  {
    name: 'from_time_for_duration',
    regex: /(\d{1,2}):?(\d{2})?\s*から\s*(\d+)\s*(分|時間)/g,
    componentType: TimeComponentType.START_TIME,
    baseConfidence: 0.85,
    parser: (match) => {
      const startHour = parseInt(match[1], 10);
      const startMinute = match[2] ? parseInt(match[2], 10) : 0;
      const duration = parseInt(match[3], 10);
      const unit = match[4];
      const durationMinutes = unit === '時間' ? duration * 60 : duration;
      
      return {
        startHour,
        startMinute,
        durationMinutes
      };
    }
  },
  {
    name: 'until_time',
    regex: /(\d{1,2}):?(\d{2})?\s*まで/g,
    componentType: TimeComponentType.END_TIME,
    baseConfidence: 0.7,
    parser: (match) => ({
      endHour: parseInt(match[1], 10),
      endMinute: match[2] ? parseInt(match[2], 10) : 0
    })
  }
];

/**
 * 時刻パターンマッチング実行
 */
export class TimePatternMatcher {
  /**
   * 入力文字列に対してパターンマッチングを実行
   */
  public matchPatterns(input: string): TimePatternMatch[] {
    const matches: TimePatternMatch[] = [];

    for (const pattern of TIME_PATTERNS) {
      pattern.regex.lastIndex = 0; // regex状態をリセット
      let match: RegExpMatchArray | null;

      while ((match = pattern.regex.exec(input)) !== null) {
        try {
          // const parsedInfo = pattern.parser(match); // 現在未使用
          
          matches.push({
            patternName: pattern.name,
            match: match[0],
            groups: Array.from(match),
            confidence: this.calculateConfidence(pattern, match, input),
            position: {
              start: match.index!,
              end: match.index! + match[0].length
            }
          });
        } catch (error) {
          console.warn(`パターン ${pattern.name} のパース失敗:`, error);
        }
      }
    }

    return this.sortAndDeduplicateMatches(matches);
  }

  /**
   * 信頼度を計算
   */
  private calculateConfidence(
    pattern: TimePattern, 
    match: RegExpMatchArray, 
    fullInput: string
  ): number {
    let confidence = pattern.baseConfidence;

    // 調整要因
    const factors = {
      // 完全な時刻形式の場合は信頼度向上
      hasCompleteTime: /\d{1,2}:\d{2}/.test(match[0]),
      // 文脈キーワードがある場合は信頼度向上
      hasContextKeywords: /(から|まで|間|中|時刻|時間)/.test(fullInput),
      // 数字のみの場合は信頼度低下
      numbersOnly: /^\d+$/.test(match[0].trim()),
      // 長いマッチは信頼度向上
      matchLength: match[0].length
    };

    if (factors.hasCompleteTime) confidence += 0.1;
    if (factors.hasContextKeywords) confidence += 0.05;
    if (factors.numbersOnly) confidence -= 0.2;
    if (factors.matchLength > 10) confidence += 0.05;

    return Math.min(Math.max(confidence, 0), 1);
  }

  /**
   * マッチ結果をソート・重複除去
   */
  private sortAndDeduplicateMatches(matches: TimePatternMatch[]): TimePatternMatch[] {
    // 信頼度順でソート
    const sorted = matches.sort((a, b) => b.confidence - a.confidence);
    
    // 重複する位置のマッチを除去（信頼度が高いものを優先）
    const deduplicated: TimePatternMatch[] = [];
    
    for (const match of sorted) {
      const hasOverlap = deduplicated.some(existing => 
        this.hasPositionOverlap(match.position, existing.position)
      );
      
      if (!hasOverlap) {
        deduplicated.push(match);
      }
    }

    return deduplicated;
  }

  /**
   * 位置の重複をチェック
   */
  private hasPositionOverlap(
    pos1: { start: number; end: number },
    pos2: { start: number; end: number }
  ): boolean {
    return !(pos1.end <= pos2.start || pos2.end <= pos1.start);
  }
}

/**
 * よく使われる時刻表現の正規化
 */
export const TIME_EXPRESSION_NORMALIZER = {
  /**
   * 時刻表現を正規化
   */
  normalize(expression: string): string {
    let normalized = expression;

    // 全角数字を半角に変換
    normalized = normalized.replace(/[０-９]/g, (char) => 
      String.fromCharCode(char.charCodeAt(0) - 0xFEE0)
    );

    // 時刻区切り文字を統一
    normalized = normalized.replace(/[：]/g, ':');
    
    // 範囲表現を統一
    normalized = normalized.replace(/[〜～]/g, '-');

    return normalized;
  },

  /**
   * 曖昧な時間表現をより具体的に変換
   */
  clarifyVagueExpressions(input: string): string {
    const clarifications = {
      'さっき': '30分前',
      '先ほど': '30分前',
      'ちょっと前': '15分前',
      '少し前': '15分前',
      '午前': '午前中',
      '午後': '午後の',
      '夜': '夕方から夜',
      '一日中': '9時から18時まで'
    };

    let clarified = input;
    for (const [vague, specific] of Object.entries(clarifications)) {
      clarified = clarified.replace(new RegExp(vague, 'g'), specific);
    }

    return clarified;
  }
};

/**
 * デバッグ用: パターンマッチング結果の表示
 */
export function debugTimePatterns(input: string): void {
  console.log('=== 時刻パターンマッチング結果 ===');
  console.log('入力:', input);
  
  const matcher = new TimePatternMatcher();
  const matches = matcher.matchPatterns(input);
  
  console.log('マッチ数:', matches.length);
  
  matches.forEach((match, index) => {
    console.log(`\n[${index + 1}] ${match.patternName}`);
    console.log('  マッチ:', match.match);
    console.log('  信頼度:', match.confidence.toFixed(2));
    console.log('  位置:', `${match.position.start}-${match.position.end}`);
    console.log('  グループ:', match.groups);
  });
}