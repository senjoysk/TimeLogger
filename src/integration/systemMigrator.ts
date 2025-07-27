/**
 * システム移行クラス
 * 旧活動記録システムから新自然言語ログシステムへの移行
 */

import * as fs from 'fs';
import { Database } from 'sqlite3';
import { SqliteActivityLogRepository } from '../repositories/sqliteActivityLogRepository';
import { IUnifiedRepository } from '../repositories/interfaces';
import { ActivityLogError } from '../types/activityLog';

/**
 * 移行設定インターフェース
 */
export interface MigrationConfig {
  /** 既存データベースパス */
  oldDatabasePath: string;
  /** 新データベースパス */
  newDatabasePath: string;
  /** バックアップを作成するか */
  createBackup: boolean;
  /** 詳細ログを出力するか */
  verbose: boolean;
  /** ドライラン（実際には変更しない） */
  dryRun: boolean;
  /** 移行後に旧テーブルを保持するか */
  keepOldTables: boolean;
}

/**
 * 移行統計情報
 */
export interface MigrationStats {
  /** 開始時刻 */
  startTime: Date;
  /** 終了時刻 */
  endTime?: Date;
  /** 実行時間（秒） */
  durationSeconds?: number;
  /** 旧システムのレコード数 */
  oldRecordsCount: number;
  /** 新システムに移行したレコード数 */
  migratedCount: number;
  /** スキップしたレコード数 */
  skippedCount: number;
  /** エラー数 */
  errorCount: number;
  /** 警告数 */
  warningCount: number;
  /** 詳細ログ */
  details: string[];
}

/**
 * システム移行クラス
 */
export class SystemMigrator {
  private config: MigrationConfig;
  private stats: MigrationStats;
  private oldDb!: Database;
  private newRepository!: IUnifiedRepository;

  constructor(config: MigrationConfig) {
    this.config = config;
    this.stats = {
      startTime: new Date(),
      oldRecordsCount: 0,
      migratedCount: 0,
      skippedCount: 0,
      errorCount: 0,
      warningCount: 0,
      details: []
    };
  }

  /**
   * 移行処理を実行
   */
  async migrate(): Promise<MigrationStats> {
    try {
      this.log('🚀 システム移行を開始します...');

      // 1. 事前チェック
      await this.preflightChecks();

      // 2. バックアップ作成
      if (this.config.createBackup) {
        await this.createBackup();
      }

      // 3. データベース接続
      await this.connectDatabases();

      // 4. 新システムのテーブル作成
      await this.createNewTables();

      // 5. データ移行
      await this.migrateData();

      // 6. 整合性チェック
      await this.verifyMigration();

      // 7. 旧テーブルの処理
      if (!this.config.keepOldTables) {
        await this.cleanupOldTables();
      }

      this.stats.endTime = new Date();
      this.stats.durationSeconds = (this.stats.endTime.getTime() - this.stats.startTime.getTime()) / 1000;

      this.log('✅ システム移行が完了しました！');
      this.printMigrationSummary();

      return this.stats;

    } catch (error) {
      this.stats.errorCount++;
      this.log(`❌ 移行エラー: ${error}`);
      throw new ActivityLogError('システム移行に失敗しました', 'MIGRATION_ERROR', { error });
    } finally {
      await this.cleanup();
    }
  }

  /**
   * 事前チェック
   */
  private async preflightChecks(): Promise<void> {
    this.log('🔍 事前チェックを実行中...');

    // 旧データベースの存在確認
    if (!fs.existsSync(this.config.oldDatabasePath)) {
      throw new Error(`旧データベースが見つかりません: ${this.config.oldDatabasePath}`);
    }

    // 新データベースのディレクトリが存在することを確認
    const newDbDir = require('path').dirname(this.config.newDatabasePath);
    if (!fs.existsSync(newDbDir)) {
      fs.mkdirSync(newDbDir, { recursive: true });
      this.log(`📁 新データベースディレクトリを作成: ${newDbDir}`);
    }

    // ドライランの場合は警告
    if (this.config.dryRun) {
      this.log('⚠️ ドライランモード: 実際の変更は行われません');
    }

    this.log('✅ 事前チェック完了');
  }

  /**
   * バックアップ作成
   */
  private async createBackup(): Promise<void> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = `${this.config.oldDatabasePath}.backup.${timestamp}`;
      
      fs.copyFileSync(this.config.oldDatabasePath, backupPath);
      this.log(`📁 バックアップ作成: ${backupPath}`);
    } catch (error) {
      this.stats.warningCount++;
      this.log(`⚠️ バックアップ作成に失敗: ${error}`);
    }
  }

  /**
   * データベース接続
   */
  private async connectDatabases(): Promise<void> {
    this.log('🔗 データベースに接続中...');

    // 旧データベース接続 (sqlite3 doesn't support readonly option in constructor)
    this.oldDb = new Database(this.config.oldDatabasePath);
    
    // 新データベース接続
    this.newRepository = new SqliteActivityLogRepository(this.config.newDatabasePath);
    // Repository is initialized in constructor

    this.log('✅ データベース接続完了');
  }

  /**
   * 新テーブル作成
   */
  private async createNewTables(): Promise<void> {
    if (this.config.dryRun) {
      this.log('🔧 [ドライラン] 新テーブル作成をスキップ');
      return;
    }

    this.log('🔧 新テーブルを作成中...');
    
    // 新スキーマの適用は既にinitialize()で実行されている
    this.log('✅ 新テーブル作成完了');
  }

  /**
   * データ移行
   */
  private async migrateData(): Promise<void> {
    this.log('🔄 データ移行を開始中...');

    try {
      // 旧システムのレコード数を取得
      const countResult = await this.getQuery('SELECT COUNT(*) as count FROM activity_records');
      this.stats.oldRecordsCount = (countResult?.count as number) || 0;

      if (this.stats.oldRecordsCount === 0) {
        this.log('📝 移行対象データがありません');
        return;
      }

      this.log(`📋 ${this.stats.oldRecordsCount}件のレコードを移行します...`);

      // バッチサイズでデータを取得・移行
      const batchSize = 100;
      let offset = 0;

      while (offset < this.stats.oldRecordsCount) {
        const records = await this.getAllQuery(`
          SELECT * FROM activity_records 
          ORDER BY created_at ASC 
          LIMIT ? OFFSET ?
        `, [batchSize, offset]);

        for (const record of records) {
          try {
            await this.migrateRecord(record);
            this.stats.migratedCount++;

            if (this.stats.migratedCount % 50 === 0) {
              this.log(`📊 移行進捗: ${this.stats.migratedCount}/${this.stats.oldRecordsCount}件`);
            }
          } catch (error) {
            this.stats.errorCount++;
            this.log(`⚠️ レコード移行エラー [${record.id}]: ${error}`);
            this.stats.skippedCount++;
          }
        }

        offset += batchSize;
      }

      this.log(`✅ データ移行完了: ${this.stats.migratedCount}件移行、${this.stats.skippedCount}件スキップ`);
    } catch (error) {
      this.stats.errorCount++;
      throw new Error(`データ移行に失敗: ${error}`);
    }
  }

  /**
   * 単一レコードを移行
   */
  private async migrateRecord(oldRecord: Record<string, unknown>): Promise<void> {
    if (this.config.dryRun) {
      // ドライランでは実際に保存しない
      return;
    }

    try {
      // 旧レコードから新レコード形式に変換
      const newLog = {
        id: oldRecord.id as string,
        userId: oldRecord.user_id as string,
        content: (oldRecord.original_text || oldRecord.content || 'データなし') as string,
        inputTimestamp: oldRecord.created_at as string,
        businessDate: oldRecord.business_date as string,
        isDeleted: false,
        createdAt: oldRecord.created_at as string,
        updatedAt: (oldRecord.updated_at || oldRecord.created_at) as string
      };

      // 重複チェック
      const existing = await this.newRepository.getLogById(newLog.id);
      if (existing) {
        this.stats.skippedCount++;
        return; // 既に存在する場合はスキップ
      }

      // 新システムに保存
      await this.newRepository.saveLog(newLog);

    } catch (error) {
      throw new Error(`レコード移行失敗 [${oldRecord.id}]: ${error}`);
    }
  }

  /**
   * 移行の整合性チェック
   */
  private async verifyMigration(): Promise<void> {
    this.log('🔍 移行結果を検証中...');

    try {
      // 新システムのレコード数を確認
      const newCount = await this.newRepository.getLogCount('');
      
      if (newCount !== this.stats.migratedCount) {
        this.stats.warningCount++;
        this.log(`⚠️ レコード数が一致しません: 移行数=${this.stats.migratedCount}, 新DB数=${newCount}`);
      }

      // サンプルレコードの整合性チェック
      const sampleOldRecord = await this.getQuery(`
        SELECT * FROM activity_records 
        ORDER BY created_at ASC 
        LIMIT 1
      `);

      if (sampleOldRecord) {
        const sampleNewRecord = await this.newRepository.getLogById(sampleOldRecord.id as string);
        
        if (!sampleNewRecord) {
          this.stats.warningCount++;
          this.log(`⚠️ サンプルレコードが見つかりません: ${sampleOldRecord.id as string}`);
        } else if (sampleNewRecord.content !== (sampleOldRecord.original_text || sampleOldRecord.content)) {
          this.stats.warningCount++;
          this.log(`⚠️ サンプルレコードの内容が一致しません: ${sampleOldRecord.id as string}`);
        }
      }

      this.log('✅ 移行結果検証完了');
    } catch (error) {
      this.stats.warningCount++;
      this.log(`⚠️ 検証エラー: ${error}`);
    }
  }

  /**
   * 旧テーブルのクリーンアップ
   */
  private async cleanupOldTables(): Promise<void> {
    if (this.config.dryRun) {
      this.log('🗑️ [ドライラン] 旧テーブル削除をスキップ');
      return;
    }

    this.log('🗑️ 旧テーブルを削除中...');

    try {
      // 旧テーブルを新システムのDBに移動してから削除
      // 実際の実装では、より慎重にバックアップを確認してから削除
      this.log('⚠️ 旧テーブル削除は手動で行ってください（安全のため）');
    } catch (error) {
      this.stats.warningCount++;
      this.log(`⚠️ 旧テーブル削除エラー: ${error}`);
    }
  }

  /**
   * 移行サマリーを表示
   */
  private printMigrationSummary(): void {
    console.log('\n📊 移行結果サマリー');
    console.log('='.repeat(50));
    console.log(`⏱️  実行時間: ${this.stats.durationSeconds}秒`);
    console.log(`📝 旧レコード数: ${this.stats.oldRecordsCount}件`);
    console.log(`✅ 移行成功: ${this.stats.migratedCount}件`);
    console.log(`⏭️  スキップ: ${this.stats.skippedCount}件`);
    console.log(`❌ エラー: ${this.stats.errorCount}件`);
    console.log(`⚠️  警告: ${this.stats.warningCount}件`);
    
    if (this.stats.migratedCount > 0) {
      const successRate = Math.round((this.stats.migratedCount / this.stats.oldRecordsCount) * 100);
      console.log(`📈 成功率: ${successRate}%`);
    }

    if (this.config.dryRun) {
      console.log('\n⚠️ これはドライランです。実際の変更は行われていません。');
    }
  }

  /**
   * SQLクエリ実行（単一行取得）
   */
  private getQuery(sql: string, params: (string | number | boolean)[] = []): Promise<Record<string, unknown> | undefined> {
    return new Promise((resolve, reject) => {
      this.oldDb.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row as Record<string, unknown> | undefined);
        }
      });
    });
  }

  /**
   * SQLクエリ実行（複数行取得）
   */
  private getAllQuery(sql: string, params: (string | number | boolean)[] = []): Promise<Record<string, unknown>[]> {
    return new Promise((resolve, reject) => {
      this.oldDb.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows as Record<string, unknown>[]);
        }
      });
    });
  }

  /**
   * リソースクリーンアップ
   */
  private async cleanup(): Promise<void> {
    try {
      if (this.oldDb) {
        this.oldDb.close();
      }
      if (this.newRepository) {
        await this.newRepository.close();
      }
    } catch (error) {
      console.error('❌ クリーンアップエラー:', error);
    }
  }

  /**
   * ログ出力
   */
  private log(message: string): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    
    if (this.config.verbose) {
      console.log(logMessage);
    }
    
    this.stats.details.push(logMessage);
  }
}

/**
 * デフォルト移行設定を生成
 */
export function createDefaultMigrationConfig(
  oldDatabasePath: string, 
  newDatabasePath: string
): MigrationConfig {
  return {
    oldDatabasePath,
    newDatabasePath,
    createBackup: true,
    verbose: true,
    dryRun: false,
    keepOldTables: true // 安全のため、デフォルトでは旧テーブルを保持
  };
}

/**
 * 移行実行のヘルパー関数
 */
export async function runMigration(config: MigrationConfig): Promise<MigrationStats> {
  const migrator = new SystemMigrator(config);
  return await migrator.migrate();
}