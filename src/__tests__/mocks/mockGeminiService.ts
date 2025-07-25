/**
 * Gemini APIのモックサービス（テスト用）
 */

import { ClassificationResult, MessageClassification } from '../../types/todo';

export class MockGeminiService {
  private costRecorded = false;

  /**
   * テスト用のモック実装
   */
  async classifyMessageWithAI(message: string): Promise<ClassificationResult> {
    // 簡単なキーワードマッチングでTODO分類
    const todoKeywords = ['タスク', '作業', '実装', '修正', '作成', '確認', '対応', 'TODO', 'todo', '必要', '資料', '提出', 'プレゼン', 'レポート'];
    const activityKeywords = ['した', 'しました', '実施', '完了', '終了', '開始', '参加', 'ミーティング', '会議'];
    const memoKeywords = ['メモ', 'ノート', '備忘', '記録', '雑談'];

    let classification: MessageClassification = 'UNCERTAIN';
    let confidence = 0.3;

    // キーワードマッチング
    if (todoKeywords.some(word => message.includes(word))) {
      classification = 'TODO';
      confidence = 0.8;
    } else if (activityKeywords.some(word => message.includes(word))) {
      classification = 'UNCERTAIN';
      confidence = 0.7;
    } else if (memoKeywords.some(word => message.includes(word))) {
      classification = 'MEMO';
      confidence = 0.6;
    }

    return {
      classification,
      confidence,
      reason: 'モックサービスによる分類',
      suggestedAction: classification === 'TODO' ? 'TODOとして登録' : undefined,
    };
  }

  /**
   * テスト用のコストレポート
   */
  async getDailyCostReport(userId: string, timezone: string): Promise<string> {
    return `📊 **本日のAPI使用状況** (テスト環境)

💰 **コスト概要**
総API呼び出し: 10回
推定コスト: $0.00 (テスト環境)

✅ テスト環境のため、実際のAPI呼び出しは行われていません。`;
  }

  /**
   * 日次分析のモック
   */
  async analyzeDaily(logs: any[]): Promise<any> {
    return {
      categories: logs.map((log, index) => ({
        category: 'Work',
        estimatedMinutes: 60,
        confidence: 0.8,
        logCount: 1,
        representativeActivities: [log.content || 'テスト活動']
      })),
      timeline: [],
      insights: {
        productivityScore: 80,
        workBalance: {
          focusTimeRatio: 0.7,
          meetingTimeRatio: 0.2,
          breakTimeRatio: 0.1,
          adminTimeRatio: 0.0
        },
        suggestions: ['テスト環境での提案'],
        highlights: ['テスト環境でのハイライト'],
        motivation: 'テスト環境での動機付け'
      },
      warnings: []
    };
  }

  /**
   * 一括分析のモック（UnifiedAnalysisService用）
   */
  async analyzeAll(prompt: string): Promise<any> {
    return {
      categories: [
        {
          category: 'Work',
          estimatedMinutes: 120,
          confidence: 0.8,
          logCount: 3,
          representativeActivities: ['プロジェクト作業', 'ミーティング']
        }
      ],
      timeline: [
        {
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString(),
          category: 'Work',
          content: 'テスト活動',
          confidence: 0.8,
          sourceLogIds: ['log-1']
        }
      ],
      timeDistribution: {
        totalEstimatedMinutes: 120,
        workingMinutes: 120,
        breakMinutes: 0,
        unaccountedMinutes: 0,
        overlapMinutes: 0
      },
      insights: {
        productivityScore: 85,
        workBalance: {
          focusTimeRatio: 0.7,
          meetingTimeRatio: 0.2,
          breakTimeRatio: 0.1,
          adminTimeRatio: 0.0
        },
        suggestions: ['集中時間を増やしましょう'],
        highlights: ['効率的な作業ができました'],
        motivation: '今日も頑張りました！'
      },
      warnings: []
    };
  }

  /**
   * APIコスト記録（モック）
   */
  async recordApiCall(operation: string, inputTokens: number, outputTokens: number): Promise<void> {
    this.costRecorded = true;
    console.log(`[MockGeminiService] API呼び出し記録: ${operation}`);
  }
}