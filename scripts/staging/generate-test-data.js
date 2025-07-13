#!/usr/bin/env node

/**
 * テストデータ生成スクリプト
 * Staging環境用の匿名化されたテストデータを生成する
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const STAGING_APP_NAME = 'timelogger-staging';
const TEST_DATA_SIZE = process.env.TEST_DATA_SIZE || 'medium'; // small, medium, large

// カラー定義
const colors = {
    red: '\033[0;31m',
    green: '\033[0;32m',
    yellow: '\033[1;33m',
    blue: '\033[0;34m',
    nc: '\033[0m'
};

const log = {
    info: (msg) => console.log(`${colors.blue}[INFO]${colors.nc} ${msg}`),
    success: (msg) => console.log(`${colors.green}[SUCCESS]${colors.nc} ${msg}`),
    warning: (msg) => console.log(`${colors.yellow}[WARNING]${colors.nc} ${msg}`),
    error: (msg) => console.log(`${colors.red}[ERROR]${colors.nc} ${msg}`)
};

console.log('📊 テストデータ生成を開始します...');
console.log(`📱 対象: ${STAGING_APP_NAME}`);
console.log(`📈 データサイズ: ${TEST_DATA_SIZE}`);

// データサイズ設定
const DATA_SIZES = {
    small: { users: 2, activities: 50, days: 7 },
    medium: { users: 5, activities: 200, days: 30 },
    large: { users: 10, activities: 500, days: 90 }
};

const config = DATA_SIZES[TEST_DATA_SIZE] || DATA_SIZES.medium;

// テストユーザーデータ
const generateTestUsers = () => {
    const users = [];
    const timezones = ['Asia/Tokyo', 'Asia/Kolkata', 'America/New_York', 'Europe/London'];
    
    for (let i = 1; i <= config.users; i++) {
        users.push({
            discord_id: `test_user_${String(i).padStart(3, '0')}`,
            username: `TestUser${i}`,
            timezone: timezones[i % timezones.length],
            created_at: new Date(Date.now() - (Math.random() * 30 * 24 * 60 * 60 * 1000)).toISOString()
        });
    }
    return users;
};

// テスト活動データ
const generateTestActivities = (users) => {
    const activities = [];
    const activityTemplates = [
        'プロジェクト開発作業',
        'ミーティング参加',
        'ドキュメント作成',
        '調査・研究作業',
        'コードレビュー',
        'テスト実行',
        '設計作業',
        'デバッグ作業',
        '学習・勉強',
        'その他の作業'
    ];

    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() - config.days);

    for (let day = 0; day < config.days; day++) {
        const currentDate = new Date(baseDate);
        currentDate.setDate(currentDate.getDate() + day);

        const activitiesPerDay = Math.floor(config.activities / config.days) + Math.floor(Math.random() * 3);

        for (let i = 0; i < activitiesPerDay; i++) {
            const user = users[Math.floor(Math.random() * users.length)];
            const template = activityTemplates[Math.floor(Math.random() * activityTemplates.length)];
            
            const activityDate = new Date(currentDate);
            activityDate.setHours(
                9 + Math.floor(Math.random() * 10), // 9-18時の間
                Math.floor(Math.random() * 60),     // ランダムな分
                0, 0
            );

            activities.push({
                id: `test_activity_${Date.now()}_${i}`,
                discord_id: user.discord_id,
                content: `${template} (テストデータ)`,
                timestamp: activityDate.toISOString(),
                analysis: JSON.stringify({
                    category: ['開発', '会議', 'ドキュメント', '調査'][Math.floor(Math.random() * 4)],
                    productive: Math.random() > 0.2, // 80%の確率で生産的
                    confidence: 0.8 + Math.random() * 0.2
                }),
                created_at: activityDate.toISOString()
            });
        }
    }

    return activities.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
};

// API使用履歴データ
const generateApiUsageData = () => {
    const usage = [];
    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() - config.days);

    for (let day = 0; day < config.days; day++) {
        const currentDate = new Date(baseDate);
        currentDate.setDate(currentDate.getDate() + day);

        // 日別のAPI使用量（ランダム）
        const inputTokens = Math.floor(Math.random() * 1000) + 100;
        const outputTokens = Math.floor(Math.random() * 500) + 50;

        usage.push({
            operation: 'analyze_activity',
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            cost: (inputTokens * 0.000075 + outputTokens * 0.0003), // Gemini Flash pricing
            created_at: currentDate.toISOString()
        });
    }

    return usage;
};

// SQLファイル生成
const generateSQLFile = (users, activities, apiUsage) => {
    let sql = '-- テストデータ生成SQL\n';
    sql += '-- 生成日時: ' + new Date().toISOString() + '\n';
    sql += '-- データサイズ: ' + TEST_DATA_SIZE + '\n\n';

    // 既存のテストデータクリーンアップ
    sql += '-- 既存のテストデータクリーンアップ\n';
    sql += "DELETE FROM activity_logs WHERE discord_id LIKE 'test_user_%';\n";
    sql += "DELETE FROM timezone_settings WHERE discord_id LIKE 'test_user_%';\n";
    sql += "DELETE FROM api_costs WHERE created_at >= date('now', '-" + (config.days + 1) + " days');\n\n";

    // ユーザー設定データ（timezone_settings テーブル）
    sql += '-- ユーザー設定データ\n';
    users.forEach(user => {
        sql += `INSERT OR REPLACE INTO timezone_settings (discord_id, timezone, updated_at) VALUES ('${user.discord_id}', '${user.timezone}', '${user.created_at}');\n`;
    });
    sql += '\n';

    // 活動ログデータ
    sql += '-- 活動ログデータ\n';
    activities.forEach(activity => {
        const escapedContent = activity.content.replace(/'/g, "''");
        const analysisJson = activity.analysis.replace(/'/g, "''");
        
        sql += `INSERT INTO activity_logs (discord_id, content, timestamp, analysis, created_at) VALUES ('${activity.discord_id}', '${escapedContent}', '${activity.timestamp}', '${analysisJson}', '${activity.created_at}');\n`;
    });
    sql += '\n';

    // API使用履歴データ
    sql += '-- API使用履歴データ\n';
    apiUsage.forEach(usage => {
        sql += `INSERT INTO api_costs (operation, input_tokens, output_tokens, cost, created_at) VALUES ('${usage.operation}', ${usage.input_tokens}, ${usage.output_tokens}, ${usage.cost}, '${usage.created_at}');\n`;
    });
    sql += '\n';

    return sql;
};

// メイン実行
async function main() {
    try {
        log.info('👤 テストユーザー生成中...');
        const users = generateTestUsers();
        log.success(`${users.length}人のテストユーザーを生成しました`);

        log.info('📝 テスト活動データ生成中...');
        const activities = generateTestActivities(users);
        log.success(`${activities.length}件の活動データを生成しました`);

        log.info('💰 API使用履歴データ生成中...');
        const apiUsage = generateApiUsageData();
        log.success(`${apiUsage.length}日分のAPI使用履歴を生成しました`);

        log.info('📄 SQLファイル生成中...');
        const sql = generateSQLFile(users, activities, apiUsage);
        
        const outputPath = path.join(__dirname, '../../temp/test-data.sql');
        
        // tempディレクトリ作成
        const tempDir = path.dirname(outputPath);
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        
        fs.writeFileSync(outputPath, sql);
        log.success(`SQLファイルを生成しました: ${outputPath}`);

        // サマリーレポート
        console.log('\n📊 テストデータ生成完了レポート');
        console.log('================================');
        console.log(`👤 テストユーザー数: ${users.length}`);
        console.log(`📝 活動ログ数: ${activities.length}`);
        console.log(`💰 API使用履歴: ${apiUsage.length}日分`);
        console.log(`📅 データ期間: ${config.days}日間`);
        console.log(`📄 SQLファイル: ${outputPath}`);
        
        // テストユーザー一覧
        console.log('\n👤 生成されたテストユーザー:');
        users.forEach(user => {
            console.log(`  - ${user.discord_id} (${user.username}) - ${user.timezone}`);
        });

        console.log('\n💡 Staging環境への適用方法:');
        console.log(`   1. Staging環境にSSH接続:`);
        console.log(`      flyctl ssh console --app ${STAGING_APP_NAME}`);
        console.log(`   2. データベースにSQL実行:`);
        console.log(`      sqlite3 /app/data/app.db < ${outputPath}`);
        console.log(`   3. 動作確認:`);
        console.log(`      https://${STAGING_APP_NAME}.fly.dev/health`);

    } catch (error) {
        log.error('テストデータ生成に失敗しました:', error.message);
        process.exit(1);
    }
}

// スクリプト実行
if (require.main === module) {
    main();
}

module.exports = {
    generateTestUsers,
    generateTestActivities,
    generateApiUsageData,
    generateSQLFile
};