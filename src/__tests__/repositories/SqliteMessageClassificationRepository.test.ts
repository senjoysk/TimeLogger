/**
 * SqliteMessageClassificationRepository テスト
 * Phase 2: メッセージ分類専用リポジトリ分離テスト
 */

import { SqliteMessageClassificationRepository } from '../../repositories/specialized/SqliteMessageClassificationRepository';
import { DatabaseConnection } from '../../repositories/base/DatabaseConnection';
import { cleanupTestDatabaseFiles } from '../setup';
import { TodoError, MessageClassification } from '../../types/todo';
import * as path from 'path';
import * as fs from 'fs';

describe('SqliteMessageClassificationRepository分離テスト（実装済み）', () => {
  let repository: SqliteMessageClassificationRepository;
  let dbConnection: DatabaseConnection;
  const testDbPath = path.join(__dirname, '../../test-data/test-message-classification-repository.db');

  beforeEach(async () => {
    // テストDB用ディレクトリ作成
    const testDir = path.dirname(testDbPath);
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // 既存DBファイルの削除
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Repository初期化
    repository = new SqliteMessageClassificationRepository(testDbPath);
    dbConnection = DatabaseConnection.getInstance(testDbPath);
    await dbConnection.initializeDatabase();
  });

  afterEach(async () => {
    try {
      await dbConnection.close();
      await cleanupTestDatabaseFiles();
    } catch (error) {
      console.warn('⚠️ クリーンアップ中にエラー:', error);
    }
  });

  describe('メッセージ分類履歴管理', () => {
    test('新しいメッセージ分類履歴を記録できる', async () => {
      // Arrange
      const userId = 'test-user-123';
      const messageContent = 'プログラムのレビューをしてください';
      const aiClassification: MessageClassification = 'TODO';
      const aiConfidence = 0.85;

      // Act
      const record = await repository.recordClassification(
        userId,
        messageContent,
        aiClassification,
        aiConfidence
      );

      // Assert
      expect(record).toBeDefined();
      expect(record.id).toBeDefined();
      expect(record.userId).toBe(userId);
      expect(record.messageContent).toBe(messageContent);
      expect(record.aiClassification).toBe(aiClassification);
      expect(record.aiConfidence).toBe(aiConfidence);
      expect(record.classifiedAt).toBeDefined();
      expect(record.isCorrect).toBeUndefined(); // ユーザー分類がない場合
    });

    test('ユーザー分類付きでメッセージ分類履歴を記録できる', async () => {
      // Arrange
      const userId = 'test-user-123';
      const messageContent = 'コーヒーを飲んでいます';
      const aiClassification: MessageClassification = 'TODO';
      const aiConfidence = 0.60;
      const userClassification: MessageClassification = 'MEMO';
      const feedback = 'AIの判定が間違っています';

      // Act
      const record = await repository.recordClassification(
        userId,
        messageContent,
        aiClassification,
        aiConfidence,
        userClassification,
        feedback
      );

      // Assert
      expect(record.userClassification).toBe(userClassification);
      expect(record.feedback).toBe(feedback);
      expect(record.isCorrect).toBe(false); // AI予測とユーザー選択が異なる
    });

    test('AI予測が正しい場合のisCorrectフラグ', async () => {
      // Arrange
      const userId = 'test-user-123';
      const messageContent = '明日の会議の資料を準備する';
      const aiClassification: MessageClassification = 'TODO';
      const aiConfidence = 0.95;
      const userClassification: MessageClassification = 'TODO';

      // Act
      const record = await repository.recordClassification(
        userId,
        messageContent,
        aiClassification,
        aiConfidence,
        userClassification
      );

      // Assert
      expect(record.isCorrect).toBe(true); // AI予測とユーザー選択が一致
    });

    test('分類フィードバックを更新できる', async () => {
      // Arrange
      const userId = 'test-user-123';
      const messageContent = 'システムの検討をします';
      const aiClassification: MessageClassification = 'UNCERTAIN';
      const aiConfidence = 0.45;

      const record = await repository.recordClassification(
        userId,
        messageContent,
        aiClassification,
        aiConfidence
      );

      const userClassification: MessageClassification = 'TODO';
      const feedback = '実際にはTODOでした';

      // Act
      await repository.updateClassificationFeedback(
        record.id,
        userClassification,
        feedback
      );

      // 更新されたレコードを取得
      const history = await repository.getClassificationHistory(userId, 1);

      // Assert
      expect(history).toHaveLength(1);
      expect(history[0].userClassification).toBe(userClassification);
      expect(history[0].feedback).toBe(feedback);
      expect(history[0].isCorrect).toBe(false); // UNCERTAIN → TODO なので不正解
    });
  });

  describe('分類履歴取得機能', () => {
    beforeEach(async () => {
      // テストデータ作成（時間差を確保）
      await repository.recordClassification(
        'test-user-123',
        '今日の作業ログ',
        'MEMO',
        0.90,
        'MEMO'
      );

      // 時間差を作るため少し待機
      await new Promise(resolve => setTimeout(resolve, 10));

      await repository.recordClassification(
        'test-user-123',
        'バグを修正してください',
        'TODO',
        0.85,
        'TODO'
      );

      // 時間差を作るため少し待機
      await new Promise(resolve => setTimeout(resolve, 10));

      await repository.recordClassification(
        'test-user-123',
        'よくわからないメッセージ',
        'UNCERTAIN',
        0.30,
        'MEMO'
      );

      // 他のユーザーのデータ
      await repository.recordClassification(
        'other-user',
        '他のユーザーのメッセージ',
        'TODO',
        0.80,
        'TODO'
      );
    });

    test('ユーザーIDで分類履歴を取得できる', async () => {
      // Act
      const history = await repository.getClassificationHistory('test-user-123');

      // Assert
      expect(history).toHaveLength(3);
      expect(history.every(record => record.userId === 'test-user-123')).toBe(true);
      // 新しい順にソートされている
      expect(history[0].messageContent).toBe('よくわからないメッセージ');
    });

    test('制限数を指定して分類履歴を取得できる', async () => {
      // Act
      const history = await repository.getClassificationHistory('test-user-123', 2);

      // Assert
      expect(history).toHaveLength(2);
      expect(history[0].messageContent).toBe('よくわからないメッセージ');
      expect(history[1].messageContent).toBe('バグを修正してください');
    });

    test('存在しないユーザーの履歴は空配列', async () => {
      // Act
      const history = await repository.getClassificationHistory('non-existent-user');

      // Assert
      expect(history).toHaveLength(0);
    });
  });

  describe('分類精度統計機能', () => {
    beforeEach(async () => {
      // 精度統計用のテストデータ作成
      const testData = [
        // TODO分類の統計: 3件中2件正解 (66.7%)
        { message: 'タスク1', ai: 'TODO', user: 'TODO', confidence: 0.90 },
        { message: 'タスク2', ai: 'TODO', user: 'TODO', confidence: 0.85 },
        { message: 'タスク3', ai: 'TODO', user: 'MEMO', confidence: 0.70 },
        
        // MEMO分類の統計: 2件中1件正解 (50%)
        { message: 'メモ1', ai: 'MEMO', user: 'MEMO', confidence: 0.95 },
        { message: 'メモ2', ai: 'MEMO', user: 'TODO', confidence: 0.60 },
        
        // UNCERTAIN分類の統計: 1件中0件正解 (0%)
        { message: '不明1', ai: 'UNCERTAIN', user: 'TODO', confidence: 0.40 },
      ];

      for (const data of testData) {
        await repository.recordClassification(
          'stats-user',
          data.message,
          data.ai as MessageClassification,
          data.confidence,
          data.user as MessageClassification
        );
      }
    });

    test('分類精度統計を取得できる', async () => {
      // Act
      const stats = await repository.getClassificationAccuracy('stats-user');

      // Assert
      expect(stats).toHaveLength(3);
      
      // TODO分類の統計確認
      const todoStats = stats.find(s => s.classification === 'TODO');
      expect(todoStats).toBeDefined();
      expect(todoStats!.totalCount).toBe(3);
      expect(todoStats!.correctCount).toBe(2);
      expect(todoStats!.accuracy).toBeCloseTo(0.6667, 4);
      expect(todoStats!.avgConfidence).toBeCloseTo(0.8167, 4);

      // MEMO分類の統計確認
      const memoStats = stats.find(s => s.classification === 'MEMO');
      expect(memoStats).toBeDefined();
      expect(memoStats!.totalCount).toBe(2);
      expect(memoStats!.correctCount).toBe(1);
      expect(memoStats!.accuracy).toBe(0.5);
      expect(memoStats!.avgConfidence).toBeCloseTo(0.775, 4);

      // UNCERTAIN分類の統計確認
      const uncertainStats = stats.find(s => s.classification === 'UNCERTAIN');
      expect(uncertainStats).toBeDefined();
      expect(uncertainStats!.totalCount).toBe(1);
      expect(uncertainStats!.correctCount).toBe(0);
      expect(uncertainStats!.accuracy).toBe(0);
      expect(uncertainStats!.avgConfidence).toBe(0.40);
    });

    test('全ユーザーの分類精度統計を取得できる', async () => {
      // 他のユーザーのデータも追加
      await repository.recordClassification(
        'other-user',
        '別ユーザーのタスク',
        'TODO',
        0.80,
        'TODO'
      );

      // Act
      const stats = await repository.getClassificationAccuracy(); // userIdなし

      // Assert - 全ユーザーのデータが集計される
      const todoStats = stats.find(s => s.classification === 'TODO');
      expect(todoStats!.totalCount).toBe(4); // stats-user: 3件 + other-user: 1件
      expect(todoStats!.correctCount).toBe(3); // stats-user: 2件 + other-user: 1件
    });

    test('ユーザー分類がないレコードは統計から除外される', async () => {
      // ユーザー分類がないレコードを追加
      await repository.recordClassification(
        'stats-user',
        'フィードバックなしメッセージ',
        'TODO',
        0.75
      );

      // Act
      const stats = await repository.getClassificationAccuracy('stats-user');

      // Assert - ユーザー分類がないレコードは除外される
      const todoStats = stats.find(s => s.classification === 'TODO');
      expect(todoStats!.totalCount).toBe(3); // フィードバックなしは除外
    });
  });

  describe('エラーハンドリング', () => {
    test('存在しない分類履歴IDの更新でエラーにならない', async () => {
      // Act & Assert
      await expect(repository.updateClassificationFeedback(
        'non-existent-id',
        'TODO',
        'テストフィードバック'
      )).resolves.not.toThrow();
    });

    test('不正なパラメータでの分類記録はエラーになる', async () => {
      // Act & Assert - 空のユーザーIDでエラー
      await expect(repository.recordClassification(
        '',
        'テストメッセージ',
        'TODO',
        0.5
      )).rejects.toThrow();
    });
  });

  describe('データベース統合テスト', () => {
    test('message_classificationsテーブルが自動作成される', async () => {
      // Act - 分類記録でテーブル作成をトリガー
      await repository.recordClassification(
        'test',
        'Test message',
        'TODO',
        0.8
      );

      // テーブルが存在することを確認
      const tables = await dbConnection.all(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='message_classifications'
      `);
      
      // Assert
      expect(tables).toHaveLength(1);
      expect(tables[0].name).toBe('message_classifications');
    });

    test('分類履歴のデータ整合性が保たれる', async () => {
      // Arrange & Act - 複数の分類を記録
      const records = [];
      for (let i = 0; i < 5; i++) {
        const record = await repository.recordClassification(
          'consistency-user',
          `メッセージ ${i + 1}`,
          'TODO',
          0.5 + (i * 0.1)
        );
        records.push(record);
      }

      // 履歴を取得して整合性確認
      const history = await repository.getClassificationHistory('consistency-user');

      // Assert
      expect(history).toHaveLength(5);
      expect(history.every(h => h.userId === 'consistency-user')).toBe(true);
      expect(history.every(h => h.aiClassification === 'TODO')).toBe(true);
      
      // ID一意性確認
      const ids = history.map(h => h.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(5);
    });
  });
});