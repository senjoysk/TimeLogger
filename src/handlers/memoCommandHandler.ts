/**
 * メモコマンドハンドラー
 * Discord.jsメッセージ処理を統合
 */

import { Message, EmbedBuilder } from 'discord.js';
import { IMemoRepository } from '../repositories/interfaces';
import { ICommandHandler } from './interfaces';
import { Memo, CreateMemoRequest, UpdateMemoRequest, MemoError } from '../types/memo';
import { logger } from '../utils/logger';
import { withErrorHandling } from '../utils/errorHandler';
import { ITimezoneService } from '../services/interfaces/ITimezoneService';

/**
 * メモコマンドの種類
 */
export type MemoCommandType = 'list' | 'add' | 'delete' | 'search' | 'help';

/**
 * メモコマンドの解析結果
 */
export interface ParsedMemoCommand {
  type: MemoCommandType;
  memoId?: string;
  content?: string;
  keyword?: string;
  error?: string;
}

/**
 * メモコマンドハンドラーの実装
 */
export class MemoCommandHandler implements ICommandHandler {
  constructor(
    private memoRepository: IMemoRepository,
    private timezoneService?: ITimezoneService
  ) {}

  /**
   * メモコマンドを処理
   */
  async handleCommand(message: Message, args: string[]): Promise<void> {
    try {
      const userId = message.author.id;
      // ユーザーのタイムゾーンを取得
      const timezone = this.timezoneService 
        ? await this.timezoneService.getUserTimezone(userId)
        : this.getDefaultTimezone();
      
      logger.debug('HANDLER', `📝 メモコマンド処理開始: ${userId} ${args.join(' ')}`);

      const parsedCommand = this.parseCommand(args);
      
      if (parsedCommand.error) {
        await message.reply(`❌ ${parsedCommand.error}\n\n使用方法: \`!memo help\` でヘルプを確認してください。`);
        return;
      }

      switch (parsedCommand.type) {
        case 'list':
          await this.showMemoList(message, userId);
          break;
          
        case 'add':
          await this.addMemo(message, userId, parsedCommand.content!);
          break;
          
        case 'delete':
          await this.deleteMemo(message, userId, parsedCommand.memoId!);
          break;
          
        case 'search':
          await this.searchMemos(message, userId, parsedCommand.keyword!);
          break;
          
        case 'help':
          await this.showHelp(message);
          break;
          
        default:
          await this.showHelp(message);
      }
    } catch (error) {
      logger.error('HANDLER', '❌ メモコマンド処理エラー:', error);
      await message.reply('❌ メモコマンドの処理中にエラーが発生しました。');
    }
  }

  /**
   * メモ一覧を表示
   */
  private async showMemoList(message: Message, userId: string): Promise<void> {
    const memos = await this.memoRepository.getMemosByUserId(userId);

    if (memos.length === 0) {
      await message.reply('📝 メモがありません。`!memo add <内容>` でメモを追加してください。');
      return;
    }

    const embed = this.createMemoListEmbed(memos);
    await message.reply({ embeds: [embed] });
  }

  /**
   * メモ追加
   */
  private async addMemo(message: Message, userId: string, content: string): Promise<void> {
    const request: CreateMemoRequest = {
      userId,
      content,
      tags: []
    };

    const memo = await this.memoRepository.createMemo(request);
    
    await message.reply(`✅ メモ「${memo.content}」を追加しました！`);
    logger.debug('HANDLER', `➕ メモ追加: ${userId} "${memo.content}"`);
  }

  /**
   * メモ削除
   */
  private async deleteMemo(message: Message, userId: string, memoId: string): Promise<void> {
    const memo = await this.memoRepository.getMemoById(memoId);
    
    if (!memo) {
      await message.reply('❌ 指定されたメモが見つかりません。');
      return;
    }

    if (memo.userId !== userId) {
      await message.reply('❌ 他のユーザーのメモは削除できません。');
      return;
    }

    await this.memoRepository.deleteMemo(memo.id);
    
    await message.reply(`🗑️ メモ「${memo.content}」を削除しました。`);
    logger.debug('HANDLER', `🗑️ メモ削除: ${userId} "${memo.content}"`);
  }

  /**
   * メモ検索
   */
  private async searchMemos(message: Message, userId: string, keyword: string): Promise<void> {
    const memos = await this.memoRepository.searchMemos(userId, keyword);
    
    if (memos.length === 0) {
      await message.reply(`🔍 「${keyword}」に一致するメモが見つかりませんでした。`);
      return;
    }

    const embed = this.createMemoListEmbed(memos);
    embed.setTitle(`🔍 検索結果: "${keyword}"`);

    await message.reply({ embeds: [embed] });
  }

  /**
   * コマンドヘルプを表示
   */
  private async showHelp(message: Message): Promise<void> {
    const helpEmbed = new EmbedBuilder()
      .setTitle('📝 メモコマンドヘルプ')
      .setDescription('メモの管理機能の使用方法')
      .addFields(
        {
          name: '📋 基本コマンド',
          value: [
            '`!memo` - メモ一覧表示',
            '`!memo add <内容>` - メモ追加',
            '`!memo delete <ID>` - メモ削除',
            '`!memo search <キーワード>` - メモ検索'
          ].join('\n'),
          inline: false
        },
        {
          name: '💡 使用例',
          value: [
            '`!memo add 明日の会議の議題を考える`',
            '`!memo delete memo123`',
            '`!memo search 会議`'
          ].join('\n'),
          inline: false
        }
      )
      .setColor(0x00ff99)
      .setTimestamp();

    await message.reply({ embeds: [helpEmbed] });
  }

  /**
   * メモ一覧のEmbedを作成
   */
  private createMemoListEmbed(memos: Memo[]): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle('📝 メモ一覧')
      .setColor(0x00ff99)
      .setTimestamp();

    if (memos.length === 0) {
      embed.setDescription('メモがありません。');
      return embed;
    }

    // 最新10件のメモを表示
    const displayMemos = memos.slice(0, 10);
    
    displayMemos.forEach((memo, index) => {
      const shortId = memo.id.substring(0, 8);
      const createdDate = new Date(memo.createdAt).toLocaleString('ja-JP');
      
      embed.addFields({
        name: `📄 ${index + 1}. ${shortId}`,
        value: `**内容**: ${memo.content}\n**作成日**: ${createdDate}`,
        inline: false
      });
    });

    if (memos.length > 10) {
      embed.setFooter({ text: `他に${memos.length - 10}件のメモがあります` });
    }

    return embed;
  }

  /**
   * コマンドを解析
   */
  private parseCommand(args: string[]): ParsedMemoCommand {
    if (args.length === 0) {
      return { type: 'list' };
    }

    const command = args[0].toLowerCase();

    switch (command) {
      case 'list':
      case 'ls':
      case '一覧':
        return { type: 'list' };

      case 'add':
      case 'create':
      case '追加':
        if (args.length < 2) {
          return { type: 'add', error: 'メモ内容を入力してください。例: `!memo add 覚えておきたいこと`' };
        }
        return { type: 'add', content: args.slice(1).join(' ') };

      case 'delete':
      case 'del':
      case '削除':
        if (args.length < 2) {
          return { type: 'delete', error: 'メモIDを指定してください。例: `!memo delete memo123`' };
        }
        return { type: 'delete', memoId: args[1] };

      case 'search':
      case 'find':
      case '検索':
        if (args.length < 2) {
          return { type: 'search', error: '検索キーワードを入力してください。例: `!memo search 会議`' };
        }
        return { type: 'search', keyword: args.slice(1).join(' ') };

      case 'help':
      case 'h':
      case 'ヘルプ':
        return { type: 'help' };

      default:
        return { type: 'help', error: `未知のコマンド「${command}」です。` };
    }
  }

  /**
   * デフォルトタイムゾーンを取得
   */
  private getDefaultTimezone(): string {
    return this.timezoneService?.getSystemTimezone() || 'Asia/Tokyo';
  }
}