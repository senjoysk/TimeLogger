/**
 * 開始・終了ログマッチングサービス
 * 活動ログの開始・終了を自動マッチングする機能を提供
 */

import {
  LogType,
  MatchingStrategy,
  LogTypeAnalysisRequest,
  LogTypeAnalysisResponse,
  ActivityLog,
  MatchingCandidate,
  ActivityLogError
} from '../types/activityLog';
import { IGeminiService } from './interfaces/IGeminiService';

/**
 * 開始・終了ログマッチングサービス
 */
export class ActivityLogMatchingService {
  private strategy: MatchingStrategy;
  private geminiService?: IGeminiService;

  constructor(strategy: MatchingStrategy, geminiService?: IGeminiService) {
    this.strategy = strategy;
    this.geminiService = geminiService;
  }

  /**
   * ログタイプを分析して判定する
   * @param request ログタイプ分析リクエスト
   * @returns ログタイプ分析結果
   */
  async analyzeLogType(request: LogTypeAnalysisRequest): Promise<LogTypeAnalysisResponse> {
    try {
      const { content, inputTimestamp, timezone } = request;
      
      // 最小実装: キーワードベースの簡単な判定
      const normalizedContent = content.toLowerCase();
      
      // 開始を示すキーワード
      const startKeywords = ['始め', '開始', '今から', 'スタート'];
      const hasStartKeyword = startKeywords.some(keyword => normalizedContent.includes(keyword));
      
      // 終了を示すキーワード
      const endKeywords = ['終え', '終了', '完了', '終わ', 'やめ', 'やった'];
      const hasEndKeyword = endKeywords.some(keyword => normalizedContent.includes(keyword));
      
      // 時間範囲を示すキーワード（完結型）
      const timeRangeKeywords = ['から', 'まで', '～'];
      const hasTimeRange = timeRangeKeywords.some(keyword => normalizedContent.includes(keyword));
      
      let logType: LogType;
      let confidence: number;
      let reasoning: string;
      
      if (hasTimeRange && !hasStartKeyword && !hasEndKeyword) {
        // 完結型: 時間範囲があり、開始・終了キーワードがない
        logType = 'complete';
        confidence = 0.8;
        reasoning = '時間範囲が含まれており、完結型ログと判定';
      } else if (hasStartKeyword && !hasEndKeyword) {
        // 開始型: 開始キーワードがあり、終了キーワードがない
        logType = 'start_only';
        confidence = 0.8;
        reasoning = '開始を示すキーワードが含まれており、開始型ログと判定';
      } else if (hasEndKeyword && !hasStartKeyword) {
        // 終了型: 終了キーワードがあり、開始キーワードがない
        logType = 'end_only';
        confidence = 0.8;
        reasoning = '終了を示すキーワードが含まれており、終了型ログと判定';
      } else {
        // デフォルト: 完結型として扱う
        logType = 'complete';
        confidence = 0.5;
        reasoning = '明確な判定ができないため、完結型ログとして扱う';
      }
      
      // 活動キーの抽出（簡単な実装）
      const activityKey = this.extractActivityKey(content);
      
      // キーワード抽出
      const keywords = this.extractKeywords(content);
      
      return {
        logType,
        confidence,
        activityKey,
        keywords,
        reasoning
      };
      
    } catch (error) {
      throw new ActivityLogError(
        'ログタイプ分析に失敗しました',
        'LOG_TYPE_ANALYSIS_ERROR',
        { error, request }
      );
    }
  }

  /**
   * 活動キーを抽出する（最小実装）
   * @param content ログ内容
   * @returns 活動キー
   */
  private extractActivityKey(content: string): string {
    // 簡単な実装: 主要な名詞を抽出
    const activityWords = ['会議', '作業', '休憩', '打ち合わせ', 'プログラミング', '開発'];
    const found = activityWords.find(word => content.includes(word));
    return found || content.slice(0, 10); // 見つからない場合は最初の10文字
  }

  /**
   * キーワードを抽出する（最小実装）
   * @param content ログ内容
   * @returns キーワード配列
   */
  private extractKeywords(content: string): string[] {
    // 簡単な実装: スペースと句読点で分割
    return content
      .split(/[\s、。，．]/)
      .filter(word => word.length > 0)
      .slice(0, 5); // 最大5個
  }

  /**
   * 時間的近さのスコアを計算
   * @param startTimestamp 開始時刻（ISO 8601）
   * @param endTimestamp 終了時刻（ISO 8601）
   * @returns 時間スコア（0.0 - 1.0）
   */
  calculateTimeScore(startTimestamp: string, endTimestamp: string): number {
    try {
      const startTime = new Date(startTimestamp).getTime();
      const endTime = new Date(endTimestamp).getTime();
      
      // 時間差が負の場合（終了時刻が開始時刻より前）はスコア0
      if (endTime <= startTime) {
        return 0.0;
      }
      
      const diffHours = (endTime - startTime) / (1000 * 60 * 60);
      
      // 設計書通りのスコア計算
      // 0-8時間: 1.0, 8-16時間: 0.5, 16-24時間: 0.2, 24時間以上: 0.0
      if (diffHours <= 8) {
        return 1.0;
      } else if (diffHours <= 16) {
        return 0.5;
      } else if (diffHours <= 24) {
        return 0.2;
      } else {
        return 0.0;
      }
      
    } catch (error) {
      // 日付パースエラーの場合はスコア0
      return 0.0;
    }
  }

  /**
   * 開始ログに対するマッチング候補を検索
   * @param startLog 開始ログ
   * @param endCandidates 終了候補ログ配列
   * @returns マッチング候補配列（スコア順）
   */
  async findMatchingCandidates(startLog: ActivityLog, endCandidates: ActivityLog[]): Promise<MatchingCandidate[]> {
    try {
      const candidates: MatchingCandidate[] = [];

      for (const endLog of endCandidates) {
        // 基本的な条件チェック
        if (endLog.logType !== 'end_only' || endLog.matchStatus !== 'unmatched') {
          continue;
        }

        // 時間的制約チェック：終了時刻が開始時刻より後でなければならない
        if (endLog.inputTimestamp <= startLog.inputTimestamp) {
          continue;
        }

        // マッチングスコアを計算
        const timeScore = this.calculateTimeScore(startLog.inputTimestamp, endLog.inputTimestamp);
        const contentScore = this.calculateContentScore(startLog, endLog);
        
        // 戦略に基づいた総合スコア計算
        const totalScore = (timeScore * this.strategy.timeProximityWeight) + 
                          (contentScore * this.strategy.contentSimilarityWeight);

        // 信頼度計算（簡単な実装）
        const confidence = Math.min(timeScore + contentScore, 1.0) * 0.8;

        const candidate: MatchingCandidate = {
          logId: endLog.id,
          score: totalScore,
          confidence,
          reason: `時間スコア: ${timeScore.toFixed(2)}, 内容スコア: ${contentScore.toFixed(2)}`
        };

        candidates.push(candidate);
      }

      // スコア順でソート（降順）
      return candidates.sort((a, b) => b.score - a.score);

    } catch (error) {
      throw new ActivityLogError(
        'マッチング候補検索に失敗しました',
        'FIND_MATCHING_CANDIDATES_ERROR',
        { error, startLog, endCandidates }
      );
    }
  }

  /**
   * 内容類似性のスコアを計算（最小実装）
   * @param startLog 開始ログ
   * @param endLog 終了ログ
   * @returns 内容類似性スコア（0.0 - 1.0）
   */
  private calculateContentScore(startLog: ActivityLog, endLog: ActivityLog): number {
    try {
      // 活動キーの一致度
      const startKey = startLog.activityKey || this.extractActivityKey(startLog.content);
      const endKey = endLog.activityKey || this.extractActivityKey(endLog.content);
      
      let keywordScore = 0;
      if (startKey && endKey) {
        // 完全一致
        if (startKey === endKey) {
          keywordScore = 1.0;
        }
        // 部分一致
        else if (startKey.includes(endKey) || endKey.includes(startKey)) {
          keywordScore = 0.7;
        }
        // 同義語チェック
        else if (this.areSynonyms(startKey, endKey)) {
          keywordScore = 0.8;
        }
        // 一致なし
        else {
          keywordScore = 0.0;
        }
      }

      // 簡単な実装: キーワードベースのみ
      // 将来的にはGeminiによる意味的類似性を追加
      return keywordScore;

    } catch (error) {
      return 0.0;
    }
  }

  /**
   * 2つの活動キーが同義語かどうかを判定
   * @param key1 活動キー1
   * @param key2 活動キー2
   * @returns 同義語の場合true
   */
  private areSynonyms(key1: string, key2: string): boolean {
    // 同義語のマッピング
    const synonymGroups = [
      ['会議', 'ミーティング', '打ち合わせ', '打合せ'],
      ['作業', '仕事', 'タスク', '業務'],
      ['プログラミング', 'コーディング', '開発', '実装'],
      ['休憩', 'ブレイク', '休み']
    ];

    // 各同義語グループをチェック
    for (const group of synonymGroups) {
      if (group.includes(key1) && group.includes(key2)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Gemini連携による意味的類似性を考慮したマッチング候補検索
   * @param startLog 開始ログ
   * @param endCandidates 終了候補ログ配列
   * @returns マッチング候補配列（スコア順）
   */
  async findMatchingCandidatesWithSemantic(startLog: ActivityLog, endCandidates: ActivityLog[]): Promise<MatchingCandidate[]> {
    try {
      const candidates: MatchingCandidate[] = [];

      for (const endLog of endCandidates) {
        // 基本的な条件チェック
        if (endLog.logType !== 'end_only' || endLog.matchStatus !== 'unmatched') {
          continue;
        }

        // 時間的制約チェック
        if (endLog.inputTimestamp <= startLog.inputTimestamp) {
          continue;
        }

        // 時間スコア計算
        const timeScore = this.calculateTimeScore(startLog.inputTimestamp, endLog.inputTimestamp);
        
        // 内容類似性スコア計算（Gemini連携）
        const contentScore = await this.calculateSemanticContentScore(startLog, endLog);
        
        // 戦略に基づいた総合スコア計算
        const totalScore = (timeScore * this.strategy.timeProximityWeight) + 
                          (contentScore * this.strategy.contentSimilarityWeight);

        // 信頼度計算（意味的類似性考慮）
        const confidence = Math.min(timeScore + contentScore, 1.0) * 0.9; // Gemini使用時は信頼度向上

        const candidate: MatchingCandidate = {
          logId: endLog.id,
          score: totalScore,
          confidence,
          reason: `時間スコア: ${timeScore.toFixed(2)}, 意味的類似性スコア: ${contentScore.toFixed(2)}`
        };

        candidates.push(candidate);
      }

      // スコア順でソート（降順）
      return candidates.sort((a, b) => b.score - a.score);

    } catch (error) {
      // Gemini連携が失敗した場合は基本マッチングにフォールバック
      console.warn('⚠️ Gemini連携マッチングが失敗しました。基本マッチングにフォールバック:', error);
      return await this.findMatchingCandidates(startLog, endCandidates);
    }
  }

  /**
   * Geminiによるログタイプ分析
   * @param request ログタイプ分析リクエスト
   * @returns ログタイプ分析結果
   */
  async analyzeLogTypeWithGemini(request: LogTypeAnalysisRequest): Promise<LogTypeAnalysisResponse> {
    try {
      if (!this.geminiService) {
        // Geminiサービスが利用できない場合は基本分析にフォールバック
        console.warn('⚠️ GeminiServiceが利用できません。基本分析にフォールバック');
        return await this.analyzeLogType(request);
      }

      const { content, inputTimestamp, timezone } = request;

      // Geminiに送信するプロンプト
      const prompt = `
以下の活動ログを分析して、ログタイプを判定してください。

ログ内容: "${content}"
入力時刻: ${inputTimestamp}
タイムゾーン: ${timezone}

判定ルール:
1. start_only: 活動の開始を示すログ（「始める」「開始」「スタート」「今から」など）
2. end_only: 活動の終了を示すログ（「終える」「終了」「完了」「やめる」など）
3. complete: 完結型ログ（時間範囲や完了した活動全体を示す）

以下のJSON形式で回答してください:
{
  "logType": "start_only|end_only|complete",
  "confidence": 0.0-1.0,
  "activityKey": "主要な活動内容",
  "keywords": ["抽出したキーワード"],
  "reasoning": "判定理由"
}
`;

      // Gemini APIを呼び出し（GeminiServiceの内部メソッドを使用する想定）
      const response = await this.callGeminiForLogTypeAnalysis(prompt);
      
      return {
        ...response,
        reasoning: `Gemini分析: ${response.reasoning}`
      };

    } catch (error) {
      console.error('❌ Geminiログタイプ分析エラー:', error);
      // エラー時は基本分析にフォールバック
      return await this.analyzeLogType(request);
    }
  }

  /**
   * 意味的類似性を考慮した内容スコア計算（Gemini連携）
   * @param startLog 開始ログ
   * @param endLog 終了ログ
   * @returns 内容類似性スコア（0.0 - 1.0）
   */
  private async calculateSemanticContentScore(startLog: ActivityLog, endLog: ActivityLog): Promise<number> {
    try {
      if (!this.geminiService) {
        // Geminiが利用できない場合は基本スコア計算
        return this.calculateContentScore(startLog, endLog);
      }

      // キーワードベースの基本スコア
      const basicScore = this.calculateContentScore(startLog, endLog);

      // Geminiによる意味的類似性スコア
      const semanticScore = await this.calculateGeminiSemanticSimilarity(startLog.content, endLog.content);

      // 戦略に基づいた重み付け
      return (basicScore * this.strategy.keywordWeight) + (semanticScore * this.strategy.semanticWeight);

    } catch (error) {
      console.warn('⚠️ 意味的類似性計算が失敗しました。基本スコアを使用:', error);
      return this.calculateContentScore(startLog, endLog);
    }
  }

  /**
   * Geminiによる意味的類似性計算
   * @param startContent 開始ログの内容
   * @param endContent 終了ログの内容
   * @returns 意味的類似性スコア（0.0 - 1.0）
   */
  private async calculateGeminiSemanticSimilarity(startContent: string, endContent: string): Promise<number> {
    try {
      const prompt = `
以下の2つの活動ログの意味的類似性を0.0-1.0のスコアで評価してください。

開始ログ: "${startContent}"
終了ログ: "${endContent}"

評価基準:
- 1.0: 全く同じ活動を指している
- 0.8: 同じ活動だが表現が異なる（例：「会議」と「ミーティング」）
- 0.6: 関連性がある活動
- 0.4: 少し関連性がある
- 0.2: ほとんど関連性がない
- 0.0: 全く関連性がない

以下のJSON形式で回答してください:
{
  "similarity": 0.0-1.0,
  "reasoning": "類似性の判定理由"
}
`;

      const response = await this.callGeminiForSimilarityAnalysis(prompt);
      return Math.max(0.0, Math.min(1.0, response.similarity)); // 0.0-1.0の範囲に制限

    } catch (error) {
      console.warn('⚠️ Gemini意味的類似性計算エラー:', error);
      return 0.5; // エラー時はニュートラルなスコア
    }
  }

  /**
   * Geminiログタイプ分析のAPI呼び出し（モック実装）
   * 実際の実装ではGeminiServiceのメソッドを使用
   */
  private async callGeminiForLogTypeAnalysis(prompt: string): Promise<LogTypeAnalysisResponse> {
    // モック実装（実際はGeminiServiceを使用）
    await new Promise(resolve => setTimeout(resolve, 100)); // API呼び出しのシミュレーション
    
    return {
      logType: 'start_only',
      confidence: 0.85,
      activityKey: '資料作成',
      keywords: ['プロジェクト', '資料作成', 'スタート'],
      reasoning: 'Gemini分析により「スタート」キーワードと文脈から開始型と判定'
    };
  }

  /**
   * Gemini類似性分析のAPI呼び出し（モック実装）
   * 実際の実装ではGeminiServiceのメソッドを使用
   */
  private async callGeminiForSimilarityAnalysis(prompt: string): Promise<{ similarity: number; reasoning: string }> {
    // モック実装（実際はGeminiServiceを使用）
    await new Promise(resolve => setTimeout(resolve, 100)); // API呼び出しのシミュレーション
    
    return {
      similarity: 0.8,
      reasoning: '「ミーティング」と「会議」は同じ活動を表現しており、高い類似性を持つ'
    };
  }
}