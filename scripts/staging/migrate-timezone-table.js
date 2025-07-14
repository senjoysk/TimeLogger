#!/usr/bin/env node

/**
 * Staging環境用 TimezoneChangeMonitor テーブル追加マイグレーション
 * 
 * このスクリプトは staging 環境のデータベースに
 * timezone_change_notifications テーブルとトリガーを追加します
 */

const Database = require('sqlite3').Database;
const path = require('path');

const DB_PATH = '/app/data/app.db';

const migrationSQL = `
-- タイムゾーン変更通知テーブル
CREATE TABLE IF NOT EXISTS timezone_change_notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    old_timezone TEXT,
    new_timezone TEXT NOT NULL,
    changed_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    processed BOOLEAN DEFAULT FALSE,
    processed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

-- タイムゾーン変更通知用インデックス
CREATE INDEX IF NOT EXISTS idx_timezone_change_notifications_user_id 
ON timezone_change_notifications(user_id);

CREATE INDEX IF NOT EXISTS idx_timezone_change_notifications_processed 
ON timezone_change_notifications(processed, changed_at);

CREATE INDEX IF NOT EXISTS idx_timezone_change_notifications_changed_at 
ON timezone_change_notifications(changed_at DESC);

-- タイムゾーン変更時の自動通知記録トリガー
CREATE TRIGGER IF NOT EXISTS trigger_timezone_change_notification
    AFTER UPDATE OF timezone ON user_settings
    FOR EACH ROW
    WHEN OLD.timezone != NEW.timezone
BEGIN
    INSERT INTO timezone_change_notifications (
        id,
        user_id,
        old_timezone,
        new_timezone,
        changed_at
    ) VALUES (
        hex(randomblob(16)),
        NEW.user_id,
        OLD.timezone,
        NEW.timezone,
        datetime('now', 'utc')
    );
END;
`;

function runMigration() {
    console.log('🚀 Starting TimezoneChangeMonitor table migration...');
    console.log('📍 Database path:', DB_PATH);
    
    const db = new Database(DB_PATH, (err) => {
        if (err) {
            console.error('❌ Failed to connect to database:', err.message);
            process.exit(1);
        }
        console.log('✅ Connected to database');
    });

    // Split SQL statements and execute them one by one
    const statements = migrationSQL
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0);

    let completed = 0;
    const total = statements.length;

    statements.forEach((statement, index) => {
        db.run(statement, (err) => {
            if (err) {
                console.error(`❌ Failed to execute statement ${index + 1}:`, err.message);
                console.error('📝 Statement:', statement.substring(0, 100) + '...');
                db.close();
                process.exit(1);
            }
            
            completed++;
            console.log(`✅ Statement ${completed}/${total} executed successfully`);
            
            if (completed === total) {
                console.log('🎉 Migration completed successfully!');
                
                // Verify the table was created
                db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='timezone_change_notifications'", (err, row) => {
                    if (err) {
                        console.error('❌ Failed to verify table creation:', err.message);
                    } else if (row) {
                        console.log('✅ timezone_change_notifications table verified');
                    } else {
                        console.error('❌ timezone_change_notifications table not found after migration');
                    }
                    
                    db.close((err) => {
                        if (err) {
                            console.error('❌ Error closing database:', err.message);
                        } else {
                            console.log('✅ Database connection closed');
                        }
                        process.exit(row ? 0 : 1);
                    });
                });
            }
        });
    });
}

// Execute migration
runMigration();