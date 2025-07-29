/**
 * ActivityLogServiceのマッチング機能統合テスト
 * Phase 2: ActivityLogServiceとマッチング機能の統合確認
 */

import { ActivityLogService } from '../../services/activityLogService';
import { PartialCompositeRepository } from '../../repositories/PartialCompositeRepository';
import { GeminiService } from '../../services/geminiService';
import { ActivityLog } from '../../types/activityLog';
import * as fs from 'fs';
import * as path from 'path';

describe('ActivityLogService Integration - Matching Features', () => {
  let service: ActivityLogService;
  let repository: PartialCompositeRepository;
  let geminiService: jest.Mocked<GeminiService>;
  const testDbPath = ':memory:'; // インメモリDB

  beforeEach(async () => {
    // テスト用のGeminiServiceモック
    geminiService = {
      analyzeActivity: jest.fn(),
      generateDailySummary: jest.fn(),
      getDailyCostReport: jest.fn(),
      getCostStats: jest.fn(),
      checkCostAlerts: jest.fn(),
    } as any;

    // テスト用リポジトリとサービスの初期化
    repository = new PartialCompositeRepository(testDbPath);
    await repository.initializeDatabase();
    
    // テストデータを完全にクリーンアップ
    await cleanupTestData();
    
    service = new ActivityLogService(repository, geminiService);
  });

  afterEach(async () => {
    // テスト後のクリーンアップ
    await cleanupTestData();
    await repository.close();
  });

  // テストデータクリーンアップ用ヘルパー関数
  async function cleanupTestData(): Promise<void> {
    try {
      // 全ユーザーを取得してデータを削除
      const users = await repository.getAllUsers();
      for (const user of users) {
        // 全ログを削除
        const logs = await repository.getLogsByDateRange(
          user.userId, 
          '1900-01-01', 
          '2100-12-31'
        );
        for (const log of logs) {
          await repository.permanentDeleteLog(log.id);
        }
        
        // 全TODOを削除
        const todos = await repository.getTodosByUserId(user.userId);
        for (const todo of todos) {
          await repository.deleteTodo(todo.id);
        }
      }
    } catch (error) {
      // エラーが発生してもテストを継続
      console.warn('テストデータクリーンアップで軽微なエラー:', error);
    }
  }

  describe('🔴 Red: ログタイプ分析と記録機能', () => {
    it('開始ログを正しく記録し、ログタイプを判定する', async () => {
      // Act
      const result = await service.recordActivity(
        'test-user',
        '今から会議を始めます',
        'Asia/Tokyo'
      );

      // Assert
      expect(result.logType).toBe('start_only');
      expect(result.matchStatus).toBe('unmatched');
      expect(result.activityKey).toBe('会議');
      expect(result.content).toBe('今から会議を始めます');
    });

    it('終了ログを正しく記録し、ログタイプを判定する', async () => {
      // Act
      const result = await service.recordActivity(
        'test-user',
        '会議を終えました',
        'Asia/Tokyo'
      );

      // Assert
      expect(result.logType).toBe('end_only');
      expect(result.matchStatus).toBe('unmatched');
      expect(result.activityKey).toBe('会議');
      expect(result.content).toBe('会議を終えました');
    });

    it('完結型ログを正しく記録し、ログタイプを判定する', async () => {
      // Act
      const result = await service.recordActivity(
        'test-user',
        '10時から11時まで会議をした',
        'Asia/Tokyo'
      );

      // Assert
      expect(result.logType).toBe('complete');
      expect(result.matchStatus).toBe('unmatched');
      expect(result.activityKey).toBe('会議');
      expect(result.content).toBe('10時から11時まで会議をした');
    });
  });

  describe('🔴 Red: マッチング待ちログ取得機能', () => {
    it('マッチング待ちログを正しく取得する', async () => {
      // Arrange: 自動マッチングを避けるため、異なる活動内容で作成
      const startLog = await service.recordActivity('test-user', '今からプログラミングを始めます', 'Asia/Tokyo');
      const endLog = await service.recordActivity('test-user', '会議を終えました', 'Asia/Tokyo');
      
      // デバッグ情報を出力
      console.log('Start log:', { id: startLog.id, logType: startLog.logType, matchStatus: startLog.matchStatus, activityKey: startLog.activityKey });
      console.log('End log:', { id: endLog.id, logType: endLog.logType, matchStatus: endLog.matchStatus, activityKey: endLog.activityKey });
      
      // Act
      const unmatchedLogs = await service.getUnmatchedLogs('test-user', 'Asia/Tokyo');
      console.log('Unmatched logs:', unmatchedLogs.map(log => ({ id: log.id, logType: log.logType, matchStatus: log.matchStatus })));

      // Assert
      expect(unmatchedLogs).toHaveLength(2);
      expect(unmatchedLogs.find(log => log.id === startLog.id)).toBeDefined();
      expect(unmatchedLogs.find(log => log.id === endLog.id)).toBeDefined();
      expect(unmatchedLogs.every(log => log.matchStatus === 'unmatched')).toBe(true);
    });

    it('完結型ログはマッチング待ちリストに含まれない', async () => {
      // Arrange
      await service.recordActivity('test-user', '10時から11時まで会議をした', 'Asia/Tokyo');
      await service.recordActivity('test-user', '今から作業を始めます', 'Asia/Tokyo');
      
      // Act
      const unmatchedLogs = await service.getUnmatchedLogs('test-user', 'Asia/Tokyo');

      // Assert
      expect(unmatchedLogs).toHaveLength(1);
      expect(unmatchedLogs[0].logType).toBe('start_only');
    });
  });

  describe('🔴 Red: 手動マッチング機能', () => {
    it('開始・終了ログを手動でマッチングできる', async () => {
      // Arrange: 自動マッチングを避けるため、異なる活動内容で作成
      const startLog = await service.recordActivity('test-user', '今からマーケティングを始めます', 'Asia/Tokyo');
      const endLog = await service.recordActivity('test-user', 'プログラミングを終えました', 'Asia/Tokyo');
      
      // デバッグ情報を出力
      console.log('Before manual match - Start log:', { id: startLog.id, matchStatus: startLog.matchStatus });
      console.log('Before manual match - End log:', { id: endLog.id, matchStatus: endLog.matchStatus });
      
      // Act
      const result = await service.manualMatchLogs(startLog.id, endLog.id, 'test-user');

      // Assert
      expect(result.startLog.matchStatus).toBe('matched');
      expect(result.endLog.matchStatus).toBe('matched');
      expect(result.startLog.matchedLogId).toBe(endLog.id);
      expect(result.endLog.matchedLogId).toBe(startLog.id);
      expect(result.startLog.similarityScore).toBe(1.0);
      expect(result.endLog.similarityScore).toBe(1.0);
    });

    it('異なるユーザーのログはマッチングできない', async () => {
      // Arrange
      const startLog = await service.recordActivity('user1', '今から会議を始めます', 'Asia/Tokyo');
      const endLog = await service.recordActivity('user2', '会議を終えました', 'Asia/Tokyo');
      
      // Act & Assert
      await expect(service.manualMatchLogs(startLog.id, endLog.id, 'user1'))
        .rejects.toThrow('他のユーザーのログをマッチングすることはできません');
    });

    it('既にマッチング済みのログは再マッチングできない', async () => {
      // Arrange: 自動マッチングを避けるため、異なる活動内容で作成
      const startLog = await service.recordActivity('test-user', '今からデザインを始めます', 'Asia/Tokyo');
      const endLog = await service.recordActivity('test-user', '研究を終えました', 'Asia/Tokyo');
      
      // デバッグ情報
      console.log('Initial logs:', { 
        start: { id: startLog.id, matchStatus: startLog.matchStatus },
        end: { id: endLog.id, matchStatus: endLog.matchStatus }
      });
      
      // 最初のマッチング
      await service.manualMatchLogs(startLog.id, endLog.id, 'test-user');
      
      // 別のログを作成
      const anotherEndLog = await service.recordActivity('test-user', '企画を終えました', 'Asia/Tokyo');
      
      // Act & Assert
      await expect(service.manualMatchLogs(startLog.id, anotherEndLog.id, 'test-user'))
        .rejects.toThrow('既にマッチング済みのログは再マッチングできません');
    });
  });
});