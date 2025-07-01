/**
 * リアルタイム活動分析統合テスト
 * 実際の使用シナリオを再現した統合テスト
 */

import { RealTimeActivityAnalyzer } from '../../../services/realTimeActivityAnalyzer';
import { GeminiService } from '../../../services/geminiService';
import { RecentActivityContext, WarningType } from '../../../types/realTimeAnalysis';

// GeminiServiceのモック
jest.mock('../../../services/geminiService');

describe('RealTimeActivityAnalyzer 統合テスト', () => {
  let analyzer: RealTimeActivityAnalyzer;
  let mockGeminiService: jest.Mocked<GeminiService>;
  const timezone = 'Asia/Tokyo';

  beforeEach(() => {
    // GeminiServiceのモックを作成
    mockGeminiService = new GeminiService(null as any) as jest.Mocked<GeminiService>;
    
    // デフォルトのモック応答
    mockGeminiService.analyzeActivity = jest.fn().mockImplementation(async (content: string) => {
      // 入力内容に応じた動的な応答を返す
      if (content.includes('会議')) {
        return {
          structuredContent: '会議',
          category: '会議',
          subCategory: '定例会議',
          confidence: 0.9,
          startTime: '2025-01-01T05:00:00.000Z',
          endTime: '2025-01-01T06:00:00.000Z'
        };
      } else if (content.includes('プログラミング') || content.includes('開発') || content.includes('リファクタリング')) {
        return {
          structuredContent: 'プログラミング',
          category: '開発',
          subCategory: 'コーディング',
          confidence: 0.85,
          startTime: '2025-01-01T00:00:00.000Z',
          endTime: '2025-01-01T01:00:00.000Z'
        };
      } else {
        return {
          structuredContent: content.substring(0, 50),
          category: '未分類',
          confidence: 0.5,
          startTime: '2025-01-01T00:00:00.000Z',
          endTime: '2025-01-01T00:30:00.000Z'
        };
      }
    });

    analyzer = new RealTimeActivityAnalyzer(mockGeminiService);
  });

  describe('基本的な活動記録分析', () => {
    test('「7:38から8:20まで」の時刻不一致問題を正しく解決する', async () => {
      const input = '[08:19] 7:38から8:20までTimeLoggerのリファクタリング';
      const inputTimestamp = new Date('2025-01-01T08:19:00+09:00');
      const context: RecentActivityContext = { recentLogs: [] };

      const result = await analyzer.analyzeActivity(input, timezone, inputTimestamp, context);

      // 時刻が正確に抽出されているか
      expect(result.timeAnalysis.totalMinutes).toBe(42); // 7:38-8:20は42分
      expect(result.timeAnalysis.method).toBe('explicit');
      expect(result.timeAnalysis.confidence).toBeGreaterThan(0.9);

      // 正しくUTCに変換されているか
      const startTime = new Date(result.timeAnalysis.startTime);
      const endTime = new Date(result.timeAnalysis.endTime);
      
      // JST 7:38は前日のUTC 22:38になるはず
      expect(startTime.getUTCHours()).toBe(22);
      expect(startTime.getUTCMinutes()).toBe(38);
      expect(startTime.getUTCDate()).toBe(31); // 前日
      
      // JST 8:20は前日のUTC 23:20になるはず
      expect(endTime.getUTCHours()).toBe(23);
      expect(endTime.getUTCMinutes()).toBe(20);
      expect(endTime.getUTCDate()).toBe(31); // 前日

      // 活動内容が正しく分析されているか
      expect(result.activities).toHaveLength(1);
      expect(result.activities[0].category).toBe('開発');
      expect(result.activities[0].content).toContain('リファクタリング');
      expect(result.activities[0].timePercentage).toBe(100);

      // サマリーが生成されているか
      expect(result.summary).toContain('7:38から8:20まで');
      expect(result.summary).toContain('42分間');

      // 警告がないか
      expect(result.warnings).toHaveLength(0);
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    test('相対時刻「さっき1時間」を正しく解析する', async () => {
      const input = 'さっき1時間ほどプログラミングをしました';
      const inputTimestamp = new Date('2025-01-01T10:00:00+09:00');
      const context: RecentActivityContext = { recentLogs: [] };

      const result = await analyzer.analyzeActivity(input, timezone, inputTimestamp, context);

      expect(result.timeAnalysis.totalMinutes).toBe(60);
      expect(result.timeAnalysis.method).toBe('relative');
      
      // 終了時刻が入力時刻と一致
      const endTime = new Date(result.timeAnalysis.endTime);
      expect(endTime.getTime()).toBe(inputTimestamp.getTime());
      
      // 開始時刻が1時間前
      const startTime = new Date(result.timeAnalysis.startTime);
      expect(inputTimestamp.getTime() - startTime.getTime()).toBe(60 * 60 * 1000);
    });
  });

  describe('並列活動の分析', () => {
    test('「会議しながらコーディング」を並列活動として検出する', async () => {
      const input = '14:00から15:00まで会議をしながらコーディングをしました';
      const inputTimestamp = new Date('2025-01-01T15:30:00+09:00');
      const context: RecentActivityContext = { recentLogs: [] };

      const result = await analyzer.analyzeActivity(input, timezone, inputTimestamp, context);

      // 複数の活動が検出されるか
      expect(result.activities.length).toBeGreaterThanOrEqual(2);
      
      // 時間配分の合計が100%か
      const totalPercentage = result.activities.reduce((sum, a) => sum + a.timePercentage, 0);
      expect(Math.abs(totalPercentage - 100)).toBeLessThan(1);

      // 警告が出るか（物理的に困難な並列活動）
      const conflictWarnings = result.warnings.filter(w => w.type === WarningType.PARALLEL_ACTIVITY_CONFLICT);
      expect(conflictWarnings.length).toBeGreaterThan(0);
    });

    test('妥当な並列活動は警告なしで処理する', async () => {
      const input = '10:00から11:00まで音楽を聞きながらプログラミング';
      const inputTimestamp = new Date('2025-01-01T11:30:00+09:00');
      const context: RecentActivityContext = { recentLogs: [] };

      const result = await analyzer.analyzeActivity(input, timezone, inputTimestamp, context);

      // 警告が少ないまたはない
      const conflictWarnings = result.warnings.filter(w => w.type === WarningType.PARALLEL_ACTIVITY_CONFLICT);
      expect(conflictWarnings.length).toBe(0);
    });
  });

  describe('履歴との整合性チェック', () => {
    test('重複する時間帯を検出して警告する', async () => {
      const input = '14:00から15:00まで会議';
      const inputTimestamp = new Date('2025-01-01T15:30:00+09:00');
      const context: RecentActivityContext = {
        recentLogs: [{
          id: '1',
          content: '別の会議',
          inputTimestamp: '2025-01-01T06:00:00.000Z',
          startTime: '2025-01-01T05:00:00.000Z', // 14:00 JST
          endTime: '2025-01-01T06:00:00.000Z',   // 15:00 JST
        }]
      };

      const result = await analyzer.analyzeActivity(input, timezone, inputTimestamp, context);

      // 重複警告が出るか
      const duplicateWarnings = result.warnings.filter(w => w.type === WarningType.DUPLICATE_TIME_ENTRY);
      expect(duplicateWarnings.length).toBeGreaterThan(0);
    });

    test('部分的な時間重複を検出する', async () => {
      const input = '14:30から15:30まで開発作業';
      const inputTimestamp = new Date('2025-01-01T16:00:00+09:00');
      const context: RecentActivityContext = {
        recentLogs: [{
          id: '1',
          content: '会議',
          inputTimestamp: '2025-01-01T06:00:00.000Z',
          startTime: '2025-01-01T05:00:00.000Z', // 14:00 JST
          endTime: '2025-01-01T06:00:00.000Z',   // 15:00 JST (30分重複)
        }]
      };

      const result = await analyzer.analyzeActivity(input, timezone, inputTimestamp, context);

      // 時間重複警告が出るか
      const overlapWarnings = result.warnings.filter(w => w.type === WarningType.TIME_OVERLAP);
      expect(overlapWarnings.length).toBeGreaterThan(0);
      expect(overlapWarnings[0].details.overlapMinutes).toBe(30);
    });
  });

  describe('エラーハンドリングとフォールバック', () => {
    test('Gemini APIエラー時もフォールバック動作する', async () => {
      // Gemini APIがエラーを返すようモック
      mockGeminiService.analyzeActivity.mockRejectedValue(new Error('API Error'));

      const input = '14:00から15:00まで会議';
      const inputTimestamp = new Date('2025-01-01T15:30:00+09:00');
      const context: RecentActivityContext = { recentLogs: [] };

      const result = await analyzer.analyzeActivity(input, timezone, inputTimestamp, context);

      // 基本的な時刻抽出は成功する
      expect(result.timeAnalysis.totalMinutes).toBe(60);
      expect(result.timeAnalysis.method).toBe('explicit');
      
      // 活動分析もフォールバックで動作
      expect(result.activities).toHaveLength(1);
      expect(result.activities[0].content).toContain('会議');
    });

    test('時刻パターンがない入力でもエラーにならない', async () => {
      const input = 'プログラミングをしました';
      const inputTimestamp = new Date('2025-01-01T12:00:00+09:00');
      const context: RecentActivityContext = { recentLogs: [] };

      const result = await analyzer.analyzeActivity(input, timezone, inputTimestamp, context);

      // フォールバックで推定時刻を使用
      expect(result.timeAnalysis.method).toBe('inferred');
      expect(result.timeAnalysis.confidence).toBeLessThan(0.5);
      expect(result.activities).toHaveLength(1);
      
      // 推奨事項が含まれる
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    test('空の入力でもクラッシュしない', async () => {
      const input = '';
      const inputTimestamp = new Date('2025-01-01T12:00:00+09:00');
      const context: RecentActivityContext = { recentLogs: [] };

      await expect(
        analyzer.analyzeActivity(input, timezone, inputTimestamp, context)
      ).resolves.toBeDefined();
    });
  });

  describe('メタデータと品質指標', () => {
    test('処理時間が記録される', async () => {
      const input = '10:00から11:00までプログラミング';
      const inputTimestamp = new Date('2025-01-01T11:30:00+09:00');
      const context: RecentActivityContext = { recentLogs: [] };

      const result = await analyzer.analyzeActivity(input, timezone, inputTimestamp, context);

      expect(result.metadata.processingTimeMs).toBeDefined();
      expect(result.metadata.processingTimeMs).toBeGreaterThan(0);
    });

    test('入力特性が正しく分類される', async () => {
      const input = '14:00から15:00まで会議をしながらメモを取りました';
      const inputTimestamp = new Date('2025-01-01T15:30:00+09:00');
      const context: RecentActivityContext = { recentLogs: [] };

      const result = await analyzer.analyzeActivity(input, timezone, inputTimestamp, context);

      expect(result.metadata.inputCharacteristics.hasExplicitTime).toBe(true);
      expect(result.metadata.inputCharacteristics.hasMultipleActivities).toBe(true);
      expect(result.metadata.inputCharacteristics.length).toBe(input.length);
    });

    test('品質指標が適切に計算される', async () => {
      const input = '10:00から11:00までプログラミング';
      const inputTimestamp = new Date('2025-01-01T11:30:00+09:00');
      const context: RecentActivityContext = { recentLogs: [] };

      const result = await analyzer.analyzeActivity(input, timezone, inputTimestamp, context);

      const { qualityMetrics } = result.metadata;
      expect(qualityMetrics.timeExtractionConfidence).toBeGreaterThan(0.8);
      expect(qualityMetrics.averageActivityConfidence).toBeGreaterThan(0.7);
      expect(qualityMetrics.validationScore).toBeGreaterThan(0.7);
      expect(qualityMetrics.warningCount).toBe(0);
    });
  });

  describe('実データシナリオテスト', () => {
    test('典型的な1日の活動記録を正しく処理する', async () => {
      const scenarios = [
        {
          input: '9:00から10:30まで朝会とメールチェック',
          expectedMinutes: 90,
          expectedActivities: 2
        },
        {
          input: 'さっき2時間ほど集中してコーディング',
          expectedMinutes: 120,
          expectedActivities: 1
        },
        {
          input: '13:00-14:00 ランチミーティング',
          expectedMinutes: 60,
          expectedActivities: 1
        },
        {
          input: '午後は3時間ぐらいドキュメント作成とレビュー',
          expectedMinutes: 180,
          expectedActivities: 2
        }
      ];

      for (const scenario of scenarios) {
        const result = await analyzer.analyzeActivity(
          scenario.input,
          timezone,
          new Date('2025-01-01T18:00:00+09:00'),
          { recentLogs: [] }
        );

        expect(result.timeAnalysis.totalMinutes).toBeCloseTo(scenario.expectedMinutes, -1);
        expect(result.activities.length).toBeGreaterThanOrEqual(1);
        expect(result.confidence).toBeGreaterThan(0.5);
      }
    });

    test('長時間活動に適切な警告を出す', async () => {
      const input = '8:00から18:00まで開発作業（途中休憩なし）';
      const inputTimestamp = new Date('2025-01-01T18:30:00+09:00');
      const context: RecentActivityContext = { recentLogs: [] };

      const result = await analyzer.analyzeActivity(input, timezone, inputTimestamp, context);

      expect(result.timeAnalysis.totalMinutes).toBe(600); // 10時間
      
      // 長時間活動の警告
      const durationWarnings = result.warnings.filter(w => w.type === WarningType.DURATION_SUSPICIOUS);
      expect(durationWarnings.length).toBeGreaterThan(0);
      
      // 推奨事項に休憩の提案が含まれる
      expect(result.recommendations.some(r => r.includes('時間'))).toBe(true);
    });
  });
});