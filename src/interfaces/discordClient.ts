/**
 * Discord API操作のためのクライアントインターフェース
 * ビジネスロジックとDiscord API実装を分離するためのレイヤー
 * 
 * 目的：
 * - ReminderReplyServiceがDiscord APIに直接依存することを避ける
 * - テスタビリティの向上（モック可能）
 * - レイヤー分離の実現（ドメイン層がインフラ層の詳細を知らない）
 */

import { Message, TextChannel, DMChannel, NewsChannel, ThreadChannel } from 'discord.js';

type MessageChannel = TextChannel | DMChannel | NewsChannel | ThreadChannel;

/**
 * Discord メッセージ操作クライアントインターフェース
 */
export interface IDiscordMessageClient {
  /**
   * メッセージIDから参照されたメッセージを取得
   * @param message 基準となるメッセージ（チャンネル情報取得に使用）
   * @param messageId 取得対象のメッセージID
   * @returns 取得されたメッセージ（null if not found）
   */
  fetchReferencedMessage(message: Message, messageId: string): Promise<Message | null>;

  /**
   * チャンネルから最近のメッセージを取得
   * @param message 基準となるメッセージ（チャンネル情報取得に使用）
   * @param limit 取得件数制限
   * @returns メッセージの配列
   */
  fetchRecentMessages(message: Message, limit?: number): Promise<Message[]>;
}

/**
 * Discord APIクライアントの実装
 * 既存のDiscord.jsメッセージオブジェクトを活用してAPI呼び出しを実行
 */
export class DiscordMessageClient implements IDiscordMessageClient {
  /**
   * メッセージIDから参照されたメッセージを取得
   */
  async fetchReferencedMessage(message: Message, messageId: string): Promise<Message | null> {
    try {
      // message.channelを使用して同じチャンネル内のメッセージを取得
      const channel = message.channel as MessageChannel;
      if (!('messages' in channel)) {
        return null;
      }

      const referencedMessage = await channel.messages.fetch(messageId);
      return referencedMessage;
    } catch (error) {
      // メッセージが見つからない、削除済み、アクセス権限がない等
      return null;
    }
  }

  /**
   * チャンネルから最近のメッセージを取得
   */
  async fetchRecentMessages(message: Message, limit: number = 50): Promise<Message[]> {
    try {
      const channel = message.channel as MessageChannel;
      if (!('messages' in channel)) {
        return [];
      }

      // 基準メッセージより前の最近のメッセージを取得
      const messages = await channel.messages.fetch({ 
        limit,
        before: message.id
      });
      
      return Array.from(messages.values());
    } catch (error) {
      return [];
    }
  }
}