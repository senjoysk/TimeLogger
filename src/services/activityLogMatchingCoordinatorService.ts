/**
 * ActivityLogMatchingCoordinatorService
 * マッチング管理・調整専門サービス - 単一責任原則によるリファクタリング完了
 */

import { IActivityLogRepository } from '../repositories/activityLogRepository';
import { IActivityLogMatchingService } from './activityLogMatchingService';
import { ActivityLog, ActivityLogError } from '../types/activityLog';

/**
 * 活動ログマッチング管理サービス
 * 単一責任原則に従い、マッチング管理・調整機能のみを担当
 */
export class ActivityLogMatchingCoordinatorService {
  constructor(
    private repository: IActivityLogRepository,
    private matchingService: IActivityLogMatchingService
  ) {}

  /**
   * マッチングされていない開始・終了ログを取得
   * @param userId ユーザーID
   * @param timezone タイムゾーン
   * @returns マッチング待ちログ配列
   */
  async getUnmatchedLogs(userId: string, timezone: string): Promise<ActivityLog[]> {
    try {
      // すべてのログタイプのマッチング待ちログを取得
      const [startLogs, endLogs] = await Promise.all([
        this.repository.getUnmatchedLogs(userId, 'start_only'),
        this.repository.getUnmatchedLogs(userId, 'end_only')
      ]);
      
      const unmatchedLogs = [...startLogs, ...endLogs];
      
      // 入力時刻順でソート
      unmatchedLogs.sort((a, b) => new Date(a.inputTimestamp).getTime() - new Date(b.inputTimestamp).getTime());
      
      console.log(`🔍 マッチング待ちログを取得: ${unmatchedLogs.length}件`);
      
      return unmatchedLogs;
    } catch (error) {
      console.error('❗ マッチング待ちログ取得エラー:', error);
      throw error instanceof ActivityLogError ? error :
        new ActivityLogError('マッチング待ちログの取得に失敗しました', 'GET_UNMATCHED_LOGS_ERROR', { error });
    }
  }

  /**
   * 手動でログをマッチングする
   * @param startLogId 開始ログID
   * @param endLogId 終了ログID
   * @param userId ユーザーID
   * @returns マッチング結果
   */
  async manualMatchLogs(startLogId: string, endLogId: string, userId: string): Promise<{ startLog: ActivityLog; endLog: ActivityLog }> {
    try {
      // ログの存在確認
      const [startLog, endLog] = await Promise.all([
        this.repository.getLogById(startLogId),
        this.repository.getLogById(endLogId)
      ]);
      
      if (!startLog || !endLog) {
        throw new ActivityLogError('指定されたログが見つかりません', 'LOG_NOT_FOUND', { startLogId, endLogId });
      }
      
      // ユーザーの所有確認
      if (startLog.userId !== userId || endLog.userId !== userId) {
        throw new ActivityLogError('他のユーザーのログをマッチングすることはできません', 'UNAUTHORIZED_MATCH', { startLogId, endLogId });
      }
      
      // ログタイプの確認
      if (startLog.logType !== 'start_only' || endLog.logType !== 'end_only') {
        throw new ActivityLogError('開始ログと終了ログのみマッチングできます', 'INVALID_LOG_TYPE_FOR_MATCH', 
          { startLogType: startLog.logType, endLogType: endLog.logType });
      }
      
      // マッチング状態の確認
      if (startLog.matchStatus !== 'unmatched' || endLog.matchStatus !== 'unmatched') {
        throw new ActivityLogError('既にマッチング済みのログは再マッチングできません', 'ALREADY_MATCHED', 
          { startMatchStatus: startLog.matchStatus, endMatchStatus: endLog.matchStatus });
      }
      
      // マッチング実行
      await Promise.all([
        this.repository.updateLogMatching(startLogId, {
          matchStatus: 'matched',
          matchedLogId: endLogId,
          similarityScore: 1.0 // 手動マッチングはスコア1.0
        }),
        this.repository.updateLogMatching(endLogId, {
          matchStatus: 'matched',
          matchedLogId: startLogId,
          similarityScore: 1.0
        })
      ]);
      
      // 更新後のログを取得
      const [updatedStartLog, updatedEndLog] = await Promise.all([
        this.repository.getLogById(startLogId),
        this.repository.getLogById(endLogId)
      ]);
      
      console.log(`🔗 手動マッチング完了: ${startLogId} ↔️ ${endLogId}`);
      
      return {
        startLog: updatedStartLog!,
        endLog: updatedEndLog!
      };
    } catch (error) {
      console.error('❗ 手動マッチングエラー:', error);
      throw error instanceof ActivityLogError ? error :
        new ActivityLogError('手動マッチングに失敗しました', 'MANUAL_MATCH_ERROR', { error, startLogId, endLogId });
    }
  }

  /**
   * 自動マッチング処理を実行
   * @param log 対象ログ
   * @param userId ユーザーID
   */
  async performAutomaticMatching(log: ActivityLog, userId: string): Promise<void> {
    try {
      if (log.logType === 'start_only') {
        // 開始ログの場合、終了候補を検索
        const endCandidates = await this.repository.getUnmatchedLogs(userId, 'end_only');
        if (endCandidates.length > 0) {
          const candidates = await this.matchingService.findMatchingCandidatesWithSemantic(log, endCandidates);
          
          // 最高スコアの候補が閾値を超える場合自動マッチング
          if (candidates.length > 0 && candidates[0].score > 0.8) {
            await Promise.all([
              this.repository.updateLogMatching(log.id, {
                matchStatus: 'matched',
                matchedLogId: candidates[0].logId,
                similarityScore: candidates[0].score
              }),
              this.repository.updateLogMatching(candidates[0].logId, {
                matchStatus: 'matched',
                matchedLogId: log.id,
                similarityScore: candidates[0].score
              })
            ]);
            console.log(`✨ 自動マッチング成功: ${log.id} ↔️ ${candidates[0].logId} (スコア: ${candidates[0].score.toFixed(2)})`);
          }
        }
      } else if (log.logType === 'end_only') {
        // 終了ログの場合、開始候補を検索
        const startCandidates = await this.repository.getUnmatchedLogs(userId, 'start_only');
        if (startCandidates.length > 0) {
          // 終了ログから開始ログへのマッチングを検索
          for (const startLog of startCandidates) {
            const candidates = await this.matchingService.findMatchingCandidatesWithSemantic(startLog, [log]);
            
            if (candidates.length > 0 && candidates[0].score > 0.8) {
              await Promise.all([
                this.repository.updateLogMatching(startLog.id, {
                  matchStatus: 'matched',
                  matchedLogId: log.id,
                  similarityScore: candidates[0].score
                }),
                this.repository.updateLogMatching(log.id, {
                  matchStatus: 'matched',
                  matchedLogId: startLog.id,
                  similarityScore: candidates[0].score
                })
              ]);
              console.log(`✨ 自動マッチング成功: ${startLog.id} ↔️ ${log.id} (スコア: ${candidates[0].score.toFixed(2)})`);
              break; // 最初のマッチで停止
            }
          }
        }
      }
    } catch (error) {
      console.error('⚠️ 自動マッチングエラー (継続):', error);
      // 自動マッチングの失敗は致命的ではないのでエラーを継続
    }
  }
}