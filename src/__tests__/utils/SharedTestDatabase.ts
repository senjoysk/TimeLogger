/**
 * 統合テスト用共有データベースクラス
 * テストパフォーマンス向上のため、データベース初期化を最適化
 */

import { PartialCompositeRepository } from '../../repositories/PartialCompositeRepository';
import { ActivityLoggingIntegration, ActivityLoggingConfig } from '../../integration/activityLoggingIntegration';
import * as path from 'path';
import * as fs from 'fs';

export class SharedTestDatabase {
  private static instance: SharedTestDatabase | null = null;
  private repository: PartialCompositeRepository | null = null;
  private integration: ActivityLoggingIntegration | null = null;
  private testDbPath: string = '';
  private isInitialized: boolean = false;

  private constructor() {}

  static getInstance(): SharedTestDatabase {
    if (!this.instance) {
      this.instance = new SharedTestDatabase();
    }
    return this.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // テスト用データベースパスを設定
      this.testDbPath = path.join(process.cwd(), 'test-data', 'shared-test.db');
      
      // テストデータディレクトリを作成
      const testDir = path.dirname(this.testDbPath);
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }

      // 既存のテストDBファイルを削除
      if (fs.existsSync(this.testDbPath)) {
        fs.unlinkSync(this.testDbPath);
      }

      // 統合リポジトリの初期化（メモリDBで高速化）
      this.repository = new PartialCompositeRepository(':memory:');
      await this.repository.initializeDatabase();

      // 統合クラスの初期化（テスト用に最適化）
      const config: ActivityLoggingConfig = {
        databasePath: ':memory:', // メモリDBで高速化
        geminiApiKey: 'test-api-key',
        debugMode: false,
        defaultTimezone: 'Asia/Tokyo',
        enableAutoAnalysis: false, // テスト時は自動分析無効
        cacheValidityMinutes: 1, // テスト用に短時間設定
        targetUserId: '', // マルチユーザー対応により削除
        repository: this.repository // 共有リポジトリを注入
      };

      this.integration = new ActivityLoggingIntegration(config);
      await this.integration.initialize();

      this.isInitialized = true;
      console.log('✅ SharedTestDatabase初期化完了');
    } catch (error) {
      console.error('❌ SharedTestDatabase初期化エラー:', error);
      throw error;
    }
  }

  async getRepository(): Promise<PartialCompositeRepository> {
    if (!this.repository) {
      throw new Error('SharedTestDatabase: リポジトリが初期化されていません');
    }
    return this.repository;
  }

  async getIntegration(): Promise<ActivityLoggingIntegration> {
    if (!this.integration) {
      throw new Error('SharedTestDatabase: 統合クラスが初期化されていません');
    }
    return this.integration;
  }

  async cleanupForTest(): Promise<void> {
    if (!this.repository) {
      return;
    }

    try {
      // テストデータのクリーンアップ（PartialCompositeRepositoryの専用メソッド使用）
      // 全テーブルのデータを安全に削除
      
      // ActivityLogsのクリーンアップ（存在するユーザーを取得してログ削除）
      const users = await this.repository.getAllUsers();
      for (const user of users) {
        const logs = await this.repository.getLogsByDateRange(
          user.userId, 
          '1900-01-01', 
          '2100-12-31'
        );
        for (const log of logs) {
          await this.repository.deleteLog(log.id);
        }
      }
      
      // TODOのクリーンアップ
      for (const user of users) {
        const todos = await this.repository.getTodosByUserId(user.userId);
        for (const todo of todos) {
          await this.repository.deleteTodo(todo.id);
        }
      }
      
      console.log('✅ テストデータクリーンアップ完了（専用メソッド使用）');
    } catch (error) {
      console.error('❌ テストデータクリーンアップエラー:', error);
      throw error;
    }
  }

  async destroy(): Promise<void> {
    try {
      if (this.integration) {
        await this.integration.shutdown();
        this.integration = null;
      }

      // リポジトリは既にintegrationのshutdownで閉じられているため、
      // 手動で閉じる必要はない
      this.repository = null;

      // テストDBファイルを削除
      if (fs.existsSync(this.testDbPath)) {
        fs.unlinkSync(this.testDbPath);
      }

      this.isInitialized = false;
      console.log('✅ SharedTestDatabase破棄完了');
    } catch (error) {
      console.error('❌ SharedTestDatabase破棄エラー:', error);
      throw error;
    }
  }

  static async reset(): Promise<void> {
    if (this.instance) {
      await this.instance.destroy();
      this.instance = null;
    }
  }
}