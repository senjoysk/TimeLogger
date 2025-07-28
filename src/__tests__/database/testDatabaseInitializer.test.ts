/**
 * TestDatabaseInitializer のテスト
 * 標準化されたテストデータベース初期化ユーティリティの検証
 */

import { TestDatabaseInitializer, setupTestDatabase, createTempTestDatabase } from '../../database/testDatabaseInitializer';
import { PartialCompositeRepository } from '../../repositories/PartialCompositeRepository';

describe('TestDatabaseInitializer', () => {
  describe('基本的な初期化とクリーンアップ', () => {
    test('データベースの初期化と接続確認', async () => {
      const initializer = new TestDatabaseInitializer(__filename);
      
      const repository = await initializer.initialize();
      
      // リポジトリが正常に初期化されていることを確認
      expect(repository).toBeInstanceOf(PartialCompositeRepository);
      expect(await repository.isConnected()).toBe(true);
      
      // パスが正しく設定されていることを確認
      expect(initializer.getPath()).toContain('test-testDatabaseInitializer-test.db');
      
      await initializer.cleanup();
    });

    test('複数回の初期化が可能', async () => {
      const initializer = new TestDatabaseInitializer(__filename, 'multi-init');
      
      const repo1 = await initializer.initialize();
      expect(await repo1.isConnected()).toBe(true);
      
      await initializer.cleanup();
      
      const repo2 = await initializer.initialize();
      expect(await repo2.isConnected()).toBe(true);
      
      await initializer.cleanup();
    });

    test('未初期化状態でのgetRepository呼び出しはエラー', () => {
      const initializer = new TestDatabaseInitializer(__filename, 'error-test');
      
      expect(() => {
        initializer.getRepository();
      }).toThrow('Database not initialized. Call initialize() first.');
    });
  });

  describe('setupTestDatabase ヘルパー関数', () => {
    const { getRepository, getPath } = setupTestDatabase(__filename, 'helper-test');

    test('beforeEach/afterEach による自動セットアップ', async () => {
      const repository = getRepository();
      
      expect(repository).toBeInstanceOf(PartialCompositeRepository);
      expect(await repository.isConnected()).toBe(true);
      expect(getPath()).toContain('test-testDatabaseInitializer-test-helper-test.db');
      
      // 基本的なデータベース操作が可能か確認
      await repository.registerUser('test-user', 'Test User');
      const userInfo = await repository.getUserInfo('test-user');
      expect(userInfo).not.toBeNull();
      expect(userInfo!.userId).toBe('test-user');
    });

    test('各テスト間でデータベースがクリーンアップされる', async () => {
      const repository = getRepository();
      
      // 前のテストでユーザーを登録したが、新しいテストではクリーンな状態
      const userInfo = await repository.getUserInfo('test-user');
      expect(userInfo).toBeNull();
      
      // 新しいユーザーを登録
      await repository.registerUser('test-user-2', 'Test User 2');
      const newUserInfo = await repository.getUserInfo('test-user-2');
      expect(newUserInfo).not.toBeNull();
    });
  });

  describe('createTempTestDatabase 関数', () => {
    test('一時的なテストデータベースの作成と削除', async () => {
      const { repository, path, cleanup } = await createTempTestDatabase(__filename);
      
      expect(repository).toBeInstanceOf(PartialCompositeRepository);
      expect(await repository.isConnected()).toBe(true);
      expect(path).toContain('temp-');
      
      // 基本的な操作確認
      await repository.registerUser('temp-user', 'Temp User');
      const userInfo = await repository.getUserInfo('temp-user');
      expect(userInfo).not.toBeNull();
      
      await cleanup();
    });

    test('複数の一時データベースが独立している', async () => {
      const db1 = await createTempTestDatabase(__filename);
      const db2 = await createTempTestDatabase(__filename);
      
      // 異なるパスが生成される
      expect(db1.path).not.toBe(db2.path);
      
      // 独立してデータを操作できる
      await db1.repository.registerUser('user1', 'User 1');
      await db2.repository.registerUser('user2', 'User 2');
      
      const user1InDb1 = await db1.repository.getUserInfo('user1');
      const user2InDb1 = await db1.repository.getUserInfo('user2');
      const user1InDb2 = await db2.repository.getUserInfo('user1');
      const user2InDb2 = await db2.repository.getUserInfo('user2');
      
      expect(user1InDb1).not.toBeNull();
      expect(user2InDb1).toBeNull();
      expect(user1InDb2).toBeNull();
      expect(user2InDb2).not.toBeNull();
      
      await db1.cleanup();
      await db2.cleanup();
    });
  });

  describe('エラーハンドリング', () => {
    test('クリーンアップ時のエラーは適切に処理される', async () => {
      const initializer = new TestDatabaseInitializer(__filename, 'error-cleanup');
      const repository = await initializer.initialize();
      
      // 手動でリポジトリを閉じる
      await repository.close();
      
      // クリーンアップ時にエラーが発生しても例外がスローされない
      await expect(initializer.cleanup()).resolves.toBeUndefined();
    });
  });
});