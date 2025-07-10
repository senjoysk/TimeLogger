#!/usr/bin/env node

/**
 * Phase1 データベース移行スクリプト
 * 安全性を最優先にしたローカル環境での移行実行
 */

const path = require('path');
const fs = require('fs');

// TypeScriptファイルを実行するための設定
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

console.log('🚀 Phase1 Database Migration');
console.log(`Environment: ${process.env.NODE_ENV}`);
console.log(`Working Directory: ${process.cwd()}`);

async function runMigration() {
  try {
    // TypeScript/ts-nodeの動的インポート
    const { register } = require('ts-node');
    register({
      project: path.join(__dirname, '../tsconfig.json'),
      transpileOnly: true
    });
    
    // 移行クラスのインポート
    const { DataMigrator } = require('../src/database/dataMigrator');
    const { DatabasePathManager } = require('../src/database/databasePathManager');
    
    console.log('\n📋 Migration Pre-Check');
    console.log('='.repeat(50));
    
    // 現在の状態確認
    const pathManager = DatabasePathManager.getInstance();
    const debugInfo = pathManager.getDebugInfo();
    
    console.log('Current Database Status:');
    Object.entries(debugInfo).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });
    
    // 移行クラスの初期化
    const migrator = new DataMigrator();
    const status = migrator.getMigrationStatus();
    
    console.log('\nMigration Status:');
    console.log(`  Main DB exists: ${status.mainDatabaseExists}`);
    console.log(`  Legacy DB exists: ${status.legacyDatabaseExists}`);
    console.log(`  Main DB size: ${status.mainDatabaseSize} KB`);
    console.log(`  Legacy DB size: ${status.legacyDatabaseSize} KB`);
    console.log(`  Needs migration: ${status.needsMigration}`);
    
    if (!status.needsMigration) {
      console.log('\n✅ No migration needed');
      if (status.mainDatabaseExists) {
        console.log('Main database already exists and is ready to use');
      } else {
        console.log('No legacy database found to migrate');
      }
      return;
    }
    
    // ユーザー確認（開発環境のみ）
    if (process.env.NODE_ENV === 'development') {
      console.log('\n⚠️  Migration will:');
      console.log(`  1. Create backup of ${status.paths.legacy}`);
      console.log(`  2. Copy data to ${status.paths.main}`);
      console.log(`  3. Preserve original legacy database`);
      console.log('\nThis operation is SAFE and non-destructive.');
      
      // 自動実行（スクリプトモードでは確認をスキップ）
      console.log('\nProceeding with migration...\n');
    }
    
    // 移行実行
    console.log('\n🔄 Starting Migration Process');
    console.log('='.repeat(50));
    
    const result = await migrator.performSafeMigration();
    
    // 結果の表示
    console.log('\n📊 Migration Results');
    console.log('='.repeat(50));
    
    console.log(`Status: ${result.success ? '✅ SUCCESS' : '❌ FAILURE'}`);
    
    if (result.backupPath) {
      console.log(`Backup: ${result.backupPath}`);
    }
    
    console.log('\nSteps performed:');
    result.steps.forEach(step => {
      const status = step.success ? '✅' : '❌';
      console.log(`  ${status} ${step.step}: ${step.message}`);
    });
    
    if (result.migratedData.totalRecords > 0) {
      console.log('\nMigrated data:');
      result.migratedData.tables.forEach(table => {
        console.log(`  ${table.name}: ${table.records} records`);
      });
      console.log(`Total: ${result.migratedData.totalRecords} records`);
    }
    
    if (result.errors.length > 0) {
      console.log('\nErrors:');
      result.errors.forEach(error => {
        console.log(`  ❌ ${error}`);
      });
    }
    
    // 最終確認
    if (result.success) {
      console.log('\n🎉 Migration completed successfully!');
      console.log('\nNext steps:');
      console.log('  1. Test the application with new database');
      console.log('  2. Verify all data is accessible');
      console.log('  3. Deploy to production if tests pass');
    } else {
      console.log('\n💥 Migration failed!');
      console.log('Please check the errors above and retry.');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n💥 Fatal error during migration:');
    console.error(error);
    process.exit(1);
  }
}

// スクリプト実行
if (require.main === module) {
  runMigration().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

module.exports = { runMigration };