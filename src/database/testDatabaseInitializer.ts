/**
 * テストデータベース初期化ユーティリティ
 * TDD開発における一貫したテストデータベースセットアップを提供
 */

import { PartialCompositeRepository } from '../repositories/PartialCompositeRepository';
import { getTestDbPath, cleanupTestDatabase, prepareTestDatabase } from '../utils/testDatabasePath';
import { logger } from '../utils/logger';

/**
 * 標準化されたテストデータベースセットアップ
 */
export class TestDatabaseInitializer {
  private repository: PartialCompositeRepository | null = null;
  private testDbPath: string;

  constructor(testFileName: string, suffix?: string) {
    this.testDbPath = getTestDbPath(testFileName, suffix);
  }

  /**
   * テストデータベースを初期化し、リポジトリインスタンスを返す
   */
  async initialize(): Promise<PartialCompositeRepository> {
    // データベースパスの準備とクリーンアップ
    prepareTestDatabase(this.testDbPath);
    
    // リポジトリインスタンス作成と初期化
    this.repository = new PartialCompositeRepository(this.testDbPath);
    await this.repository.initializeDatabase();
    
    return this.repository;
  }

  /**
   * テスト終了時のクリーンアップ
   */
  async cleanup(): Promise<void> {
    if (this.repository) {
      try {
        await this.repository.close();
      } catch (error) {
        // Already closed database errors are expected in some test scenarios
        logger.warn('TEST_DB', 'Database cleanup warning', { error });
      }
      this.repository = null;
    }
    cleanupTestDatabase(this.testDbPath);
  }

  /**
   * データベースパスを取得
   */
  getPath(): string {
    return this.testDbPath;
  }

  /**
   * リポジトリインスタンスを取得（初期化後のみ）
   */
  getRepository(): PartialCompositeRepository {
    if (!this.repository) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.repository;
  }
}

/**
 * 基本的な beforeEach/afterEach セットアップのヘルパー関数
 * 
 * @example
 * ```typescript
 * describe('MyRepository test', () => {
 *   const { getRepository, getPath } = setupTestDatabase(__filename);
 *   
 *   test('some test', async () => {
 *     const repo = getRepository();
 *     // テストロジック
 *   });
 * });
 * ```
 */
export function setupTestDatabase(testFileName: string, suffix?: string) {
  const initializer = new TestDatabaseInitializer(testFileName, suffix);
  let repository: PartialCompositeRepository;

  beforeEach(async () => {
    repository = await initializer.initialize();
  });

  afterEach(async () => {
    await initializer.cleanup();
  });

  return {
    getRepository: () => repository,
    getPath: () => initializer.getPath(),
    getInitializer: () => initializer
  };
}

/**
 * 複数のテストで共有するデータベースセットアップ
 * beforeAll/afterAll パターン用
 */
export function setupSharedTestDatabase(testFileName: string, suffix?: string) {
  const initializer = new TestDatabaseInitializer(testFileName, suffix);
  let repository: PartialCompositeRepository;

  beforeAll(async () => {
    repository = await initializer.initialize();
  });

  afterAll(async () => {
    await initializer.cleanup();
  });

  return {
    getRepository: () => repository,
    getPath: () => initializer.getPath(),
    getInitializer: () => initializer
  };
}

/**
 * 一時的なテストデータベースを作成するヘルパー
 * 各テストケースで独立したDBを使用したい場合
 */
export async function createTempTestDatabase(testFileName: string): Promise<{
  repository: PartialCompositeRepository;
  path: string;
  cleanup: () => Promise<void>;
}> {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substr(2, 9);
  const initializer = new TestDatabaseInitializer(testFileName, `temp-${timestamp}-${randomId}`);
  
  const repository = await initializer.initialize();
  
  return {
    repository,
    path: initializer.getPath(),
    cleanup: () => initializer.cleanup()
  };
}