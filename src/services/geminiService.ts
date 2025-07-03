import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { config } from '../config';
import { ActivityAnalysis, ActivityRecord, DailySummary, CategoryTotal, SubCategoryTotal } from '../types';
import { IAnalysisService, IApiCostRepository } from '../repositories/interfaces';
import { ApiCostMonitor } from './apiCostMonitor';
import { toZonedTime, format } from 'date-fns-tz';

/**
 * Google Gemini API サービスクラス
 * 活動記録の解析とサマリー生成を行う
 * IAnalysisServiceインターフェースを実装
 */
export class GeminiService implements IAnalysisService {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;
  private costMonitor: ApiCostMonitor;

  constructor(costRepository: IApiCostRepository) {
    // Gemini API の初期化
    this.genAI = new GoogleGenerativeAI(config.gemini.apiKey);
    
    // Gemini 2.0 Flash モデルを使用（精度向上・コスト効率）
    this.model = this.genAI.getGenerativeModel({ 
      model: 'gemini-2.0-flash',
      generationConfig: {
        temperature: 0.2, // より一貫性を重視した低い温度設定
        topP: 0.9,        // 精度重視の設定
        maxOutputTokens: 1000, // 十分な出力長
      },
    });
    
    // API使用量監視の初期化（インターフェースベース）
    this.costMonitor = new ApiCostMonitor(costRepository);
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
    previousActivities: ActivityRecord[] = [],
    timezone: string
  ): Promise<ActivityAnalysis> {
    try {
      console.log(`🧠 Gemini で活動を解析中: "${userInput}"`);

      // プロンプトの構築
      const prompt = this.buildAnalysisPrompt(userInput, timeSlot, previousActivities, timezone);
      
      // Gemini API 呼び出し
      const result = await this.model.generateContent(prompt);
      const response = result.response;

      // トークン使用量を記録
      if (response.usageMetadata) {
        const { promptTokenCount, candidatesTokenCount } = response.usageMetadata;
        await this.costMonitor.recordApiCall('analyzeActivity', promptTokenCount, candidatesTokenCount);
        const alert = await this.costMonitor.checkCostAlerts();
        if (alert) {
          console.warn(`🚨 コスト警告: ${alert.message}`);
        }
      }

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

      // トークン使用量を記録
      if (response.usageMetadata) {
        const { promptTokenCount, candidatesTokenCount } = response.usageMetadata;
        await this.costMonitor.recordApiCall('generateDailySummary', promptTokenCount, candidatesTokenCount);
        const alert = await this.costMonitor.checkCostAlerts();
        if (alert) {
          console.warn(`🚨 コスト警告: ${alert.message}`);
        }
      }

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
    previousActivities: ActivityRecord[],
    timezone: string
  ): string {
    let contextInfo = '';
    if (previousActivities.length > 0) {
      const prevTexts = previousActivities.map(a => {
        const timeInfo = a.analysis.startTime && a.analysis.endTime 
          ? ` (${new Date(a.analysis.startTime).toLocaleTimeString('ja-JP', {hour: '2-digit', minute: '2-digit', timeZone: timezone})}-${new Date(a.analysis.endTime).toLocaleTimeString('ja-JP', {hour: '2-digit', minute: '2-digit', timeZone: timezone})})`
          : '';
        return `- ${a.originalText}${timeInfo}`;
      }).join('\n');
      contextInfo = `\n\n【最近の活動記録（コンテキスト参考用）】\n${prevTexts}\n\n`;
    }

    // ユーザーのタイムゾーンでの現在時刻を取得
    const now = new Date();
    const zonedNow = toZonedTime(now, timezone);
    const localTimeDisplay = format(zonedNow, 'yyyy-MM-dd HH:mm:ss zzz', { timeZone: timezone });
    const utcTime = now.toISOString();

    return `\nあなたは時間管理とタスク解析の専門家です。\nユーザーの活動記録を以下の形式で構造化して解析してください。\n\n【現在時刻（ユーザーのローカル時刻）】\n${localTimeDisplay}\n【現在時刻（UTC）】\n${utcTime}\n【ユーザーのタイムゾーン】\n${timezone}\n\n【分析対象】\nユーザー入力: "${userInput}"${contextInfo}\n\n【出力形式】（必ずJSON形式で回答してください）\n{\n  "category": "メインカテゴリ名",\n  "subCategory": "サブカテゴリ名（任意）",\n  "structuredContent": "活動内容の構造化された説明",\n  "estimatedMinutes": 推定合計時間（分）、\n  "productivityLevel": 生産性レベル（1-5、5が最高）,\n  "startTime": "活動開始時刻のISO 8601形式の文字列（例: 2025-06-26T14:00:00.000Z)",\n  "endTime": "活動終了時刻のISO 8601形式の文字列（例: 2025-06-26T15:30:00.000Z)"\n}\n\n【重要：カテゴリとサブカテゴリの詳細分類】\n**仕事カテゴリの詳細サブカテゴリ**:\n- プログラミング: コーディング、実装、開発作業\n- バグ修正: 不具合対応、修正作業、デバッグ、テスト\n- 経理業務: 予算計算、請求書処理、コスト管理、経費精算、拠点予算\n- 調査業務: 技術調査、市場調査、情報収集、API調査\n- 管理業務: 書類整理、スケジュール調整、資料作成、文書作成\n- 監査業務: 監査対応、書類作成、署名作業、監査準備\n- 会議: 打合せ、会議参加、ディスカッション、チーム会議\n\n**休憩カテゴリの詳細サブカテゴリ**:\n- コーヒーブレイク: 短時間休憩、飲み物タイム\n- 家事: 掃除、整理整頓、生活関連作業\n- その他: その他の休憩活動\n\n**混在作業の処理**: 複数の作業が含まれる場合は、最も時間を費やした主要な活動をベースに分類してください\n\n【重要：日本語の時制解釈】\n- **過去形（〜した、〜していた、〜してた）**: 活動は既に完了している\n  - endTimeは【現在時刻】に設定\n  - startTimeはendTimeから推定活動時間を差し引いた時刻\n  - 例：「バグを修正してた」→ 現在時刻までに修正作業が完了\n- **現在形・現在進行形（〜している、〜中）**: 活動が継続中\n  - startTimeは【現在時刻】に設定\n  - endTimeはstartTimeに推定活動時間を加算した時刻\n- **未来形（〜する予定、〜します）**: 活動が予定されている\n  - startTimeは【現在時刻】またはユーザー指定時刻\n  - endTimeは推定活動時間を加算した時刻\n\n【判断基準】\n- **時間解釈**: ユーザー入力から活動の開始・終了時刻を特定してください。\n  - まず日本語の時制（過去・現在・未来）を正確に判定してください\n  - 「さっき」「30分前」のような相対的な表現は、【現在時刻】を基準に絶対時刻へ変換してください\n  - 「14時から15時まで」のような範囲指定も解釈してください\n  - 時間に関する言及がない場合は、時制に基づいてstartTime/endTimeを設定してください\n    - 過去形：endTime=現在時刻、startTime=現在時刻-推定活動時間\n    - 現在形：startTime=現在時刻、endTime=現在時刻+推定活動時間\n    - 未来形：startTime=現在時刻、endTime=現在時刻+推定活動時間\n  - **コンテキスト活用**: 【最近の活動記録】を参考にして、活動の継続性や関連性を判断してください\n- estimatedMinutes: startTimeとendTimeから算出した合計時間（分）を記入してください\n- productivityLevel: 目標達成への貢献度（1:低い 3:普通 5:高い）\n- 曖昧な入力でも、文脈から最も適切なカテゴリを推測してください\n- 複数の活動が含まれる場合は、最も主要な活動をベースに判断してください\n\n必ずJSON形式のみで回答してください。説明文は不要です。\n`;
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
        estimatedMinutes: parsed.estimatedMinutes || 30,
        productivityLevel: Math.min(Math.max(parsed.productivityLevel || 3, 1), 5),
        startTime: parsed.startTime,
        endTime: parsed.endTime,
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
   * カテゴリ別集計を計算（重複排除版）
   * 同一時間枠では最も詳細な記録を使用し、実際の活動時間を正確に計算
   */
  private calculateCategoryTotals(activities: ActivityRecord[]): CategoryTotal[] {
    // 時間枠ごとにグループ化して重複を排除
    const timeSlotMap = new Map<string, ActivityRecord[]>();
    
    activities.forEach(activity => {
      const timeSlot = activity.timeSlot;
      if (!timeSlotMap.has(timeSlot)) {
        timeSlotMap.set(timeSlot, []);
      }
      timeSlotMap.get(timeSlot)!.push(activity);
    });

    // 各時間枠で重複を解決し、実際の時間を計算
    const resolvedActivities: { category: string; subCategory?: string; minutes: number; productivityLevel: number }[] = [];
    
    timeSlotMap.forEach((slotActivities, timeSlot) => {
      if (slotActivities.length === 1) {
        // 単一の記録の場合はそのまま使用（データベースの値を優先）
        const activity = slotActivities[0];
        resolvedActivities.push({
          category: activity.category, // データベースから直接取得
          subCategory: activity.subCategory, // データベースから直接取得
          minutes: Math.min(activity.analysis.estimatedMinutes, 30), // 30分枠を超えないよう制限
          productivityLevel: activity.analysis.productivityLevel
        });
      } else {
        // 複数記録がある場合の処理
        const categoryMinutesMap = new Map<string, number>();
        let totalProductivity = 0;
        let totalRecords = 0;

        slotActivities.forEach(activity => {
          const category = activity.category; // データベースから直接取得
          const currentMinutes = categoryMinutesMap.get(category) || 0;
          categoryMinutesMap.set(category, currentMinutes + activity.analysis.estimatedMinutes);
          totalProductivity += activity.analysis.productivityLevel;
          totalRecords++;
        });

        // 30分枠内で各カテゴリの時間を正規化
        const totalCategoryMinutes = Array.from(categoryMinutesMap.values()).reduce((sum, minutes) => sum + minutes, 0);
        const normalizedRatio = Math.min(30, totalCategoryMinutes) / totalCategoryMinutes;

        categoryMinutesMap.forEach((minutes, category) => {
          const normalizedMinutes = Math.round(minutes * normalizedRatio);
          if (normalizedMinutes > 0) {
            resolvedActivities.push({
              category,
              minutes: normalizedMinutes,
              productivityLevel: Math.round(totalProductivity / totalRecords * 10) / 10
            });
          }
        });
      }
    });

    // カテゴリ別に集計（サブカテゴリ詳細も含む）
    const categoryMap = new Map<string, {
      totalMinutes: number;
      recordCount: number;
      productivitySum: number;
      subCategoryMap: Map<string, { totalMinutes: number; recordCount: number; productivitySum: number }>;
    }>();

    resolvedActivities.forEach(resolved => {
      const category = resolved.category;
      const subCategory = resolved.subCategory || 'その他';
      
      const existing = categoryMap.get(category) || {
        totalMinutes: 0,
        recordCount: 0,
        productivitySum: 0,
        subCategoryMap: new Map()
      };

      existing.totalMinutes += resolved.minutes;
      existing.recordCount += 1;
      existing.productivitySum += resolved.productivityLevel;

      // サブカテゴリも集計
      const subCategoryData = existing.subCategoryMap.get(subCategory) || {
        totalMinutes: 0,
        recordCount: 0,
        productivitySum: 0
      };
      
      subCategoryData.totalMinutes += resolved.minutes;
      subCategoryData.recordCount += 1;
      subCategoryData.productivitySum += resolved.productivityLevel;
      
      existing.subCategoryMap.set(subCategory, subCategoryData);
      categoryMap.set(category, existing);
    });

    // CategoryTotal[] 形式に変換（サブカテゴリ詳細付き）
    return Array.from(categoryMap.entries()).map(([category, data]) => ({
      category,
      totalMinutes: data.totalMinutes,
      recordCount: data.recordCount,
      averageProductivity: Math.round(data.productivitySum / data.recordCount * 10) / 10,
      subCategories: Array.from(data.subCategoryMap.entries())
        .map(([subCategory, subData]) => ({
          subCategory,
          totalMinutes: subData.totalMinutes,
          recordCount: subData.recordCount,
          averageProductivity: Math.round(subData.productivitySum / subData.recordCount * 10) / 10,
        }))
        .sort((a, b) => b.totalMinutes - a.totalMinutes) // サブカテゴリも時間順でソート
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

  /**
   * API使用量の統計を取得
   */
  public getCostStats() {
    return this.costMonitor.getTodayStats();
  }

  /**
   * API使用量の日次レポートを取得
   */
  public async getDailyCostReport(userId: string, timezone: string): Promise<string> {
    return await this.costMonitor.generateDailyReport(timezone);
  }

  /**
   * コスト警告をチェック
   */
  public async checkCostAlerts(userId: string, timezone: string) {
    return await this.costMonitor.checkCostAlerts(timezone);
  }

  
}