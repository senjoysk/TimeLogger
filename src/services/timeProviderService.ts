/**
 * 時刻プロバイダーサービス（シングルトン）
 * Web管理アプリとDiscord Bot間で時刻プロバイダーを共有
 */

import { ITimeProvider } from '../interfaces/dependencies';
import { RealTimeProvider, MockTimeProvider } from '../factories';

/**
 * TimeProviderServiceのシングルトンインスタンス
 * アプリケーション全体で共有される時刻プロバイダーを管理
 */
export class TimeProviderService {
  private static instance: TimeProviderService;
  private timeProvider: ITimeProvider;
  private isSimulationMode: boolean = false;

  private constructor() {
    // デフォルトは実時刻プロバイダー
    this.timeProvider = new RealTimeProvider();
  }

  /**
   * シングルトンインスタンスを取得
   */
  static getInstance(): TimeProviderService {
    if (!TimeProviderService.instance) {
      TimeProviderService.instance = new TimeProviderService();
    }
    return TimeProviderService.instance;
  }

  /**
   * 現在の時刻プロバイダーを取得
   */
  getTimeProvider(): ITimeProvider {
    return this.timeProvider;
  }

  /**
   * シミュレーションモードを有効化
   * @param initialDate 初期時刻（省略時は現在時刻）
   */
  enableSimulationMode(initialDate?: Date): void {
    if (!this.isSimulationMode) {
      this.timeProvider = new MockTimeProvider(initialDate);
      this.isSimulationMode = true;
      console.log('⏰ TimeProviderService: シミュレーションモード有効化');
    }
  }

  /**
   * シミュレーションモードを無効化（実時刻に戻す）
   */
  disableSimulationMode(): void {
    if (this.isSimulationMode) {
      this.timeProvider = new RealTimeProvider();
      this.isSimulationMode = false;
      console.log('⏰ TimeProviderService: 実時刻モードに復帰');
    }
  }

  /**
   * シミュレーションモードかどうかを確認
   */
  isInSimulationMode(): boolean {
    return this.isSimulationMode;
  }

  /**
   * MockTimeProviderの場合、時刻を設定
   * @param date 設定する時刻
   */
  setSimulatedTime(date: Date): void {
    if (this.timeProvider instanceof MockTimeProvider) {
      this.timeProvider.setMockDate(date);
      console.log(`⏰ TimeProviderService: シミュレーション時刻を設定: ${date.toISOString()}`);
    } else {
      console.warn('⚠️ TimeProviderService: シミュレーションモードではないため、時刻設定はスキップされました');
    }
  }

  /**
   * 現在時刻を取得（プロバイダー経由）
   */
  now(): Date {
    return this.timeProvider.now();
  }

  /**
   * テスト用：インスタンスをリセット
   */
  static resetForTesting(): void {
    TimeProviderService.instance = null as any;
  }
}