/**
 * 新活動記録システム用データベース初期化スクリプト
 * 既存データベースに新テーブルを追加し、必要に応じてデータ移行を実行
 */

import * as fs from 'fs';
import * as path from 'path';
import { Database } from 'sqlite3';
import { SqliteActivityLogRepository } from '../src/repositories/sqliteActivityLogRepository';
import { config } from '../src/config';

/**
 * データベース初期化オプション
 */
interface InitializationOptions {
  /** 既存データを新形式に移行するか */
  migrateExistingData: boolean;
  /** バックアップを作成するか */
  createBackup: boolean;
  /** 詳細ログを出力するか */
  verbose: boolean;
  /** データベースファイルパス */
  databasePath: string;
}

/**
 * 移行統計情報
 */
interface MigrationStats {
  existingRecords: number;
  migratedLogs: number;
  skippedRecords: number;
  errors: number;
  duration: number;
}

/**
 * データベース初期化クラス
 */
class DatabaseInitializer {
  private db: Database;
  private options: InitializationOptions;

  constructor(databasePath: string, options: InitializationOptions) {
    this.db = new Database(databasePath);
    this.options = options;
  }

  /**
   * 初期化処理を実行
   */
  async initialize(): Promise<MigrationStats> {
    const startTime = Date.now();
    let stats: MigrationStats = {
      existingRecords: 0,
      migratedLogs: 0,
      skippedRecords: 0,
      errors: 0,
      duration: 0
    };

    try {
      this.log('🚀 新活動記録システムの初期化を開始します...');

      // 1. バックアップ作成
      if (this.options.createBackup) {
        await this.createBackup();
      }

      // 2. 新テーブル作成
      await this.createNewTables();

      // 3. 既存データ移行
      if (this.options.migrateExistingData) {
        stats = await this.migrateExistingData();
      }

      // 4. インデックス最適化
      await this.optimizeDatabase();

      stats.duration = Date.now() - startTime;
      
      this.log('✅ 初期化が完了しました！');
      this.printStats(stats);

      return stats;
    } catch (error) {
      this.log(`❌ 初期化エラー: ${error}`);
      stats.errors++;
      stats.duration = Date.now() - startTime;
      throw error;
    } finally {
      await this.close();
    }
  }

  /**
   * データベースバックアップを作成
   */
  private async createBackup(): Promise<void> {
    try {
      const dbPath = this.options.databasePath;
      const backupPath = `${dbPath}.backup.${new Date().toISOString().replace(/[:.]/g, '-')}`;
      
      if (fs.existsSync(dbPath)) {
        fs.copyFileSync(dbPath, backupPath);
        this.log(`📁 バックアップ作成: ${backupPath}`);
      } else {
        this.log('📁 既存データベースが見つかりません（新規作成）');
      }
    } catch (error) {
      this.log(`❌ バックアップエラー: ${error}`);
      throw new Error(`バックアップの作成に失敗しました: ${error}`);
    }
  }

  /**
   * 新テーブルを作成
   */
  private async createNewTables(): Promise<void> {
    try {
      this.log('📊 新テーブル作成中...');

      // スキーマファイルを読み込み
      const schemaPath = path.join(__dirname, '../src/database/newSchema.sql');
      const schema = fs.readFileSync(schemaPath, 'utf8');
      
      // SQLを適切に分割して実行
      const statements = this.splitSqlStatements(schema);
      
      for (const statement of statements) {
        if (statement.trim()) {
          this.log(`🔧 実行中: ${statement.substring(0, 50)}...`);
          await this.executeQuery(statement);
        }
      }

      this.log('✅ 新テーブル作成完了');
    } catch (error) {
      this.log(`❌ テーブル作成エラー: ${error}`);
      throw new Error(`新テーブルの作成に失敗しました: ${error}`);
    }
  }

  /**
   * 既存データを新形式に移行
   */
  private async migrateExistingData(): Promise<MigrationStats> {
    let stats: MigrationStats = {
      existingRecords: 0,
      migratedLogs: 0,
      skippedRecords: 0,
      errors: 0,
      duration: 0
    };

    try {
      this.log('🔄 既存データ移行を開始...');

      // 既存レコード数をカウント
      const countResult = await this.getQuery('SELECT COUNT(*) as count FROM activity_records WHERE 1=1') as any;
      stats.existingRecords = countResult?.count || 0;

      if (stats.existingRecords === 0) {
        this.log('📝 移行対象の既存データがありません');
        return stats;
      }

      this.log(`📋 ${stats.existingRecords}件のレコードを移行します...`);

      // 既存データを取得（バッチ処理）
      const batchSize = 100;
      let offset = 0;
      
      while (offset < stats.existingRecords) {
        const batch = await this.getAllQuery(`
          SELECT * FROM activity_records 
          ORDER BY created_at ASC 
          LIMIT ? OFFSET ?
        `, [batchSize, offset]) as any[];

        for (const record of batch) {
          try {
            await this.migrateRecord(record);
            stats.migratedLogs++;
            
            if (stats.migratedLogs % 50 === 0) {
              this.log(`📊 移行進捗: ${stats.migratedLogs}/${stats.existingRecords}件`);
            }
          } catch (error) {
            this.log(`⚠️ レコード移行エラー [${record.id}]: ${error}`);
            stats.errors++;
            stats.skippedRecords++;
          }
        }

        offset += batchSize;
      }

      this.log(`✅ データ移行完了: ${stats.migratedLogs}件移行, ${stats.skippedRecords}件スキップ`);
      return stats;
    } catch (error) {
      this.log(`❌ データ移行エラー: ${error}`);
      stats.errors++;
      throw new Error(`データ移行に失敗しました: ${error}`);
    }
  }

  /**
   * 単一レコードを移行
   */
  private async migrateRecord(oldRecord: any): Promise<void> {
    try {
      // 既存の activity_records から activity_logs 形式に変換
      const newLog = {
        id: oldRecord.id,
        user_id: oldRecord.user_id,
        content: oldRecord.original_text,
        input_timestamp: oldRecord.created_at, // 作成時刻を入力時刻として使用
        business_date: oldRecord.business_date,
        is_deleted: false,
        created_at: oldRecord.created_at,
        updated_at: oldRecord.updated_at || oldRecord.created_at
      };

      // 重複チェック
      const existing = await this.getQuery(
        'SELECT id FROM activity_logs WHERE id = ?', 
        [newLog.id]
      );

      if (existing) {
        // 既に移行済み
        return;
      }

      // 新テーブルに挿入
      await this.executeQuery(`
        INSERT INTO activity_logs (
          id, user_id, content, input_timestamp, business_date, 
          is_deleted, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        newLog.id,
        newLog.user_id,
        newLog.content,
        newLog.input_timestamp,
        newLog.business_date,
        newLog.is_deleted ? 1 : 0,
        newLog.created_at,
        newLog.updated_at
      ]);

    } catch (error) {
      throw new Error(`レコード移行エラー [${oldRecord.id}]: ${error}`);
    }
  }

  /**
   * データベースを最適化
   */
  private async optimizeDatabase(): Promise<void> {
    try {
      this.log('⚡ データベース最適化中...');

      // VACUUM（データベースの断片化解消）
      await this.executeQuery('VACUUM');

      // ANALYZE（統計情報更新）
      await this.executeQuery('ANALYZE');

      this.log('✅ データベース最適化完了');
    } catch (error) {
      this.log(`⚠️ 最適化エラー: ${error}`);
      // 最適化エラーは致命的でないため続行
    }
  }

  /**
   * 統計情報を表示
   */
  private printStats(stats: MigrationStats): void {
    const durationSec = Math.round(stats.duration / 1000);
    
    console.log('\n📊 初期化結果:');
    console.log(`⏱️  実行時間: ${durationSec}秒`);
    console.log(`📝 既存レコード: ${stats.existingRecords}件`);
    console.log(`✅ 移行成功: ${stats.migratedLogs}件`);
    console.log(`⏭️  スキップ: ${stats.skippedRecords}件`);
    console.log(`❌ エラー: ${stats.errors}件`);
    
    if (stats.migratedLogs > 0) {
      const successRate = Math.round((stats.migratedLogs / stats.existingRecords) * 100);
      console.log(`📈 成功率: ${successRate}%`);
    }
  }

  /**
   * SQLクエリ実行（更新系）
   */
  private executeQuery(sql: string, params: any[] = []): Promise<any> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this);
        }
      });
    });
  }

  /**
   * SQLクエリ実行（単一行取得）
   */
  private getQuery(sql: string, params: any[] = []): Promise<any> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  /**
   * SQLクエリ実行（複数行取得）
   */
  private getAllQuery(sql: string, params: any[] = []): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * ログ出力
   */
  private log(message: string): void {
    if (this.options.verbose) {
      console.log(`[${new Date().toISOString()}] ${message}`);
    }
  }

  /**
   * SQLスキーマを適切にステートメントに分割
   * TRIGGER、VIEW、複数行構文に配慮した分割
   */
  private splitSqlStatements(schema: string): string[] {
    const statements: string[] = [];
    const lines = schema.split('\n');
    let currentStatement = '';
    let inBlock = false;

    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // コメント行をスキップ
      if (trimmedLine.startsWith('--') || trimmedLine === '') {
        continue;
      }

      // ブロック開始の検出（TRIGGER、VIEW）
      if (trimmedLine.match(/^(CREATE\s+TRIGGER|CREATE\s+VIEW)/i)) {
        if (currentStatement.trim()) {
          statements.push(currentStatement.trim() + ';');
        }
        currentStatement = trimmedLine;
        inBlock = true;
        continue;
      }

      // ブロック終了の検出
      if (inBlock && trimmedLine.match(/^END;?$/i)) {
        currentStatement += '\n' + trimmedLine;
        if (!trimmedLine.endsWith(';')) {
          currentStatement += ';';
        }
        statements.push(currentStatement.trim());
        currentStatement = '';
        inBlock = false;
        continue;
      }

      // ブロック内の場合は行を追加
      if (inBlock) {
        currentStatement += '\n' + trimmedLine;
        continue;
      }

      // 通常の文の処理
      if (trimmedLine.endsWith(';')) {
        currentStatement += '\n' + trimmedLine;
        statements.push(currentStatement.trim());
        currentStatement = '';
      } else {
        currentStatement += '\n' + trimmedLine;
      }
    }

    // 残りの文があれば追加
    if (currentStatement.trim()) {
      const finalStatement = currentStatement.trim();
      if (!finalStatement.endsWith(';')) {
        statements.push(finalStatement + ';');
      } else {
        statements.push(finalStatement);
      }
    }

    return statements.filter(stmt => stmt.trim().length > 0);
  }

  /**
   * データベース接続を閉じる
   */
  private async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}

/**
 * メイン実行関数
 */
async function main(): Promise<void> {
  try {
    // コマンドライン引数を解析
    const args = process.argv.slice(2);
    const databasePath = config.database?.path || './data/tasks.db';
    const options: InitializationOptions = {
      migrateExistingData: !args.includes('--no-migrate'),
      createBackup: !args.includes('--no-backup'),
      verbose: args.includes('--verbose') || args.includes('-v'),
      databasePath: databasePath
    };

    console.log('🚀 新活動記録システム初期化スクリプト');
    console.log('='.repeat(50));

    if (args.includes('--help') || args.includes('-h')) {
      console.log(`
使用方法: npm run init:new-db [オプション]

オプション:
  --no-migrate    既存データの移行をスキップ
  --no-backup     バックアップ作成をスキップ  
  --verbose, -v   詳細ログを出力
  --help, -h      このヘルプを表示

例:
  npm run init:new-db                  # 完全初期化
  npm run init:new-db --no-migrate     # テーブル作成のみ
  npm run init:new-db --verbose        # 詳細ログ付き
`);
      return;
    }

    console.log('設定:');
    console.log(`📁 データベース: ${databasePath}`);
    console.log(`🔄 データ移行: ${options.migrateExistingData ? 'する' : 'しない'}`);
    console.log(`📁 バックアップ: ${options.createBackup ? 'する' : 'しない'}`);
    console.log('');

    // 初期化実行
    const initializer = new DatabaseInitializer(databasePath, options);
    const stats = await initializer.initialize();

    console.log('\n🎉 初期化が正常に完了しました！');
    console.log('\n次のステップ:');
    console.log('1. npm run build でビルド');
    console.log('2. npm start で新システム起動');
    console.log('3. !summary で動作確認');

  } catch (error) {
    console.error('\n❌ 初期化に失敗しました:', error);
    process.exit(1);
  }
}

// スクリプトが直接実行された場合のみmainを実行
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { DatabaseInitializer, InitializationOptions, MigrationStats };