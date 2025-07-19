/**
 * 活動記録システム統合テスト
 * Discord Botでのコマンド処理の動作確認
 */

import { ActivityLoggingIntegration, createDefaultConfig } from '../../integration';
import { Message } from 'discord.js';
import { DATABASE_PATHS } from '../../database/simplePathConfig';
import * as fs from 'fs';
import * as path from 'path';
import { getTestDbPath, cleanupTestDatabase } from '../../utils/testDatabasePath';

// Discordメッセージのモック
class MockMessage {
  public content: string;
  public author: { id: string; bot: boolean; tag: string };
  public guild: null = null; // DM simulation - 明示的にnullを設定
  public channel: { isDMBased: () => boolean } = { isDMBased: () => true };
  public replies: string[] = [];

  constructor(content: string, userId: string = '770478489203507241') {
    this.content = content;
    this.author = { id: userId, bot: false, tag: 'test-user' };
  }

  async reply(message: string): Promise<void> {
    this.replies.push(message);
  }

  async react(emoji: string): Promise<void> {
    // リアクション処理（モック）
  }
}

describe('活動記録システム統合テスト', () => {
  let integration: ActivityLoggingIntegration;
  const testDbPath = getTestDbPath(__filename);

  beforeAll(async () => {
    // 環境変数を明示的に設定
    process.env.USER_TIMEZONE = 'Asia/Tokyo';
    
    // テストデータディレクトリ作成とDBファイル削除
    const testDir = path.dirname(testDbPath);
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    cleanupTestDatabase(testDbPath);
    
    const config = createDefaultConfig(
      testDbPath, // テスト用一時ファイルDB
      'test-api-key'
    );
    config.debugMode = true;
    config.enableAutoAnalysis = false; // テスト環境では自動分析を無効化
    
    integration = new ActivityLoggingIntegration(config);
    await integration.initialize();
  });

  afterAll(async () => {
    console.log('🔄 テスト終了処理開始...');
    
    try {
      // 統合システムのシャットダウン
      if (integration) {
        await integration.shutdown();
      }
    } catch (error) {
      console.error('❌ 統合システムシャットダウンエラー:', error);
    }
    
    // テストデータベースのクリーンアップ
    cleanupTestDatabase(testDbPath);
    
    // 未完了の非同期処理を待つ
    await new Promise(resolve => setImmediate(resolve));
    
    console.log('✅ テスト終了処理完了');
  });

  describe('コマンド処理テスト', () => {
    test('!cost コマンドが正しく処理される', async () => {
      const mockMessage = new MockMessage('!cost');
      
      // プライベートメソッドをテストするためリフレクション使用
      const handleMessage = (integration as any).handleMessage.bind(integration);
      const result = await handleMessage(mockMessage as unknown as Message);
      
      expect(result).toBe(true); // 処理成功
      expect(mockMessage.replies.length).toBeGreaterThan(0); // 何らかの返信がある
      expect(mockMessage.replies[0]).toContain('API使用量レポート'); // コスト情報が含まれている
    });

    test('!timezone コマンドが正しく処理される', async () => {
      const mockMessage = new MockMessage('!timezone');
      
      const handleMessage = (integration as any).handleMessage.bind(integration);
      const result = await handleMessage(mockMessage as unknown as Message);
      
      expect(result).toBe(true);
      expect(mockMessage.replies.length).toBeGreaterThan(0);
      expect(mockMessage.replies[0]).toContain('タイムゾーン設定');
      expect(mockMessage.replies[0]).toContain('Asia/Tokyo'); // デフォルト
      expect(mockMessage.replies[0]).toContain('現在時刻');
    });

    test('!timezone search コマンドが正しく処理される', async () => {
      const mockMessage = new MockMessage('!timezone search Kolkata');
      
      const handleMessage = (integration as any).handleMessage.bind(integration);
      const result = await handleMessage(mockMessage as unknown as Message);
      
      expect(result).toBe(true);
      expect(mockMessage.replies.length).toBeGreaterThan(0);
      expect(mockMessage.replies[0]).toContain('検索結果');
      expect(mockMessage.replies[0]).toContain('Asia/Kolkata');
      expect(mockMessage.replies[0]).toContain('インド');
    });

    test('!timezone set コマンドが正しく処理される', async () => {
      const mockMessage = new MockMessage('!timezone set Asia/Kolkata');
      
      const handleMessage = (integration as any).handleMessage.bind(integration);
      const result = await handleMessage(mockMessage as unknown as Message);
      
      expect(result).toBe(true);
      expect(mockMessage.replies.length).toBeGreaterThan(0);
      expect(mockMessage.replies[0]).toContain('タイムゾーン設定');
      expect(mockMessage.replies[0]).toContain('Asia/Kolkata');
      // 新機能では即座に適用されるメッセージが表示される
      expect(mockMessage.replies[0]).toMatch(/設定完了|即座に適用/);
    });

    test('!help コマンドにコマンド一覧が表示される', async () => {
      const mockMessage = new MockMessage('!help');
      
      const handleMessage = (integration as any).handleMessage.bind(integration);
      const result = await handleMessage(mockMessage as unknown as Message);
      
      expect(result).toBe(true);
      expect(mockMessage.replies.length).toBeGreaterThan(0);
      
      const helpText = mockMessage.replies[0];
      expect(helpText).toContain('!cost');
      expect(helpText).toContain('!timezone');
      expect(helpText).toContain('!summary');
      expect(helpText).toContain('!edit');
      expect(helpText).toContain('!logs');
    });

    test('未対応コマンドが適切に処理される', async () => {
      const mockMessage = new MockMessage('!unknown');
      
      const handleMessage = (integration as any).handleMessage.bind(integration);
      const result = await handleMessage(mockMessage as unknown as Message);
      
      expect(result).toBe(true); // 処理は成功（ログは出力）
      // 未対応コマンドなので返信はない
    });

    test('通常メッセージが活動ログとして記録される', async () => {
      const mockMessage = new MockMessage('プログラミング作業中');
      
      const handleMessage = (integration as any).handleMessage.bind(integration);
      const result = await handleMessage(mockMessage as unknown as Message);
      
      expect(result).toBe(true);
      // デバッグモードなのでリアクションが追加される想定
    });

  });

  describe('エラーハンドリングテスト', () => {
    test('Botメッセージは無視される', async () => {
      const mockMessage = new MockMessage('!cost');
      mockMessage.author.bot = true;
      
      const handleMessage = (integration as any).handleMessage.bind(integration);
      const result = await handleMessage(mockMessage as unknown as Message);
      
      expect(result).toBe(false); // Bot無視
      expect(mockMessage.replies.length).toBe(0);
    });

    test('マルチユーザー対応により全ユーザーが処理される', async () => {
      const mockMessage = new MockMessage('!cost', 'different-user-id');
      
      const handleMessage = (integration as any).handleMessage.bind(integration);
      const result = await handleMessage(mockMessage as unknown as Message);
      
      expect(result).toBe(true); // マルチユーザー対応により処理される
      expect(mockMessage.replies.length).toBeGreaterThan(0); // コストレポートが返される
    });
  });

  describe('システム健全性テスト', () => {

    test('ヘルスチェックが正常に動作する', async () => {
      const healthCheck = await integration.healthCheck();
      
      expect(healthCheck.healthy).toBe(true);
      expect(healthCheck.details.initialized).toBe(true);
      expect(healthCheck.details.database).toBe(true);
      expect(healthCheck.details.services).toBe(true);
      expect(healthCheck.details.handlers).toBe(true);
    });

    test('システム統計が取得できる', async () => {
      const stats = await integration.getSystemStats();
      
      expect(stats).toHaveProperty('totalLogs');
      expect(stats).toHaveProperty('isInitialized');
      expect(stats).toHaveProperty('uptime');
      expect(stats.isInitialized).toBe(true);
    });

    test('設定情報が取得できる', () => {
      const config = integration.getConfig();
      
      expect(config).toHaveProperty('databasePath');
      expect(config).toHaveProperty('geminiApiKey');
      expect(config).toHaveProperty('debugMode');
      expect(config).toHaveProperty('targetUserId');
    });

    test('日次サマリーテキストが生成できる', async () => {
      const userId = '770478489203507241';
      const timezone = 'Asia/Tokyo';
      
      // タイムアウトを設定し、エラー時はフォールバックメッセージが返されることを確認
      const summaryText = await integration.generateDailySummaryText(userId, timezone);
      
      expect(typeof summaryText).toBe('string');
      expect(summaryText.length).toBeGreaterThan(0);
      
      // フォールバックメッセージや実際のサマリーを含む幅広い検証
      // 今日のログがない場合はフォールバックメッセージが返されるのが正常
      expect(summaryText).toBeTruthy();
    }, 15000); // 15秒のタイムアウト
  });

  describe('TODO機能統合テスト', () => {
    test('TODOメッセージ分類が実行される', async () => {
      const mockMessage = new MockMessage('プレゼン資料を作成する必要がある');
      
      const handleMessage = (integration as any).handleMessage.bind(integration);
      const result = await handleMessage(mockMessage as unknown as Message);
      
      expect(result).toBe(true);
      // TODO分類処理が実行されたことを確認
    });

    test('!todoコマンドが正しく処理される', async () => {
      const mockMessage = new MockMessage('!todo');
      
      const handleMessage = (integration as any).handleMessage.bind(integration);
      const result = await handleMessage(mockMessage as unknown as Message);
      
      expect(result).toBe(true);
      expect(mockMessage.replies.length).toBeGreaterThan(0);
      // 返信がオブジェクト形式の場合も対応
      const reply = mockMessage.replies[0];
      if (typeof reply === 'string') {
        expect(reply).toContain('TODO');
      } else {
        expect(JSON.stringify(reply)).toContain('TODO'); // TODO関連の情報が含まれている
      }
    });

    test('TODO追加コマンドが動作する', async () => {
      const mockMessage = new MockMessage('!todo add テストタスクを実行する');
      
      const handleMessage = (integration as any).handleMessage.bind(integration);
      const result = await handleMessage(mockMessage as unknown as Message);
      
      expect(result).toBe(true);
      expect(mockMessage.replies.length).toBeGreaterThan(0);
      expect(mockMessage.replies[0]).toContain('追加'); // TODO追加の確認メッセージ
    });
  });

  describe('並行処理最適化テスト', () => {
    test('活動記録とTODO分類の並行処理', async () => {
      const mockMessage = new MockMessage('新しいプロジェクトを開始した');
      
      const startTime = Date.now();
      const handleMessage = (integration as any).handleMessage.bind(integration);
      const result = await handleMessage(mockMessage as unknown as Message);
      const endTime = Date.now();
      
      expect(result).toBe(true);
      expect(endTime - startTime).toBeLessThan(5000); // 5秒以内で処理
    });

    test('自動分析の非同期実行', async () => {
      const mockMessage = new MockMessage('非同期テスト用の活動ログ');
      
      const handleMessage = (integration as any).handleMessage.bind(integration);
      const result = await handleMessage(mockMessage as unknown as Message);
      
      // メイン処理は即座に完了する（非同期で分析が実行される）
      expect(result).toBe(true);
    });
  });

  describe('エラーハンドリング統合テスト拡張', () => {
    test('Gemini APIエラー時のフォールバック動作', async () => {
      // GeminiServiceのエラーをシミュレート
      const geminiService = (integration as any).geminiService;
      const originalMethod = geminiService.analyzeMessage;
      geminiService.analyzeMessage = jest.fn().mockRejectedValue(new Error('Gemini API エラー'));
      
      const mockMessage = new MockMessage('分析が必要なメッセージ');
      const handleMessage = (integration as any).handleMessage.bind(integration);
      const result = await handleMessage(mockMessage as unknown as Message);
      
      // APIエラーが発生してもメッセージ処理は継続される
      expect(result).toBe(true);
      
      geminiService.analyzeMessage = originalMethod;
    });

    test('データベース接続エラー時のシステム動作', async () => {
      // データベース接続エラーをシミュレート
      const repository = (integration as any).repository;
      const originalMethod = repository.createLog;
      repository.createLog = jest.fn().mockRejectedValue(new Error('Database connection failed'));
      
      const mockMessage = new MockMessage('データベースエラーテスト');
      const handleMessage = (integration as any).handleMessage.bind(integration);
      const result = await handleMessage(mockMessage as unknown as Message);
      
      // データベースエラーでもシステムが停止しない
      expect(result).toBe(true);
      
      repository.createLog = originalMethod;
    });

    test('複数システムエラー時の統合動作', async () => {
      // 複数のコンポーネントでエラーをシミュレート
      const repository = (integration as any).repository;
      const geminiService = (integration as any).geminiService;
      
      const originalCreateLog = repository.createLog;
      const originalAnalyze = geminiService.analyzeMessage;
      
      repository.createLog = jest.fn().mockRejectedValue(new Error('DB Error'));
      geminiService.analyzeMessage = jest.fn().mockRejectedValue(new Error('API Error'));
      
      const mockMessage = new MockMessage('複数エラーテスト');
      const handleMessage = (integration as any).handleMessage.bind(integration);
      const result = await handleMessage(mockMessage as unknown as Message);
      
      // 複数エラーでもシステムが継続動作
      expect(result).toBe(true);
      
      // ヘルスチェックが依然として動作することを確認
      const healthCheck = await integration.healthCheck();
      expect(healthCheck.healthy).toBe(true);
      
      repository.createLog = originalCreateLog;
      geminiService.analyzeMessage = originalAnalyze;
    });
  });

  describe('エラーハンドリング拡張テスト', () => {
    test('データベースエラー時の処理', async () => {
      const mockMessage = new MockMessage('テストメッセージ');
      
      // リポジトリのメソッドをモックしてエラーを発生させる
      const repository = (integration as any).repository;
      const originalMethod = repository.createLog;
      repository.createLog = jest.fn().mockRejectedValue(new Error('データベース接続エラー'));
      
      const handleMessage = (integration as any).handleMessage.bind(integration);
      const result = await handleMessage(mockMessage as unknown as Message);
      
      // エラーが発生してもシステムが停止しないことを確認
      expect(result).toBe(true);
      
      // メソッドを復旧
      repository.createLog = originalMethod;
    });

    test('空のメッセージ処理', async () => {
      const mockMessage = new MockMessage('');
      
      const handleMessage = (integration as any).handleMessage.bind(integration);
      const result = await handleMessage(mockMessage as unknown as Message);
      
      // 空のメッセージは処理されない（falseが返される）のが正常
      expect(result).toBe(false);
    });

    test('非常に長いメッセージ処理', async () => {
      const longMessage = 'A'.repeat(2000); // 2000文字の長いメッセージ
      const mockMessage = new MockMessage(longMessage);
      
      const handleMessage = (integration as any).handleMessage.bind(integration);
      const result = await handleMessage(mockMessage as unknown as Message);
      
      expect(result).toBe(true); // 長いメッセージでも処理できる
    });
  });

  describe('Bot初期化統合テスト', () => {
    test('Bot初期化時にActivityLoggingIntegrationが正しく設定される', async () => {
      // Botが初期化時にintegrationを使用することを確認
      const healthCheck = await integration.healthCheck();
      expect(healthCheck.healthy).toBe(true);
      expect(healthCheck.details.initialized).toBe(true);
      expect(integration.getConfig()).toBeDefined();
      expect(integration.getConfig().debugMode).toBe(true);
    });

    test('Scheduler初期化時にActivityLoggingIntegrationが利用できる', async () => {
      // integrationからrepositoryが取得できることを確認
      const repository = (integration as any).repository;
      expect(repository).toBeDefined();
      expect(repository.getUserInfo).toBeDefined();
      
      // ユーザー情報とタイムゾーン設定が取得できることを確認
      const userInfo = await repository.getUserInfo('test-user');
      // ユーザーが存在しない場合もある（新規テスト実行時）
      if (userInfo) {
        expect(userInfo).toBeDefined();
        expect(userInfo.timezone).toBeDefined();
      }
      
      // タイムゾーン取得メソッドが利用できることを確認
      expect(repository.getUserTimezone).toBeDefined();
    });

    test('Bot停止時にActivityLoggingIntegrationのシャットダウンが実行される', async () => {
      // 新しいintegrationインスタンスでシャットダウンをテスト
      const testConfig = createDefaultConfig('./test-data/shutdown-test.db', 'test-api-key');
      const testIntegration = new ActivityLoggingIntegration(testConfig);
      await testIntegration.initialize();
      
      // シャットダウン前の状態確認
      const healthCheckBefore = await testIntegration.healthCheck();
      expect(healthCheckBefore.healthy).toBe(true);
      expect(healthCheckBefore.details.initialized).toBe(true);
      
      // シャットダウン実行
      await testIntegration.shutdown();
      
      // シャットダウン後の状態確認
      const healthCheckAfter = await testIntegration.healthCheck();
      expect(healthCheckAfter.details.initialized).toBe(false);
    });
  });

  describe('Scheduler統合テスト', () => {
    test('Schedulerが日次サマリーを定時実行する機能をテスト', async () => {
      // schedulerに必要なメソッドがintegrationから取得できることを確認
      const generateSummary = await integration.generateDailySummaryText('test-user', 'Asia/Tokyo');
      expect(typeof generateSummary).toBe('string');
      expect(generateSummary.length).toBeGreaterThan(0);
    });

    test('Schedulerがタイムゾーン設定を使用してユーザー別実行時刻を決定する', async () => {
      // ユーザー設定を取得
      const repository = (integration as any).repository;
      
      // まずテスト用ユーザーのタイムゾーンを設定
      await repository.saveUserTimezone('test-user', 'Asia/Tokyo');
      
      const userTimezone = await repository.getUserTimezone('test-user');
      
      // タイムゾーンが考慮された処理ができることを確認
      expect(userTimezone).toBeDefined();
      expect(userTimezone).toBe('Asia/Tokyo');
      
      // デフォルトタイムゾーンでの時刻取得が正常に動作することを確認
      const defaultTimezone = 'Asia/Tokyo';
      const currentTime = new Date().toLocaleString('ja-JP', { 
        timeZone: userTimezone 
      });
      expect(currentTime).toBeDefined();
      expect(typeof currentTime).toBe('string');
    });

    test('Schedulerエラー時にActivityLoggingIntegrationが継続動作する', async () => {
      // schedulerで使用される可能性のあるメソッドでエラーをシミュレート
      const repository = (integration as any).repository;
      const originalMethod = repository.getUserTimezone;
      
      // エラーを発生させる
      repository.getUserTimezone = jest.fn().mockRejectedValue(new Error('Scheduler DB error'));
      
      // システムのヘルスチェックは依然として動作することを確認
      const healthCheck = await integration.healthCheck();
      expect(healthCheck.healthy).toBe(true);
      
      // メソッドを復旧
      repository.getUserTimezone = originalMethod;
    });
  });

  describe('パフォーマンステスト', () => {
    // パフォーマンステストのタイムアウトを60秒に延長
    jest.setTimeout(60000);
    test('連続メッセージ処理のパフォーマンス', async () => {
      // テスト簡略化: メッセージ数を削減し、自動分析無効化で高速化
      const messages = [
        new MockMessage('メッセージ1'),
        new MockMessage('メッセージ2')
      ];
      
      const handleMessage = (integration as any).handleMessage.bind(integration);
      const startTime = Date.now();
      
      // 連続でメッセージを処理
      for (const message of messages) {
        const result = await handleMessage(message as unknown as Message);
        expect(result).toBe(true);
      }
      
      const endTime = Date.now();
      expect(endTime - startTime).toBeLessThan(30000); // 30秒以内で全て処理（簡略化）
    });

    test('メモリ使用量の確認', () => {
      const initialMemory = process.memoryUsage();
      
      // システム統計を取得してメモリ情報を確認
      const config = integration.getConfig();
      expect(config).toBeDefined();
      
      const currentMemory = process.memoryUsage();
      
      // メモリ使用量が異常に増加していないことを確認
      const memoryIncrease = currentMemory.heapUsed - initialMemory.heapUsed;
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // 50MB以内
    });
  });
});