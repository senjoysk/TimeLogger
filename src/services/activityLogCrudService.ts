/**
 * ActivityLogCrudService
 * 基本CRUD操作専門サービス
 */

import { v4 as uuidv4 } from 'uuid';
import { toZonedTime, format } from 'date-fns-tz';
import { IActivityLogRepository } from '../repositories/activityLogRepository';
import { IGeminiService } from './interfaces/IGeminiService';
import { ITimezoneService } from './interfaces/ITimezoneService';
import { 
  ActivityLog, 
  CreateActivityLogRequest, 
  EditLogRequest, 
  DeleteLogRequest 
} from '../types/activityLog';
import { ActivityAnalysisResult } from '../types/activityAnalysis';
import { ActivityLogError } from '../types/activityLog';

/**
 * 活動ログCRUD操作専門サービス
 * 単一責任原則に従い、基本CRUD操作のみを担当
 */
export class ActivityLogCrudService {
  constructor(
    private repository: IActivityLogRepository,
    private geminiService: IGeminiService,
    private timezoneService: ITimezoneService
  ) {}

  /**
   * 新しい活動を記録
   * @param userId ユーザーID
   * @param content 活動内容（自然言語）
   * @param timezone ユーザーのタイムゾーン
   * @param inputTime 記録時刻（省略時は現在時刻）
   * @param aiAnalysis AI分析結果（オプション）
   * @returns 作成されたActivityLog
   */
  async recordActivity(
    userId: string, 
    content: string, 
    timezone: string, 
    inputTime?: string, 
    aiAnalysis?: ActivityAnalysisResult
  ): Promise<ActivityLog> {
    // 入力バリデーション
    if (!content || content.trim().length === 0) {
      throw new ActivityLogError('活動内容が空です', 'EMPTY_CONTENT');
    }

    if (content.length > 2000) {
      throw new ActivityLogError('活動内容が長すぎます', 'CONTENT_TOO_LONG');
    }

    // 現在時刻の取得
    const now = new Date();
    const inputTimestamp = inputTime ? new Date(inputTime).toISOString() : now.toISOString();
    
    // 業務日の計算（簡単な実装）
    const businessDate = format(toZonedTime(now, timezone), 'yyyy-MM-dd');

    // 基本的な活動ログ作成リクエスト
    const createRequest: CreateActivityLogRequest = {
      userId,
      content: content.trim(),
      inputTimestamp,
      businessDate,
    };

    // AI分析結果があれば統合
    if (aiAnalysis) {
      Object.assign(createRequest, {
        categories: aiAnalysis.activityCategory?.primaryCategory,
        startTime: aiAnalysis.timeEstimation?.startTime,
        endTime: aiAnalysis.timeEstimation?.endTime,
        confidence: aiAnalysis.analysisMetadata?.confidence,
      });
    }

    return await this.repository.saveLog(createRequest);
  }

  /**
   * ログを編集
   * @param request 編集リクエスト
   * @returns 更新されたActivityLog
   */
  async editLog(request: EditLogRequest): Promise<ActivityLog> {
    // 入力バリデーション
    if (!request.newContent || request.newContent.trim().length === 0) {
      throw new ActivityLogError('活動内容が空です', 'EMPTY_CONTENT');
    }

    if (request.newContent.length > 2000) {
      throw new ActivityLogError('活動内容が長すぎます', 'CONTENT_TOO_LONG');
    }

    // 既存ログの確認
    const existingLog = await this.repository.getLogById(request.logId);
    if (!existingLog) {
      throw new ActivityLogError('ログが見つかりません', 'LOG_NOT_FOUND');
    }

    if (existingLog.isDeleted) {
      throw new ActivityLogError('削除されたログは編集できません', 'DELETED_LOG_EDIT');
    }

    // ログ更新
    return await this.repository.updateLog(request.logId, request.newContent.trim());
  }

  /**
   * ログを削除
   * @param request 削除リクエスト
   * @returns 削除されたActivityLog
   */
  async deleteLog(request: DeleteLogRequest): Promise<ActivityLog> {
    // 既存ログの確認
    const existingLog = await this.repository.getLogById(request.logId);
    if (!existingLog) {
      throw new ActivityLogError('ログが見つかりません', 'LOG_NOT_FOUND');
    }

    if (existingLog.isDeleted) {
      throw new ActivityLogError('既に削除されたログです', 'ALREADY_DELETED');
    }

    // 論理削除実行
    return await this.repository.deleteLog(request.logId);
  }
}