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

/**
 * 開始・終了ログマッチングサービス
 */
export class ActivityLogMatchingService {
  private strategy: MatchingStrategy;

  constructor(strategy: MatchingStrategy) {
    this.strategy = strategy;
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
}