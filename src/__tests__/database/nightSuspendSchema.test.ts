/**
 * 夜間サスペンド機能のデータベーススキーマテスト
 * TDD: Red Phase - 失敗するテストを先に書く
 */

import { Database } from 'sqlite3';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

// SQLiteの型定義
interface ColumnInfo {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

interface IndexInfo {
  name: string;
  unique: number;
  origin: string;
  partial: number;
}

describe('夜間サスペンド機能用データベーススキーマ', () => {
  let db: Database;
  let dbRun: (sql: string, params?: any[]) => Promise<any>;
  let dbGet: (sql: string, params?: any[]) => Promise<any>;
  let dbAll: (sql: string, params?: any[]) => Promise<any[]>;

  beforeAll(async () => {
    // テスト用のin-memoryデータベースを作成
    db = new Database(':memory:');
    dbRun = promisify(db.run.bind(db));
    dbGet = promisify(db.get.bind(db));
    dbAll = promisify(db.all.bind(db));
    
    // 統合されたスキーマを適用（夜間サスペンド機能含む）
    const schemaPath = path.join(__dirname, '../../database/newSchema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    await dbRun(schema);
    
    // テストデータをセットアップ
    await dbRun(`
      INSERT INTO activity_logs (id, user_id, content, input_timestamp, business_date)
      VALUES ('test1', 'user1', 'テストログ1', '2025-01-01T10:00:00Z', '2025-01-01')
    `);
  });

  afterAll(async () => {
    const dbClose = promisify(db.close.bind(db));
    await dbClose();
  });

  describe('🔴 Red Phase: activity_logsテーブルのdiscord_message_id拡張', () => {
    test('discord_message_idフィールドが存在する', async () => {
      // まずは失敗するテストを書く
      const columns = await dbAll("PRAGMA table_info(activity_logs)") as ColumnInfo[];
      const discordMessageIdColumn = columns.find(
        (col: ColumnInfo) => col.name === 'discord_message_id'
      );
      
      expect(discordMessageIdColumn).toBeDefined();
      expect(discordMessageIdColumn?.type).toBe('TEXT');
      expect(discordMessageIdColumn?.notnull).toBe(0); // NULLable
    });

    test('discord_message_idフィールドにUNIQUE制約がある', async () => {
      const indexes = await dbAll("PRAGMA index_list(activity_logs)") as IndexInfo[];
      const uniqueIndex = indexes.find(
        (idx: IndexInfo) => idx.name.includes('discord_message_id') && idx.unique === 1
      );
      
      expect(uniqueIndex).toBeDefined();
    });

    test('discord_message_idでデータを挿入・検索できる', async () => {
      // Discord メッセージIDを含むデータを挿入
      await dbRun(`
        INSERT INTO activity_logs (id, user_id, content, input_timestamp, business_date, discord_message_id)
        VALUES ('test2', 'user1', 'Discord経由のログ', '2025-01-01T11:00:00Z', '2025-01-01', 'discord_msg_123')
      `);
      
      // Discord メッセージIDで検索
      const result = await dbGet(`
        SELECT * FROM activity_logs WHERE discord_message_id = 'discord_msg_123'
      `) as any;
      
      expect(result).toBeDefined();
      expect(result.id).toBe('test2');
      expect(result.discord_message_id).toBe('discord_msg_123');
    });

    test('discord_message_idの重複挿入が失敗する', async () => {
      // 同じDiscord メッセージIDで二重挿入を試行
      await expect(dbRun(`
        INSERT INTO activity_logs (id, user_id, content, input_timestamp, business_date, discord_message_id)
        VALUES ('test3', 'user1', '重複テスト', '2025-01-01T12:00:00Z', '2025-01-01', 'discord_msg_123')
      `)).rejects.toThrow();
    });
  });

  describe('🔴 Red Phase: リカバリ処理用フィールド拡張', () => {
    test('recovery_processedフィールドが存在し、デフォルト値がFALSE', async () => {
      const columns = await dbAll("PRAGMA table_info(activity_logs)") as ColumnInfo[];
      const recoveryProcessedColumn = columns.find(
        (col: ColumnInfo) => col.name === 'recovery_processed'
      );
      
      expect(recoveryProcessedColumn).toBeDefined();
      expect(recoveryProcessedColumn?.type).toBe('BOOLEAN');
      expect(recoveryProcessedColumn?.dflt_value).toBe('FALSE');
    });

    test('recovery_timestampフィールドが存在する', async () => {
      const columns = await dbAll("PRAGMA table_info(activity_logs)") as ColumnInfo[];
      const recoveryTimestampColumn = columns.find(
        (col: ColumnInfo) => col.name === 'recovery_timestamp'
      );
      
      expect(recoveryTimestampColumn).toBeDefined();
      expect(recoveryTimestampColumn?.type).toBe('TEXT');
    });

    test('リカバリ処理済みフラグでフィルタリングできる', async () => {
      // リカバリ処理済みデータを挿入
      await dbRun(`
        INSERT INTO activity_logs (id, user_id, content, input_timestamp, business_date, recovery_processed, recovery_timestamp)
        VALUES ('test4', 'user1', 'リカバリ済みログ', '2025-01-01T13:00:00Z', '2025-01-01', TRUE, '2025-01-01T13:05:00Z')
      `);
      
      // リカバリ未処理のデータを検索
      const unprocessed = await dbAll(`
        SELECT * FROM activity_logs WHERE recovery_processed = FALSE
      `) as any[];
      
      expect(unprocessed.length).toBeGreaterThan(0);
      expect(unprocessed.some((log: any) => log.id === 'test4')).toBe(false);
    });
  });

  describe('🔴 Red Phase: suspend_statesテーブル新規作成', () => {
    test('suspend_statesテーブルが存在する', async () => {
      const tableExists = await dbGet(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='suspend_states'
      `);
      
      expect(tableExists).toBeDefined();
    });

    test('suspend_statesテーブルが正しいスキーマを持つ', async () => {
      const columns = await dbAll("PRAGMA table_info(suspend_states)") as ColumnInfo[];
      const columnNames = columns.map((col: ColumnInfo) => col.name);
      
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('user_id');
      expect(columnNames).toContain('suspend_time');
      expect(columnNames).toContain('expected_recovery_time');
      expect(columnNames).toContain('actual_recovery_time');
      expect(columnNames).toContain('created_at');
    });

    test('suspend_statesテーブルにデータを挿入できる', async () => {
      const suspendState = {
        id: 'suspend_1',
        user_id: 'user1',
        suspend_time: '2025-01-01T00:00:00Z',
        expected_recovery_time: '2025-01-01T07:00:00Z',
        actual_recovery_time: null
      };
      
      await dbRun(`
        INSERT INTO suspend_states (id, user_id, suspend_time, expected_recovery_time, actual_recovery_time)
        VALUES (?, ?, ?, ?, ?)
      `, [suspendState.id, suspendState.user_id, suspendState.suspend_time, 
          suspendState.expected_recovery_time, suspendState.actual_recovery_time]);
      
      const result = await dbGet(`
        SELECT * FROM suspend_states WHERE id = 'suspend_1'
      `) as any;
      
      expect(result).toBeDefined();
      expect(result.user_id).toBe('user1');
      expect(result.suspend_time).toBe('2025-01-01T00:00:00Z');
    });

    test('suspend_statesテーブルのuser_idインデックスが存在する', async () => {
      const indexes = await dbAll("PRAGMA index_list(suspend_states)") as IndexInfo[];
      const userIdIndex = indexes.find(
        (idx: IndexInfo) => idx.name.includes('user_id')
      );
      
      expect(userIdIndex).toBeDefined();
    });
  });

  describe('🔴 Red Phase: 必要なインデックスの存在確認', () => {
    test('discord_message_idインデックスが存在する', async () => {
      const indexes = await dbAll("PRAGMA index_list(activity_logs)") as IndexInfo[];
      const discordMessageIdIndex = indexes.find(
        (idx: IndexInfo) => idx.name.includes('discord_message_id')
      );
      
      expect(discordMessageIdIndex).toBeDefined();
    });

    test('recovery_processedインデックスが存在する', async () => {
      const indexes = await dbAll("PRAGMA index_list(activity_logs)") as IndexInfo[];
      const recoveryProcessedIndex = indexes.find(
        (idx: IndexInfo) => idx.name.includes('recovery_processed')
      );
      
      expect(recoveryProcessedIndex).toBeDefined();
    });
  });
});