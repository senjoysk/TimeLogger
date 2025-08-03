/**
 * 共有リポジトリマネージャー
 * データベース初期化の重複を防ぎ、アプリケーション全体で単一のリポジトリインスタンスを共有
 */

import { PartialCompositeRepository } from './PartialCompositeRepository';
import { logger } from '../utils/logger';
import * as path from 'path';

export class SharedRepositoryManager {
  private static instance: SharedRepositoryManager;
  private repository: PartialCompositeRepository | null = null;
  private isInitializing: boolean = false;
  private initializationPromise: Promise<void> | null = null;
  private repositoryPath: string | null = null;

  private constructor() {}

  /**
   * シングルトンインスタンスを取得
   */
  public static getInstance(): SharedRepositoryManager {
    if (!SharedRepositoryManager.instance) {
      SharedRepositoryManager.instance = new SharedRepositoryManager();
    }
    return SharedRepositoryManager.instance;
  }

  /**
   * 共有リポジトリを取得または初期化
   */
  public async getRepository(databasePath: string): Promise<PartialCompositeRepository> {
    // パスを正規化（相対パスと絶対パスの差異を吸収）
    const normalizedPath = path.resolve(databasePath);
    
    // 既に初期化済みの場合
    if (this.repository) {
      // 正規化されたパスで比較
      const currentNormalizedPath = this.repositoryPath ? path.resolve(this.repositoryPath) : null;
      if (currentNormalizedPath && currentNormalizedPath !== normalizedPath) {
        logger.warn('SHARED_REPO', '⚠️ 異なるパスが指定されました。既存のリポジトリをクリアします', {
          current: currentNormalizedPath,
          requested: normalizedPath
        });
        await this.clear();
      } else {
        logger.debug('SHARED_REPO', '✅ 既存の共有リポジトリを使用');
        return this.repository;
      }
    }

    // 初期化中の場合は完了を待つ
    if (this.isInitializing && this.initializationPromise) {
      logger.info('SHARED_REPO', '⏳ リポジトリ初期化の完了を待機中...');
      await this.initializationPromise;
      return this.repository!;
    }

    // 新規初期化
    this.isInitializing = true;
    this.initializationPromise = this.initializeRepository(normalizedPath);
    
    try {
      await this.initializationPromise;
      return this.repository!;
    } finally {
      this.isInitializing = false;
      this.initializationPromise = null;
    }
  }

  /**
   * リポジトリを初期化
   */
  private async initializeRepository(normalizedPath: string): Promise<void> {
    logger.info('SHARED_REPO', '🚀 共有リポジトリの初期化を開始...');
    
    try {
      this.repository = new PartialCompositeRepository(normalizedPath);
      this.repositoryPath = normalizedPath;
      await this.repository.initializeDatabase();
      logger.success('SHARED_REPO', '✅ 共有リポジトリの初期化完了');
    } catch (error) {
      logger.error('SHARED_REPO', '❌ 共有リポジトリの初期化エラー:', error as Error);
      this.repository = null;
      this.repositoryPath = null;
      throw error;
    }
  }

  /**
   * リポジトリをクリア（主にテスト用）
   */
  public async clear(): Promise<void> {
    if (this.repository) {
      await this.repository.close();
      this.repository = null;
    }
    this.repositoryPath = null;
    this.isInitializing = false;
    this.initializationPromise = null;
  }

  /**
   * 既に初期化済みかどうか
   */
  public isInitialized(): boolean {
    return this.repository !== null;
  }

  /**
   * テスト用: インスタンスをリセット
   */
  public static resetInstance(): void {
    if (SharedRepositoryManager.instance) {
      SharedRepositoryManager.instance.clear();
    }
    SharedRepositoryManager.instance = null!;
  }
}