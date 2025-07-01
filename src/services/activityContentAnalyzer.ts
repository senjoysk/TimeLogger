/**
 * 活動内容分析サービス
 * 活動記録の内容を詳細に分析し、並列活動や時間配分を特定
 */

import { 
  ActivityDetail, 
  ActivityPriority,
  TimeAnalysisResult,
  GeminiTimeAnalysisResponse,
  RealTimeAnalysisError,
  RealTimeAnalysisErrorCode
} from '../types/realTimeAnalysis';
import { GeminiService } from './geminiService';

/**
 * 活動内容分析クラス
 */
export class ActivityContentAnalyzer {
  constructor(private geminiService: GeminiService) {}

  /**
   * メイン分析メソッド - 活動内容を詳細分析
   */
  async analyzeActivityContent(
    input: string,
    timeAnalysis: TimeAnalysisResult
  ): Promise<ActivityDetail[]> {
    try {
      console.log(`📊 活動内容分析開始: "${input.substring(0, 50)}..."`);

      // 1. 基本的な活動分解
      const basicBreakdown = this.performBasicBreakdown(input);

      // 2. Geminiによる詳細分析
      const detailedAnalysis = await this.analyzeWithGemini(input, timeAnalysis, basicBreakdown);

      // 3. 時間配分の検証・調整
      const adjustedActivities = this.adjustTimeDistribution(detailedAnalysis, timeAnalysis);

      // 4. 優先度の決定
      const finalActivities = this.determinePriorities(adjustedActivities);

      console.log(`✅ 活動内容分析完了: ${finalActivities.length}個の活動を検出`);
      return finalActivities;

    } catch (error) {
      console.error('❌ 活動内容分析エラー:', error);
      throw new RealTimeAnalysisError(
        '活動内容の分析に失敗しました',
        RealTimeAnalysisErrorCode.AI_ANALYSIS_FAILED,
        { error, input }
      );
    }
  }

  /**
   * 基本的な活動分解
   */
  private performBasicBreakdown(input: string): BasicActivityBreakdown {
    // 並列活動を示すキーワードの検出
    const parallelIndicators = [
      'と', 'や', '、', '及び', 'および', 'かつ', '同時に', '並行して', 
      'ながら', 'つつ', 'しながら', 'もしながら'
    ];

    const hasParallelActivities = parallelIndicators.some(indicator => 
      input.includes(indicator)
    );

    // 活動の複雑度評価
    const complexityLevel = this.evaluateComplexity(input);

    // 基本的な活動分割
    const activities = hasParallelActivities 
      ? this.splitParallelActivities(input)
      : [{ content: input.trim(), estimated: true }];

    return {
      hasParallelActivities,
      complexityLevel,
      activities,
      totalActivities: activities.length
    };
  }

  /**
   * 複雑度の評価
   */
  private evaluateComplexity(input: string): 'simple' | 'medium' | 'complex' {
    const factors = {
      length: input.length,
      separators: (input.match(/[、，。・]/g) || []).length,
      keywords: (input.match(/(作業|開発|会議|調査|修正|実装|テスト|レビュー)/g) || []).length,
      timeExpressions: (input.match(/(\d+分|\d+時間|から|まで|中|間)/g) || []).length
    };

    const score = factors.length * 0.01 + 
                  factors.separators * 2 + 
                  factors.keywords * 3 + 
                  factors.timeExpressions * 2;

    if (score < 5) return 'simple';
    if (score < 15) return 'medium';
    return 'complex';
  }

  /**
   * 並列活動の分割
   */
  private splitParallelActivities(input: string): BasicActivity[] {
    // 簡易的な分割ロジック
    const splitPatterns = [
      /([^、]+)、([^、]+)/g,  // カンマ区切り
      /([^と]+)と([^と]+)/g,   // "と" 区切り
      /([^や]+)や([^や]+)/g,   // "や" 区切り
      /([^ながら]+)ながら([^ながら]+)/g  // "ながら" 区切り
    ];

    for (const pattern of splitPatterns) {
      const match = pattern.exec(input);
      if (match) {
        return [
          { content: match[1].trim(), estimated: true },
          { content: match[2].trim(), estimated: true }
        ];
      }
    }

    return [{ content: input.trim(), estimated: true }];
  }

  /**
   * Geminiによる詳細分析
   */
  private async analyzeWithGemini(
    input: string,
    timeAnalysis: TimeAnalysisResult,
    basicBreakdown: BasicActivityBreakdown
  ): Promise<GeminiActivityAnalysisResponse> {
    const prompt = this.buildDetailedAnalysisPrompt(input, timeAnalysis, basicBreakdown);

    try {
      console.log('🤖 Gemini活動分析開始...');
      
      // GeminiServiceを使用してAI分析を実行
      const result = await this.geminiService.analyzeActivity(input, '', [], timeAnalysis.timezone);
      
      // レスポンスを詳細分析形式に変換
      return this.parseGeminiActivityResponse(result, timeAnalysis, basicBreakdown);

    } catch (error) {
      console.error('Gemini活動分析エラー:', error);
      // フォールバック処理
      return this.createFallbackActivityResponse(input, timeAnalysis, basicBreakdown);
    }
  }

  /**
   * 詳細分析用プロンプトの構築
   */
  private buildDetailedAnalysisPrompt(
    input: string,
    timeAnalysis: TimeAnalysisResult,
    basicBreakdown: BasicActivityBreakdown
  ): string {
    return `
あなたは活動分析の専門家です。以下の活動記録を詳細に分析してください。

【入力情報】
- 活動記録: "${input}"
- 推定時間: ${timeAnalysis.totalMinutes}分 (${timeAnalysis.startTime} - ${timeAnalysis.endTime})
- 時刻信頼度: ${timeAnalysis.confidence}
- 基本分析: ${basicBreakdown.hasParallelActivities ? '並列活動あり' : '単一活動'}, 複雑度: ${basicBreakdown.complexityLevel}

【分析項目】
1. **活動の詳細分解**: 
   - 単一活動か並列活動かを正確に判定
   - 各活動の具体的な内容を明確化
   - 主要活動と副次活動を区別

2. **時間配分の推定**:
   - 各活動にどの程度の時間を費やしたかを%で推定
   - 並列活動の場合は重複時間も考慮
   - 実質的な活動時間を計算

3. **カテゴリ分類**:
   - 開発、会議、調査、管理業務、休憩などの適切な分類
   - より具体的なサブカテゴリも設定

4. **優先度評価**:
   - primary: メインの活動（80%以上の時間）
   - secondary: サブの活動（20-80%の時間）
   - background: バックグラウンド活動（20%未満）

【出力形式】（JSON形式のみ）
{
  "activities": [
    {
      "content": "具体的で明確な活動内容",
      "category": "開発",
      "subCategory": "プログラミング",
      "timePercentage": 85,
      "actualMinutes": ${Math.round(timeAnalysis.totalMinutes * 0.85)},
      "priority": "primary",
      "confidence": 0.9,
      "reasoning": "なぜこの配分になったかの理由"
    }
  ],
  "analysis": {
    "hasParallelActivities": false,
    "complexityLevel": "medium",
    "totalPercentage": 100,
    "mainFocus": "最も重要な活動",
    "timeDistributionMethod": "explicit|estimated|inferred"
  },
  "metadata": {
    "processingApproach": "使用した分析手法",
    "confidenceFactors": ["信頼度に影響した要因"],
    "assumptions": ["前提とした事項"]
  }
}

【重要な注意事項】
- timePercentageの合計は必ず100%になるようにしてください
- actualMinutesは timePercentage に基づいて正確に計算してください
- 曖昧な表現ではなく、具体的で行動可能な活動内容を記述してください
- 実際に可能な時間配分を心がけてください

JSON形式のみで回答してください。説明文は不要です。
`;
  }

  /**
   * Gemini活動分析レスポンスのパース
   */
  private parseGeminiActivityResponse(
    geminiResult: any,
    timeAnalysis: TimeAnalysisResult,
    basicBreakdown: BasicActivityBreakdown
  ): GeminiActivityAnalysisResponse {
    // 既存のGeminiService結果を新形式に適応
    const activity: ActivityDetail = {
      content: geminiResult.structuredContent || basicBreakdown.activities[0]?.content || '活動記録',
      category: geminiResult.category || '未分類',
      subCategory: geminiResult.subCategory,
      timePercentage: 100,
      actualMinutes: timeAnalysis.totalMinutes,
      priority: ActivityPriority.PRIMARY,
      confidence: geminiResult.confidence || 0.7
    };

    return {
      activities: [activity],
      analysis: {
        hasParallelActivities: basicBreakdown.hasParallelActivities,
        complexityLevel: basicBreakdown.complexityLevel,
        totalPercentage: 100,
        mainFocus: activity.content,
        timeDistributionMethod: 'estimated'
      },
      metadata: {
        processingApproach: 'gemini_basic_analysis',
        confidenceFactors: ['AI分析', '基本分解'],
        assumptions: ['単一活動', '全時間使用']
      }
    };
  }

  /**
   * フォールバック活動分析レスポンスの作成
   */
  private createFallbackActivityResponse(
    input: string,
    timeAnalysis: TimeAnalysisResult,
    basicBreakdown: BasicActivityBreakdown
  ): GeminiActivityAnalysisResponse {
    const activities: ActivityDetail[] = basicBreakdown.activities.map((activity, index) => {
      const percentage = basicBreakdown.activities.length === 1 ? 100 : 
                        index === 0 ? 70 : 30; // 主要活動70%, その他30%
      
      return {
        content: activity.content,
        category: this.inferCategory(activity.content),
        timePercentage: percentage,
        actualMinutes: Math.round(timeAnalysis.totalMinutes * percentage / 100),
        priority: index === 0 ? ActivityPriority.PRIMARY : ActivityPriority.SECONDARY,
        confidence: 0.5
      };
    });

    return {
      activities,
      analysis: {
        hasParallelActivities: basicBreakdown.hasParallelActivities,
        complexityLevel: basicBreakdown.complexityLevel,
        totalPercentage: 100,
        mainFocus: activities[0]?.content || '活動記録',
        timeDistributionMethod: 'fallback'
      },
      metadata: {
        processingApproach: 'fallback_analysis',
        confidenceFactors: ['基本パターンマッチング'],
        assumptions: ['デフォルト時間配分']
      }
    };
  }

  /**
   * カテゴリの推論
   */
  private inferCategory(content: string): string {
    const categoryKeywords = {
      '開発': ['プログラミング', '開発', 'コーディング', '実装', 'コード', 'リファクタリング'],
      '会議': ['会議', 'ミーティング', '打ち合わせ', '相談', 'ディスカッション'],
      '調査': ['調査', '研究', '検索', '情報収集', '分析', '確認'],
      '管理': ['管理', '整理', '計画', 'スケジュール', '手続き', '申請'],
      '休憩': ['休憩', '昼食', '食事', 'コーヒー', '雑談', '散歩']
    };

    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some(keyword => content.includes(keyword))) {
        return category;
      }
    }

    return '未分類';
  }

  /**
   * 時間配分の検証・調整
   */
  private adjustTimeDistribution(
    analysis: GeminiActivityAnalysisResponse,
    timeAnalysis: TimeAnalysisResult
  ): ActivityDetail[] {
    let activities = [...analysis.activities];

    // 1. パーセンテージの合計が100%になるよう調整
    const totalPercentage = activities.reduce((sum, activity) => sum + activity.timePercentage, 0);
    
    if (Math.abs(totalPercentage - 100) > 1) {
      console.log(`⚠️ 時間配分調整: ${totalPercentage}% -> 100%`);
      activities = this.normalizePercentages(activities);
    }

    // 2. actualMinutesの再計算
    activities.forEach(activity => {
      activity.actualMinutes = Math.round(timeAnalysis.totalMinutes * activity.timePercentage / 100);
    });

    // 3. 物理的整合性のチェック
    return this.validatePhysicalConsistency(activities, timeAnalysis);
  }

  /**
   * パーセンテージの正規化
   */
  private normalizePercentages(activities: ActivityDetail[]): ActivityDetail[] {
    const totalPercentage = activities.reduce((sum, activity) => sum + activity.timePercentage, 0);
    
    return activities.map(activity => ({
      ...activity,
      timePercentage: Math.round((activity.timePercentage / totalPercentage) * 100 * 10) / 10
    }));
  }

  /**
   * 物理的整合性の検証
   */
  private validatePhysicalConsistency(
    activities: ActivityDetail[],
    timeAnalysis: TimeAnalysisResult
  ): ActivityDetail[] {
    // 非現実的な時間配分をチェック・修正
    return activities.map(activity => {
      // 最小時間: 1分
      if (activity.actualMinutes < 1) {
        activity.actualMinutes = 1;
        activity.timePercentage = Math.round((1 / timeAnalysis.totalMinutes) * 100 * 10) / 10;
        activity.confidence *= 0.8; // 信頼度を下げる
      }

      // 最大時間: 総時間を超えない
      if (activity.actualMinutes > timeAnalysis.totalMinutes) {
        activity.actualMinutes = timeAnalysis.totalMinutes;
        activity.timePercentage = 100;
        activity.confidence *= 0.9;
      }

      return activity;
    });
  }

  /**
   * 優先度の決定
   */
  private determinePriorities(activities: ActivityDetail[]): ActivityDetail[] {
    return activities.map(activity => {
      // 時間配分に基づく優先度決定
      if (activity.timePercentage >= 80) {
        activity.priority = ActivityPriority.PRIMARY;
      } else if (activity.timePercentage >= 20) {
        activity.priority = ActivityPriority.SECONDARY;
      } else {
        activity.priority = ActivityPriority.BACKGROUND;
      }

      return activity;
    });
  }
}

// ===== 内部で使用する型定義 =====

interface BasicActivityBreakdown {
  hasParallelActivities: boolean;
  complexityLevel: 'simple' | 'medium' | 'complex';
  activities: BasicActivity[];
  totalActivities: number;
}

interface BasicActivity {
  content: string;
  estimated: boolean;
}

interface GeminiActivityAnalysisResponse {
  activities: ActivityDetail[];
  analysis: {
    hasParallelActivities: boolean;
    complexityLevel: 'simple' | 'medium' | 'complex';
    totalPercentage: number;
    mainFocus: string;
    timeDistributionMethod: string;
  };
  metadata: {
    processingApproach: string;
    confidenceFactors: string[];
    assumptions: string[];
  };
}