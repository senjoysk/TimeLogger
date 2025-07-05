/**
 * ClassificationResultEmbed コンポーネントのテスト
 * TDD開発: Red Phase - まず失敗するテストを書く
 */

import { 
  createClassificationResultEmbed,
  createClassificationButtons,
  createTodoListEmbed,
  createTodoActionButtons,
  generateSessionId
} from '../../components/classificationResultEmbed';
import { ClassificationResult } from '../../types/todo';

describe('ClassificationResultEmbed', () => {
  
  describe('createClassificationResultEmbed', () => {
    test('TODO分類結果のEmbedを正しく生成できる', () => {
      const result: ClassificationResult = {
        classification: 'TODO',
        confidence: 0.85,
        reason: 'タスク実行の意図が明確に表現されています',
        suggestedAction: 'TODOリストに追加して期日を設定',
        priority: 1,
        dueDateSuggestion: '2025-01-10'
      };

      const embed = createClassificationResultEmbed({
        originalMessage: 'プレゼン資料を明日までに作成する',
        result,
        userId: 'test-user-123'
      });

      expect(embed.data.title).toBe('📋 AI分析結果');
      expect(embed.data.color).toBe(0x00ff00); // 緑色 (TODO)
      expect(embed.data.description).toContain('プレゼン資料を明日までに作成する');
      expect(embed.data.fields).toHaveLength(4); // AI判定、信頼度、判定理由、TODO詳細
      
      // AI判定フィールドの確認
      const aiField = embed.data.fields?.find(f => f.name === '🤖 AI判定');
      expect(aiField?.value).toBe('**TODO**');
      
      // 信頼度フィールドの確認
      const confidenceField = embed.data.fields?.find(f => f.name === '📊 信頼度');
      expect(confidenceField?.value).toContain('85%');
      
      // TODO詳細フィールドの確認
      const todoField = embed.data.fields?.find(f => f.name === '📋 TODO詳細');
      expect(todoField?.value).toContain('🔴 高');
      expect(todoField?.value).toContain('2025-01-10');
      expect(todoField?.value).toContain('TODOリストに追加して期日を設定');
    });

    test('ACTIVITY_LOG分類結果のEmbedを正しく生成できる', () => {
      const result: ClassificationResult = {
        classification: 'ACTIVITY_LOG',
        confidence: 0.92,
        reason: '完了した活動の記録として判定されました'
      };

      const embed = createClassificationResultEmbed({
        originalMessage: 'プレゼン資料の作成を完了した',
        result,
        userId: 'test-user-123'
      });

      expect(embed.data.title).toBe('📝 AI分析結果');
      expect(embed.data.color).toBe(0x0099ff); // 青色 (ACTIVITY_LOG)
      expect(embed.data.fields).toHaveLength(3); // AI判定、信頼度、判定理由のみ
      
      const aiField = embed.data.fields?.find(f => f.name === '🤖 AI判定');
      expect(aiField?.value).toBe('**活動ログ**');
    });

    test('MEMO分類結果のEmbedを正しく生成できる', () => {
      const result: ClassificationResult = {
        classification: 'MEMO',
        confidence: 0.75,
        reason: 'メモや参考情報として判定されました'
      };

      const embed = createClassificationResultEmbed({
        originalMessage: '参考になるリンクをメモ: https://example.com',
        result,
        userId: 'test-user-123'
      });

      expect(embed.data.title).toBe('📄 AI分析結果');
      expect(embed.data.color).toBe(0xffaa00); // オレンジ色 (MEMO)
    });

    test('UNCERTAIN分類結果のEmbedを正しく生成できる', () => {
      const result: ClassificationResult = {
        classification: 'UNCERTAIN',
        confidence: 0.3,
        reason: '明確な分類が困難です'
      };

      const embed = createClassificationResultEmbed({
        originalMessage: 'うーん',
        result,
        userId: 'test-user-123'
      });

      expect(embed.data.title).toBe('❓ AI分析結果');
      expect(embed.data.color).toBe(0x888888); // グレー色 (UNCERTAIN)
    });

    test('長いメッセージは適切に切り詰められる', () => {
      const longMessage = 'とても長いメッセージです。'.repeat(20); // 200文字超
      
      const result: ClassificationResult = {
        classification: 'TODO',
        confidence: 0.8,
        reason: 'テスト'
      };

      const embed = createClassificationResultEmbed({
        originalMessage: longMessage,
        result,
        userId: 'test-user-123'
      });

      expect(embed.data.description!.length).toBeGreaterThan(200); // マークダウン込みで200文字超
      expect(embed.data.description).toContain('...');
    });
  });

  describe('createClassificationButtons', () => {
    test('TODO分類の確認ボタンが正しく生成される', () => {
      const sessionId = 'test-session-123';
      const buttons = createClassificationButtons(sessionId, 'TODO');

      expect(buttons.components).toHaveLength(4); // 確認 + 代替2つ + 無視
      
      // ボタンが正しく生成されているかを基本的にチェック
      expect(buttons.components[0]).toBeDefined();
      expect(buttons.components[3]).toBeDefined();
    });

    test('ACTIVITY_LOG分類の確認ボタンが正しく生成される', () => {
      const sessionId = 'test-session-456';
      const buttons = createClassificationButtons(sessionId, 'ACTIVITY_LOG');

      expect(buttons.components).toHaveLength(4);
      expect(buttons.components[0]).toBeDefined();
    });

    test('代替分類ボタンに正しいオプションが含まれる', () => {
      const sessionId = 'test-session-789';
      const buttons = createClassificationButtons(sessionId, 'TODO');

      // 適切な数のボタンが生成されることを確認
      expect(buttons.components).toHaveLength(4);
      expect(buttons.components[1]).toBeDefined();
      expect(buttons.components[2]).toBeDefined();
    });
  });

  describe('createTodoListEmbed', () => {
    test('TODO一覧が正しく表示される', () => {
      const todos = [
        {
          id: '1',
          content: 'プレゼン資料を作成する',
          status: 'pending',
          priority: 1,
          due_date: '2025-01-10',
          created_at: '2025-01-01T00:00:00Z'
        },
        {
          id: '2',
          content: '会議の準備をする',
          status: 'in_progress',
          priority: 0,
          created_at: '2025-01-01T01:00:00Z'
        }
      ];

      const embed = createTodoListEmbed(todos, 'test-user');

      expect(embed.data.title).toBe('📋 TODO一覧');
      expect(embed.data.color).toBe(0x00ff00);
      expect(embed.data.description).toContain('プレゼン資料を作成する');
      expect(embed.data.description).toContain('会議の準備をする');
      expect(embed.data.description).toContain('期日: 2025-01-10');
      expect(embed.data.description).toContain('🔴'); // 高優先度アイコン
      expect(embed.data.description).toContain('⏳'); // pendingアイコン
      expect(embed.data.description).toContain('🚀'); // in_progressアイコン
    });

    test('TODOが0件の場合の表示', () => {
      const embed = createTodoListEmbed([], 'test-user');

      expect(embed.data.description).toContain('現在登録されているTODOはありません');
      expect(embed.data.description).toContain('新しいメッセージを送信してTODOを作成しましょう');
    });

    test('10件を超えるTODOがある場合の表示制限', () => {
      const todos = Array.from({ length: 15 }, (_, i) => ({
        id: `${i + 1}`,
        content: `TODO ${i + 1}`,
        status: 'pending',
        priority: 0,
        created_at: '2025-01-01T00:00:00Z'
      }));

      const embed = createTodoListEmbed(todos, 'test-user');

      expect(embed.data.description).toContain('TODO 10'); // 10番目まで表示
      expect(embed.data.description).not.toContain('TODO 11'); // 11番目以降は非表示
      
      const limitField = embed.data.fields?.find(f => f.name === '⚠️ 表示制限');
      expect(limitField?.value).toContain('5件の追加のTODO');
    });
  });

  describe('createTodoActionButtons', () => {
    test('pending状態のTODOアクションボタン', () => {
      const buttons = createTodoActionButtons('todo-123', 'pending');

      expect(buttons.components).toHaveLength(4); // 完了、開始、編集、削除
      
      // ボタンが正しく生成されているかを基本的にチェック
      expect(buttons.components[0]).toBeDefined();
      expect(buttons.components[1]).toBeDefined();
      expect(buttons.components[2]).toBeDefined();
      expect(buttons.components[3]).toBeDefined();
    });

    test('in_progress状態のTODOアクションボタン', () => {
      const buttons = createTodoActionButtons('todo-456', 'in_progress');

      expect(buttons.components).toHaveLength(3); // 完了、編集、削除（開始なし）
      
      expect(buttons.components[0]).toBeDefined();
      expect(buttons.components[1]).toBeDefined();
      expect(buttons.components[2]).toBeDefined();
    });

    test('completed状態のTODOアクションボタン', () => {
      const buttons = createTodoActionButtons('todo-789', 'completed');

      expect(buttons.components).toHaveLength(2); // 編集、削除のみ（完了・開始なし）
      
      expect(buttons.components[0]).toBeDefined();
      expect(buttons.components[1]).toBeDefined();
    });

    test('すべてのボタンに適切なIDが設定される', () => {
      const buttons = createTodoActionButtons('test-id', 'pending');

      // 4つのボタンが生成されることを確認
      expect(buttons.components).toHaveLength(4);
      expect(buttons.components.every(btn => btn)).toBe(true);
    });
  });

  describe('generateSessionId', () => {
    test('ユニークなセッションIDが生成される', () => {
      const id1 = generateSessionId('user1');
      const id2 = generateSessionId('user1');
      
      expect(id1).not.toBe(id2);
      expect(id1).toContain('user1');
      expect(id2).toContain('user1');
    });

    test('異なるユーザーで異なるIDが生成される', () => {
      const id1 = generateSessionId('user1');
      const id2 = generateSessionId('user2');
      
      expect(id1).toContain('user1');
      expect(id2).toContain('user2');
      expect(id1).not.toBe(id2);
    });

    test('タイムスタンプが指定された場合のID生成', () => {
      const timestamp = new Date('2025-01-01T00:00:00Z');
      const id = generateSessionId('user1', timestamp);
      
      expect(id).toContain('user1');
      expect(id).toContain('1735689600000'); // 2025-01-01のタイムスタンプ
    });
  });
});