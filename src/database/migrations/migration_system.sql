-- データベースマイグレーション管理システム
-- Migration tracking system for TimeLogger Bot

-- マイグレーション履歴テーブル
CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    executed_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    execution_time_ms INTEGER,
    success BOOLEAN NOT NULL DEFAULT 1,
    error_message TEXT,
    rollback_available BOOLEAN DEFAULT 0
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_schema_migrations_version ON schema_migrations(version);
CREATE INDEX IF NOT EXISTS idx_schema_migrations_executed_at ON schema_migrations(executed_at);

-- システムメタデータテーブル
CREATE TABLE IF NOT EXISTS system_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

-- 初期データ挿入
INSERT OR REPLACE INTO system_metadata (key, value) VALUES 
('schema_version', '001'),
('last_migration_check', datetime('now', 'utc')),
('backup_before_migration', 'true');