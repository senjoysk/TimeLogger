/**
 * MessageClassificationServiceのテスト
 * TDD開発: Red Phase - まず失敗するテストを書く
 */

import { MessageClassificationService } from '../../services/messageClassificationService';
import { MessageClassification, ClassificationResult } from '../../types/todo';

describe('MessageClassificationService', () => {
  let service: MessageClassificationService;

  beforeEach(() => {
    service = new MessageClassificationService();
  });

  describe('classifyMessage', () => {
    test('TODOメッセージを正しく分類できる', async () => {
      const message = 'プレゼン資料を作成する';
      
      const result = await service.classifyMessage(message);
      
      expect(result.classification).toBe('TODO');
      expect(result.confidence).toBeGreaterThan(0.7);
      expect(result.reason).toBeDefined();
    });

    test('活動ログメッセージを正しく分類できる', async () => {
      const message = 'プレゼン資料を作成した';
      
      const result = await service.classifyMessage(message);
      
      expect(result.classification).toBe('UNCERTAIN');
      expect(result.confidence).toBeGreaterThanOrEqual(0.3);
      expect(result.reason).toBeDefined();
    });

    test('メモメッセージを正しく分類できる', async () => {
      const message = '参考になるリンクを保存';
      
      const result = await service.classifyMessage(message);
      
      expect(result.classification).toBe('MEMO');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.reason).toBeDefined();
    });

    test('不明確なメッセージはUNCERTAINとして分類される', async () => {
      const message = 'あー';
      
      const result = await service.classifyMessage(message);
      
      expect(result.classification).toBe('UNCERTAIN');
      expect(result.confidence).toBeLessThan(0.5);
    });

    test('TODO分類時に推奨アクションが含まれる', async () => {
      const message = '明日までに資料を完成させる';
      
      const result = await service.classifyMessage(message);
      
      expect(result.classification).toBe('TODO');
      expect(result.suggestedAction).toBeDefined();
      expect(result.priority).toBeDefined();
    });

    test('期日を含むTODOでは期日提案が含まれる', async () => {
      const message = '来週金曜日までにレポートを提出する';
      
      const result = await service.classifyMessage(message);
      
      expect(result.classification).toBe('TODO');
      expect(result.dueDateSuggestion).toBeDefined();
    });
  });

  describe('improveClassificationAccuracy', () => {
    test('ユーザーフィードバックで分類精度を改善できる', async () => {
      const message = '会議に参加する';
      const actualClass: MessageClassification = 'TODO';
      
      // フィードバック学習をテスト
      await service.improveClassificationAccuracy(message, actualClass);
      
      // 同様のメッセージの分類が改善されることを確認
      const result = await service.classifyMessage('ミーティングに参加する');
      expect(result.classification).toBe('TODO');
    });
  });

  describe('getClassificationConfidenceThresholds', () => {
    test('分類信頼度の閾値を取得できる', async () => {
      const thresholds = await service.getClassificationConfidenceThresholds();
      
      expect(thresholds.todo).toBeGreaterThan(0);
      expect(thresholds.memo).toBeGreaterThan(0);
      expect(thresholds.uncertain).toBeGreaterThan(0);
    });
  });

  describe('エラーハンドリング', () => {
    test('空のメッセージはUNCERTAINとして処理される', async () => {
      const result = await service.classifyMessage('');
      
      expect(result.classification).toBe('UNCERTAIN');
      expect(result.confidence).toBe(0);
    });

    test('極端に長いメッセージも適切に処理される', async () => {
      const longMessage = 'あ'.repeat(10000);
      
      const result = await service.classifyMessage(longMessage);
      
      expect(result.classification).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });
  });
});