import { ActivityAnalysis, DailySummary } from '../../types';

/**
 * GeminiService のモック実装
 * テスト用の固定レスポンスを返す
 */
export class MockGeminiService {
  /**
   * 活動解析のモックレスポンス
   */
  static getDefaultAnalysis(userInput: string): ActivityAnalysis {
    // 入力内容に基づいてカテゴリを推定
    let category = '未分類';
    let subCategory: string | undefined;
    let productivityLevel = 3;

    if (userInput.includes('プログラミング') || userInput.includes('コーディング')) {
      category = '仕事';
      subCategory = 'プログラミング';
      productivityLevel = 4;
    } else if (userInput.includes('会議') || userInput.includes('ミーティング')) {
      category = '会議';
      productivityLevel = 3;
    } else if (userInput.includes('休憩') || userInput.includes('コーヒー')) {
      category = '休憩';
      productivityLevel = 2;
    } else if (userInput.includes('勉強') || userInput.includes('学習')) {
      category = '勉強';
      productivityLevel = 4;
    }

    return {
      category,
      subCategory,
      structuredContent: `${userInput}の構造化された内容`,
      estimatedMinutes: 30,
      productivityLevel,
    };
  }

  /**
   * 日次サマリーのモックレスポンス
   */
  static getDefaultSummary(totalMinutes: number): {
    insights: string;
    motivation: string;
  } {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const timeStr = hours > 0 ? `${hours}時間${minutes}分` : `${minutes}分`;

    return {
      insights: `今日は${timeStr}の活動を記録しました。バランスの取れた一日でしたね。`,
      motivation: '明日も素晴らしい一日になりますように！頑張りましょう！',
    };
  }

  /**
   * エラーレスポンスのモック
   */
  static getErrorAnalysis(): ActivityAnalysis {
    return {
      category: '未分類',
      structuredContent: 'エラーが発生しました',
      estimatedMinutes: 30,
      productivityLevel: 3,
    };
  }
}