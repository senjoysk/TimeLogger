/**
 * 新システム統合コマンドテスト
 * gapコマンドでdetectGapsFromAnalysisが呼ばれることを確認
 */

import { ActivityLoggingIntegration, createDefaultConfig } from '../../integration/activityLoggingIntegration';
import { getTestDbPath, cleanupTestDatabase } from '../../utils/testDatabasePath';

describe('新システム統合コマンド', () => {
  let integration: ActivityLoggingIntegration;
  const testDbPath = getTestDbPath(__filename);

  beforeAll(async () => {
    // テスト用データベースファイルを削除（既存の場合）
    cleanupTestDatabase(testDbPath);

    // 統合システムを初期化
    const config = createDefaultConfig(
      testDbPath,
      'test-api-key'
    );
    
    integration = new ActivityLoggingIntegration(config);
    await integration.initialize();
  });

  afterAll(async () => {
    if (integration) {
      await integration.shutdown();
    }
    
    // テスト用データベースファイルを削除
    cleanupTestDatabase(testDbPath);
  });

  test('detectGapsFromAnalysisメソッドが正しく実装されている', async () => {
    const repository = integration.getRepository();
    
    // GapDetectionServiceを取得
    const { GapDetectionService } = await import('../../services/gapDetectionService');
    const gapService = new GapDetectionService(repository);
    
    // DailyAnalysisResult型に合わせたモック分析結果を作成
    const mockAnalysisResult = {
      businessDate: '2025-06-30',
      timeline: [
        {
          startTime: new Date('2025-06-30T09:00:00+09:00').toISOString(),
          endTime: new Date('2025-06-30T09:30:00+09:00').toISOString(),
          category: 'プログラミング',
          content: 'テスト作業',
          confidence: 0.9,
          sourceLogIds: []
        },
        {
          startTime: new Date('2025-06-30T11:00:00+09:00').toISOString(),
          endTime: new Date('2025-06-30T11:30:00+09:00').toISOString(),
          category: '会議',
          content: '1on1会議',
          confidence: 0.9,
          sourceLogIds: []
        }
      ],
      totalLogCount: 2,
      categories: [
        { 
          category: 'プログラミング', 
          estimatedMinutes: 30, 
          confidence: 0.9, 
          logCount: 1, 
          representativeActivities: ['テスト作業'] 
        },
        { 
          category: '会議', 
          estimatedMinutes: 30, 
          confidence: 0.9, 
          logCount: 1, 
          representativeActivities: ['1on1会議'] 
        }
      ],
      timeDistribution: {
        totalEstimatedMinutes: 60,
        workingMinutes: 60,
        breakMinutes: 0,
        unaccountedMinutes: 600,
        overlapMinutes: 0
      },
      insights: {
        productivityScore: 85,
        workBalance: { focusTimeRatio: 0.5, meetingTimeRatio: 0.5, breakTimeRatio: 0, adminTimeRatio: 0 },
        suggestions: ['バランスの良い作業です'],
        highlights: ['プログラミングと会議'],
        motivation: '良いペースで進んでいます'
      },
      warnings: [],
      generatedAt: new Date().toISOString()
    };

    // detectGapsFromAnalysisメソッドを呼び出し
    const gaps = await gapService.detectGapsFromAnalysis(mockAnalysisResult, 'Asia/Tokyo');
    
    // ギャップが検出されることを確認
    expect(gaps.length).toBeGreaterThan(0);
    console.log('🔍 検出されたギャップ:', gaps);
    
    // 期待されるギャップ:
    // 1. 07:30 - 09:00 (最初のギャップ)
    // 2. 09:30 - 11:00 (活動間のギャップ)
    // 3. 11:30 - 18:30 (最後のギャップ)
    expect(gaps.length).toBe(3);
    
    // 最初のギャップを確認
    const firstGap = gaps.find(g => g.startTimeLocal === '07:30');
    expect(firstGap).toBeDefined();
    expect(firstGap!.endTimeLocal).toBe('09:00');
    
    // 活動間のギャップを確認
    const middleGap = gaps.find(g => g.startTimeLocal === '09:30');
    expect(middleGap).toBeDefined();
    expect(middleGap!.endTimeLocal).toBe('11:00');
    
    // 最後のギャップを確認
    const lastGap = gaps.find(g => g.startTimeLocal === '11:30');
    expect(lastGap).toBeDefined();
    expect(lastGap!.endTimeLocal).toBe('18:30');
  });

  test('timelineがない場合、全時間帯がギャップとして検出される', async () => {
    const repository = integration.getRepository();
    const { GapDetectionService } = await import('../../services/gapDetectionService');
    const gapService = new GapDetectionService(repository);
    
    // 空のタイムラインを持つ分析結果
    const mockAnalysisResult = {
      businessDate: '2025-06-30',
      timeline: [],
      totalLogCount: 0,
      categories: [],
      timeDistribution: {
        totalEstimatedMinutes: 0,
        workingMinutes: 0,
        breakMinutes: 0,
        unaccountedMinutes: 660,
        overlapMinutes: 0
      },
      insights: {
        productivityScore: 0,
        workBalance: { focusTimeRatio: 0, meetingTimeRatio: 0, breakTimeRatio: 0, adminTimeRatio: 0 },
        suggestions: [],
        highlights: [],
        motivation: '今日はお休みでしたね'
      },
      warnings: [],
      generatedAt: new Date().toISOString()
    };

    const gaps = await gapService.detectGapsFromAnalysis(mockAnalysisResult, 'Asia/Tokyo');
    
    // 全時間帯がギャップとして検出されること
    expect(gaps.length).toBe(1);
    expect(gaps[0].startTimeLocal).toBe('07:30');
    expect(gaps[0].endTimeLocal).toBe('18:30');
    expect(gaps[0].durationMinutes).toBe(660); // 11時間
  });
});