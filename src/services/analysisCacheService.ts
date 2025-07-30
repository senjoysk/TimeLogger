/**
 * 分析キャッシュ管理サービス
 * 高速レスポンスと効率的なAPI使用のためのキャッシュ戦略
 */

import { IActivityLogRepository } from '../repositories/activityLogRepository';
import {
  DailyAnalysisResult,
  AnalysisCache,
  CreateAnalysisCacheRequest,
  ActivityLogError
} from '../types/activityLog';
import { logger } from '../utils/logger';
import { withDatabaseErrorHandling } from '../utils/errorHandler';

/**
 * キャッシュ戦略の設定
 */
export interface CacheStrategy {
  /** キャッシュの有効期限（分） */
  maxAgeMinutes: number;
  /** ログ数が変更された場合の無効化 */
  invalidateOnLogCountChange: boolean;
  /** 強制リフレッシュの頻度（時間） */
  forceRefreshHours: number;
  /** 古いキャッシュの自動削除（日） */
  autoCleanupDays: number;
}

/**
 * キャッシュ統計情報
 */
export interface CacheStats {
  totalCaches: number;
  hitRate: number;
  averageAge: number;
  staleCaches: number;
}

/**
 * 分析キャッシュサービスインターフェース
 */
export interface IAnalysisCacheService {
  /**
   * キャッシュから分析結果を取得
   * @param userId ユーザーID
   * @param businessDate 業務日
   * @returns キャッシュされた分析結果（null if not found/invalid）
   */
  getCache(userId: string, businessDate: string): Promise<DailyAnalysisResult | null>;

  /**
   * 分析結果をキャッシュに保存
   * @param userId ユーザーID
   * @param businessDate 業務日
   * @param analysisResult 分析結果
   * @param logCount 対象ログ数
   * @returns 保存されたキャッシュ
   */
  setCache(userId: string, businessDate: string, analysisResult: DailyAnalysisResult, logCount: number): Promise<AnalysisCache>;

  /**
   * キャッシュを無効化
   * @param userId ユーザーID
   * @param businessDate 業務日
   * @returns 無効化されたかどうか
   */
  invalidateCache(userId: string, businessDate: string): Promise<boolean>;

  /**
   * 複数日のキャッシュを無効化
   * @param userId ユーザーID
   * @param businessDates 業務日配列
   * @returns 無効化されたキャッシュ数
   */
  invalidateMultipleCaches(userId: string, businessDates: string[]): Promise<number>;

  /**
   * キャッシュの有効性をチェック
   * @param userId ユーザーID
   * @param businessDate 業務日
   * @param currentLogCount 現在のログ数
   * @returns キャッシュが有効かどうか
   */
  isCacheValid(userId: string, businessDate: string, currentLogCount: number): Promise<boolean>;

  /**
   * 古いキャッシュをクリーンアップ
   * @param olderThanDays 指定日数より古いキャッシュを削除
   * @returns 削除されたキャッシュ数
   */
  cleanup(olderThanDays?: number): Promise<number>;

  /**
   * キャッシュ統計を取得
   * @param userId ユーザーID（省略時は全体統計）
   * @returns キャッシュ統計情報
   */
  getStats(userId?: string): Promise<CacheStats>;
}

/**
 * AnalysisCacheServiceの実装
 */
export class AnalysisCacheService implements IAnalysisCacheService {
  private strategy: CacheStrategy;
  private hitCount: number = 0;
  private missCount: number = 0;

  constructor(
    private repository: IActivityLogRepository,
    strategy?: Partial<CacheStrategy>
  ) {
    // デフォルトのキャッシュ戦略
    this.strategy = {
      maxAgeMinutes: 60,           // 1時間有効
      invalidateOnLogCountChange: true,
      forceRefreshHours: 6,        // 6時間で強制リフレッシュ
      autoCleanupDays: 7,          // 7日後に自動削除
      ...strategy
    };

    logger.debug('CACHE', '🗄️ キャッシュサービス初期化', { strategy: this.strategy });
  }

  /**
   * キャッシュから分析結果を取得
   */
  async getCache(userId: string, businessDate: string): Promise<DailyAnalysisResult | null> {
    try {
      return await withDatabaseErrorHandling(
        async () => {
          const cache = await this.repository.getAnalysisCache(userId, businessDate);
          
          if (!cache) {
            this.missCount++;
            logger.debug('CACHE', `💨 キャッシュミス: [${businessDate}] ${userId}`);
            return null;
          }

          // キャッシュの年齢をチェック
          const cacheAge = this.getCacheAgeMinutes(cache.generatedAt);
          
          if (cacheAge > this.strategy.maxAgeMinutes) {
            this.missCount++;
            logger.debug('CACHE', `⏰ キャッシュ期限切れ: [${businessDate}] ${cacheAge}分経過`);
            await this.invalidateCache(userId, businessDate);
            return null;
          }

          // ログ数の変更をチェック
          if (this.strategy.invalidateOnLogCountChange) {
            const currentLogCount = await this.repository.getLogCountByDate(userId, businessDate);
            
            if (cache.logCount !== currentLogCount) {
              this.missCount++;
              logger.debug('CACHE', `🔄 ログ数変更によりキャッシュ無効: [${businessDate}] ${cache.logCount} -> ${currentLogCount}`);
              await this.invalidateCache(userId, businessDate);
              return null;
            }

            // ログ内容の変更をチェック（最終更新時刻比較）
            const latestLogUpdate = await this.getLatestLogUpdateTime(userId, businessDate);
            if (latestLogUpdate && latestLogUpdate > cache.generatedAt) {
              this.missCount++;
              logger.debug('CACHE', `📝 ログ内容変更によりキャッシュ無効: [${businessDate}] キャッシュ:${cache.generatedAt} < 最新:${latestLogUpdate}`);
              await this.invalidateCache(userId, businessDate);
              return null;
            }
          }

          // 強制リフレッシュの時間をチェック
          const forceRefreshMinutes = this.strategy.forceRefreshHours * 60;
          if (cacheAge > forceRefreshMinutes) {
            this.missCount++;
            logger.debug('CACHE', `🔄 強制リフレッシュ時間到達: [${businessDate}] ${cacheAge}分経過`);
            await this.invalidateCache(userId, businessDate);
            return null;
          }

          this.hitCount++;
          logger.debug('CACHE', `⚡ キャッシュヒット: [${businessDate}] ${cacheAge}分前生成`);
          
          return cache.analysisResult;
        },
        'キャッシュ取得',
        { userId, businessDate }
      );
    } catch (error) {
      // キャッシュエラーは非致命的なので、nullを返してキャッシュを使用しない
      logger.error('CACHE', '❌ キャッシュ取得エラー:', error);
      this.missCount++;
      return null;
    }
  }

  /**
   * 分析結果をキャッシュに保存
   */
  async setCache(userId: string, businessDate: string, analysisResult: DailyAnalysisResult, logCount: number): Promise<AnalysisCache> {
    try {
      const request: CreateAnalysisCacheRequest = {
        userId,
        businessDate,
        analysisResult,
        logCount
      };

      const savedCache = await this.repository.saveAnalysisCache(request);
      
      logger.debug('CACHE', `💾 キャッシュ保存: [${businessDate}] ${logCount}ログ, ${analysisResult.categories.length}カテゴリ`);
      
      return savedCache;
    } catch (error) {
      logger.error('CACHE', '❌ キャッシュ保存エラー:', error);
      throw error instanceof ActivityLogError ? error :
        new ActivityLogError('キャッシュの保存に失敗しました', 'CACHE_SAVE_ERROR', { error });
    }
  }

  /**
   * キャッシュを無効化
   */
  async invalidateCache(userId: string, businessDate: string): Promise<boolean> {
    try {
      const result = await this.repository.deleteAnalysisCache(userId, businessDate);
      
      if (result) {
        logger.debug('CACHE', `🗑️ キャッシュ無効化: [${businessDate}] ${userId}`);
      }
      
      return result;
    } catch (error) {
      logger.error('CACHE', '❌ キャッシュ無効化エラー:', error);
      return false;
    }
  }

  /**
   * 複数日のキャッシュを無効化
   */
  async invalidateMultipleCaches(userId: string, businessDates: string[]): Promise<number> {
    let invalidatedCount = 0;
    
    for (const businessDate of businessDates) {
      try {
        const result = await this.invalidateCache(userId, businessDate);
        if (result) {
          invalidatedCount++;
        }
      } catch (error) {
        logger.error('CACHE', `❌ キャッシュ無効化エラー [${businessDate}]:`, error);
      }
    }

    logger.debug('CACHE', `🗑️ 複数キャッシュ無効化: ${invalidatedCount}/${businessDates.length}件`);
    
    return invalidatedCount;
  }

  /**
   * キャッシュの有効性をチェック
   */
  async isCacheValid(userId: string, businessDate: string, currentLogCount: number): Promise<boolean> {
    try {
      const cache = await this.repository.getAnalysisCache(userId, businessDate);
      
      if (!cache) {
        return false; // キャッシュが存在しない
      }

      // キャッシュの年齢をチェック
      const cacheAge = this.getCacheAgeMinutes(cache.generatedAt);
      
      if (cacheAge > this.strategy.maxAgeMinutes) {
        return false; // 期限切れ
      }

      // ログ数の変更をチェック
      if (this.strategy.invalidateOnLogCountChange) {
        if (cache.logCount !== currentLogCount) {
          return false; // ログ数が変更された
        }

        // ログ内容の変更をチェック（最終更新時刻比較）
        const latestLogUpdate = await this.getLatestLogUpdateTime(userId, businessDate);
        if (latestLogUpdate && latestLogUpdate > cache.generatedAt) {
          return false; // ログ内容が変更された
        }
      }

      // 強制リフレッシュの時間をチェック
      const forceRefreshMinutes = this.strategy.forceRefreshHours * 60;
      if (cacheAge > forceRefreshMinutes) {
        return false; // 強制リフレッシュ時間到達
      }

      return true; // キャッシュは有効
    } catch (error) {
      logger.error('CACHE', '❌ キャッシュ有効性チェックエラー:', error);
      return false;
    }
  }

  /**
   * 古いキャッシュをクリーンアップ
   */
  async cleanup(olderThanDays?: number): Promise<number> {
    try {
      const days = olderThanDays || this.strategy.autoCleanupDays;
      const deletedCount = await this.repository.cleanupOldCaches(days);
      
      logger.debug('CACHE', `🧹 キャッシュクリーンアップ: ${deletedCount}件削除 (${days}日以上前)`);
      
      return deletedCount;
    } catch (error) {
      logger.error('CACHE', '❌ キャッシュクリーンアップエラー:', error);
      throw error instanceof ActivityLogError ? error :
        new ActivityLogError('キャッシュクリーンアップに失敗しました', 'CACHE_CLEANUP_ERROR', { error });
    }
  }

  /**
   * キャッシュ統計を取得
   */
  async getStats(userId?: string): Promise<CacheStats> {
    try {
      // 基本統計の計算
      const totalRequests = this.hitCount + this.missCount;
      const hitRate = totalRequests > 0 ? this.hitCount / totalRequests : 0;

      // ALLOW_TODO: 詳細統計は現在の機能要件に含まれていないため将来実装予定
      // 現在は基本的な情報のみ返す
      return {
        totalCaches: 0, // 実装する場合はSQLクエリで取得
        hitRate: Math.round(hitRate * 100) / 100,
        averageAge: 0,  // 実装する場合は平均年齢を計算
        staleCaches: 0  // 実装する場合は古いキャッシュ数を計算
      };
    } catch (error) {
      logger.error('CACHE', '❌ キャッシュ統計取得エラー:', error);
      throw error instanceof ActivityLogError ? error :
        new ActivityLogError('キャッシュ統計の取得に失敗しました', 'CACHE_STATS_ERROR', { error });
    }
  }

  /**
   * キャッシュの年齢（分）を計算
   */
  private getCacheAgeMinutes(generatedAt: string): number {
    const generatedTime = new Date(generatedAt).getTime();
    const now = new Date().getTime();
    return Math.floor((now - generatedTime) / (1000 * 60));
  }

  /**
   * キャッシュヒット率を取得
   */
  getHitRate(): number {
    const totalRequests = this.hitCount + this.missCount;
    return totalRequests > 0 ? this.hitCount / totalRequests : 0;
  }

  /**
   * キャッシュ統計をリセット
   */
  resetStats(): void {
    this.hitCount = 0;
    this.missCount = 0;
    logger.debug('CACHE', '📊 キャッシュ統計をリセットしました');
  }

  /**
   * キャッシュ戦略を更新
   */
  updateStrategy(newStrategy: Partial<CacheStrategy>): void {
    this.strategy = { ...this.strategy, ...newStrategy };
    logger.debug('CACHE', '⚙️ キャッシュ戦略を更新', { strategy: this.strategy });
  }

  /**
   * 現在のキャッシュ戦略を取得
   */
  getStrategy(): CacheStrategy {
    return { ...this.strategy };
  }

  /**
   * キャッシュ情報をフォーマット（Discord表示用）
   */
  formatCacheInfo(): string {
    const hitRate = this.getHitRate();
    const hitRatePercent = Math.round(hitRate * 100);
    const totalRequests = this.hitCount + this.missCount;

    return `📊 **キャッシュ統計**
⚡ ヒット率: ${hitRatePercent}% (${this.hitCount}/${totalRequests})
💨 ミス回数: ${this.missCount}
⚙️ 設定: ${this.strategy.maxAgeMinutes}分有効, ${this.strategy.autoCleanupDays}日で削除`;
  }

  /**
   * 指定日の最新ログ更新時刻を取得
   */
  private async getLatestLogUpdateTime(userId: string, businessDate: string): Promise<string | null> {
    try {
      // SQLiteリポジトリに専用メソッドを追加する代わりに、
      // 既存のメソッドを使用してログを取得し、最新のupdated_atを検索
      const logs = await this.repository.getLogsByDate(userId, businessDate);
      
      if (logs.length === 0) {
        return null;
      }

      // 最新のupdated_atを見つける
      let latestUpdate = logs[0].updatedAt;
      for (const log of logs) {
        if (log.updatedAt > latestUpdate) {
          latestUpdate = log.updatedAt;
        }
      }

      return latestUpdate;
    } catch (error) {
      logger.error('CACHE', '❌ 最新ログ更新時刻取得エラー:', error);
      return null; // エラー時はキャッシュを維持
    }
  }

  /**
   * 定期メンテナンスタスク（cron等から呼び出し）
   */
  async performMaintenance(): Promise<{
    cleanedCaches: number;
    hitRate: number;
  }> {
    try {
      logger.debug('CACHE', '🔧 キャッシュメンテナンス開始');

      // 古いキャッシュをクリーンアップ
      const cleanedCaches = await this.cleanup();

      // 統計情報を記録
      const hitRate = this.getHitRate();

      logger.debug('CACHE', `✅ キャッシュメンテナンス完了: ${cleanedCaches}件削除, ヒット率${Math.round(hitRate * 100)}%`);

      return {
        cleanedCaches,
        hitRate
      };
    } catch (error) {
      logger.error('CACHE', '❌ キャッシュメンテナンスエラー:', error);
      throw error instanceof ActivityLogError ? error :
        new ActivityLogError('キャッシュメンテナンスに失敗しました', 'CACHE_MAINTENANCE_ERROR', { error });
    }
  }
}