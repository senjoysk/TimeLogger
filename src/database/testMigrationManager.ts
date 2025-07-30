/**
 * テスト用マイグレーション管理ユーティリティ
 * テストデータベースの段階的セットアップとクリーンアップ
 */

import { Database } from 'sqlite3';
import { MigrationManager } from './migrationManager';
import { DatabaseInitializer } from './databaseInitializer';
import { logger } from '../utils/logger';

/**
 * テスト専用マイグレーション管理クラス
 */
export class TestMigrationManager {
  private db: Database;
  private migrationManager: MigrationManager;
  private databaseInitializer: DatabaseInitializer;

  constructor(db: Database, databasePath: string) {
    this.db = db;
    this.migrationManager = new MigrationManager(db, databasePath);
    this.databaseInitializer = new DatabaseInitializer(db);
  }

  /**
   * テスト用データベースの完全初期化
   * スキーマ作成 + 全マイグレーション実行
   */
  async initializeTestDatabase(): Promise<void> {
    // 外部キー制約を有効化
    await this.runSql('PRAGMA foreign_keys = ON');
    
    // 基本スキーマの初期化
    await this.databaseInitializer.initialize();
    
    // 全マイグレーションの実行
    await this.migrationManager.runMigrations();
  }

  /**
   * 特定のマイグレーションまで実行
   * 段階的テスト用（注：現在のMigrationManagerは段階実行未対応）
   */
  async runMigrationsUntil(targetVersion: string): Promise<void> {
    await this.databaseInitializer.initialize();
    // TODO: MigrationManagerに段階実行機能を追加
    logger.warn('TEST_MIGRATION', '段階的マイグレーション実行は未実装です。代わりに全マイグレーションを実行します。');
    await this.migrationManager.runMigrations();
  }

  /**
   * テストデータの挿入
   * 標準的なテストシナリオ用データ
   */
  async insertTestData(): Promise<void> {
    const testUserId = 'test-user-1';
    const testUsername = 'Test User';
    
    // テストユーザーの登録
    await this.runSql(`
      INSERT OR IGNORE INTO user_settings (
        user_id, timezone, username, first_seen, last_seen, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      testUserId,
      'Asia/Tokyo',
      testUsername,
      new Date().toISOString(),
      new Date().toISOString(),
      1,
      new Date().toISOString(),
      new Date().toISOString()
    ]);

    // テスト用活動ログの挿入
    await this.runSql(`
      INSERT INTO activity_logs (
        id, user_id, content, input_timestamp, business_date,
        start_time, end_time, total_minutes, confidence, categories, analysis_warnings
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      'test-log-1',
      testUserId,
      'テスト用活動ログ',
      new Date().toISOString(),
      new Date().toISOString().split('T')[0],
      new Date().toISOString(),
      new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1時間後
      60,
      0.8,
      'テスト',
      ''
    ]);
  }

  /**
   * テストデータのクリーンアップ
   * テスト間のデータリセット用
   */
  async cleanupTestData(): Promise<void> {
    const tables = [
      'activity_logs',
      'api_costs',
      'analysis_cache',
      'user_settings',
      'todo_tasks',
      'message_classification_history',
      'notifications'
    ];

    for (const table of tables) {
      await this.runSql(`DELETE FROM ${table}`);
    }
  }

  /**
   * データベースの状態確認
   * テスト前の整合性チェック用
   */
  async verifyDatabaseState(): Promise<{
    tablesExist: boolean;
    migrationCount: number;
    userCount: number;
    logCount: number;
  }> {
    const tables = await this.runSql(`
      SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `);

    const migrations = await this.runSql(`
      SELECT COUNT(*) as count FROM migration_history
    `).catch(() => ({ count: 0 })) as { count: number };

    const userCount = await this.runSql(`
      SELECT COUNT(*) as count FROM user_settings
    `).catch(() => ({ count: 0 })) as { count: number };

    const logCount = await this.runSql(`
      SELECT COUNT(*) as count FROM activity_logs
    `).catch(() => ({ count: 0 })) as { count: number };

    return {
      tablesExist: Array.isArray(tables) && tables.length > 0,
      migrationCount: migrations.count || 0,
      userCount: userCount.count || 0,
      logCount: logCount.count || 0
    };
  }

  /**
   * SQLクエリ実行のヘルパー
   */
  private runSql(sql: string, params?: (string | number | boolean | null)[]): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (sql.trim().toUpperCase().startsWith('SELECT')) {
        this.db.all(sql, params || [], (err: Error | null, rows: unknown[]) => {
          if (err) reject(err);
          else resolve(rows);
        });
      } else {
        this.db.run(sql, params || [], function(err: Error | null) {
          if (err) reject(err);
          else resolve({ lastID: this.lastID, changes: this.changes });
        });
      }
    });
  }
}

/**
 * 便利関数: テスト用マイグレーション管理インスタンス作成
 */
export function createTestMigrationManager(db: Database, databasePath: string): TestMigrationManager {
  return new TestMigrationManager(db, databasePath);
}

/**
 * テストシナリオ別セットアップのヘルパー関数
 */
export class TestScenarios {
  private migrationManager: TestMigrationManager;

  constructor(migrationManager: TestMigrationManager) {
    this.migrationManager = migrationManager;
  }

  /**
   * 基本的なユーザー活動シナリオのセットアップ
   */
  async setupBasicUserActivity(): Promise<void> {
    await this.migrationManager.initializeTestDatabase();
    await this.migrationManager.insertTestData();
  }

  /**
   * 空のデータベースシナリオのセットアップ
   */
  async setupEmptyDatabase(): Promise<void> {
    await this.migrationManager.initializeTestDatabase();
    await this.migrationManager.cleanupTestData();
  }

  /**
   * 複数ユーザーシナリオのセットアップ
   */
  async setupMultiUserScenario(): Promise<void> {
    await this.migrationManager.initializeTestDatabase();
    
    const users = [
      { id: 'user1', name: 'User One' },
      { id: 'user2', name: 'User Two' },
      { id: 'user3', name: 'User Three' }
    ];

    for (const user of users) {
      // ユーザー登録ロジックを追加
      // 実装は必要に応じて
    }
  }
}