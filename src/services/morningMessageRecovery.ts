/**
 * 朝のメッセージリカバリサービス
 * TDD: Green Phase - テストを通すための最小限の実装
 */

import { Client, Collection, DMChannel, Message, User } from 'discord.js';
import { INightSuspendRepository, DiscordActivityLogData } from '../repositories/interfaces';

/**
 * 朝のメッセージリカバリ設定
 */
interface MorningRecoveryConfig {
  targetUserId: string; // 空文字の場合は全ユーザー対応
  timezone: string;
}

/**
 * 朝のメッセージリカバリサービス
 * 
 * 夜間サスペンド中（0:00-7:00）に受信したDiscordメッセージを
 * 朝の起動時に遡って処理する機能
 */
export class MorningMessageRecovery {
  constructor(
    private client: Client,
    private repository: INightSuspendRepository,
    private config: MorningRecoveryConfig
  ) {}

  /**
   * 夜間メッセージリカバリのメイン処理
   * 
   * @returns 処理されたアクティビティログの配列
   */
  public async recoverNightMessages(): Promise<any[]> {
    const now = new Date();
    const sevenAM = new Date(now);
    sevenAM.setHours(7, 0, 0, 0);
    
    const midnight = new Date(sevenAM);
    midnight.setHours(0, 0, 0, 0);
    
    console.log(`🔍 夜間メッセージを検索: ${midnight.toISOString()} ~ ${sevenAM.toISOString()}`);
    
    // マルチユーザー対応: 全ユーザーまたは特定ユーザーの夜間メッセージを取得
    const processedLogs: any[] = [];
    
    if (this.config.targetUserId) {
      // 特定ユーザーの場合（レガシー対応）
      const user = await this.client.users.fetch(this.config.targetUserId);
      const dmChannel = await user.createDM();
      const messages = await dmChannel.messages.fetch({ limit: 100 });
      
      console.log(`📬 夜間メッセージ ${messages.size}件を検出 (ユーザー: ${this.config.targetUserId})`);
      
      await this.processMessagesForUser(messages, midnight, sevenAM, processedLogs);
    } else {
      // 全ユーザー対応（新システム）
      console.log(`📬 全ユーザーの夜間メッセージリカバリはスキップ（実装予定）`);
      // TODO: 実際の実装では、データベースから全ユーザーを取得して処理
    }
    
    return processedLogs;
  }

  /**
   * 特定ユーザーのメッセージを処理
   */
  private async processMessagesForUser(
    messages: Collection<string, Message>,
    midnight: Date,
    sevenAM: Date,
    processedLogs: any[]
  ): Promise<void> {
    for (const [id, message] of messages) {
      // 時間範囲チェック
      if (message.createdAt >= midnight && message.createdAt < sevenAM) {
        if (await this.isUnprocessedMessage(message)) {
          try {
            const log = await this.processMessage(message);
            processedLogs.push(log);
            
            // API制限対策
            await this.delay(1000);
            
          } catch (error) {
            console.error(`❌ メッセージ処理失敗 ${message.id}:`, error);
          }
        }
      }
    }
  }

  /**
   * 指定された時間範囲のメッセージを取得
   */
  private async fetchMessagesBetween(
    channel: DMChannel,
    startTime: Date,
    endTime: Date
  ): Promise<Collection<string, Message>> {
    const allMessages = new Map<string, Message>();
    let lastId: string | undefined;
    
    while (true) {
      const options: { limit: number; before?: string } = {
        limit: 100
      };
      
      if (lastId) {
        options.before = lastId;
      }
      
      const batch = await channel.messages.fetch(options);
      if (batch.size === 0) break;
      
      let shouldContinue = true;
      
      batch.forEach((message) => {
        const messageTime = message.createdAt;
        
        if (messageTime >= startTime && messageTime < endTime) {
          allMessages.set(message.id, message);
        }
        
        if (messageTime < startTime) {
          shouldContinue = false;
        }
      });
      
      if (!shouldContinue) break;
      
      lastId = batch.last()?.id;
    }
    
    return new Collection(allMessages);
  }

  /**
   * メッセージが未処理かどうかを判定
   */
  private async isUnprocessedMessage(message: Message): Promise<boolean> {
    // Botメッセージは除外
    if (message.author.bot) return false;
    
    // 対象ユーザー以外は除外
    if (message.author.id !== this.config.targetUserId) return false;
    
    // DBに存在チェック
    const exists = await this.repository.existsByDiscordMessageId(message.id);
    return !exists;
  }

  /**
   * メッセージを処理してアクティビティログを作成
   */
  private async processMessage(message: Message): Promise<any> {
    const logData: DiscordActivityLogData = {
      user_id: message.author.id,
      content: message.content,
      input_timestamp: message.createdAt.toISOString(),
      business_date: this.getBusinessDate(message.createdAt),
      discord_message_id: message.id,
      recovery_processed: true,
      recovery_timestamp: new Date().toISOString()
    };
    
    const log = await this.repository.createActivityLogFromDiscord(logData);
    
    // AI分析は後で実行（重い処理）
    setImmediate(async () => {
      try {
        await this.processWithAI(log);
      } catch (error) {
        console.error('❌ AI処理エラー:', error);
      }
    });
    
    return log;
  }

  /**
   * 処理完了レポートをユーザーに送信
   */
  private async sendRecoveryReport(logs: any[]): Promise<void> {
    const user = await this.client.users.fetch(this.config.targetUserId);
    
    const reportMessage = `🌅 **朝のメッセージリカバリ完了**\n\n` +
      `📊 **処理結果**\n` +
      `• 処理済みメッセージ: ${logs.length}件\n` +
      `• 処理時刻: ${new Date().toLocaleString('ja-JP')}\n\n` +
      `${logs.length > 0 ? '✅ 夜間のメッセージを正常に処理しました。' : '📝 夜間の新規メッセージはありませんでした。'}`;
    
    await user.send(reportMessage);
  }

  /**
   * 待機処理
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 業務日を計算（5am基準）
   */
  private getBusinessDate(date: Date): string {
    const businessDate = new Date(date);
    // UTCベースの時刻で5am基準を判定
    if (businessDate.getUTCHours() < 5) {
      businessDate.setUTCDate(businessDate.getUTCDate() - 1);
    }
    return businessDate.toISOString().split('T')[0];
  }

  /**
   * AI分析処理（プレースホルダー）
   */
  private async processWithAI(log: any): Promise<void> {
    // TODO: 実際のAI分析処理を実装
    console.log('AI分析処理をスキップ:', log.id);
  }
}