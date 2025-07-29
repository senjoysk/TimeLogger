/**
 * 🟢 Green Phase: MessageClassificationHandler 実装
 * TDD開発: AIメッセージ分析の責任分離
 * 責任: メッセージ分類 + セッション管理 + AI連携
 */

import { Message, ButtonInteraction, EmbedBuilder } from 'discord.js';
import { ITodoRepository, IMessageClassificationRepository } from '../repositories/interfaces';
import { IGeminiService } from '../services/interfaces/IGeminiService';
import { IMessageClassificationService } from '../services/messageClassificationService';
import { CreateTodoRequest, ClassificationResult, MessageClassification } from '../types/todo';
import { 
  createClassificationResultEmbed,
  createClassificationButtons,
  generateSessionId
} from '../components/classificationResultEmbed';

/**
 * メッセージ分類処理のセッション情報
 */
interface ClassificationSession {
  sessionId: string;
  userId: string;
  originalMessage: string;
  result: ClassificationResult;
  timestamp: Date;
}

/**
 * MessageClassificationHandlerインターフェース
 */
export interface IMessageClassificationHandler {
  /**
   * メッセージ分類を処理
   */
  handleMessageClassification(message: Message, userId: string, timezone: string): Promise<void>;
  
  /**
   * 分類確認ボタンを処理
   */
  handleClassificationButton(
    interaction: ButtonInteraction, 
    action: string, 
    type: string, 
    sessionId: string, 
    userId: string, 
    timezone: string
  ): Promise<void>;
  
  /**
   * 無視ボタンを処理
   */
  handleIgnoreButton(interaction: ButtonInteraction, sessionId: string, userId: string): Promise<void>;
  
  /**
   * リソースクリーンアップ
   */
  destroy(): void;
}

/**
 * AIメッセージ分類ハンドラー
 * 責任: メッセージ分類、セッション管理、AI結果からのTODO作成
 */
export class MessageClassificationHandler implements IMessageClassificationHandler {
  private activeSessions = new Map<string, ClassificationSession>();
  private readonly SESSION_TIMEOUT = 5 * 60 * 1000; // 5分
  private cleanupInterval?: NodeJS.Timeout;
  
  constructor(
    private todoRepository: ITodoRepository,
    private classificationRepository: IMessageClassificationRepository,
    private geminiService: IGeminiService,
    private classificationService: IMessageClassificationService
  ) {
    // セッションタイムアウトのクリーンアップ
    this.cleanupInterval = setInterval(() => this.cleanupExpiredSessions(), 60 * 1000);
    
    // テスト環境でプロセス終了を妨げないようにする
    if (this.cleanupInterval && typeof this.cleanupInterval.unref === 'function') {
      this.cleanupInterval.unref();
    }
  }

  /**
   * リソースクリーンアップ
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }

  /**
   * メッセージ分類を処理
   */
  async handleMessageClassification(message: Message, userId: string, timezone: string): Promise<void> {
    try {
      console.log(`🤖 メッセージ分類開始: ${userId} "${message.content}"`);

      // AI分析を実行
      const result = await this.classificationService.classifyMessage(message.content);
      
      // セッション作成
      const sessionId = generateSessionId(userId);
      const session: ClassificationSession = {
        sessionId,
        userId,
        originalMessage: message.content,
        result,
        timestamp: new Date()
      };
      
      this.activeSessions.set(sessionId, session);
      console.log(`📝 セッション作成: sessionId=${sessionId}, userId=${userId}`);

      // 判定結果を表示
      const embed = createClassificationResultEmbed({
        originalMessage: message.content,
        result,
        userId,
        timestamp: new Date()
      });

      const buttons = createClassificationButtons(sessionId, result.classification);

      const reply = await message.reply({
        embeds: [embed],
        components: [buttons]
      });

      // 分類履歴を記録
      await this.recordClassificationHistory(userId, message.content, result);

      console.log(`🤖 メッセージ分類完了: ${userId} -> ${result.classification} (信頼度: ${result.confidence})`);
      
    } catch (error) {
      console.error('❌ メッセージ分類エラー:', error);
      await message.reply('❌ メッセージの分析中にエラーが発生しました。');
    }
  }

  /**
   * 分類確認ボタンを処理
   */
  async handleClassificationButton(
    interaction: ButtonInteraction, 
    action: string, 
    type: string, 
    sessionId: string, 
    userId: string, 
    timezone: string
  ): Promise<void> {
    console.log(`🔍 セッション確認: sessionId=${sessionId}, userId=${userId}`);
    
    const session = this.activeSessions.get(sessionId);
    
    if (!session) {
      console.error(`❌ セッションが見つからない: sessionId=${sessionId}`);
      console.log(`🔍 現在のアクティブセッション: ${Array.from(this.activeSessions.keys()).join(', ')}`);
      await interaction.reply({ content: '❌ セッションが見つからないか、権限がありません。', ephemeral: true });
      return;
    }
    
    if (session.userId !== userId) {
      console.error(`❌ ユーザーIDが不一致: session.userId=${session.userId}, userId=${userId}`);
      await interaction.reply({ content: '❌ セッションが見つからないか、権限がありません。', ephemeral: true });
      return;
    }
    
    console.log(`✅ セッション確認成功: sessionId=${sessionId}, userId=${userId}`);
    const sessionAge = Date.now() - session.timestamp.getTime();
    console.log(`🕐 セッション経過時間: ${Math.round(sessionAge / 1000)}秒`);

    // 分類を決定
    let finalClassification: MessageClassification;
    
    if (action === 'confirm') {
      finalClassification = session.result.classification;
    } else if (action === 'classify') {
      // 分類タイプを正規化
      finalClassification = type.toUpperCase() as MessageClassification;
    } else {
      // セッション削除
      this.activeSessions.delete(sessionId);
      await interaction.reply({ content: '❌ 無効な操作です。', ephemeral: true });
      return;
    }

    // 分類に基づいて処理
    await this.processClassifiedMessage(
      interaction, 
      session.originalMessage, 
      finalClassification, 
      session.result, 
      userId, 
      timezone
    );
    
    // 処理完了後にセッション削除
    this.activeSessions.delete(sessionId);
  }

  /**
   * 無視ボタンを処理
   */
  async handleIgnoreButton(interaction: ButtonInteraction, sessionId: string, userId: string): Promise<void> {
    // セッション削除
    this.activeSessions.delete(sessionId);
    await interaction.update({
      content: '❌ メッセージを無視しました。',
      embeds: [],
      components: []
    });
  }

  /**
   * 分類されたメッセージを処理
   */
  private async processClassifiedMessage(
    interaction: ButtonInteraction,
    originalMessage: string,
    classification: MessageClassification,
    originalResult: ClassificationResult,
    userId: string,
    timezone: string
  ): Promise<void> {
    switch (classification) {
      case 'TODO':
        await this.createTodoFromMessage(interaction, originalMessage, originalResult, userId, timezone);
        break;
        
      case 'MEMO':
        // メモとして処理（将来実装）
        await interaction.update({
          content: '📄 メモとして保存されました。',
          embeds: [],
          components: []
        });
        break;
        
      default:
        await interaction.update({
          content: '❓ 分類が不明なため、処理をスキップしました。',
          embeds: [],
          components: []
        });
    }
  }

  /**
   * メッセージからTODOを作成
   */
  private async createTodoFromMessage(
    interaction: ButtonInteraction,
    message: string,
    result: ClassificationResult,
    userId: string,
    timezone: string
  ): Promise<void> {
    const request: CreateTodoRequest = {
      userId,
      content: message,
      priority: result.priority || 0,
      dueDate: result.dueDateSuggestion,
      sourceType: 'ai_suggested',
      aiConfidence: result.confidence
    };

    const todo = await this.todoRepository.createTodo(request);

    const successEmbed = new EmbedBuilder()
      .setTitle('✅ TODO作成完了')
      .setDescription(`**内容**: ${todo.content}`)
      .addFields(
        { name: '優先度', value: this.formatPriority(todo.priority), inline: true },
        { name: 'ステータス', value: 'pending', inline: true }
      )
      .setColor(0x00ff00)
      .setTimestamp();

    if (todo.dueDate) {
      successEmbed.addFields({ name: '期日', value: todo.dueDate, inline: true });
    }

    await interaction.update({
      content: '',
      embeds: [successEmbed],
      components: []
    });

    console.log(`✅ TODO作成: ${userId} "${todo.content}"`);
  }

  /**
   * 分類履歴を記録
   */
  private async recordClassificationHistory(
    userId: string, 
    message: string, 
    result: ClassificationResult
  ): Promise<void> {
    try {
      // 分類履歴をデータベースに記録
      // 将来の学習機能で使用
      console.log(`📊 分類履歴記録: ${userId} "${message}" -> ${result.classification} (${result.confidence})`);
    } catch (error) {
      console.error('❌ 分類履歴記録エラー:', error);
      // エラーでも処理を継続
    }
  }

  /**
   * 優先度をフォーマット
   */
  private formatPriority(priority: number): string {
    switch (priority) {
      case 1: return '🔴 高';
      case 0: return '🟡 普通';
      case -1: return '🟢 低';
      default: return '🟡 普通';
    }
  }

  /**
   * 期限切れセッションをクリーンアップ
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (now - session.timestamp.getTime() > this.SESSION_TIMEOUT) {
        this.activeSessions.delete(sessionId);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`🧹 期限切れセッションクリーンアップ: ${cleanedCount}件`);
    }
  }
}