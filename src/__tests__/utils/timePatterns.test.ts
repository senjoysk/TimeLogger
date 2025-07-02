/**
 * 時刻パターンユーティリティのテスト
 */

import { TimePatternMatcher, TIME_EXPRESSION_NORMALIZER } from '../../utils/timePatterns';

describe('TimePatternMatcher', () => {
  let matcher: TimePatternMatcher;

  beforeEach(() => {
    matcher = new TimePatternMatcher();
  });

  describe('明示的時刻パターン', () => {
    test('コロン形式の時刻範囲を正しく検出する', () => {
      const input = '7:38から8:20まで開発作業をしました';
      const matches = matcher.matchPatterns(input);
      
      expect(matches).toHaveLength(1);
      expect(matches[0].patternName).toBe('explicit_time_range_colon');
      expect(matches[0].groups).toEqual(expect.arrayContaining(['7', '38', '8', '20']));
      expect(matches[0].confidence).toBeGreaterThan(0.9);
    });

    test('日本語形式の時刻範囲を正しく検出する', () => {
      const input = '14時00分から15時30分まで会議でした';
      const matches = matcher.matchPatterns(input);
      
      expect(matches).toHaveLength(1);
      expect(matches[0].patternName).toBe('explicit_time_range_japanese');
      expect(matches[0].groups).toEqual(expect.arrayContaining(['14', '00', '15', '30']));
    });

    test('単一時刻も検出する', () => {
      const input = '9:30に作業を開始しました';
      const matches = matcher.matchPatterns(input);
      
      expect(matches).toHaveLength(1);
      expect(matches[0].patternName).toBe('single_time_colon');
      expect(matches[0].groups).toEqual(expect.arrayContaining(['9', '30']));
    });
  });

  describe('相対時刻パターン', () => {
    test('「さっき○時間」形式を検出する', () => {
      const input = 'さっき1時間ほどコーディングしました';
      const matches = matcher.matchPatterns(input);
      
      expect(matches).toHaveLength(1);
      expect(matches[0].patternName).toBe('relative_recent_duration');
      expect(matches[0].groups).toEqual(expect.arrayContaining(['1', '時間']));
    });

    test('「○分前」形式を検出する', () => {
      const input = '30分前から会議をしています';
      const matches = matcher.matchPatterns(input);
      
      expect(matches).toHaveLength(1);
      expect(matches[0].patternName).toBe('relative_ago');
      expect(matches[0].groups).toEqual(expect.arrayContaining(['30', '分']));
    });
  });

  describe('継続時間パターン', () => {
    test('「○時間」形式を検出する', () => {
      const input = '2時間プログラミングをしました';
      const matches = matcher.matchPatterns(input);
      
      expect(matches).toHaveLength(1);
      expect(matches[0].patternName).toBe('duration_hours');
      expect(matches[0].groups).toEqual(expect.arrayContaining(['2']));
    });

    test('「○分間」形式を検出する', () => {
      const input = '45分間デバッグ作業をしました';
      const matches = matcher.matchPatterns(input);
      
      expect(matches).toHaveLength(1);
      expect(matches[0].patternName).toBe('duration_minutes');
      expect(matches[0].groups).toEqual(expect.arrayContaining(['45']));
    });
  });

  describe('複数パターンの検出', () => {
    test('複数の時刻パターンを同時に検出する', () => {
      const input = '9:00から10:30まで会議、その後30分休憩しました';
      const matches = matcher.matchPatterns(input);
      
      expect(matches).toHaveLength(2);
      expect(matches[0].patternName).toBe('explicit_time_range_colon');
      expect(matches[1].patternName).toBe('duration_minutes');
    });

    test('信頼度順にソートされる', () => {
      const input = 'さっき作業して、14:00から15:00まで会議でした';
      const matches = matcher.matchPatterns(input);
      
      expect(matches.length).toBeGreaterThan(1);
      expect(matches[0].confidence).toBeGreaterThanOrEqual(matches[1].confidence);
    });
  });
});

describe('TIME_EXPRESSION_NORMALIZER', () => {
  describe('normalize', () => {
    test('全角数字を半角に変換する', () => {
      const input = '１４時３０分から１５時００分まで';
      const normalized = TIME_EXPRESSION_NORMALIZER.normalize(input);
      
      expect(normalized).toBe('14時30分から15時00分まで');
    });

    test('時刻区切り文字を統一する', () => {
      const input = '14時～15時、16時〜17時';
      const normalized = TIME_EXPRESSION_NORMALIZER.normalize(input);
      
      expect(normalized).toContain('から');
      expect(normalized).not.toContain('～');
      expect(normalized).not.toContain('〜');
    });

    test('複数の正規化を同時に適用する', () => {
      const input = '９：００〜１０：３０';
      const normalized = TIME_EXPRESSION_NORMALIZER.normalize(input);
      
      expect(normalized).toBe('9:00から10:30');
    });
  });

  describe('clarifyVagueExpressions', () => {
    test('「さっき」を「30分前」に置換する', () => {
      const input = 'さっき作業しました';
      const clarified = TIME_EXPRESSION_NORMALIZER.clarifyVagueExpressions(input);
      
      expect(clarified).toBe('30分前作業しました');
    });

    test('「ちょっと前」を「15分前」に置換する', () => {
      const input = 'ちょっと前から始めました';
      const clarified = TIME_EXPRESSION_NORMALIZER.clarifyVagueExpressions(input);
      
      expect(clarified).toBe('15分前から始めました');
    });

    test('「今」を「0分前」に置換する', () => {
      const input = '今作業を終えました';
      const clarified = TIME_EXPRESSION_NORMALIZER.clarifyVagueExpressions(input);
      
      expect(clarified).toBe('0分前作業を終えました');
    });
  });
});