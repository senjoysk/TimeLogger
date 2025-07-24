import { GeminiService } from '../../services/geminiService';

// 🟢 Green Phase: GeminiServiceでのリマインダーコンテキスト付きAI分析テスト
describe('🟢 Green Phase: GeminiService ReminderContext機能', () => {
  let geminiService: GeminiService;
  let mockApiCostRepository: any;

  beforeEach(() => {
    mockApiCostRepository = {
      recordApiCall: jest.fn()
    };
    geminiService = new GeminiService(mockApiCostRepository);
  });

  describe('classifyMessageWithReminderContext', () => {
    test('リマインダーReplyメッセージを時間範囲付きで分析する', async () => {
      const messageContent = '会議とメール返信をしていました';
      const timeRange = {
        start: new Date('2024-01-15T11:00:00Z'),
        end: new Date('2024-01-15T11:30:00Z')
      };

      // parseClassificationResponseをモックしてfallback動作をテスト
      jest.spyOn(geminiService as any, 'parseClassificationResponse').mockReturnValue({
        classification: 'ACTIVITY_LOG',
        confidence: 0.9,
        reason: 'テスト用の分類',
        analysis: '会議とメール返信を実施'
      });

      // Gemini APIをモック（成功パターン）
      const mockResponse = {
        response: {
          text: () => '{"classification": "ACTIVITY_LOG", "confidence": 0.9, "analysis": "会議とメール返信を実施"}'
        }
      };
      jest.spyOn(geminiService['model'], 'generateContent').mockResolvedValue(mockResponse as any);

      const result = await geminiService.classifyMessageWithReminderContext(
        messageContent, 
        timeRange
      );

      expect(result.classification).toBe('ACTIVITY_LOG');
      expect(result.analysis).toContain('会議とメール返信');
      expect(result.analysis).toContain('20:00-20:30'); // JST時刻フォーマット
      expect(result.contextType).toBe('REMINDER_REPLY');
    });

    test('リマインダー直後メッセージを文脈考慮で分析する', async () => {
      const messageContent = 'さっきの会議、疲れた...';
      const reminderTime = new Date('2024-01-15T11:30:00Z');
      const timeDiff = 3; // 3分後

      // parseClassificationResponseをモック
      jest.spyOn(geminiService as any, 'parseClassificationResponse').mockReturnValue({
        classification: 'ACTIVITY_LOG',
        confidence: 0.8,
        reason: 'テスト用の分類',
        analysis: '会議の振り返りコメント'
      });

      // Gemini APIをモック
      const mockResponse = {
        response: {
          text: () => '{"classification": "ACTIVITY_LOG", "confidence": 0.8, "analysis": "会議の振り返りコメント"}'
        }
      };
      jest.spyOn(geminiService['model'], 'generateContent').mockResolvedValue(mockResponse as any);

      const result = await geminiService.classifyMessageWithNearbyReminderContext(
        messageContent,
        reminderTime,
        timeDiff
      );

      expect(result.classification).toBe('ACTIVITY_LOG');
      expect(result.analysis).toContain('会議の振り返り');
      expect(result.analysis).toContain('3分後の投稿');
      expect(result.contextType).toBe('POST_REMINDER');
    });
  });

  describe('buildReminderContextPrompt', () => {
    test('リマインダーReply用のプロンプトを構築する', () => {
      const messageContent = '資料作成していました';
      const timeRange = {
        start: new Date('2024-01-15T14:00:00Z'),
        end: new Date('2024-01-15T14:30:00Z')
      };

      // この時点では実装がないため、テストは失敗する
      const prompt = geminiService.buildReminderContextPrompt(messageContent, timeRange);

      expect(prompt).toContain('23:00'); // JST時刻に変換される
      expect(prompt).toContain('23:30'); // JST時刻に変換される
      expect(prompt).toContain('30分間の活動'); // ❌ 失敗する
      expect(prompt).toContain('リマインダーへの返信'); // ❌ 失敗する
    });
  });
});