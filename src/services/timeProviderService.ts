/**
 * 時刻プロバイダーサービス
 * 時刻プロバイダーの管理とシミュレーション機能を提供
 */

import { ITimeProvider } from '../interfaces/dependencies';
import { RealTimeProvider, MockTimeProvider } from '../factories';
import { logger } from '../utils/logger';

export interface ITimeProviderService {
  getTimeProvider(): ITimeProvider;
  enableSimulationMode(initialDate?: Date): void;
  disableSimulationMode(): void;
  isInSimulationMode(): boolean;
  setSimulatedTime(date: Date): void;
  now(): Date;
  startTimeProgression(): void;
  stopTimeProgression(): void;
  isTimeProgressing(): boolean;
}

/**
 * TimeProviderService
 * 依存性注入パターンで時刻プロバイダーを管理
 */
export class TimeProviderService implements ITimeProviderService {
  private timeProvider: ITimeProvider;
  private isSimulationMode: boolean = false;

  constructor(timeProvider?: ITimeProvider) {
    // デフォルトは実時刻プロバイダー、または注入されたプロバイダーを使用
    this.timeProvider = timeProvider || new RealTimeProvider();
    // 注入されたプロバイダーがMockの場合はシミュレーションモードとして扱う
    this.isSimulationMode = this.timeProvider instanceof MockTimeProvider;
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
      logger.info('TIME_PROVIDER_SERVICE', 'シミュレーションモード有効化');
    }
  }

  /**
   * シミュレーションモードを無効化（実時刻に戻す）
   */
  disableSimulationMode(): void {
    if (this.isSimulationMode) {
      this.timeProvider = new RealTimeProvider();
      this.isSimulationMode = false;
      logger.info('TIME_PROVIDER_SERVICE', '実時刻モードに復帰');
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
      logger.info('TIME_PROVIDER_SERVICE', `シミュレーション時刻を設定: ${date.toISOString()}`);
    } else {
      logger.warn('TIME_PROVIDER_SERVICE', 'シミュレーションモードではないため、時刻設定はスキップされました');
    }
  }

  /**
   * 現在時刻を取得（プロバイダー経由）
   */
  now(): Date {
    return this.timeProvider.now();
  }

  /**
   * 時間進行を開始（MockTimeProviderの場合のみ）
   */
  startTimeProgression(): void {
    if (this.timeProvider instanceof MockTimeProvider) {
      this.timeProvider.startTimeProgression();
    } else {
      logger.warn('TIME_PROVIDER_SERVICE', '実時刻モードでは時間進行機能は使用できません');
    }
  }

  /**
   * 時間進行を停止（MockTimeProviderの場合のみ）
   */
  stopTimeProgression(): void {
    if (this.timeProvider instanceof MockTimeProvider) {
      this.timeProvider.stopTimeProgression();
    } else {
      logger.warn('TIME_PROVIDER_SERVICE', '実時刻モードでは時間進行機能は使用できません');
    }
  }

  /**
   * 時間進行状態を確認（MockTimeProviderの場合のみ）
   */
  isTimeProgressing(): boolean {
    if (this.timeProvider instanceof MockTimeProvider) {
      return this.timeProvider.isTimeProgressing();
    }
    return false;
  }

  /**
   * デフォルトインスタンスを作成（後方互換性のため）
   */
  static createDefault(): TimeProviderService {
    return new TimeProviderService();
  }
}