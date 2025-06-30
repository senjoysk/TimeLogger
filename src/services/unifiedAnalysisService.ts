/**
 * 統合分析サービス
 * 自然言語ログを統合的に分析してタイムライン・カテゴリ別時間配分を生成
 */

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { toZonedTime, format } from 'date-fns-tz';
import { config } from '../config';
import { IActivityLogRepository } from '../repositories/activityLogRepository';
import { IAnalysisService } from '../repositories/interfaces'; // 既存のAPI Cost監視インターフェース
import {
  ActivityLog,
  DailyAnalysisResult,
  AnalysisRequest,
  GeminiAnalysisRequest,
  GeminiAnalysisResponse,
  CategorySummary,
  TimelineEntry,
  TimeDistribution,
  AnalysisInsight,
  AnalysisWarning,
  ActivityLogError
} from '../types/activityLog';
import { ApiCostMonitor } from './apiCostMonitor';

/**
 * 統合分析サービスインターフェース
 */
export interface IUnifiedAnalysisService {
  /**
   * 指定日の統合分析を実行
   * @param request 分析リクエスト
   * @returns 分析結果
   */
  analyzeDaily(request: AnalysisRequest): Promise<DailyAnalysisResult>;

  /**
   * 分析結果のキャッシュをチェック
   * @param userId ユーザーID
   * @param businessDate 業務日
   * @returns キャッシュされた分析結果（null if not found/invalid）
   */
  getCachedAnalysis(userId: string, businessDate: string): Promise<DailyAnalysisResult | null>;

  /**
   * トークン数を推定
   * @param logs 分析対象ログ
   * @returns 推定トークン数
   */
  estimateTokenCount(logs: ActivityLog[]): number;
}

/**
 * UnifiedAnalysisServiceの実装
 */
export class UnifiedAnalysisService implements IUnifiedAnalysisService {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;
  private costMonitor: ApiCostMonitor;

  constructor(
    private repository: IActivityLogRepository,
    costRepository: any // 既存のAPIコストリポジトリ
  ) {
    // Gemini API の初期化
    this.genAI = new GoogleGenerativeAI(config.gemini.apiKey);
    
    // Gemini 1.5 Flash モデルを使用（統合分析に最適化）
    this.model = this.genAI.getGenerativeModel({ 
      model: 'gemini-1.5-flash',
      generationConfig: {
        temperature: 0.2, // 一貫性重視でより低い温度
        topP: 0.9,
        maxOutputTokens: 2000, // 詳細な分析結果のため増量
      },
    });
    
    // API使用量監視の初期化
    this.costMonitor = new ApiCostMonitor(costRepository);
  }

  /**
   * 指定日の統合分析を実行
   */
  async analyzeDaily(request: AnalysisRequest): Promise<DailyAnalysisResult> {
    try {
      console.log(`🧠 統合分析開始: [${request.businessDate}] ${request.userId}`);

      // キャッシュチェック（forceRefreshが指定されていない場合）
      if (!request.forceRefresh) {
        const cached = await this.getCachedAnalysis(request.userId, request.businessDate);
        if (cached) {
          console.log(`⚡ キャッシュから分析結果を返却: [${request.businessDate}]`);
          return cached;
        }
      }

      // ログを取得
      const logs = await this.repository.getLogsByDate(request.userId, request.businessDate);
      
      if (logs.length === 0) {
        console.log(`📝 ログが見つかりません: [${request.businessDate}]`);
        return this.createEmptyAnalysis(request.businessDate);
      }

      // トークン数をチェックして分析方法を決定
      const tokenCount = this.estimateTokenCount(logs);
      const maxTokens = 6000; // 安全なトークン制限

      let analysisResult: DailyAnalysisResult;
      
      if (tokenCount <= maxTokens) {
        // 一括分析
        console.log(`📊 一括分析実行: ${logs.length}件のログ, 推定${tokenCount}トークン`);
        analysisResult = await this.analyzeAll(logs, request.timezone, request.businessDate);
      } else {
        // 分割分析
        console.log(`📊 分割分析実行: ${logs.length}件のログ, 推定${tokenCount}トークン`);
        analysisResult = await this.analyzeInChunks(logs, request.timezone, request.businessDate);
      }

      // 分析結果をキャッシュに保存
      await this.repository.saveAnalysisCache({
        userId: request.userId,
        businessDate: request.businessDate,
        analysisResult,
        logCount: logs.length
      });

      console.log(`✅ 統合分析完了: [${request.businessDate}] ${analysisResult.categories.length}カテゴリ, ${analysisResult.timeline.length}タイムライン`);
      
      return analysisResult;
    } catch (error) {
      console.error('❌ 統合分析エラー:', error);
      throw error instanceof ActivityLogError ? error :
        new ActivityLogError('統合分析の実行に失敗しました', 'UNIFIED_ANALYSIS_ERROR', { error, request });
    }
  }

  /**
   * 分析結果のキャッシュをチェック
   */
  async getCachedAnalysis(userId: string, businessDate: string): Promise<DailyAnalysisResult | null> {
    try {
      // 現在のログ数を取得
      const currentLogCount = await this.repository.getLogCountByDate(userId, businessDate);
      
      // キャッシュの有効性をチェック
      const isValid = await this.repository.isCacheValid(userId, businessDate, currentLogCount);
      
      if (!isValid) {
        return null;
      }

      // 有効なキャッシュを取得
      const cache = await this.repository.getAnalysisCache(userId, businessDate);
      return cache?.analysisResult || null;
    } catch (error) {
      console.error('❌ キャッシュチェックエラー:', error);
      return null; // エラー時はキャッシュを使用しない
    }
  }

  /**
   * 一括分析を実行
   */
  private async analyzeAll(logs: ActivityLog[], timezone: string, businessDate: string): Promise<DailyAnalysisResult> {
    try {
      const prompt = this.buildUnifiedPrompt(logs, timezone, businessDate);
      
      // デバッグ情報: プロンプトサイズ
      console.log(`📝 プロンプトサイズ: ${prompt.length}文字, 推定トークン: ${Math.ceil(prompt.length / 4)}`);
      
      // Gemini API 呼び出し
      const result = await this.model.generateContent(prompt);
      const response = result.response;

      // トークン使用量を記録
      if (response.usageMetadata) {
        const { promptTokenCount, candidatesTokenCount } = response.usageMetadata;
        await this.costMonitor.recordApiCall('generateDailySummary', promptTokenCount, candidatesTokenCount);
      }

      const responseText = response.text();
      
      // デバッグ情報: レスポンステキストの詳細
      console.log(`📝 Geminiレスポンス詳細: 文字数=${responseText.length}, 最後の100文字="${responseText.slice(-100)}"`);
      
      // 不完全なJSONの検出
      if (!responseText.trim().endsWith('}')) {
        console.warn('⚠️ Geminiレスポンスが不完全です（}で終わっていません）');
        console.log(`📝 レスポンス全文:\n${responseText}`);
      }
      
      // レスポンスをパース
      const geminiResponse = this.parseGeminiResponse(responseText);
      
      // DailyAnalysisResult形式に変換
      return this.convertToDailyAnalysisResult(geminiResponse, businessDate, logs.length);
    } catch (error) {
      console.error('❌ 一括分析エラー:', error);
      throw new ActivityLogError('一括分析の実行に失敗しました', 'BULK_ANALYSIS_ERROR', { error });
    }
  }

  /**
   * 分割分析を実行
   */
  private async analyzeInChunks(logs: ActivityLog[], timezone: string, businessDate: string): Promise<DailyAnalysisResult> {
    try {
      // 時間帯別にログを分割
      const chunks = this.splitLogsByTimeRange(logs, timezone);
      
      console.log(`🔄 分割分析: ${chunks.length}チャンクに分割`);
      
      // 各チャンクを分析
      const chunkResults: GeminiAnalysisResponse[] = [];
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        console.log(`📊 チャンク${i + 1}/${chunks.length}を分析: ${chunk.logs.length}件`);
        
        const prompt = this.buildChunkPrompt(chunk.logs, timezone, chunk.timeRange, businessDate);
        
        const result = await this.model.generateContent(prompt);
        const response = result.response;

        // トークン使用量を記録
        if (response.usageMetadata) {
          const { promptTokenCount, candidatesTokenCount } = response.usageMetadata;
          await this.costMonitor.recordApiCall('generateDailySummary', promptTokenCount, candidatesTokenCount);
        }

        const responseText = response.text();
        
        // デバッグ情報: チャンクレスポンステキストの詳細
        console.log(`📝 チャンク${i + 1}レスポンス詳細: 文字数=${responseText.length}, 最後の50文字="${responseText.slice(-50)}"`);
        
        // 不完全なJSONの検出
        if (!responseText.trim().endsWith('}')) {
          console.warn(`⚠️ チャンク${i + 1}のレスポンスが不完全です`);
        }
        
        const chunkResult = this.parseGeminiResponse(responseText);
        chunkResults.push(chunkResult);
      }

      // チャンク結果を統合
      const mergedResult = this.mergeChunkResults(chunkResults);
      
      // DailyAnalysisResult形式に変換
      return this.convertToDailyAnalysisResult(mergedResult, businessDate, logs.length);
    } catch (error) {
      console.error('❌ 分割分析エラー:', error);
      throw new ActivityLogError('分割分析の実行に失敗しました', 'CHUNK_ANALYSIS_ERROR', { error });
    }
  }

  /**
   * 統合分析用プロンプトを構築
   */
  private buildUnifiedPrompt(logs: ActivityLog[], timezone: string, businessDate: string): string {
    // 現在時刻の情報
    const now = new Date();
    const zonedNow = toZonedTime(now, timezone);
    const localTimeDisplay = format(zonedNow, 'yyyy-MM-dd HH:mm:ss zzz', { timeZone: timezone });

    // ログを時系列順にソート
    const sortedLogs = [...logs].sort((a, b) => 
      new Date(a.inputTimestamp).getTime() - new Date(b.inputTimestamp).getTime()
    );

    // ログリストを構築
    const logList = sortedLogs.map((log, index) => {
      const inputTime = new Date(log.inputTimestamp);
      const localTime = toZonedTime(inputTime, timezone);
      const timeStr = format(localTime, 'HH:mm', { timeZone: timezone });
      
      return `${index + 1}. [${timeStr}投稿] ${log.content}`;
    }).join('\n');

    return `
あなたは時間管理とタスク解析の専門家です。
ユーザーの1日の活動ログを統合的に分析し、正確な時間配分とタイムラインを生成してください。

【分析日時情報】
業務日: ${businessDate}
現在時刻: ${localTimeDisplay}
ユーザータイムゾーン: ${timezone}
対象ログ数: ${logs.length}件

【活動ログ一覧】（投稿時刻順）
${logList}

【重要な分析指針】
1. **時間解釈の精度**：
   - 「14:00-15:30は会議」→明確な時間範囲として解釈
   - 「いま30分休憩していた」→投稿時刻から30分前〜投稿時刻
   - 「午前中ずっとプログラミング」→9:00-12:00頃と推定
   - 「さっき〇〇した」→投稿時刻の直近30分〜1時間前と推定

2. **重複・矛盾の検出**：
   - 同じ時間帯に複数の活動が記録されている場合を検出
   - 明らかに矛盾する時間記録を警告

3. **未記録時間の推定**：
   - 記録されていない時間帯を特定
   - 通常の勤務時間（9:00-18:00）との比較

4. **信頼度評価**：
   - 明示的時刻（例：14:00-15:30）→高信頼度
   - 相対時刻（例：いま30分）→中信頼度  
   - 曖昧表現（例：午前中）→低信頼度

【出力形式】（必ずJSON形式で回答してください）
{
  "categories": [
    {
      "category": "カテゴリ名",
      "subCategory": "サブカテゴリ名",
      "estimatedMinutes": 推定時間（分）,
      "confidence": 信頼度（0-1）,
      "logCount": 関連ログ数,
      "representativeActivities": ["代表的な活動1", "代表的な活動2"]
    }
  ],
  "timeline": [
    {
      "startTime": "開始時刻（ISO 8601形式、UTC）",
      "endTime": "終了時刻（ISO 8601形式、UTC）", 
      "category": "カテゴリ名",
      "subCategory": "サブカテゴリ名",
      "content": "活動内容",
      "confidence": 時間推定信頼度（0-1）,
      "sourceLogIds": ["元ログのID1", "元ログのID2"]
    }
  ],
  "timeDistribution": {
    "totalEstimatedMinutes": 総推定時間,
    "workingMinutes": 作業時間,
    "breakMinutes": 休憩時間,
    "unaccountedMinutes": 未記録時間,
    "overlapMinutes": 重複時間
  },
  "insights": {
    "productivityScore": 生産性スコア（0-100）,
    "workBalance": {
      "focusTimeRatio": 集中作業時間割合,
      "meetingTimeRatio": 会議時間割合,
      "breakTimeRatio": 休憩時間割合,
      "adminTimeRatio": 管理業務時間割合
    },
    "suggestions": ["改善提案1", "改善提案2"],
    "highlights": ["今日のハイライト1", "今日のハイライト2"],
    "motivation": "明日への励ましメッセージ"
  },
  "warnings": [
    {
      "type": "警告タイプ（time_overlap/time_gap/inconsistent_input等）",
      "severity": "重要度（low/medium/high）",
      "message": "警告メッセージ",
      "affectedTimeRanges": [
        {
          "startTime": "開始時刻",
          "endTime": "終了時刻",
          "description": "説明"
        }
      ],
      "suggestions": ["対処提案1", "対処提案2"]
    }
  ],
  "confidence": 全体分析信頼度（0-1）
}

必ずJSON形式のみで回答してください。説明文は不要です。
`;
  }

  /**
   * チャンク分析用プロンプトを構築
   */
  private buildChunkPrompt(logs: ActivityLog[], timezone: string, timeRange: string, businessDate: string): string {
    const logList = logs.map((log, index) => {
      const inputTime = new Date(log.inputTimestamp);
      const localTime = toZonedTime(inputTime, timezone);
      const timeStr = format(localTime, 'HH:mm', { timeZone: timezone });
      
      return `${index + 1}. [${timeStr}投稿] ${log.content}`;
    }).join('\n');

    return `
${timeRange}の活動ログを分析してください。

【対象時間帯】: ${timeRange}
【業務日】: ${businessDate} 
【ログ一覧】:
${logList}

この時間帯の活動を分析し、カテゴリ分類とタイムラインを生成してください。
出力形式は統合分析と同じJSON形式です。
`;
  }

  /**
   * ログを時間帯別に分割
   */
  private splitLogsByTimeRange(logs: ActivityLog[], timezone: string): Array<{
    timeRange: string;
    logs: ActivityLog[];
  }> {
    const chunks: Array<{ timeRange: string; logs: ActivityLog[] }> = [];
    
    // 時間帯を定義
    const timeRanges = [
      { name: '早朝（5:00-9:00）', start: 5, end: 9 },
      { name: '午前（9:00-12:00）', start: 9, end: 12 },
      { name: '午後（13:00-17:00）', start: 13, end: 17 },
      { name: '夕方（17:00-21:00）', start: 17, end: 21 },
      { name: '夜間（21:00-24:00）', start: 21, end: 24 }
    ];

    for (const range of timeRanges) {
      const rangeLogs = logs.filter(log => {
        const inputTime = new Date(log.inputTimestamp);
        const localTime = toZonedTime(inputTime, timezone);
        const hour = localTime.getHours();
        return hour >= range.start && hour < range.end;
      });

      if (rangeLogs.length > 0) {
        chunks.push({
          timeRange: range.name,
          logs: rangeLogs
        });
      }
    }

    return chunks;
  }

  /**
   * チャンク結果を統合
   */
  private mergeChunkResults(chunkResults: GeminiAnalysisResponse[]): GeminiAnalysisResponse {
    // カテゴリを統合
    const mergedCategories = new Map<string, CategorySummary>();
    
    for (const result of chunkResults) {
      for (const category of result.categories) {
        const key = `${category.category}-${category.subCategory || ''}`;
        
        if (mergedCategories.has(key)) {
          const existing = mergedCategories.get(key)!;
          existing.estimatedMinutes += category.estimatedMinutes;
          existing.logCount += category.logCount;
          existing.representativeActivities = [
            ...existing.representativeActivities,
            ...category.representativeActivities
          ].slice(0, 5); // 最大5件
        } else {
          mergedCategories.set(key, { ...category });
        }
      }
    }

    // タイムラインを統合（時刻順）
    const mergedTimeline = chunkResults
      .flatMap(result => result.timeline)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    // 時間分布を統合
    const mergedTimeDistribution: TimeDistribution = {
      totalEstimatedMinutes: 0,
      workingMinutes: 0,
      breakMinutes: 0,
      unaccountedMinutes: 0,
      overlapMinutes: 0
    };

    for (const result of chunkResults) {
      mergedTimeDistribution.totalEstimatedMinutes += result.timeDistribution.totalEstimatedMinutes;
      mergedTimeDistribution.workingMinutes += result.timeDistribution.workingMinutes;
      mergedTimeDistribution.breakMinutes += result.timeDistribution.breakMinutes;
      mergedTimeDistribution.unaccountedMinutes += result.timeDistribution.unaccountedMinutes;
      mergedTimeDistribution.overlapMinutes += result.timeDistribution.overlapMinutes;
    }

    // 洞察を統合（最初のチャンクのものを使用し、提案を統合）
    const firstInsight = chunkResults[0]?.insights || {
      productivityScore: 70,
      workBalance: {
        focusTimeRatio: 0.5,
        meetingTimeRatio: 0.2,
        breakTimeRatio: 0.2,
        adminTimeRatio: 0.1
      },
      suggestions: [],
      highlights: [],
      motivation: '今日もお疲れさまでした！'
    };

    const allSuggestions = chunkResults.flatMap(r => r.insights.suggestions);
    const allHighlights = chunkResults.flatMap(r => r.insights.highlights);

    firstInsight.suggestions = [...new Set(allSuggestions)].slice(0, 3);
    firstInsight.highlights = [...new Set(allHighlights)].slice(0, 3);

    // 警告を統合
    const mergedWarnings = chunkResults.flatMap(result => result.warnings);

    // 全体の信頼度（平均）
    const avgConfidence = chunkResults.reduce((sum, r) => sum + r.confidence, 0) / chunkResults.length;

    return {
      categories: Array.from(mergedCategories.values()),
      timeline: mergedTimeline,
      timeDistribution: mergedTimeDistribution,
      insights: firstInsight,
      warnings: mergedWarnings,
      confidence: avgConfidence
    };
  }

  /**
   * 不完全なJSONの修復を試行
   */
  private repairIncompleteJson(jsonText: string): string {
    try {
      let repaired = jsonText.trim();
      
      // 引用符が途中で終わっている場合を修復
      if (repaired.endsWith('"')) {
        // 最後の不完全な値を削除
        const lastCommaIndex = repaired.lastIndexOf(',');
        const lastColonIndex = repaired.lastIndexOf(':');
        
        if (lastColonIndex > lastCommaIndex) {
          // 最後のプロパティが不完全
          repaired = repaired.substring(0, lastCommaIndex > 0 ? lastCommaIndex : repaired.lastIndexOf('{'));
        }
      }
      
      // 配列やオブジェクトの途中で終わっている場合を修復
      let openBraces = 0;
      let openBrackets = 0;
      let inString = false;
      let escaped = false;
      
      for (let i = 0; i < repaired.length; i++) {
        const char = repaired[i];
        
        if (!inString) {
          if (char === '{') openBraces++;
          else if (char === '}') openBraces--;
          else if (char === '[') openBrackets++;
          else if (char === ']') openBrackets--;
          else if (char === '"') inString = true;
        } else {
          if (char === '"' && !escaped) inString = false;
          escaped = char === '\\' && !escaped;
        }
      }
      
      // 必要な閉じ括弧を追加
      repaired += ']'.repeat(openBrackets);
      repaired += '}'.repeat(openBraces);
      
      console.log(`🔧 JSON修復完了: ${repaired.length}文字`);
      return repaired;
      
    } catch (error) {
      console.error('❌ JSON修復失敗:', error);
      // 修復できない場合は最小限の有効なJSONを返す
      return '{"categories":[],"timeline":[],"timeDistribution":{"totalEstimatedMinutes":0,"workingMinutes":0,"breakMinutes":0,"unaccountedMinutes":0,"overlapMinutes":0},"insights":{"productivityScore":70,"workBalance":{"focusTimeRatio":0.5,"meetingTimeRatio":0.2,"breakTimeRatio":0.2,"adminTimeRatio":0.1},"suggestions":[],"highlights":[],"motivation":"分析中にエラーが発生しました"},"warnings":[],"confidence":0.5}';
    }
  }

  /**
   * Geminiレスポンスをパース
   */
  private parseGeminiResponse(responseText: string): GeminiAnalysisResponse {
    try {
      // JSONのみを抽出
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      let jsonText = jsonMatch ? jsonMatch[0] : responseText;
      
      // 不完全なJSONの修復を試行
      if (!jsonText.trim().endsWith('}')) {
        console.log('🔧 不完全なJSONの修復を試行...');
        jsonText = this.repairIncompleteJson(jsonText);
      }
      
      const parsed = JSON.parse(jsonText);
      
      return {
        categories: parsed.categories || [],
        timeline: parsed.timeline || [],
        timeDistribution: parsed.timeDistribution || {
          totalEstimatedMinutes: 0,
          workingMinutes: 0,
          breakMinutes: 0,
          unaccountedMinutes: 0,
          overlapMinutes: 0
        },
        insights: parsed.insights || {
          productivityScore: 70,
          workBalance: {
            focusTimeRatio: 0.5,
            meetingTimeRatio: 0.2,
            breakTimeRatio: 0.2,
            adminTimeRatio: 0.1
          },
          suggestions: [],
          highlights: [],
          motivation: '今日もお疲れさまでした！'
        },
        warnings: parsed.warnings || [],
        confidence: parsed.confidence || 0.7
      };
    } catch (error) {
      console.error('❌ Geminiレスポンスパースエラー:', error);
      throw new ActivityLogError('分析結果の解析に失敗しました', 'PARSE_RESPONSE_ERROR', { error, responseText });
    }
  }

  /**
   * GeminiAnalysisResponseをDailyAnalysisResultに変換
   */
  private convertToDailyAnalysisResult(
    geminiResponse: GeminiAnalysisResponse, 
    businessDate: string, 
    logCount: number
  ): DailyAnalysisResult {
    return {
      businessDate,
      totalLogCount: logCount,
      categories: geminiResponse.categories,
      timeline: geminiResponse.timeline,
      timeDistribution: geminiResponse.timeDistribution,
      insights: geminiResponse.insights,
      warnings: geminiResponse.warnings,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * 空の分析結果を作成（ログが0件の場合）
   */
  private createEmptyAnalysis(businessDate: string): DailyAnalysisResult {
    return {
      businessDate,
      totalLogCount: 0,
      categories: [],
      timeline: [],
      timeDistribution: {
        totalEstimatedMinutes: 0,
        workingMinutes: 0,
        breakMinutes: 0,
        unaccountedMinutes: 480, // 8時間分を未記録とする
        overlapMinutes: 0
      },
      insights: {
        productivityScore: 0,
        workBalance: {
          focusTimeRatio: 0,
          meetingTimeRatio: 0,
          breakTimeRatio: 0,
          adminTimeRatio: 0
        },
        suggestions: ['活動記録を始めましょう！'],
        highlights: ['新しい一日の始まりです'],
        motivation: '活動記録をつけて、生産的な一日を過ごしましょう！'
      },
      warnings: [],
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * トークン数を推定
   */
  estimateTokenCount(logs: ActivityLog[]): number {
    // 簡易的なトークン数推定（日本語は1文字≒1.5トークン）
    const totalChars = logs.reduce((sum, log) => sum + log.content.length, 0);
    const promptOverhead = 2000; // プロンプト固定部分
    
    return Math.ceil(totalChars * 1.5) + promptOverhead;
  }
}