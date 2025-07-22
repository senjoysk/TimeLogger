/**
 * タイムゾーンコマンドハンドラー
 * タイムゾーンの検索・設定・表示機能
 */

import { Message } from 'discord.js';
import { IActivityLogRepository } from '../repositories/activityLogRepository';
import { ActivityLogError } from '../types/activityLog';
import { ITimezoneService } from '../services/interfaces/ITimezoneService';
import { ITimeProvider } from '../interfaces/dependencies';
import { TimeProviderService } from '../services/timeProviderService';

/**
 * タイムゾーンコマンドの種類
 */
export type TimezoneCommandType = 'show' | 'search' | 'set' | 'help';

/**
 * タイムゾーンコマンドの解析結果
 */
export interface ParsedTimezoneCommand {
  type: TimezoneCommandType;
  query?: string;           // 検索クエリまたは設定値
  error?: string;           // パースエラーメッセージ
}

/**
 * タイムゾーン検索結果
 */
export interface TimezoneSearchResult {
  timezone: string;         // IANA タイムゾーン名
  description: string;      // 説明（都市名など）
  offset: string;           // UTC からのオフセット
}

/**
 * タイムゾーンハンドラーインターフェース
 */
export interface ITimezoneHandler {
  /**
   * タイムゾーンコマンドを処理
   * @param message Discordメッセージ
   * @param userId ユーザーID
   * @param args コマンド引数
   */
  handle(message: Message, userId: string, args: string[]): Promise<void>;

  /**
   * コマンドの使用方法を表示
   * @param message Discordメッセージ
   */
  showHelp(message: Message): Promise<void>;
}

/**
 * TimezoneHandlerの実装
 */
export class TimezoneHandler implements ITimezoneHandler {
  private onTimezoneChanged?: (userId: string, oldTimezone: string | null, newTimezone: string) => Promise<void>;
  private timeProvider: ITimeProvider;

  constructor(
    private repository: IActivityLogRepository,
    private timezoneService?: ITimezoneService,
    timeProvider?: ITimeProvider
  ) {
    // TimeProviderが注入されない場合は、シングルトンから取得
    this.timeProvider = timeProvider || TimeProviderService.getInstance().getTimeProvider();
  }

  /**
   * タイムゾーン変更時のコールバックを設定（EnhancedScheduler連携用）
   */
  public setTimezoneChangeCallback(callback: (userId: string, oldTimezone: string | null, newTimezone: string) => Promise<void>): void {
    this.onTimezoneChanged = callback;
  }

  /**
   * タイムゾーンコマンドを処理
   */
  async handle(message: Message, userId: string, args: string[]): Promise<void> {
    try {
      console.log(`🌍 タイムゾーンコマンド処理開始: ${userId} ${args.join(' ')}`);

      // コマンドを解析
      const parsedCommand = this.parseTimezoneCommand(args);

      if (parsedCommand.error) {
        await message.reply(`❌ ${parsedCommand.error}\n\n使用方法: \`!timezone help\` でヘルプを確認してください。`);
        return;
      }

      // コマンドタイプ別に処理
      switch (parsedCommand.type) {
        case 'show':
          await this.showCurrentTimezone(message, userId);
          break;
        
        case 'search':
          await this.searchTimezone(message, parsedCommand.query!);
          break;
        
        case 'set':
          await this.setTimezone(message, userId, parsedCommand.query!);
          break;
        
        case 'help':
          await this.showHelp(message);
          break;
        
        default:
          await this.showCurrentTimezone(message, userId);
      }
    } catch (error) {
      console.error('❌ タイムゾーンコマンド処理エラー:', error);
      
      const errorMessage = error instanceof ActivityLogError 
        ? `❌ ${error.message}`
        : '❌ タイムゾーン処理中にエラーが発生しました。';
        
      await message.reply(errorMessage);
    }
  }

  /**
   * 現在のタイムゾーンを表示
   */
  private async showCurrentTimezone(message: Message, userId: string): Promise<void> {
    try {
      // TimezoneServiceを使用してユーザーのタイムゾーンを取得
      let currentTimezone: string;
      
      if (this.timezoneService) {
        currentTimezone = await this.timezoneService.getUserTimezone(userId);
      } else {
        // フォールバック: 従来の方法
        if ('getUserTimezone' in this.repository) {
          const dbTimezone = await (this.repository as any).getUserTimezone(userId);
          currentTimezone = dbTimezone || this.getSystemDefaultTimezone();
        } else {
          currentTimezone = this.getSystemDefaultTimezone();
        }
      }
      
      const now = TimeProviderService.getInstance().now();
      const localTime = now.toLocaleString('ja-JP', { 
        timeZone: currentTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      const response = `🌍 **タイムゾーン設定**\n\n` +
                      `📍 現在のタイムゾーン: \`${currentTimezone}\`\n` +
                      `🕐 現在時刻: ${localTime}\n\n` +
                      `**使用可能なコマンド:**\n` +
                      `• \`!timezone search <都市名>\` - タイムゾーン検索\n` +
                      `• \`!timezone set <タイムゾーン名>\` - タイムゾーン設定\n` +
                      `• \`!timezone help\` - 詳細ヘルプ`;
      
      await message.reply(response);
      
      console.log(`🌍 タイムゾーン情報表示完了: ${userId}`);
    } catch (error) {
      console.error('❌ タイムゾーン表示エラー:', error);
      throw new ActivityLogError('タイムゾーン情報の表示に失敗しました', 'SHOW_TIMEZONE_ERROR', { error });
    }
  }

  /**
   * タイムゾーンを検索
   */
  private async searchTimezone(message: Message, query: string): Promise<void> {
    try {
      console.log(`🔍 タイムゾーン検索: "${query}"`);
      
      const results = this.searchTimezones(query);
      
      if (results.length === 0) {
        await message.reply(`🔍 「${query}」に一致するタイムゾーンが見つかりませんでした。\n\n**検索のヒント:**\n• 都市名で検索してみてください（例: Tokyo, New York, London）\n• 国名でも検索できます（例: Japan, India, America）`);
        return;
      }

      // 上位5件まで表示
      const topResults = results.slice(0, 5);
      const formattedResults = topResults.map(result => 
        `• \`${result.timezone}\` - ${result.description} (UTC${result.offset})`
      ).join('\n');

      const response = `🔍 **「${query}」の検索結果** (${results.length}件中上位${topResults.length}件)\n\n` +
                      `${formattedResults}\n\n` +
                      `**設定方法:** \`!timezone set <タイムゾーン名>\`\n` +
                      `**例:** \`!timezone set ${topResults[0].timezone}\``;
      
      await message.reply(response);
      
      console.log(`🔍 タイムゾーン検索完了: ${query} - ${results.length}件ヒット`);
    } catch (error) {
      console.error('❌ タイムゾーン検索エラー:', error);
      throw new ActivityLogError('タイムゾーンの検索に失敗しました', 'SEARCH_TIMEZONE_ERROR', { error });
    }
  }

  /**
   * タイムゾーンを設定
   */
  private async setTimezone(message: Message, userId: string, timezone: string): Promise<void> {
    try {
      console.log(`⚙️ タイムゾーン設定: ${userId} -> ${timezone}`);
      
      // タイムゾーンの妥当性を検証
      if (!this.isValidTimezone(timezone)) {
        const supportedTimezones = this.timezoneService?.getSupportedTimezones() || ['Asia/Tokyo', 'Asia/Kolkata', 'UTC'];
        const exampleTimezone = supportedTimezones[0];
        await message.reply(`❌ 無効なタイムゾーン: \`${timezone}\`\n\n**有効な形式:**\n• IANA タイムゾーン名（例: ${exampleTimezone}, UTC）\n• \`!timezone search <都市名>\` で利用可能なタイムゾーンを検索してください。`);
        return;
      }

      // 古いタイムゾーンを取得
      let oldTimezone: string | null = null;
      if ('getUserTimezone' in this.repository) {
        oldTimezone = await (this.repository as any).getUserTimezone(userId);
      }

      // データベースにユーザーのタイムゾーンを保存
      if ('saveUserTimezone' in this.repository) {
        await (this.repository as any).saveUserTimezone(userId, timezone);
        
        // EnhancedSchedulerに変更を通知
        if (this.onTimezoneChanged) {
          try {
            await this.onTimezoneChanged(userId, oldTimezone, timezone);
            console.log(`📅 動的スケジューラーに通知: ${userId} ${oldTimezone} -> ${timezone}`);
          } catch (error) {
            console.warn(`⚠️ 動的スケジューラーへの通知に失敗: ${error}`);
          }
        }
        
        // 現在時刻を新しいタイムゾーンで表示
        const now = TimeProviderService.getInstance().now();
        const localTime = now.toLocaleString('ja-JP', { 
          timeZone: timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });

        await message.reply(`✅ **タイムゾーン設定完了**\n\n` +
                           `🎯 新しいタイムゾーン: \`${timezone}\`\n` +
                           `🕐 現在時刻: ${localTime}\n\n` +
                           `💡 **即座に適用されました！**\n` +
                           `• ログ表示: \`!logs\` で新しいタイムゾーンで時刻表示\n` +
                           `• サマリー: \`!summary\` で新しいタイムゾーンで分析\n` +
                           `• 今後の記録も新しいタイムゾーンで処理されます\n\n` +
                           `🔄 設定変更は即座に反映され、Botの再起動は不要です。`);
      } else {
        // フォールバック（古いリポジトリの場合）
        await message.reply(`⚙️ **タイムゾーン設定**\n\n` +
                           `🎯 設定したいタイムゾーン: \`${timezone}\`\n\n` +
                           `💡 **現在の設定方法:**\n` +
                           `環境変数 \`USER_TIMEZONE\` に以下を設定してください:\n` +
                           `\`\`\`\n` +
                           `export USER_TIMEZONE="${timezone}"\n` +
                           `\`\`\`\n\n` +
                           `🔄 設定後はBotを再起動してください。`);
      }
      
      console.log(`⚙️ タイムゾーン設定完了: ${userId} -> ${timezone}`);
    } catch (error) {
      console.error('❌ タイムゾーン設定エラー:', error);
      throw new ActivityLogError('タイムゾーンの設定に失敗しました', 'SET_TIMEZONE_ERROR', { error });
    }
  }

  /**
   * ヘルプを表示
   */
  async showHelp(message: Message): Promise<void> {
    const helpMessage = `🌍 **タイムゾーンコマンド**

**基本的な使い方:**
\`!timezone\` - 現在のタイムゾーン表示
\`!timezone search <都市名>\` - タイムゾーン検索
\`!timezone set <タイムゾーン名>\` - タイムゾーン設定

**使用例:**
\`!timezone\` → 現在の設定を表示
\`!timezone search Tokyo\` → 東京のタイムゾーンを検索
\`!timezone search Kolkata\` → コルカタ（インド）のタイムゾーンを検索
\`!timezone search New York\` → ニューヨークのタイムゾーンを検索
\`!timezone set Asia/Kolkata\` → インド標準時に設定

**対応タイムゾーン例:**
• **日本**: Asia/Tokyo (JST, UTC+9)
• **インド**: Asia/Kolkata (IST, UTC+5:30)
• **アメリカ東部**: America/New_York (EST/EDT)
• **イギリス**: Europe/London (GMT/BST)
• **中国**: Asia/Shanghai (CST, UTC+8)

**検索のコツ:**
• 都市名で検索: Tokyo, Mumbai, London
• 国名でも検索可能: Japan, India, America
• 部分一致で検索されます

**設定方法:**
\`!timezone set <タイムゾーン名>\` でリアルタイム設定変更可能。
Botの再起動は不要で、即座に全機能に反映されます。

**その他のコマンド:**
\`!logs\` - ログ表示（設定したタイムゾーンで時刻表示）
\`!summary\` - 分析結果表示`;

    await message.reply(helpMessage);
  }

  /**
   * タイムゾーンコマンドを解析
   */
  private parseTimezoneCommand(args: string[]): ParsedTimezoneCommand {
    // 引数がない場合は現在のタイムゾーンを表示
    if (args.length === 0) {
      return { type: 'show' };
    }

    const firstArg = args[0].toLowerCase();

    // ヘルプ表示
    if (firstArg === 'help' || firstArg === 'h' || firstArg === '?' || firstArg === 'ヘルプ') {
      return { type: 'help' };
    }

    // 検索
    if (firstArg === 'search' || firstArg === 'find' || firstArg === '検索') {
      if (args.length < 2) {
        return { 
          type: 'search', 
          error: '検索する都市名を指定してください。例: `!timezone search Tokyo`' 
        };
      }

      const query = args.slice(1).join(' ').trim();
      if (query.length === 0) {
        return { 
          type: 'search', 
          error: '検索キーワードが空です。' 
        };
      }

      return { 
        type: 'search', 
        query 
      };
    }

    // 設定
    if (firstArg === 'set' || firstArg === '設定') {
      if (args.length < 2) {
        return { 
          type: 'set', 
          error: `タイムゾーンを指定してください。例: \`!timezone set ${this.getExampleTimezone()}\``
        };
      }

      const timezone = args[1].trim();
      if (timezone.length === 0) {
        return { 
          type: 'set', 
          error: 'タイムゾーンが空です。' 
        };
      }

      return { 
        type: 'set', 
        query: timezone 
      };
    }

    // その他の場合は現在のタイムゾーンを表示
    return { type: 'show' };
  }

  /**
   * タイムゾーンを検索（簡易実装）
   */
  private searchTimezones(query: string): TimezoneSearchResult[] {
    // 主要なタイムゾーンのマッピング
    const timezoneMap: { [key: string]: TimezoneSearchResult } = {
      // アジア
      'tokyo': { timezone: 'Asia/Tokyo', description: '東京, 日本', offset: '+9:00' },
      'japan': { timezone: 'Asia/Tokyo', description: '日本', offset: '+9:00' },
      'kolkata': { timezone: 'Asia/Kolkata', description: 'コルカタ, インド', offset: '+5:30' },
      'mumbai': { timezone: 'Asia/Kolkata', description: 'ムンバイ, インド', offset: '+5:30' },
      'delhi': { timezone: 'Asia/Kolkata', description: 'デリー, インド', offset: '+5:30' },
      'india': { timezone: 'Asia/Kolkata', description: 'インド', offset: '+5:30' },
      'shanghai': { timezone: 'Asia/Shanghai', description: '上海, 中国', offset: '+8:00' },
      'beijing': { timezone: 'Asia/Shanghai', description: '北京, 中国', offset: '+8:00' },
      'china': { timezone: 'Asia/Shanghai', description: '中国', offset: '+8:00' },
      'singapore': { timezone: 'Asia/Singapore', description: 'シンガポール', offset: '+8:00' },
      'seoul': { timezone: 'Asia/Seoul', description: 'ソウル, 韓国', offset: '+9:00' },
      'korea': { timezone: 'Asia/Seoul', description: '韓国', offset: '+9:00' },
      
      // アメリカ
      'new york': { timezone: 'America/New_York', description: 'ニューヨーク, アメリカ', offset: '-5:00/-4:00' },
      'newyork': { timezone: 'America/New_York', description: 'ニューヨーク, アメリカ', offset: '-5:00/-4:00' },
      'los angeles': { timezone: 'America/Los_Angeles', description: 'ロサンゼルス, アメリカ', offset: '-8:00/-7:00' },
      'losangeles': { timezone: 'America/Los_Angeles', description: 'ロサンゼルス, アメリカ', offset: '-8:00/-7:00' },
      'chicago': { timezone: 'America/Chicago', description: 'シカゴ, アメリカ', offset: '-6:00/-5:00' },
      'america': { timezone: 'America/New_York', description: 'アメリカ東部', offset: '-5:00/-4:00' },
      'usa': { timezone: 'America/New_York', description: 'アメリカ東部', offset: '-5:00/-4:00' },
      
      // ヨーロッパ
      'london': { timezone: 'Europe/London', description: 'ロンドン, イギリス', offset: '+0:00/+1:00' },
      'uk': { timezone: 'Europe/London', description: 'イギリス', offset: '+0:00/+1:00' },
      'england': { timezone: 'Europe/London', description: 'イギリス', offset: '+0:00/+1:00' },
      'paris': { timezone: 'Europe/Paris', description: 'パリ, フランス', offset: '+1:00/+2:00' },
      'france': { timezone: 'Europe/Paris', description: 'フランス', offset: '+1:00/+2:00' },
      'berlin': { timezone: 'Europe/Berlin', description: 'ベルリン, ドイツ', offset: '+1:00/+2:00' },
      'germany': { timezone: 'Europe/Berlin', description: 'ドイツ', offset: '+1:00/+2:00' },
      
      // オセアニア
      'sydney': { timezone: 'Australia/Sydney', description: 'シドニー, オーストラリア', offset: '+10:00/+11:00' },
      'melbourne': { timezone: 'Australia/Melbourne', description: 'メルボルン, オーストラリア', offset: '+10:00/+11:00' },
      'australia': { timezone: 'Australia/Sydney', description: 'オーストラリア東部', offset: '+10:00/+11:00' },
    };

    const normalizedQuery = query.toLowerCase();
    const results: TimezoneSearchResult[] = [];

    // 完全一致を優先
    if (timezoneMap[normalizedQuery]) {
      results.push(timezoneMap[normalizedQuery]);
    }

    // 部分一致を追加
    Object.keys(timezoneMap).forEach(key => {
      if (key.includes(normalizedQuery) && !results.find(r => r.timezone === timezoneMap[key].timezone)) {
        results.push(timezoneMap[key]);
      }
    });

    return results;
  }

  /**
   * タイムゾーンの妥当性を検証
   */
  private isValidTimezone(timezone: string): boolean {
    // TimezoneServiceが利用可能な場合はそれを使用
    if (this.timezoneService) {
      return this.timezoneService.validateTimezone(timezone);
    }
    
    // フォールバック: 直接検証
    try {
      TimeProviderService.getInstance().now().toLocaleString('en-US', { timeZone: timezone });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * システムデフォルトタイムゾーンを取得
   */
  private getSystemDefaultTimezone(): string {
    return this.timezoneService?.getSystemTimezone() || 'Asia/Tokyo';
  }

  /**
   * 例として使用するタイムゾーンを取得
   */
  private getExampleTimezone(): string {
    const supportedTimezones = this.timezoneService?.getSupportedTimezones() || ['Asia/Tokyo'];
    return supportedTimezones[0];
  }
}