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

    console.log('🗄️ キャッシュサービス初期化:', this.strategy);
  }

  /**
   * キャッシュから分析結果を取得
   */
  async getCache(userId: string, businessDate: string): Promise<DailyAnalysisResult | null> {
    try {
      const cache = await this.repository.getAnalysisCache(userId, businessDate);
      
      if (!cache) {
        this.missCount++;
        console.log(`💨 キャッシュミス: [${businessDate}] ${userId}`);
        return null;
      }

      // キャッシュの年齢をチェック
      const cacheAge = this.getCacheAgeMinutes(cache.generatedAt);
      
      if (cacheAge > this.strategy.maxAgeMinutes) {
        this.missCount++;
        console.log(`⏰ キャッシュ期限切れ: [${businessDate}] ${cacheAge}分経過`);
        await this.invalidateCache(userId, businessDate);
        return null;
      }

      // ログ数の変更をチェック
      if (this.strategy.invalidateOnLogCountChange) {
        const currentLogCount = await this.repository.getLogCountByDate(userId, businessDate);
        
        if (cache.logCount !== currentLogCount) {
          this.missCount++;
          console.log(`🔄 ログ数変更によりキャッシュ無効: [${businessDate}] ${cache.logCount} -> ${currentLogCount}`);
          await this.invalidateCache(userId, businessDate);
          return null;
        }
      }

      // 強制リフレッシュの時間をチェック
      const forceRefreshMinutes = this.strategy.forceRefreshHours * 60;
      if (cacheAge > forceRefreshMinutes) {
        this.missCount++;
        console.log(`🔄 強制リフレッシュ時間到達: [${businessDate}] ${cacheAge}分経過`);
        await this.invalidateCache(userId, businessDate);
        return null;
      }

      this.hitCount++;
      console.log(`⚡ キャッシュヒット: [${businessDate}] ${cacheAge}分前生成`);
      
      return cache.analysisResult;
    } catch (error) {
      console.error('❌ キャッシュ取得エラー:', error);
      this.missCount++;
      return null; // エラー時はキャッシュを使用しない
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
      
      console.log(`💾 キャッシュ保存: [${businessDate}] ${logCount}ログ, ${analysisResult.categories.length}カテゴリ`);
      
      return savedCache;
    } catch (error) {
      console.error('❌ キャッシュ保存エラー:', error);
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
        console.log(`🗑️ キャッシュ無効化: [${businessDate}] ${userId}`);
      }
      
      return result;
    } catch (error) {
      console.error('❌ キャッシュ無効化エラー:', error);
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
        console.error(`❌ キャッシュ無効化エラー [${businessDate}]:`, error);
      }
    }

    console.log(`🗑️ 複数キャッシュ無効化: ${invalidatedCount}/${businessDates.length}件`);
    
    return invalidatedCount;
  }

  /**
   * キャッシュの有効性をチェック
   */
  async isCacheValid(userId: string, businessDate: string, currentLogCount: number): Promise<boolean> {
    try {
      return await this.repository.isCacheValid(userId, businessDate, currentLogCount);
    } catch (error) {
      console.error('❌ キャッシュ有効性チェックエラー:', error);
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
      
      console.log(`🧹 キャッシュクリーンアップ: ${deletedCount}件削除 (${days}日以上前)`);
      
      return deletedCount;
    } catch (error) {
      console.error('❌ キャッシュクリーンアップエラー:', error);
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

      // TODO: より詳細な統計情報をデータベースから取得
      // 現在は基本的な情報のみ返す
      return {
        totalCaches: 0, // 実装する場合はSQLクエリで取得
        hitRate: Math.round(hitRate * 100) / 100,
        averageAge: 0,  // 実装する場合は平均年齢を計算
        staleCaches: 0  // 実装する場合は古いキャッシュ数を計算
      };
    } catch (error) {
      console.error('❌ キャッシュ統計取得エラー:', error);
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
    console.log('📊 キャッシュ統計をリセットしました');
  }

  /**
   * キャッシュ戦略を更新
   */
  updateStrategy(newStrategy: Partial<CacheStrategy>): void {
    this.strategy = { ...this.strategy, ...newStrategy };
    console.log('⚙️ キャッシュ戦略を更新:', this.strategy);
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
   * 定期メンテナンスタスク（cron等から呼び出し）
   */
  async performMaintenance(): Promise<{
    cleanedCaches: number;
    hitRate: number;
  }> {
    try {
      console.log('🔧 キャッシュメンテナンス開始');

      // 古いキャッシュをクリーンアップ
      const cleanedCaches = await this.cleanup();

      // 統計情報を記録
      const hitRate = this.getHitRate();

      console.log(`✅ キャッシュメンテナンス完了: ${cleanedCaches}件削除, ヒット率${Math.round(hitRate * 100)}%`);

      return {
        cleanedCaches,
        hitRate
      };
    } catch (error) {
      console.error('❌ キャッシュメンテナンスエラー:', error);
      throw error instanceof ActivityLogError ? error :
        new ActivityLogError('キャッシュメンテナンスに失敗しました', 'CACHE_MAINTENANCE_ERROR', { error });
    }
  }
}