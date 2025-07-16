/**
 * 統合テスト用共有データベースクラス
 * テストパフォーマンス向上のため、データベース初期化を最適化
 */

import { SqliteActivityLogRepository } from '../../repositories/sqliteActivityLogRepository';
import { ActivityLoggingIntegration, ActivityLoggingConfig } from '../../integration/activityLoggingIntegration';
import * as path from 'path';
import * as fs from 'fs';

export class SharedTestDatabase {
  private static instance: SharedTestDatabase | null = null;
  private repository: SqliteActivityLogRepository | null = null;
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

      // 統合リポジトリの初期化
      this.repository = new SqliteActivityLogRepository(this.testDbPath);
      await this.repository.initializeDatabase();

      // 統合クラスの初期化（テスト用に最適化）
      const config: ActivityLoggingConfig = {
        databasePath: this.testDbPath,
        geminiApiKey: 'test-api-key',
        debugMode: false,
        defaultTimezone: 'Asia/Tokyo',
        enableAutoAnalysis: false, // テスト時は自動分析無効
        cacheValidityMinutes: 1, // テスト用に短時間設定
        targetUserId: '' // マルチユーザー対応により削除
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

  async getRepository(): Promise<SqliteActivityLogRepository> {
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
      // テストデータのクリーンアップ（runQueryを使用）
      await (this.repository as any).runQuery('DELETE FROM activity_logs');
      await (this.repository as any).runQuery('DELETE FROM user_settings');
      await (this.repository as any).runQuery('DELETE FROM todo_tasks');
      await (this.repository as any).runQuery('DELETE FROM message_classifications');
      await (this.repository as any).runQuery('DELETE FROM api_costs');
      await (this.repository as any).runQuery('DELETE FROM daily_analysis_cache');
      
      console.log('✅ テストデータクリーンアップ完了');
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

      if (this.repository) {
        await this.repository.close();
        this.repository = null;
      }

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