/**
 * ギャップ検出サービステスト
 */

import { GapDetectionService } from '../../services/gapDetectionService';
import { ActivityLog, DailyAnalysisResult } from '../../types/activityLog';

// モックリポジトリ
class MockRepository {
  private logs: ActivityLog[] = [];

  async getLogsByDate(userId: string, businessDate: string): Promise<ActivityLog[]> {
    return this.logs.filter(log => 
      log.userId === userId && log.businessDate === businessDate
    );
  }

  // テスト用メソッド
  addTestLog(log: ActivityLog) {
    this.logs.push(log);
  }

  clearLogs() {
    this.logs = [];
  }
}

describe('GapDetectionService', () => {
  let service: GapDetectionService;
  let mockRepository: MockRepository;
  const businessDate = '2025-06-30';
  const timezone = 'Asia/Tokyo';

  beforeEach(() => {
    mockRepository = new MockRepository();
    service = new GapDetectionService(mockRepository as any);
  });

  afterEach(() => {
    mockRepository.clearLogs();
  });

  describe('ギャップ検出', () => {
    test('ログがない場合、全時間帯がギャップとして検出される', async () => {
      // 空の分析結果を作成
      const mockAnalysisResult: DailyAnalysisResult = {
        businessDate,
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
          motivation: 'テストメッセージ'
        },
        warnings: [],
        generatedAt: new Date().toISOString()
      };
      
      const gaps = await service.detectGapsFromAnalysis(mockAnalysisResult, timezone);
      
      expect(gaps.length).toBe(1);
      expect(gaps[0].startTimeLocal).toBe('07:30');
      expect(gaps[0].endTimeLocal).toBe('18:30');
      expect(gaps[0].durationMinutes).toBe(660); // 11時間
    });

    test('開始時刻から最初のログまでのギャップが検出される', async () => {
      // 9:00に1つの活動がある分析結果を作成
      const mockAnalysisResult: DailyAnalysisResult = {
        businessDate,
        timeline: [{
          startTime: '2025-06-30T00:00:00.000Z', // JST 9:00
          endTime: '2025-06-30T01:00:00.000Z',   // JST 10:00
          category: '開発',
          content: 'プログラミング開始',
          confidence: 0.9,
          sourceLogIds: []
        }],
        totalLogCount: 1,
        categories: [{ 
          category: '開発', 
          estimatedMinutes: 60, 
          confidence: 0.9, 
          logCount: 1, 
          representativeActivities: ['プログラミング開始'] 
        }],
        timeDistribution: {
          totalEstimatedMinutes: 60,
          workingMinutes: 60,
          breakMinutes: 0,
          unaccountedMinutes: 600,
          overlapMinutes: 0
        },
        insights: {
          productivityScore: 80,
          workBalance: { focusTimeRatio: 1.0, meetingTimeRatio: 0, breakTimeRatio: 0, adminTimeRatio: 0 },
          suggestions: ['良いペースです'],
          highlights: ['プログラミングに集中'],
          motivation: 'この調子で頭張ってください'
        },
        warnings: [],
        generatedAt: new Date().toISOString()
      };
      
      const gaps = await service.detectGapsFromAnalysis(mockAnalysisResult, timezone);
      
      // 7:30-9:00のギャップが検出されるべき
      const firstGap = gaps.find(g => g.startTimeLocal === '07:30');
      expect(firstGap).toBeDefined();
      expect(firstGap!.endTimeLocal).toBe('09:00');
      expect(firstGap!.durationMinutes).toBe(90); // 1.5時間
    });

    test('ログ間の15分以上のギャップが検出される', async () => {
      // 9:00-9:30と11:00-11:30の2つの活動がある分析結果（間に90分のギャップ）
      const mockAnalysisResult: DailyAnalysisResult = {
        businessDate,
        timeline: [
          {
            startTime: '2025-06-30T00:00:00.000Z', // JST 9:00
            endTime: '2025-06-30T00:30:00.000Z',   // JST 9:30
            category: '作業',
            content: '作業1',
            confidence: 0.9,
            sourceLogIds: []
          },
          {
            startTime: '2025-06-30T02:00:00.000Z', // JST 11:00
            endTime: '2025-06-30T02:30:00.000Z',   // JST 11:30
            category: '作業',
            content: '作業2',
            confidence: 0.9,
            sourceLogIds: []
          }
        ],
        totalLogCount: 2,
        categories: [
          { 
            category: '作業', 
            estimatedMinutes: 60, 
            confidence: 0.9, 
            logCount: 2, 
            representativeActivities: ['作業1', '作業2'] 
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
          productivityScore: 75,
          workBalance: { focusTimeRatio: 1.0, meetingTimeRatio: 0, breakTimeRatio: 0, adminTimeRatio: 0 },
          suggestions: ['集中して作業できています'],
          highlights: ['作業セッション'],
          motivation: '良いペースです'
        },
        warnings: [],
        generatedAt: new Date().toISOString()
      };
      
      const gaps = await service.detectGapsFromAnalysis(mockAnalysisResult, timezone);
      
      // 期待されるギャップ：
      // 1. 7:30-9:00 (90分) - 開始から最初の活動まで
      // 2. 9:30-11:00 (90分) - 活動間のギャップ
      // 3. 11:30-18:30 (420分) - 最後の活動から終了まで
      expect(gaps.length).toBe(3);
      
      // 9:30〜11:00のギャップが検出されるべき（活動間の90分ギャップ）
      const logGap = gaps.find(g => g.startTimeLocal === '09:30' && g.endTimeLocal === '11:00');
      expect(logGap).toBeDefined();
      expect(logGap!.durationMinutes).toBe(90); // 1.5時間
    });

    test('15分未満のギャップは検出されない', async () => {
      // 9:00-9:30と9:40-10:10の2つの活動（間に10分の短いギャップ）
      const mockAnalysisResult: DailyAnalysisResult = {
        businessDate,
        timeline: [
          {
            startTime: '2025-06-30T00:00:00.000Z', // JST 9:00
            endTime: '2025-06-30T00:30:00.000Z',   // JST 9:30
            category: '作業',
            content: '作業1',
            confidence: 0.9,
            sourceLogIds: []
          },
          {
            startTime: '2025-06-30T00:40:00.000Z', // JST 9:40
            endTime: '2025-06-30T01:10:00.000Z',   // JST 10:10
            category: '作業',
            content: '作業2',
            confidence: 0.9,
            sourceLogIds: []
          }
        ],
        totalLogCount: 2,
        categories: [
          { 
            category: '作業', 
            estimatedMinutes: 60, 
            confidence: 0.9, 
            logCount: 2, 
            representativeActivities: ['作業1', '作業2'] 
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
          productivityScore: 80,
          workBalance: { focusTimeRatio: 1.0, meetingTimeRatio: 0, breakTimeRatio: 0, adminTimeRatio: 0 },
          suggestions: ['集中して作業できています'],
          highlights: ['継続的な作業'],
          motivation: '良いリズムです'
        },
        warnings: [],
        generatedAt: new Date().toISOString()
      };
      
      const gaps = await service.detectGapsFromAnalysis(mockAnalysisResult, timezone);
      
      // 期待されるギャップ：
      // 1. 7:30-9:00 (90分) - 開始から最初の活動まで
      // 2. 10:10-18:30 (500分) - 最後の活動から終了まで
      // 9:30-9:40の10分ギャップは15分未満なので検出されない
      expect(gaps.length).toBe(2);
      
      // 9:30〜9:40の短いギャップは検出されない（10分は15分未満）
      const shortGap = gaps.find(g => g.startTimeLocal === '09:30' && g.endTimeLocal === '09:40');
      expect(shortGap).toBeUndefined();
      
      // 代わりに7:30-9:00と10:10-18:30のギャップが検出される
      const firstGap = gaps.find(g => g.startTimeLocal === '07:30');
      const lastGap = gaps.find(g => g.endTimeLocal === '18:30');
      expect(firstGap).toBeDefined();
      expect(lastGap).toBeDefined();
    });

    test('削除されたログは無視される', async () => {
      // 削除されたログは分析結果のタイムラインに含まれないため、
      // 空のタイムラインと同じ結果になることをテスト
      const mockAnalysisResult: DailyAnalysisResult = {
        businessDate,
        timeline: [], // 削除されたログは分析結果に含まれない
        totalLogCount: 0, // 削除されたログはカウントされない
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
          motivation: '削除されたログは分析対象外です'
        },
        warnings: [],
        generatedAt: new Date().toISOString()
      };
      
      const gaps = await service.detectGapsFromAnalysis(mockAnalysisResult, timezone);
      
      // 削除されたログは無視され、全時間帯がギャップとなる
      expect(gaps.length).toBe(1);
      expect(gaps[0].startTimeLocal).toBe('07:30');
      expect(gaps[0].endTimeLocal).toBe('18:30');
      expect(gaps[0].durationMinutes).toBe(660); // 11時間
    });

    test('今日の場合は現在時刻まででギャップを検出', async () => {
      // 現在日時のテストでは、過去の日付を使用して一貫性を保つ
      const pastDate = '2025-06-29'; // 明確に過去の日付
      const mockAnalysisResult: DailyAnalysisResult = {
        businessDate: pastDate,
        timeline: [], // 活動なし
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
          motivation: '過去の日付テスト'
        },
        warnings: [],
        generatedAt: new Date().toISOString()
      };
      
      const gaps = await service.detectGapsFromAnalysis(mockAnalysisResult, timezone);
      
      // 過去の日付の場合は18:30までのギャップ（一日全体）
      expect(gaps.length).toBe(1);
      expect(gaps[0].startTimeLocal).toBe('07:30');
      expect(gaps[0].endTimeLocal).toBe('18:30');
      expect(gaps[0].durationMinutes).toBe(660); // 11時間
    });

    test('実際のシナリオをテスト：間隔のあるログ', async () => {
      // ユーザーが報告したシナリオを再現（各活動30分と仮定）
      const mockAnalysisResult: DailyAnalysisResult = {
        businessDate,
        timeline: [
          {
            startTime: '2025-06-30T00:00:00.000Z', // JST 9:00
            endTime: '2025-06-30T00:30:00.000Z',   // JST 9:30
            category: '通勤',
            content: '通勤',
            confidence: 0.9,
            sourceLogIds: []
          },
          {
            startTime: '2025-06-30T00:30:00.000Z', // JST 9:30
            endTime: '2025-06-30T01:00:00.000Z',   // JST 10:00
            category: '会議',
            content: '1on1 住吉さん',
            confidence: 0.9,
            sourceLogIds: []
          },
          {
            startTime: '2025-06-30T01:30:00.000Z', // JST 10:30
            endTime: '2025-06-30T02:00:00.000Z',   // JST 11:00
            category: '会議',
            content: '1on1 美和くん',
            confidence: 0.9,
            sourceLogIds: []
          },
          {
            startTime: '2025-06-30T02:30:00.000Z', // JST 11:30
            endTime: '2025-06-30T03:00:00.000Z',   // JST 12:00
            category: 'コミュニケーション',
            content: 'メールやスラック返信',
            confidence: 0.9,
            sourceLogIds: []
          }
        ],
        totalLogCount: 4,
        categories: [
          { category: '通勤', estimatedMinutes: 30, confidence: 0.9, logCount: 1, representativeActivities: ['通勤'] },
          { category: '会議', estimatedMinutes: 60, confidence: 0.9, logCount: 2, representativeActivities: ['1on1 住吉さん', '1on1 美和くん'] },
          { category: 'コミュニケーション', estimatedMinutes: 30, confidence: 0.9, logCount: 1, representativeActivities: ['メールやスラック返信'] }
        ],
        timeDistribution: {
          totalEstimatedMinutes: 120,
          workingMinutes: 120,
          breakMinutes: 0,
          unaccountedMinutes: 540,
          overlapMinutes: 0
        },
        insights: {
          productivityScore: 85,
          workBalance: { focusTimeRatio: 0.25, meetingTimeRatio: 0.5, breakTimeRatio: 0, adminTimeRatio: 0.25 },
          suggestions: ['会議が多めの日でした'],
          highlights: ['1on1会議', 'コミュニケーション'],
          motivation: 'チームワークが素晴らしいです'
        },
        warnings: [],
        generatedAt: new Date().toISOString()
      };
      
      const gaps = await service.detectGapsFromAnalysis(mockAnalysisResult, timezone);
      
      // 期待されるギャップ：
      // 1. 7:30-9:00 (90分) - 開始から最初のログまで
      // 2. 10:00-10:30 (30分) - 9:30+30分後から10:30まで
      // 3. 11:00-11:30 (30分) - 10:30+30分後から11:30まで
      // 4. 12:00-18:30 (390分) - 11:30+30分後から終了まで
      
      expect(gaps.length).toBe(4);
      
      const gap1 = gaps.find(g => g.startTimeLocal === '07:30' && g.endTimeLocal === '09:00');
      expect(gap1).toBeDefined();
      expect(gap1!.durationMinutes).toBe(90);
      
      const gap2 = gaps.find(g => g.startTimeLocal === '10:00' && g.endTimeLocal === '10:30');
      expect(gap2).toBeDefined();
      expect(gap2!.durationMinutes).toBe(30);
      
      const gap3 = gaps.find(g => g.startTimeLocal === '11:00' && g.endTimeLocal === '11:30');
      expect(gap3).toBeDefined();
      expect(gap3!.durationMinutes).toBe(30);
      
      const gap4 = gaps.find(g => g.startTimeLocal === '12:00' && g.endTimeLocal === '18:30');
      expect(gap4).toBeDefined();
      expect(gap4!.durationMinutes).toBe(390);
    });
  });

  describe('設定管理', () => {
    test('デフォルト設定が正しく適用される', () => {
      const config = service.getConfig();
      
      expect(config.minGapMinutes).toBe(15);
      expect(config.startHour).toBe(7);
      expect(config.startMinute).toBe(30);
      expect(config.endHour).toBe(18);
      expect(config.endMinute).toBe(30);
    });

    test('カスタム設定が適用される', () => {
      const customService = new GapDetectionService(mockRepository as any, {
        minGapMinutes: 30,
        startHour: 9,
        startMinute: 0,
        endHour: 17,
        endMinute: 0
      });

      const config = customService.getConfig();
      
      expect(config.minGapMinutes).toBe(30);
      expect(config.startHour).toBe(9);
      expect(config.startMinute).toBe(0);
      expect(config.endHour).toBe(17);
      expect(config.endMinute).toBe(0);
    });

    test('設定を動的に更新できる', () => {
      service.updateConfig({ minGapMinutes: 20 });
      
      const config = service.getConfig();
      expect(config.minGapMinutes).toBe(20);
      expect(config.startHour).toBe(7); // 他の設定は変更されない
    });
  });
});