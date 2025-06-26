import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { config } from '../config';
import { ActivityAnalysis, ActivityRecord, DailySummary, CategoryTotal } from '../types';

/**
 * Google Gemini API サービスクラス
 * 活動記録の解析とサマリー生成を行う
 */
export class GeminiService {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;

  constructor() {
    // Gemini API の初期化
    this.genAI = new GoogleGenerativeAI(config.gemini.apiKey);
    
    // Gemini 1.5 Flash モデルを使用（高速で日本語対応）
    this.model = this.genAI.getGenerativeModel({ 
      model: 'gemini-1.5-flash',
      generationConfig: {
        temperature: 0.3, // 一貫性を重視した低い温度設定
        topP: 0.95,       // 適度な多様性
        maxOutputTokens: 1000, // 十分な出力長
      },
    });
  }

  /**
   * ユーザーの活動記録を解析
   * @param userInput ユーザーからの投稿内容
   * @param timeSlot 時間枠 (HH:MM-HH:MM)
   * @param previousActivities 同じ時間枠の過去の記録（追加投稿の場合）
   * @returns 解析結果
   */
  public async analyzeActivity(
    userInput: string,
    timeSlot: string,
    previousActivities: ActivityRecord[] = []
  ): Promise<ActivityAnalysis> {
    try {
      console.log(`🧠 Gemini で活動を解析中: "${userInput}"`);

      // プロンプトの構築
      const prompt = this.buildAnalysisPrompt(userInput, timeSlot, previousActivities);
      
      // Gemini API 呼び出し
      const result = await this.model.generateContent(prompt);
      const response = result.response;
      const responseText = response.text();

      // JSON レスポンスをパース
      const analysis = this.parseAnalysisResponse(responseText);
      
      console.log('✅ 活動解析が完了しました:', analysis);
      return analysis;

    } catch (error) {
      console.error('❌ 活動解析エラー:', error);
      
      // エラー時はデフォルト値を返す
      return this.getDefaultAnalysis(userInput);
    }
  }

  /**
   * 日次サマリーを生成
   * @param activities 一日の活動記録
   * @param businessDate 業務日
   * @returns 日次サマリー
   */
  public async generateDailySummary(
    activities: ActivityRecord[],
    businessDate: string
  ): Promise<DailySummary> {
    try {
      console.log(`📊 Gemini で日次サマリーを生成中: ${businessDate}`);

      // カテゴリ別集計の計算
      const categoryTotals = this.calculateCategoryTotals(activities);
      const totalMinutes = categoryTotals.reduce((sum, cat) => sum + cat.totalMinutes, 0);

      // サマリー生成プロンプトの構築
      const prompt = this.buildSummaryPrompt(activities, categoryTotals, totalMinutes);
      
      // Gemini API 呼び出し
      const result = await this.model.generateContent(prompt);
      const response = result.response;
      const responseText = response.text();

      // JSON レスポンスをパース
      const summaryContent = this.parseSummaryResponse(responseText);

      const summary: DailySummary = {
        date: businessDate,
        categoryTotals,
        totalMinutes,
        insights: summaryContent.insights,
        motivation: summaryContent.motivation,
        generatedAt: new Date().toISOString(),
      };

      console.log('✅ 日次サマリー生成が完了しました');
      return summary;

    } catch (error) {
      console.error('❌ 日次サマリー生成エラー:', error);
      
      // エラー時はデフォルトサマリーを返す
      return this.getDefaultSummary(activities, businessDate);
    }
  }

  /**
   * 活動解析用プロンプトを構築
   */
  private buildAnalysisPrompt(
    userInput: string,
    timeSlot: string,
    previousActivities: ActivityRecord[]
  ): string {
    let contextInfo = '';
    if (previousActivities.length > 0) {
      const prevTexts = previousActivities.map(a => `- ${a.originalText}`).join('\n');
      contextInfo = `\n\n【同じ時間枠の過去の記録】\n${prevTexts}\n\n`;
    }

    return `
あなたは時間管理とタスク解析の専門家です。
ユーザーの活動記録を以下の形式で構造化して解析してください。

【分析対象】
時間枠: ${timeSlot}
ユーザー入力: "${userInput}"${contextInfo}

【出力形式】（必ずJSON形式で回答してください）
{
  "category": "メインカテゴリ名",
  "subCategory": "サブカテゴリ名（任意）",
  "structuredContent": "活動内容の構造化された説明",
  "estimatedMinutes": 推定時間（分、1-30の範囲）,
  "productivityLevel": 生産性レベル（1-5、5が最高）
}

【カテゴリの例】
- 仕事（会議、プログラミング、調査、企画、レビューなど）
- 勉強（学習、読書、研修など）
- 休憩（昼食、コーヒーブレイク、散歩など）
- コミュニケーション（メール、チャット、電話など）
- 管理業務（スケジュール調整、資料整理など）

【判断基準】
- estimatedMinutes: 実際の作業時間を30分以内で推定
- productivityLevel: 目標達成への貢献度（1:低い 3:普通 5:高い）
- 曖昧な入力でも、文脈から最も適切なカテゴリを推測してください
- 複数の活動が含まれる場合は、最も主要な活動をベースに判断してください

必ずJSON形式のみで回答してください。説明文は不要です。
`;
  }

  /**
   * サマリー生成用プロンプトを構築
   */
  private buildSummaryPrompt(
    activities: ActivityRecord[],
    categoryTotals: CategoryTotal[],
    totalMinutes: number
  ): string {
    // 活動リストの構築
    const activityList = activities
      .map(a => `${a.timeSlot}: [${a.analysis.category}] ${a.originalText}`)
      .join('\n');

    // カテゴリ集計の構築
    const categoryList = categoryTotals
      .map(c => `- ${c.category}: ${c.totalMinutes}分 (${c.recordCount}回)`)
      .join('\n');

    return `
あなたは親しみやすく前向きな時間管理コーチです。
今日一日の活動記録を振り返り、温かい感想と明日への励ましメッセージを作成してください。

【今日の活動記録】
${activityList}

【カテゴリ別集計】
${categoryList}
総活動時間: ${totalMinutes}分

【出力形式】（必ずJSON形式で回答してください）
{
  "insights": "今日の活動についての感想・気づき（100-200文字程度）",
  "motivation": "明日に向けた前向きで励ましになる一言（50-100文字程度）"
}

【コメント作成指針】
- insights: 活動バランス、生産性、特徴的な活動について肯定的に言及
- motivation: 明日への期待感と具体的な応援メッセージ
- 親しみやすく、温かみのある日本語で記述
- 批判的な表現は避け、常に建設的・前向きに
- ユーザーの努力を認め、成長を応援する内容

必ずJSON形式のみで回答してください。説明文は不要です。
`;
  }

  /**
   * 活動解析レスポンスをパース
   */
  private parseAnalysisResponse(responseText: string): ActivityAnalysis {
    try {
      // JSONのみを抽出（```json ブロックがある場合の対応）
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      const jsonText = jsonMatch ? jsonMatch[0] : responseText;
      
      const parsed = JSON.parse(jsonText);
      
      return {
        category: parsed.category || '未分類',
        subCategory: parsed.subCategory || undefined,
        structuredContent: parsed.structuredContent || '活動記録',
        estimatedMinutes: Math.min(Math.max(parsed.estimatedMinutes || 30, 1), 30),
        productivityLevel: Math.min(Math.max(parsed.productivityLevel || 3, 1), 5),
      };
    } catch (error) {
      console.error('解析レスポンスのパースエラー:', error);
      throw error;
    }
  }

  /**
   * サマリーレスポンスをパース
   */
  private parseSummaryResponse(responseText: string): { insights: string; motivation: string } {
    try {
      // JSONのみを抽出
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      const jsonText = jsonMatch ? jsonMatch[0] : responseText;
      
      const parsed = JSON.parse(jsonText);
      
      return {
        insights: parsed.insights || '今日も一日お疲れさまでした。',
        motivation: parsed.motivation || '明日もがんばりましょう！',
      };
    } catch (error) {
      console.error('サマリーレスポンスのパースエラー:', error);
      throw error;
    }
  }

  /**
   * カテゴリ別集計を計算
   */
  private calculateCategoryTotals(activities: ActivityRecord[]): CategoryTotal[] {
    const categoryMap = new Map<string, {
      totalMinutes: number;
      recordCount: number;
      productivitySum: number;
    }>();

    // 各活動をカテゴリ別に集計
    activities.forEach(activity => {
      const category = activity.analysis.category;
      const existing = categoryMap.get(category) || {
        totalMinutes: 0,
        recordCount: 0,
        productivitySum: 0,
      };

      existing.totalMinutes += activity.analysis.estimatedMinutes;
      existing.recordCount += 1;
      existing.productivitySum += activity.analysis.productivityLevel;
      
      categoryMap.set(category, existing);
    });

    // CategoryTotal[] 形式に変換
    return Array.from(categoryMap.entries()).map(([category, data]) => ({
      category,
      totalMinutes: data.totalMinutes,
      recordCount: data.recordCount,
      averageProductivity: Math.round(data.productivitySum / data.recordCount * 10) / 10,
    }));
  }

  /**
   * デフォルトの活動解析結果を取得（エラー時用）
   */
  private getDefaultAnalysis(userInput: string): ActivityAnalysis {
    return {
      category: '未分類',
      structuredContent: userInput,
      estimatedMinutes: 30,
      productivityLevel: 3,
    };
  }

  /**
   * デフォルトのサマリーを取得（エラー時用）
   */
  private getDefaultSummary(activities: ActivityRecord[], businessDate: string): DailySummary {
    const categoryTotals = this.calculateCategoryTotals(activities);
    const totalMinutes = categoryTotals.reduce((sum, cat) => sum + cat.totalMinutes, 0);

    return {
      date: businessDate,
      categoryTotals,
      totalMinutes,
      insights: 'システムエラーにより詳細な分析を生成できませんでしたが、今日も一日お疲れさまでした。',
      motivation: '明日も素晴らしい一日になりますように！',
      generatedAt: new Date().toISOString(),
    };
  }
}