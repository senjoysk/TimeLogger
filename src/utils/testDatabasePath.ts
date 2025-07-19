/**
 * テスト用データベースパス統一管理ユーティリティ
 * Issue #40: テストデータベースファイル散在問題の解決
 */

import * as path from 'path';
import * as fs from 'fs';

/**
 * テスト用データベースパス設定
 */
export class TestDatabasePath {
  private static readonly TEST_DATA_DIR = 'test-data';
  // モジュールファイルの位置からプロジェクトルートを計算（より安全）
  private static readonly PROJECT_ROOT = path.resolve(__dirname, '../..');

  /**
   * テスト用データベースパスを取得
   * @param testName テスト名（ファイル名として使用）
   * @param suffix サフィックス（オプション）
   * @returns 統一された絶対パス
   */
  static getTestDatabasePath(testName: string, suffix?: string): string {
    const baseName = testName.replace(/\.test\.ts$/, '').replace(/[^\w-]/g, '-');
    const fileName = suffix ? `test-${baseName}-${suffix}.db` : `test-${baseName}.db`;
    
    return path.join(this.PROJECT_ROOT, this.TEST_DATA_DIR, fileName);
  }

  /**
   * 一時テスト用データベースパスを取得
   * @param testName テスト名
   * @returns 一意な一時データベースパス
   */
  static getTempTestDatabasePath(testName: string): string {
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substr(2, 9);
    return this.getTestDatabasePath(testName, `temp-${timestamp}-${randomId}`);
  }

  /**
   * Webアプリケーション管理用テスト用データベースパス
   * @param feature 機能名
   * @returns Web管理用統一パス
   */
  static getAdminTestDatabasePath(feature: string): string {
    return this.getTestDatabasePath(`admin-${feature}`);
  }

  /**
   * 統合テスト用データベースパス
   * @param integrationName 統合テスト名
   * @returns 統合テスト用統一パス
   */
  static getIntegrationTestDatabasePath(integrationName: string): string {
    return this.getTestDatabasePath(`integration-${integrationName}`);
  }

  /**
   * テストデータディレクトリを確保
   */
  static ensureTestDataDirectory(): void {
    const testDataDir = path.join(this.PROJECT_ROOT, this.TEST_DATA_DIR);
    if (!fs.existsSync(testDataDir)) {
      fs.mkdirSync(testDataDir, { recursive: true });
    }
  }

  /**
   * テスト終了後のクリーンアップ
   * @param dbPath データベースパス
   */
  static cleanup(dbPath: string): void {
    if (fs.existsSync(dbPath)) {
      try {
        fs.unlinkSync(dbPath);
      } catch (error) {
        console.warn(`テストDB削除失敗: ${dbPath}`, error);
      }
    }
  }

  /**
   * 複数のテストDBファイルを一括クリーンアップ
   * @param dbPaths データベースパスの配列
   */
  static cleanupMultiple(dbPaths: string[]): void {
    dbPaths.forEach(dbPath => this.cleanup(dbPath));
  }

  /**
   * 一時ファイルパターンに基づくクリーンアップ
   * @param pattern 削除対象のパターン
   */
  static cleanupPattern(pattern: string): void {
    const testDataDir = path.join(this.PROJECT_ROOT, this.TEST_DATA_DIR);
    if (!fs.existsSync(testDataDir)) {
      return;
    }

    try {
      const files = fs.readdirSync(testDataDir);
      files
        .filter(file => file.includes(pattern) && file.endsWith('.db'))
        .forEach(file => {
          const filePath = path.join(testDataDir, file);
          this.cleanup(filePath);
        });
    } catch (error) {
      console.warn(`パターンベースクリーンアップ失敗: ${pattern}`, error);
    }
  }

  /**
   * メモリDB用パス（高速テスト用）
   */
  static getMemoryDatabasePath(): string {
    return ':memory:';
  }

  /**
   * 現在のテストデータディレクトリパス
   */
  static getTestDataDirectory(): string {
    return path.join(this.PROJECT_ROOT, this.TEST_DATA_DIR);
  }
}

/**
 * 便利関数: テスト用データベースパス取得
 * @param testFileName テストファイル名（__filename から取得）
 * @param suffix サフィックス（オプション）
 */
export function getTestDbPath(testFileName: string, suffix?: string): string {
  const testName = path.basename(testFileName, '.ts');
  return TestDatabasePath.getTestDatabasePath(testName, suffix);
}

/**
 * 便利関数: 一時テスト用データベースパス取得
 * @param testFileName テストファイル名（__filename から取得）
 */
export function getTempTestDbPath(testFileName: string): string {
  const testName = path.basename(testFileName, '.ts');
  return TestDatabasePath.getTempTestDatabasePath(testName);
}

/**
 * 便利関数: テスト前の準備
 * @param dbPath データベースパス
 * @returns 準備されたデータベースパス
 */
export function prepareTestDatabase(dbPath: string): string {
  TestDatabasePath.ensureTestDataDirectory();
  TestDatabasePath.cleanup(dbPath);
  return dbPath;
}

/**
 * 便利関数: テスト後のクリーンアップ
 * @param dbPaths データベースパス（複数可）
 */
export function cleanupTestDatabase(...dbPaths: string[]): void {
  TestDatabasePath.cleanupMultiple(dbPaths);
}