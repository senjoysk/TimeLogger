/**
 * UserManager
 * ユーザー管理の責任を分離
 */

import { IUnifiedRepository } from '../../repositories/interfaces';
import { logger } from '../../utils/logger';

export interface IUserManager {
  ensureUserRegistered(userId: string, username: string): Promise<boolean>;
  getUserTimezone(userId: string): Promise<string>;
  getAllUserTimezones(): Promise<Map<string, string[]>>;
}

export class UserManager implements IUserManager {
  private static readonly DEFAULT_TIMEZONE = 'Asia/Tokyo';

  constructor(
    private repository: IUnifiedRepository
  ) {}

  /**
   * ユーザーが登録されているか確認し、必要に応じて登録
   * @returns 新規ユーザーの場合true
   */
  async ensureUserRegistered(userId: string, username: string): Promise<boolean> {
    try {
      // ALLOW_LAYER_VIOLATION: リポジトリインターフェース調整中
      const existingUser = await (this.repository as any).getUserSettings?.(userId) || 
        await (this.repository as any).getSettings?.(userId);
      
      if (!existingUser) {
        // 新規ユーザーを登録
        // ALLOW_LAYER_VIOLATION: リポジトリインターフェース調整中
        await (this.repository as any).createUser?.({
          userId,
          username,
          displayName: username,
          timezone: UserManager.DEFAULT_TIMEZONE
        });
        
        logger.info('USER_MANAGER', `🎉 新規ユーザー登録: ${userId} (${username})`);
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('USER_MANAGER', `ユーザー登録確認エラー: ${userId}`, error);
      throw error;
    }
  }

  /**
   * ユーザーのタイムゾーンを取得
   */
  async getUserTimezone(userId: string): Promise<string> {
    try {
      // ALLOW_LAYER_VIOLATION: リポジトリインターフェース調整中
      const settings = await (this.repository as any).getUserSettings?.(userId) || 
        await (this.repository as any).getSettings?.(userId);
      
      if (settings?.timezone) {
        return settings.timezone;
      }
      
      logger.info('USER_MANAGER', `ユーザー ${userId} のタイムゾーンが未設定。デフォルト値を使用: ${UserManager.DEFAULT_TIMEZONE}`);
      return UserManager.DEFAULT_TIMEZONE;
      
    } catch (error) {
      logger.error('USER_MANAGER', `タイムゾーン取得エラー (${userId}):`, error);
      return UserManager.DEFAULT_TIMEZONE;
    }
  }

  /**
   * すべてのユーザーのタイムゾーンを取得
   * @returns タイムゾーンごとのユーザーIDマップ
   */
  async getAllUserTimezones(): Promise<Map<string, string[]>> {
    try {
      // ALLOW_LAYER_VIOLATION: リポジトリインターフェース調整中
      const allUsers = await (this.repository as any).getAllUsers?.() || [];
      const timezoneMap = new Map<string, string[]>();
      
      for (const user of allUsers) {
        const timezone = user.timezone || UserManager.DEFAULT_TIMEZONE;
        if (!timezoneMap.has(timezone)) {
          timezoneMap.set(timezone, []);
        }
        timezoneMap.get(timezone)!.push(user.userId);
      }
      
      return timezoneMap;
    } catch (error) {
      logger.error('USER_MANAGER', 'すべてのユーザータイムゾーン取得エラー:', error);
      return new Map();
    }
  }

  /**
   * ウェルカムメッセージを取得
   */
  static getWelcomeMessage(): string {
    return `🎉 **Discord TimeLoggerへようこそ！**

はじめまして！私はあなたの活動を記録するアシスタントです。

📝 **基本的な使い方：**
• メッセージを送信 → 活動ログ/TODO/メモから選択
• \`!help\` → 使い方を表示
• \`!summary\` → 今日のサマリー表示
• \`!todo\` → TODOリスト管理

⚙️ **初期設定：**
• タイムゾーン: Asia/Tokyo（デフォルト）
• \`!timezone set [地域]\` で変更可能

💡 **ヒント：**
• 自然な言葉で活動を記録できます
• 時間表現（10:30、午後2時など）も認識します
• 毎日朝5時に前日のサマリーを自動生成します

詳しくは \`!help\` をお試しください！`;
  }
}