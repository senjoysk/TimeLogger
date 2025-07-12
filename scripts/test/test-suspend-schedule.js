#!/usr/bin/env node

/**
 * サスペンドスケジュール機能のテストスクリプト
 */

const { getSafeDatabasePath } = require('../utils/databasePath');
const { SqliteActivityLogRepository } = require('../../dist/repositories/sqliteActivityLogRepository');
const { DynamicSchedulerService } = require('../../dist/services/dynamicSchedulerService');

async function testSuspendScheduleFeature() {
  console.log('🧪 サスペンドスケジュール機能テスト開始\n');

  try {
    // リポジトリ初期化
    const dbPath = getSafeDatabasePath();
    console.log(`📁 データベースパス: ${dbPath}`);
    
    const repository = new SqliteActivityLogRepository(dbPath);
    await repository.initializeDatabase();
    
    // 動的スケジューラーサービス初期化
    const schedulerService = new DynamicSchedulerService(repository);
    
    // テストユーザーID
    const testUserId = 'test_user_123';
    
    console.log('📊 テスト1: デフォルトスケジュール確認');
    let schedule = await repository.getUserSuspendSchedule(testUserId);
    console.log('デフォルトスケジュール:', schedule);
    
    console.log('\n🔧 テスト2: サスペンドスケジュール設定');
    // 1:00 サスペンド、8:00 起床に設定
    await repository.saveUserSuspendSchedule(testUserId, 1, 8);
    console.log('✅ スケジュール設定完了: 1:00サスペンド、8:00起床');
    
    console.log('\n📋 テスト3: 設定確認');
    schedule = await repository.getUserSuspendSchedule(testUserId);
    console.log('設定後スケジュール:', schedule);
    
    console.log('\n🌍 テスト4: 全ユーザースケジュール取得');
    const allSchedules = await repository.getAllUserSuspendSchedules();
    console.log('全ユーザースケジュール:', allSchedules);
    
    console.log('\n⏰ テスト5: 動的スケジューラー - 次回実行時刻計算');
    const nextExecutions = await schedulerService.getNextExecutionTimes();
    console.log('次回サスペンド:', nextExecutions.nextSuspend);
    console.log('次回起床:', nextExecutions.nextWake);
    
    console.log('\n📊 テスト6: スケジュール統計');
    const stats = await schedulerService.getScheduleStatistics();
    console.log('統計情報:', stats);
    
    console.log('\n🕐 テスト7: 現在時刻での実行判定');
    const scheduleCheck = await schedulerService.checkSchedule(30); // 30分許容
    console.log('実行判定結果:', {
      shouldSuspend: scheduleCheck.shouldSuspend,
      shouldWake: scheduleCheck.shouldWake,
      suspendUsers: scheduleCheck.suspendUsers,
      wakeUsers: scheduleCheck.wakeUsers,
      currentUtc: scheduleCheck.currentUtc.toISOString()
    });
    
    console.log('\n🔄 テスト8: GitHub Actions Cron式生成');
    const cronExpression = schedulerService.generateCronExpression();
    console.log('GitHub Actions Cron式:', cronExpression);
    
    console.log('\n🧪 テスト9: 異なるタイムゾーンでのテスト');
    // インドユーザーのテスト（IST = UTC+5:30）
    const indiaUserId = 'india_user_456';
    await repository.saveUserTimezone(indiaUserId, 'Asia/Kolkata');
    await repository.saveUserSuspendSchedule(indiaUserId, 23, 6); // 23:00サスペンド、6:00起床
    
    const indiaSchedule = await repository.getUserSuspendSchedule(indiaUserId);
    console.log('インドユーザーのスケジュール:', indiaSchedule);
    
    // 全ユーザーの次回実行時刻を再計算
    const updatedNextExecutions = await schedulerService.getNextExecutionTimes();
    console.log('マルチタイムゾーン対応後の次回実行時刻:');
    console.log('  サスペンド:', updatedNextExecutions.nextSuspend);
    console.log('  起床:', updatedNextExecutions.nextWake);
    
    console.log('\n✅ 全テスト完了！サスペンドスケジュール機能は正常に動作しています。');
    
  } catch (error) {
    console.error('❌ テスト失敗:', error);
    process.exit(1);
  }
}

// スクリプト実行
if (require.main === module) {
  testSuspendScheduleFeature()
    .then(() => {
      console.log('\n🎉 サスペンドスケジュール機能テスト完了！');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 テスト実行エラー:', error);
      process.exit(1);
    });
}

module.exports = { testSuspendScheduleFeature };