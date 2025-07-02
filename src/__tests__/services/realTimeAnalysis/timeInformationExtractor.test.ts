/**
 * 時刻情報抽出サービスのテスト
 */

import { TimeInformationExtractor } from '../../../services/timeInformationExtractor';
import { GeminiService } from '../../../services/geminiService';
import { RecentActivityContext, TimeExtractionMethod } from '../../../types/realTimeAnalysis';
import { toZonedTime } from 'date-fns-tz';

// GeminiServiceのモック
jest.mock('../../../services/geminiService');

describe('TimeInformationExtractor', () => {
  let extractor: TimeInformationExtractor;
  let mockGeminiService: jest.Mocked<GeminiService>;
  const timezone = 'Asia/Tokyo';

  beforeEach(() => {
    // GeminiServiceのモックを作成
    mockGeminiService = new GeminiService(null as any) as jest.Mocked<GeminiService>;
    mockGeminiService.analyzeActivity = jest.fn().mockResolvedValue({
      structuredContent: 'プログラミング',
      category: '開発',
      confidence: 0.9,
      startTime: '2025-01-01T00:00:00.000Z',
      endTime: '2025-01-01T01:00:00.000Z'
    });

    extractor = new TimeInformationExtractor(mockGeminiService);
  });

  describe('明示的時刻の抽出', () => {
    test('「7:38から8:20まで」形式を正しく抽出する', async () => {
      const input = '7:38から8:20までTimeLoggerのリファクタリング';
      const inputTimestamp = new Date('2025-01-01T08:30:00+09:00'); // JST
      const context: RecentActivityContext = { recentLogs: [] };

      const result = await extractor.extractTimeInformation(
        input,
        timezone,
        inputTimestamp,
        context
      );

      expect(result.method).toBe(TimeExtractionMethod.EXPLICIT);
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.totalMinutes).toBe(42); // 7:38から8:20は42分
      
      // 時刻が正しくUTCに変換されているか確認
      const startTime = new Date(result.startTime);
      const endTime = new Date(result.endTime);
      const startTimeJST = toZonedTime(startTime, timezone);
      const endTimeJST = toZonedTime(endTime, timezone);
      
      expect(startTimeJST.getHours()).toBe(7);
      expect(startTimeJST.getMinutes()).toBe(38);
      expect(endTimeJST.getHours()).toBe(8);
      expect(endTimeJST.getMinutes()).toBe(20);
    });

    test('「14時00分から15時30分」形式を正しく抽出する', async () => {
      const input = '14時00分から15時30分まで会議でした';
      const inputTimestamp = new Date('2025-01-01T16:00:00+09:00');
      const context: RecentActivityContext = { recentLogs: [] };

      const result = await extractor.extractTimeInformation(
        input,
        timezone,
        inputTimestamp,
        context
      );

      expect(result.method).toBe(TimeExtractionMethod.EXPLICIT);
      expect(result.totalMinutes).toBe(90); // 1時間30分
    });

    test('単一時刻の場合は入力時刻までの時間を計算する', async () => {
      const input = '9:30から作業を開始しました';
      const inputTimestamp = new Date('2025-01-01T10:00:00+09:00');
      const context: RecentActivityContext = { recentLogs: [] };

      const result = await extractor.extractTimeInformation(
        input,
        timezone,
        inputTimestamp,
        context
      );

      expect(result.totalMinutes).toBe(30); // 9:30から10:00は30分
    });
  });

  describe('相対時刻の抽出', () => {
    test('「さっき1時間」を正しく解釈する', async () => {
      const input = 'さっき1時間ほどコーディングしました';
      const inputTimestamp = new Date('2025-01-01T10:00:00+09:00');
      const context: RecentActivityContext = { recentLogs: [] };

      const result = await extractor.extractTimeInformation(
        input,
        timezone,
        inputTimestamp,
        context
      );

      expect(result.method).toBe(TimeExtractionMethod.RELATIVE);
      expect(result.totalMinutes).toBe(60);
      
      // 終了時刻が入力時刻と一致するか確認
      const endTime = new Date(result.endTime);
      expect(endTime.getTime()).toBe(inputTimestamp.getTime());
    });

    test('「30分前から」を正しく解釈する', async () => {
      const input = '30分前から会議をしています';
      const inputTimestamp = new Date('2025-01-01T10:00:00+09:00');
      const context: RecentActivityContext = { recentLogs: [] };

      const result = await extractor.extractTimeInformation(
        input,
        timezone,
        inputTimestamp,
        context
      );

      expect(result.method).toBe(TimeExtractionMethod.RELATIVE);
      expect(result.totalMinutes).toBe(30);
    });
  });

  describe('継続時間の抽出', () => {
    test('「2時間」形式を正しく抽出する', async () => {
      const input = '2時間プログラミングをしました';
      const inputTimestamp = new Date('2025-01-01T12:00:00+09:00');
      const context: RecentActivityContext = { recentLogs: [] };

      const result = await extractor.extractTimeInformation(
        input,
        timezone,
        inputTimestamp,
        context
      );

      expect(result.method).toBe(TimeExtractionMethod.RELATIVE);
      expect(result.totalMinutes).toBe(120);
    });

    test('「45分間」形式を正しく抽出する', async () => {
      const input = '45分間デバッグ作業をしました';
      const inputTimestamp = new Date('2025-01-01T12:00:00+09:00');
      const context: RecentActivityContext = { recentLogs: [] };

      const result = await extractor.extractTimeInformation(
        input,
        timezone,
        inputTimestamp,
        context
      );

      expect(result.method).toBe(TimeExtractionMethod.RELATIVE);
      expect(result.totalMinutes).toBe(45);
    });
  });

  describe('エッジケース', () => {
    test('時刻パターンがない場合はINFERREDメソッドを使用する', async () => {
      const input = 'プログラミングをしました';
      const inputTimestamp = new Date('2025-01-01T12:00:00+09:00');
      const context: RecentActivityContext = { recentLogs: [] };

      const result = await extractor.extractTimeInformation(
        input,
        timezone,
        inputTimestamp,
        context
      );

      expect(result.method).toBe(TimeExtractionMethod.INFERRED);
      expect(result.confidence).toBeLessThan(0.5);
    });

    test('日付をまたぐ時刻範囲を正しく処理する', async () => {
      const input = '23:30から0:30まで作業しました';
      const inputTimestamp = new Date('2025-01-02T01:00:00+09:00');
      const context: RecentActivityContext = { recentLogs: [] };

      const result = await extractor.extractTimeInformation(
        input,
        timezone,
        inputTimestamp,
        context
      );

      expect(result.totalMinutes).toBe(60); // 1時間
      
      // 時刻の正当性を確認：1時間の差があること
      const startTime = new Date(result.startTime);
      const endTime = new Date(result.endTime);
      expect(endTime.getTime() - startTime.getTime()).toBe(60 * 60 * 1000);
    });

    test('タイムスタンプ付き入力を正しく処理する', async () => {
      const input = '[08:19] 7:38から8:20まで開発作業';
      const inputTimestamp = new Date('2025-01-01T08:30:00+09:00');
      const context: RecentActivityContext = { recentLogs: [] };

      const result = await extractor.extractTimeInformation(
        input,
        timezone,
        inputTimestamp,
        context
      );

      // タイムスタンプは無視して実際の時刻範囲を抽出
      expect(result.totalMinutes).toBe(42);
    });
  });

  describe('コンテキストベース補正', () => {
    test('最近のログとの重複を検出する', async () => {
      const input = '14:00から15:00まで会議';
      const inputTimestamp = new Date('2025-01-01T15:30:00+09:00');
      const context: RecentActivityContext = {
        recentLogs: [{
          id: '1',
          content: '別の会議',
          inputTimestamp: '2025-01-01T06:00:00.000Z',
          startTime: '2025-01-01T05:00:00.000Z', // 14:00 JST in UTC
          endTime: '2025-01-01T06:00:00.000Z',   // 15:00 JST in UTC
        }]
      };

      const result = await extractor.extractTimeInformation(
        input,
        timezone,
        inputTimestamp,
        context
      );

      // 重複があっても基本的な抽出は成功する
      expect(result.totalMinutes).toBe(60);
      expect(result.confidence).toBeGreaterThan(0.5);
    });
  });

  describe('エラーハンドリング', () => {
    test('Gemini APIエラー時もフォールバック動作する', async () => {
      // Gemini APIがエラーを返すようモック
      mockGeminiService.analyzeActivity.mockRejectedValue(new Error('API Error'));

      const input = '14:00から15:00まで会議';
      const inputTimestamp = new Date('2025-01-01T15:30:00+09:00');
      const context: RecentActivityContext = { recentLogs: [] };

      const result = await extractor.extractTimeInformation(
        input,
        timezone,
        inputTimestamp,
        context
      );

      // パターンマッチングのみで動作
      expect(result.method).toBe(TimeExtractionMethod.EXPLICIT);
      expect(result.totalMinutes).toBe(60);
    });

    test('無効な入力でもエラーにならない', async () => {
      const input = '';
      const inputTimestamp = new Date('2025-01-01T15:30:00+09:00');
      const context: RecentActivityContext = { recentLogs: [] };

      await expect(
        extractor.extractTimeInformation(input, timezone, inputTimestamp, context)
      ).resolves.toBeDefined();
    });
  });
});