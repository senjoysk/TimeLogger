/**
 * TimeProviderFactory
 * TimeProviderServiceのグローバルインスタンスを管理
 * 段階的移行のための暫定的なファクトリー
 */

import { TimeProviderService, ITimeProviderService } from './timeProviderService';
import { ITimeProvider } from '../interfaces/dependencies';

/**
 * グローバルインスタンスの管理（後方互換性のため）
 * 将来的にはDIコンテナに移行予定
 */
class TimeProviderFactory {
  private static globalInstance: TimeProviderService | null = null;

  /**
   * グローバルインスタンスを取得（シングルトンの代替）
   * @deprecated 将来的にDIコンテナを使用してください
   */
  static getGlobalInstance(): TimeProviderService {
    if (!this.globalInstance) {
      this.globalInstance = new TimeProviderService();
    }
    return this.globalInstance;
  }

  /**
   * 新しいインスタンスを作成
   */
  static createInstance(timeProvider?: ITimeProvider): TimeProviderService {
    return new TimeProviderService(timeProvider);
  }

  /**
   * グローバルインスタンスをリセット（テスト用）
   */
  static resetGlobalInstance(): void {
    this.globalInstance = null;
  }

  /**
   * グローバルインスタンスを設定（テストやWeb管理アプリ用）
   */
  static setGlobalInstance(instance: TimeProviderService): void {
    this.globalInstance = instance;
  }
}

export { TimeProviderFactory };