/**
 * テストヘルパー関数
 * テストの安定性と速度を両立させるためのユーティリティ
 */

import { DatabaseConnection } from '../repositories/base/DatabaseConnection';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

// 単一の共有テストデータベースパス
const SHARED_TEST_DB_PATH = path.join(__dirname, '../../test-data/test-shared.db');

// テストごとのユニークな分離キー
const testIsolationKeys = new Map<string, string>();

/**
 * 共有テストデータベースの接続を取得
 * - 単一のデータベースファイルを全テストで共有
 * - 各テストは独自のトランザクションまたはデータ分離を使用
 */
export function getSharedTestDatabase(): string {
  // test-dataディレクトリが存在しない場合は作成
  const testDir = path.dirname(SHARED_TEST_DB_PATH);
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }
  
  return SHARED_TEST_DB_PATH;
}

/**
 * テストごとのユニークな分離キーを生成
 * - テーブル名のプレフィックスやユーザーIDのサフィックスとして使用
 */
export function getTestIsolationKey(testName: string): string {
  if (!testIsolationKeys.has(testName)) {
    const hash = crypto.createHash('md5').update(testName + Date.now()).digest('hex');
    const key = hash.substring(0, 8);
    testIsolationKeys.set(testName, key);
  }
  return testIsolationKeys.get(testName)!;
}

/**
 * テストデータのクリーンアップ
 * - 特定のテストに関連するデータのみを削除
 */
export async function cleanupTestData(
  connection: DatabaseConnection,
  isolationKey: string
): Promise<void> {
  const tables = [
    'activity_logs',
    'user_settings',
    'todo_tasks',
    'api_costs',
    'message_classifications'
  ];
  
  for (const table of tables) {
    try {
      // ユーザーIDやタスクIDに分離キーが含まれるレコードを削除
      await connection.run(
        `DELETE FROM ${table} WHERE 
         user_id LIKE ? OR 
         id LIKE ? OR 
         task_id LIKE ?`,
        [`%${isolationKey}%`, `%${isolationKey}%`, `%${isolationKey}%`]
      );
    } catch (error) {
      // テーブルが存在しない場合は無視
    }
  }
}

/**
 * テストトランザクションの管理
 * - 各テストを独立したトランザクションで実行
 */
export class TestTransaction {
  private connection: DatabaseConnection;
  private inTransaction: boolean = false;
  
  constructor(connection: DatabaseConnection) {
    this.connection = connection;
  }
  
  async begin(): Promise<void> {
    await this.connection.run('BEGIN IMMEDIATE');
    this.inTransaction = true;
  }
  
  async rollback(): Promise<void> {
    if (this.inTransaction) {
      await this.connection.run('ROLLBACK');
      this.inTransaction = false;
    }
  }
  
  async commit(): Promise<void> {
    if (this.inTransaction) {
      await this.connection.run('COMMIT');
      this.inTransaction = false;
    }
  }
}

/**
 * WAL モードの設定
 * - Write-Ahead Logging モードで並行性を向上
 */
export async function setupWALMode(connection: DatabaseConnection): Promise<void> {
  await connection.run('PRAGMA journal_mode=WAL');
  await connection.run('PRAGMA synchronous=NORMAL');
  await connection.run('PRAGMA cache_size=10000');
  await connection.run('PRAGMA temp_store=MEMORY');
}

/**
 * テストデータベースの初期化
 * - 共有データベースを使用し、WALモードを設定
 */
export async function initializeTestDatabase(): Promise<DatabaseConnection> {
  const dbPath = getSharedTestDatabase();
  const connection = DatabaseConnection.getInstance(dbPath);
  
  // 初回のみスキーマを作成
  await connection.ensureSchema();
  
  // WALモードを設定（並行性向上）
  await setupWALMode(connection);
  
  return connection;
}

/**
 * テスト用のユーザーIDを生成
 * - 分離キーを含むユニークなIDを生成
 */
export function generateTestUserId(testName: string, suffix: string = ''): string {
  const isolationKey = getTestIsolationKey(testName);
  return `test-${isolationKey}-${suffix}`;
}

/**
 * テスト用のタスクIDを生成
 * - 分離キーを含むユニークなIDを生成
 */
export function generateTestTaskId(testName: string, suffix: string = ''): string {
  const isolationKey = getTestIsolationKey(testName);
  return `task-${isolationKey}-${suffix}`;
}

/**
 * データベース接続の再利用プール
 */
const connectionPool = new Map<string, DatabaseConnection>();

/**
 * プールされた接続を取得
 * - 同じテストスイート内で接続を再利用
 */
export function getPooledConnection(dbPath: string = SHARED_TEST_DB_PATH): DatabaseConnection {
  if (!connectionPool.has(dbPath)) {
    const connection = DatabaseConnection.getInstance(dbPath);
    connectionPool.set(dbPath, connection);
  }
  return connectionPool.get(dbPath)!;
}

/**
 * すべてのプール接続をクローズ
 */
export async function closeAllPooledConnections(): Promise<void> {
  for (const connection of connectionPool.values()) {
    try {
      await connection.close();
    } catch (error) {
      // エラーは無視
    }
  }
  connectionPool.clear();
}