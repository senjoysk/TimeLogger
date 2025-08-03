/**
 * 🟢 Green Phase: TodoCrudHandler 実装
 * TDD開発: TODO管理コマンドの責任分離
 * 責任: コマンド解析 + CRUD操作 + ヘルプ表示
 * 
 * @SRP-EXCEPTION: TODO管理の統合ハンドラーとして複数の責務を持つ
 * @SRP-REASON: コマンド解析とCRUD操作を一体的に扱う必要があるため。将来的に分割予定
 */

import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { ITodoRepository } from '../repositories/interfaces';
import { CreateTodoRequest, Todo, TodoCommandType } from '../types/todo';
import { logger } from '../utils/logger';
import { createTodoListEmbed, createPaginatedEmbed, createTodoActionButtons, createTodoNumberButtons } from '../components/classificationResultEmbed';
import { ActivityLogError } from '../types/activityLog';
import { validatePriority, getPriorityLabel } from '../utils/todoUtils';

/**
 * コマンド解析結果
 */
export interface ParsedTodoCommand {
  type: TodoCommandType;
  todoId?: string;
  content?: string;
  keyword?: string;
  error?: string;
}

/**
 * TodoCrudHandlerインターフェース
 */
export interface ITodoCrudHandler {
  /**
   * TODOコマンドを処理
   */
  handleCommand(message: Message, userId: string, args: string[], timezone: string): Promise<void>;
  
  /**
   * コマンドヘルプを表示
   */
  showHelp(message: Message): Promise<void>;
}

/**
 * TODO CRUD操作ハンドラー
 * 責任: コマンド解析、基本CRUD操作、ヘルプ表示
 */
export class TodoCrudHandler implements ITodoCrudHandler {
  constructor(private todoRepository: ITodoRepository) {}

  /**
   * TODOコマンドを処理
   */
  async handleCommand(message: Message, userId: string, args: string[], timezone: string): Promise<void> {
    try {
      logger.debug('HANDLER', `📋 TODO CRUDコマンド処理開始: ${userId} ${args.join(' ')}`);

      const parsedCommand = this.parseCommand(args);
      
      if (parsedCommand.error) {
        await message.reply(`❌ ${parsedCommand.error}\n\n使用方法: \`!todo help\` でヘルプを確認してください。`);
        return;
      }

      switch (parsedCommand.type) {
        case 'list':
          await this.showTodoList(message, userId);
          break;
          
        case 'add':
          await this.addTodo(message, userId, parsedCommand.content!, timezone);
          break;
          
        case 'done':
          await this.completeTodo(message, userId, parsedCommand.todoId!, timezone);
          break;
          
        case 'edit':
          await this.editTodo(message, userId, parsedCommand.todoId!, parsedCommand.content!, timezone);
          break;
          
        case 'delete':
          await this.deleteTodo(message, userId, parsedCommand.todoId!, timezone);
          break;
          
        case 'search':
          await this.searchTodos(message, userId, parsedCommand.keyword!);
          break;
          
        case 'priority':
          await this.setPriority(message, userId, parsedCommand.todoId!, parsedCommand.content!, timezone);
          break;
          
        case 'help':
          await this.showHelp(message);
          break;
          
        default:
          await this.showHelp(message);
      }
    } catch (error) {
      logger.error('HANDLER', '❌ TODO CRUDコマンド処理エラー:', error);
      
      const errorMessage = error instanceof ActivityLogError 
        ? `❌ ${error.message}`
        : error instanceof Error 
          ? `❌ TODOコマンドの処理中にエラーが発生しました。詳細: ${error.message}`
          : '❌ TODOコマンドの処理中にエラーが発生しました。';
        
      await message.reply(errorMessage);
    }
  }

  /**
   * TODO一覧を表示（ページネーション対応）
   */
  private async showTodoList(message: Message, userId: string, page: number = 1): Promise<void> {
    // パフォーマンス最適化: メモリ内フィルタリングをDB直接クエリに変更
    const activeTodos = await this.todoRepository.getTodosByStatusOptimized(userId, ['pending', 'in_progress']);

    const pageSize = 10;
    const totalPages = Math.ceil(activeTodos.length / pageSize);
    const startIndex = (page - 1) * pageSize;
    const pageTodos = activeTodos.slice(startIndex, startIndex + pageSize);

    // 11件以上の場合はページネーション対応のEmbedを使用
    const embed = activeTodos.length > 10 
      ? createPaginatedEmbed(pageTodos.map(todo => ({
          id: todo.id,
          content: todo.content,
          status: todo.status,
          priority: todo.priority,
          due_date: todo.dueDate,
          created_at: todo.createdAt
        })), page, totalPages, activeTodos.length)
      : createTodoListEmbed(activeTodos.map(todo => ({
          id: todo.id,
          content: todo.content,
          status: todo.status,
          priority: todo.priority,
          due_date: todo.dueDate,
          created_at: todo.createdAt
        })), userId);

    // コンポーネントを作成
    const components = [];
    
    // ページネーションボタン（11件以上の場合）
    if (activeTodos.length > 10) {
      components.push(this.createPaginationButtons(page, totalPages));
    }
    
    // 番号ボタンを作成（ページに応じた番号）
    const numberButtons = createTodoNumberButtons(pageTodos.length, startIndex);
    components.push(...numberButtons);

    await message.reply({
      embeds: [embed],
      components
    });
  }

  /**
   * TODO追加
   */
  private async addTodo(message: Message, userId: string, content: string, timezone: string): Promise<void> {
    // 最後の引数が優先度の可能性をチェック
    const parts = content.split(' ');
    let priority = 0;
    let actualContent = content;
    
    if (parts.length >= 2) {
      const lastPart = parts[parts.length - 1];
      // 数値として解析可能かチェック
      if (!isNaN(parseInt(lastPart, 10))) {
        const parsedPriority = validatePriority(lastPart);
        
        if (parsedPriority === null) {
          // 無効な優先度値の場合
          await message.reply('❌ 優先度は 1（高）、0（普通）、-1（低）のいずれかを指定してください。');
          return;
        }
        
        priority = parsedPriority;
        actualContent = parts.slice(0, -1).join(' ');
      }
    }

    const request: CreateTodoRequest = {
      userId,
      content: actualContent,
      sourceType: 'manual',
      priority
    };

    const todo = await this.todoRepository.createTodo(request);
    
    let replyMessage = `✅ TODO「${todo.content}」を追加しました！`;
    if (priority !== 0) {
      replyMessage += `（優先度: ${getPriorityLabel(priority)}）`;
    }
    
    await message.reply(replyMessage);
    logger.debug('HANDLER', `➕ TODO追加: ${userId} "${todo.content}" 優先度: ${priority}`);
  }

  /**
   * TODO完了
   */
  private async completeTodo(message: Message, userId: string, todoId: string, timezone: string): Promise<void> {
    const todo = await this.findTodoByIdOrShortId(todoId, userId);
    
    if (!todo) {
      await message.reply('❌ 指定されたTODOが見つかりません。');
      return;
    }

    if (todo.userId !== userId) {
      await message.reply('❌ 他のユーザーのTODOは操作できません。');
      return;
    }

    await this.todoRepository.updateTodoStatus(todo.id, 'completed');
    
    await message.reply(`🎉 TODO「${todo.content}」を完了しました！`);
    logger.debug('HANDLER', `✅ TODO完了: ${userId} "${todo.content}"`);
  }

  /**
   * TODO編集
   */
  private async editTodo(message: Message, userId: string, todoId: string, newContent: string, timezone: string): Promise<void> {
    const todo = await this.findTodoByIdOrShortId(todoId, userId);
    
    if (!todo) {
      await message.reply('❌ 指定されたTODOが見つかりません。');
      return;
    }

    if (todo.userId !== userId) {
      await message.reply('❌ 他のユーザーのTODOは操作できません。');
      return;
    }

    // 最後の引数が優先度の可能性をチェック
    const parts = newContent.split(' ');
    let priority: number | undefined;
    let actualContent = newContent;
    
    if (parts.length >= 2) {
      const lastPart = parts[parts.length - 1];
      // 数値として解析可能かチェック
      if (!isNaN(parseInt(lastPart, 10))) {
        const parsedPriority = validatePriority(lastPart);
        
        if (parsedPriority === null) {
          // 無効な優先度値の場合
          await message.reply('❌ 優先度は 1（高）、0（普通）、-1（低）のいずれかを指定してください。');
          return;
        }
        
        priority = parsedPriority;
        actualContent = parts.slice(0, -1).join(' ');
      }
    }

    const oldContent = todo.content;
    const updateData: Partial<Todo> = { content: actualContent };
    if (priority !== undefined) {
      updateData.priority = priority;
    }
    
    await this.todoRepository.updateTodo(todo.id, updateData);
    
    let replyMessage = `✏️ TODO「${oldContent}」を「${actualContent}」に編集しました！`;
    if (priority !== undefined) {
      replyMessage += `（優先度: ${getPriorityLabel(priority)}）`;
    }
    
    await message.reply(replyMessage);
    logger.debug('HANDLER', `✏️ TODO編集: ${userId} "${todo.content}" -> "${actualContent}" 優先度: ${priority}`);
  }

  /**
   * TODO削除
   */
  private async deleteTodo(message: Message, userId: string, todoId: string, timezone: string): Promise<void> {
    const todo = await this.findTodoByIdOrShortId(todoId, userId);
    
    if (!todo) {
      await message.reply('❌ 指定されたTODOが見つかりません。');
      return;
    }

    if (todo.userId !== userId) {
      await message.reply('❌ 他のユーザーのTODOは操作できません。');
      return;
    }

    await this.todoRepository.deleteTodo(todo.id);
    
    await message.reply(`🗑️ TODO「${todo.content}」を削除しました。`);
    logger.debug('HANDLER', `🗑️ TODO削除: ${userId} "${todo.content}"`);
  }

  /**
   * TODO検索
   */
  private async searchTodos(message: Message, userId: string, keyword: string): Promise<void> {
    const todos = await this.todoRepository.searchTodos(userId, keyword);
    
    if (todos.length === 0) {
      await message.reply(`🔍 「${keyword}」に一致するTODOが見つかりませんでした。`);
      return;
    }

    const embed = createTodoListEmbed(todos.map(todo => ({
      id: todo.id,
      content: todo.content,
      status: todo.status,
      priority: todo.priority,
      due_date: todo.dueDate,
      created_at: todo.createdAt
    })), userId);

    embed.setTitle(`🔍 検索結果: "${keyword}"`);

    await message.reply({ embeds: [embed] });
  }

  /**
   * TODO優先度変更
   */
  private async setPriority(message: Message, userId: string, todoId: string, priorityStr: string, timezone: string): Promise<void> {
    const todo = await this.findTodoByIdOrShortId(todoId, userId);
    
    if (!todo) {
      await message.reply('❌ 指定されたTODOが見つかりません。');
      return;
    }

    if (todo.userId !== userId) {
      await message.reply('❌ 他のユーザーのTODOは操作できません。');
      return;
    }

    const priority = validatePriority(priorityStr);
    if (priority === null) {
      await message.reply('❌ 優先度は 1（高）、0（普通）、-1（低）のいずれかを指定してください。');
      return;
    }

    await this.todoRepository.updateTodo(todo.id, { priority });
    
    await message.reply(`📊 TODO「${todo.content}」の優先度を「${getPriorityLabel(priority)}」に変更しました！`);
    logger.debug('HANDLER', `📊 TODO優先度変更: ${userId} "${todo.content}" 優先度: ${priority}`);
  }

  /**
   * コマンドヘルプを表示
   */
  async showHelp(message: Message): Promise<void> {
    const helpEmbed = new EmbedBuilder()
      .setTitle('📋 TODOコマンドヘルプ')
      .setDescription('TODOの管理機能の使用方法')
      .addFields(
        {
          name: '📝 基本コマンド',
          value: [
            '`!todo` - TODO一覧表示',
            '`!todo add <内容> [優先度]` - TODO追加',
            '`!todo done <ID>` - TODO完了',
            '`!todo edit <ID> <新内容> [優先度]` - TODO編集',
            '`!todo priority <ID> <優先度>` - 優先度のみ変更',
            '`!todo delete <ID>` - TODO削除',
            '`!todo search <キーワード>` - TODO検索'
          ].join('\n'),
          inline: false
        },
        {
          name: '📊 優先度の値',
          value: [
            '`1` = 高（🔴）',
            '`0` = 普通（🟡）',
            '`-1` = 低（🟢）'
          ].join('\n'),
          inline: false
        },
        {
          name: '💡 使用例',
          value: [
            '`!todo add 重要なタスク 1` - 高優先度でTODO追加',
            '`!todo add 通常のタスク` - 普通優先度でTODO追加',
            '`!todo edit abc123 新しい内容` - 内容のみ変更',
            '`!todo edit abc123 新しい内容 1` - 内容と優先度を変更',
            '`!todo priority abc123 -1` - 優先度を低に変更',
            '`!todo done abc123` - TODO完了',
            '`!todo search 資料` - キーワード検索'
          ].join('\n'),
          inline: false
        }
      )
      .setColor(0x0099ff)
      .setTimestamp();

    await message.reply({ embeds: [helpEmbed] });
  }

  /**
   * コマンドを解析
   */
  private parseCommand(args: string[]): ParsedTodoCommand {
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
          return { type: 'add', error: 'TODO内容を入力してください。例: `!todo add 資料を作成する`' };
        }
        return { type: 'add', content: args.slice(1).join(' ') };

      case 'done':
      case 'complete':
      case '完了':
        if (args.length < 2) {
          return { type: 'done', error: 'TODO IDを指定してください。例: `!todo done abc123`' };
        }
        return { type: 'done', todoId: args[1] };

      case 'edit':
      case '編集':
        if (args.length < 3) {
          return { type: 'edit', error: 'TODO IDと新しい内容を指定してください。例: `!todo edit abc123 新しい内容`' };
        }
        return { type: 'edit', todoId: args[1], content: args.slice(2).join(' ') };

      case 'delete':
      case 'del':
      case '削除':
        if (args.length < 2) {
          return { type: 'delete', error: 'TODO IDを指定してください。例: `!todo delete abc123`' };
        }
        return { type: 'delete', todoId: args[1] };

      case 'search':
      case 'find':
      case '検索':
        if (args.length < 2) {
          return { type: 'search', error: '検索キーワードを入力してください。例: `!todo search 資料`' };
        }
        return { type: 'search', keyword: args.slice(1).join(' ') };

      case 'priority':
      case '優先度':
        if (args.length < 3) {
          return { type: 'priority', error: 'TODO IDと優先度を指定してください。例: `!todo priority abc123 1`' };
        }
        return { type: 'priority', todoId: args[1], content: args[2] };

      case 'help':
      case 'h':
      case 'ヘルプ':
        return { type: 'help' };

      default:
        return { type: 'help', error: `未知のコマンド「${command}」です。` };
    }
  }

  /**
   * 完全IDまたは短縮IDでTODOを検索
   */
  private async findTodoByIdOrShortId(idOrShortId: string, userId: string): Promise<Todo | null> {
    // まず完全IDで試行
    let todo = await this.todoRepository.getTodoById(idOrShortId);
    if (todo && todo.userId === userId) {
      return todo;
    }

    // 短縮IDの場合、ユーザーのTODO一覧から検索
    if (idOrShortId.length >= 6 && idOrShortId.length <= 8) {
      const userTodos = await this.todoRepository.getTodosByUserId(userId);
      const matchingTodos = userTodos.filter(todo => 
        todo.id.startsWith(idOrShortId)
      );

      if (matchingTodos.length === 1) {
        return matchingTodos[0];
      } else if (matchingTodos.length > 1) {
        return matchingTodos[0];
      }
    }

    return null;
  }

  /**
   * ページネーション用のボタンを生成
   */
  private createPaginationButtons(currentPage: number, totalPages: number): ActionRowBuilder<ButtonBuilder> {
    const buttonRow = new ActionRowBuilder<ButtonBuilder>();
    
    // 前のページボタン
    buttonRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`todo_page_prev_${currentPage}`)
        .setLabel('◀️ 前のページ')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === 1)
    );
    
    // 現在のページ情報ボタン（無効化）
    buttonRow.addComponents(
      new ButtonBuilder()
        .setCustomId('todo_page_info')
        .setLabel(`ページ ${currentPage}/${totalPages}`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true)
    );
    
    // 次のページボタン
    buttonRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`todo_page_next_${currentPage}`)
        .setLabel('次のページ ▶️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === totalPages)
    );
    
    return buttonRow;
  }
}