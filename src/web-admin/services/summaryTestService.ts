/**
 * サマリーテストサービス
 * 
 * 日次サマリー送信のテスト・検証機能を提供するサービス
 */

import { TaskLoggerBot } from '../../bot';
import { ITimeProvider, ILogger } from '../../interfaces/dependencies';
import { 
  SummaryTestRequest, 
  SummaryTestResponse, 
  SummaryTestUserResult 
} from '../types/testing';
import { toZonedTime, format } from 'date-fns-tz';

/**
 * ユーザー情報インターフェース（テスト用）
 */
interface UserInfo {
  userId: string;
  timezone: string;
}

/**
 * サマリーテストサービス
 */
export class SummaryTestService {
  private readonly bot: TaskLoggerBot | null;
  private readonly timeProvider: ITimeProvider;
  private readonly logger: ILogger;

  constructor(bot: TaskLoggerBot | null, timeProvider: ITimeProvider, logger: ILogger) {
    this.bot = bot;
    this.timeProvider = timeProvider;
    this.logger = logger;
  }

  /**
   * サマリーテストを実行する
   */
  async executeTest(request: SummaryTestRequest): Promise<SummaryTestResponse> {
    const executedAt = new Date().toISOString();

    try {

      // Bot初期化チェック
      if (!this.bot) {
        return {
          success: false,
          executedAt,
          testSettings: this.createTestSettings(request),
          results: [],
          summary: { totalUsers: 0, sentCount: 0, skippedCount: 0, errorCount: 0 },
          error: 'Bot が初期化されていません'
        };
      }

      // テスト時刻の設定
      if (request.testDateTime) {
        const testDate = new Date(request.testDateTime);
        if (this.timeProvider && 'setMockDate' in this.timeProvider) {
          (this.timeProvider as any).setMockDate(testDate);
        }
      }

      // 対象ユーザーの取得
      const targetUsers = await this.getTargetUsers(request);
      
      // テスト実行
      const results = await this.executeTestForUsers(targetUsers, request);
      
      // 統計の計算
      const summary = this.calculateSummary(results);

      this.logger.info('サマリーテスト実行完了', {
        dryRun: request.dryRun,
        targetUserCount: targetUsers.length,
        summary
      });

      return {
        success: true,
        executedAt,
        testSettings: this.createTestSettings(request, targetUsers.length),
        results,
        summary
      };

    } catch (error) {
      this.logger.error('サマリーテスト実行エラー', error as Error, { request });
      
      return {
        success: false,
        executedAt,
        testSettings: this.createTestSettings(request),
        results: [],
        summary: { totalUsers: 0, sentCount: 0, skippedCount: 0, errorCount: 0 },
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * 対象ユーザーを取得
   */
  private async getTargetUsers(request: SummaryTestRequest): Promise<UserInfo[]> {
    // モックメソッドを呼び出し（実際の実装では適切なメソッドを使用）
    const allUsers = await this.getAllRegisteredUsers();

    if (request.targetUsers && request.targetUsers.length > 0) {
      // 指定されたユーザーのみをフィルタ
      const targetUsers = allUsers.filter(user => request.targetUsers!.includes(user.userId));
      
      // 存在しないユーザーがあればエラー
      const existingUserIds = allUsers.map(u => u.userId);
      const nonExistentUsers = request.targetUsers.filter(id => !existingUserIds.includes(id));
      
      if (nonExistentUsers.length > 0) {
        throw new Error(`存在しないユーザーが指定されました: ${nonExistentUsers.join(', ')}`);
      }
      
      return targetUsers;
    }

    return allUsers;
  }

  /**
   * 各ユーザーに対してテストを実行
   */
  private async executeTestForUsers(users: UserInfo[], request: SummaryTestRequest): Promise<SummaryTestUserResult[]> {
    const results: SummaryTestUserResult[] = [];

    for (const user of users) {
      try {
        const result = await this.executeTestForUser(user, request);
        results.push(result);
      } catch (error) {
        results.push({
          userId: user.userId,
          timezone: user.timezone,
          localTime: 'Error',
          status: 'error',
          reason: 'テスト実行中にエラーが発生しました',
          errorDetail: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return results;
  }

  /**
   * 個別ユーザーに対してテストを実行
   */
  private async executeTestForUser(user: UserInfo, request: SummaryTestRequest): Promise<SummaryTestUserResult> {
    // 現在の時刻を取得
    const currentTime = this.timeProvider.now();
    
    // ユーザーのタイムゾーンでの現地時刻を計算
    const localTime = toZonedTime(currentTime, user.timezone);
    const localTimeString = format(localTime, 'yyyy-MM-dd HH:mm:ss', { timeZone: user.timezone });
    
    // 18:30送信時刻かどうかを判定
    const isSummaryTime = localTime.getHours() === 18 && localTime.getMinutes() === 30;
    
    if (!isSummaryTime) {
      return {
        userId: user.userId,
        timezone: user.timezone,
        localTime: localTimeString,
        status: 'skipped',
        reason: `18:30ではありません (現在: ${localTime.getHours()}:${localTime.getMinutes().toString().padStart(2, '0')})`
      };
    }

    // 18:30の場合は送信処理
    try {
      // dryRun の値を正しく boolean として評価
      // HTTPリクエストでは文字列として送られてくる可能性があるため、型安全に変換
      const isDryRun = Boolean(request.dryRun === true || (request.dryRun as any) === 'true');

      if (isDryRun) {
        // ドライランモード：実際の送信は行わない
        const summaryPreview = await this.generateSummaryPreview(user.userId);
        
        return {
          userId: user.userId,
          timezone: user.timezone,
          localTime: localTimeString,
          status: 'sent',
          reason: '18:30送信時刻（ドライラン）',
          summaryPreview
        };
      } else {
        // 実際の送信モード
        await this.sendDailySummaryToUser(user.userId, user.timezone);
        
        return {
          userId: user.userId,
          timezone: user.timezone,
          localTime: localTimeString,
          status: 'sent',
          reason: '18:30送信時刻（実際送信）'
        };
      }
    } catch (error) {
      return {
        userId: user.userId,
        timezone: user.timezone,
        localTime: localTimeString,
        status: 'error',
        reason: '送信処理中にエラーが発生しました',
        errorDetail: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * 統計を計算
   */
  private calculateSummary(results: SummaryTestUserResult[]) {
    return {
      totalUsers: results.length,
      sentCount: results.filter(r => r.status === 'sent').length,
      skippedCount: results.filter(r => r.status === 'skipped').length,
      errorCount: results.filter(r => r.status === 'error').length
    };
  }

  /**
   * テスト設定情報を作成
   */
  private createTestSettings(request: SummaryTestRequest, targetUserCount?: number) {
    const testDateTime = request.testDateTime || this.timeProvider.now().toISOString();
    const testTimezone = request.testTimezone || this.getDefaultTimezone();
    
    return {
      dryRun: request.dryRun,
      testDateTime,
      testTimezone,
      targetUserCount: targetUserCount || 0
    };
  }

  /**
   * 登録ユーザー一覧を取得（モックメソッド）
   */
  private async getAllRegisteredUsers(): Promise<UserInfo[]> {
    // テスト用のモックメソッド呼び出し
    if (this.bot && 'getRegisteredUsers' in this.bot) {
      return (this.bot as any).getRegisteredUsers();
    }
    
    // フォールバック：空の配列
    return [];
  }

  /**
   * サマリープレビューを生成（モックメソッド）
   */
  private async generateSummaryPreview(userId: string): Promise<string> {
    // テスト用のモックメソッド呼び出し
    if (this.bot && 'generateSummaryPreview' in this.bot) {
      return (this.bot as any).generateSummaryPreview(userId);
    }
    
    // フォールバック：デフォルトメッセージ
    return `🌅 今日一日お疲れさまでした！\n\n[${userId}] のサマリープレビュー（テストモード）`;
  }

  /**
   * 日次サマリーを送信（モックメソッド）
   */
  private async sendDailySummaryToUser(userId: string, timezone: string): Promise<void> {
    // テスト用のモックメソッド呼び出し
    if (this.bot && 'sendDailySummaryToUserForTest' in this.bot) {
      // テスト用の公開メソッドを使用
      return (this.bot as any).sendDailySummaryToUserForTest(userId, timezone);
    }
    
    // フォールバック：何もしない
    this.logger.info('サマリー送信をシミュレート', { userId, timezone });
  }

  /**
   * デフォルトタイムゾーンを取得
   */
  private getDefaultTimezone(): string {
    return 'Asia/Tokyo'; // Web管理機能ではシンプルなフォールバック
  }
}