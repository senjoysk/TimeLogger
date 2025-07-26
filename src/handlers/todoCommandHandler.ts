/**
 * TODOコマンドハンドラー
 * Discord.jsメッセージとボタンインタラクション処理を統合
 */

import { 
  Message, 
  ButtonInteraction, 
  EmbedBuilder,
  ComponentType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import { ITodoRepository, IMessageClassificationRepository } from '../repositories/interfaces';
import { IGeminiService } from '../services/interfaces/IGeminiService';
import { IMessageClassificationService } from '../services/messageClassificationService';
import { 
  Todo, 
  TodoStatus, 
  CreateTodoRequest, 
  ClassificationResult,
  MessageClassification 
} from '../types/todo';
import { 
  createClassificationResultEmbed,
  createClassificationButtons,
  createTodoListEmbed,
  createTodoActionButtons,
  createPaginatedEmbed,
  generateSessionId
} from '../components/classificationResultEmbed';
import { ActivityLogError } from '../types/activityLog';
import { ActivityLogService } from '../services/activityLogService';

/**
 * TODOコマンドの種類
 */
export type TodoCommandType = 'list' | 'add' | 'done' | 'edit' | 'delete' | 'search' | 'help';

/**
 * TODOコマンドの解析結果
 */
export interface ParsedTodoCommand {
  type: TodoCommandType;
  todoId?: string;
  content?: string;
  keyword?: string;
  error?: string;
}

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
 * TODOコマンドハンドラーインターフェース
 */
export interface ITodoCommandHandler {
  /**
   * TODOコマンドを処理
   */
  handleCommand(message: Message, userId: string, args: string[], timezone: string): Promise<void>;
  
  /**
   * メッセージ分類を処理
   */
  handleMessageClassification(message: Message, userId: string, timezone: string): Promise<void>;
  
  /**
   * ボタンインタラクションを処理
   */
  handleButtonInteraction(interaction: ButtonInteraction, userId: string, timezone: string): Promise<void>;
  
  /**
   * コマンドヘルプを表示
   */
  showHelp(message: Message): Promise<void>;
  

  /**
   * リソースクリーンアップ
   */
  destroy(): void;
}

/**
 * TODOコマンドハンドラーの実装
 */
export class TodoCommandHandler implements ITodoCommandHandler {
  private activeSessions = new Map<string, ClassificationSession>();
  private readonly SESSION_TIMEOUT = 5 * 60 * 1000; // 5分
  private cleanupInterval?: NodeJS.Timeout;
  
  constructor(
    private todoRepository: ITodoRepository,
    private classificationRepository: IMessageClassificationRepository,
    private geminiService: IGeminiService,
    private classificationService: IMessageClassificationService,
    private activityLogService?: ActivityLogService // 活動ログサービスの注入
  ) {
    // セッションタイムアウトのクリーンアップ
    this.cleanupInterval = setInterval(() => this.cleanupExpiredSessions(), 60 * 1000); // 1分間隔でクリーンアップ
    
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
   * TODOコマンドを処理
   */
  async handleCommand(message: Message, userId: string, args: string[], timezone: string): Promise<void> {
    try {
      console.log(`📋 TODOコマンド処理開始: ${userId} ${args.join(' ')}`);

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
          
        case 'help':
          await this.showHelp(message);
          break;
          
        default:
          await this.showHelp(message);
      }
    } catch (error) {
      console.error('❌ TODOコマンド処理エラー:', error);
      
      if (error instanceof Error) {
        console.error('❌ エラーの詳細:', {
          name: error.name,
          message: error.message,
          stack: error.stack
        });
      }
      
      const errorMessage = error instanceof ActivityLogError 
        ? `❌ ${error.message}`
        : error instanceof Error 
          ? `❌ TODOコマンドの処理中にエラーが発生しました。詳細: ${error.message}`
          : '❌ TODOコマンドの処理中にエラーが発生しました。';
        
      await message.reply(errorMessage);
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
   * ボタンインタラクションを処理
   */
  async handleButtonInteraction(interaction: ButtonInteraction, userId: string, timezone: string): Promise<void> {
    try {
      if (!interaction.customId) {
        await interaction.reply({ content: '❌ 無効なボタン操作です。', ephemeral: true });
        return;
      }

      console.log(`🔘 ボタンインタラクション: ${userId} ${interaction.customId}`);

      // カスタムIDを解析
      const idParts = interaction.customId.split('_');
      const action = idParts[0];
      
      let type: string;
      let sessionId: string;
      
      // ignoreボタンの特別処理（typeがない）
      if (action === 'ignore') {
        type = '';
        sessionId = idParts.slice(1).join('_');
      }
      // activity_log classification removed
      else {
        type = idParts[1];
        sessionId = idParts.slice(2).join('_');
      }

      console.log(`🔍 カスタムID解析: action=${action}, type=${type}, sessionId=${sessionId}`);
      console.log(`🔍 idParts詳細: [${idParts.join(', ')}]`);

      // セッション確認
      if (action === 'confirm' || action === 'classify' || action === 'ignore') {
        await this.handleClassificationButton(interaction, action, type, sessionId, userId, timezone);
      } else if (action === 'todo') {
        // ページネーションボタンの処理
        if (type === 'page') {
          const pageAction = idParts[2]; // prev または next
          const currentPage = parseInt(idParts[3]);
          await this.handlePaginationInteraction(interaction, pageAction, currentPage, userId);
        } else {
          // TODOアクションの場合、todoIdは第3要素以降のすべて
          const todoId = idParts.slice(2).join('_');
          await this.handleTodoActionButton(interaction, type, todoId, userId, timezone);
        }
      } else {
        await interaction.reply({ content: '❌ 未知のボタン操作です。', ephemeral: true });
      }

    } catch (error) {
      console.error('❌ ボタンインタラクション処理エラー:', error);
      
      if (!interaction.replied) {
        await interaction.reply({ 
          content: '❌ ボタン操作の処理中にエラーが発生しました。', 
          ephemeral: true 
        });
      }
    }
  }

  /**
   * 分類確認ボタンを処理
   */
  private async handleClassificationButton(
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

    if (action === 'ignore') {
      // セッション削除
      this.activeSessions.delete(sessionId);
      await interaction.update({
        content: '❌ メッセージを無視しました。',
        embeds: [],
        components: []
      });
      return;
    }

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
        
      // ACTIVITY_LOG分類は削除されました（MessageSelectionHandlerで処理）
        
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
   * メッセージから活動ログを作成
   */
  // createActivityLogFromMessage method removed - activity logs are now handled by MessageSelectionHandler

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
    
    // TODO操作ボタンを作成（Discord制限: 最大5行まで）
    // ページネーションがある場合は4つまで、ない場合は5つまで
    const hasPagination = activeTodos.length > 10;
    const maxTodos = Math.min(pageTodos.length, hasPagination ? 4 : 5);
    
    for (let i = 0; i < maxTodos; i++) {
      const todo = pageTodos[i];
      const actionRow = createTodoActionButtons(todo.id, todo.status, startIndex + i);
      components.push(actionRow);
    }

    await message.reply({
      embeds: [embed],
      components
    });
  }

  /**
   * TODO追加
   */
  private async addTodo(message: Message, userId: string, content: string, timezone: string): Promise<void> {
    const request: CreateTodoRequest = {
      userId,
      content,
      sourceType: 'manual'
    };

    const todo = await this.todoRepository.createTodo(request);
    
    await message.reply(`✅ TODO「${todo.content}」を追加しました！`);
    console.log(`➕ TODO追加: ${userId} "${todo.content}"`);
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
    console.log(`✅ TODO完了: ${userId} "${todo.content}"`);
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

    // TODO更新（簡易実装）
    const oldContent = todo.content;
    await this.todoRepository.updateTodo(todo.id, { content: newContent });
    
    await message.reply(`✏️ TODO「${oldContent}」を「${newContent}」に編集しました！`);
    console.log(`✏️ TODO編集: ${userId} "${todo.content}" -> "${newContent}"`);
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
    console.log(`🗑️ TODO削除: ${userId} "${todo.content}"`);
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
   * コマンドヘルプを表示
   */
  async showHelp(message: Message): Promise<void> {
    const helpEmbed = new EmbedBuilder()
      .setTitle('📋 TODOコマンドヘルプ')
      .setDescription('TODOの管理とAI分類機能の使用方法')
      .addFields(
        {
          name: '📝 基本コマンド',
          value: [
            '`!todo` - TODO一覧表示',
            '`!todo add <内容>` - TODO追加',
            '`!todo done <ID>` - TODO完了',
            '`!todo edit <ID> <新内容>` - TODO編集',
            '`!todo delete <ID>` - TODO削除',
            '`!todo search <キーワード>` - TODO検索'
          ].join('\n'),
          inline: false
        },
        {
          name: '🤖 AI分類機能',
          value: [
            '**自動判定**: メッセージを送信すると自動分析',
            '**ボタン操作**: 判定結果をボタンで確認・修正',
            '**TODO変換**: TODOと判定されたらワンクリックで登録'
          ].join('\n'),
          inline: false
        },
        {
          name: '💡 使用例',
          value: [
            '`!todo add プレゼン資料を作成する`',
            '`!todo done abc123`',
            '`"明日までにレポートを提出する"` → AI分析 → TODO登録'
          ].join('\n'),
          inline: false
        }
      )
      .setColor(0x0099ff)
      .setTimestamp();

    await message.reply({ embeds: [helpEmbed] });
  }

  /**
   * TODO操作ボタンを処理
   */
  private async handleTodoActionButton(
    interaction: ButtonInteraction, 
    action: string, 
    todoId: string, 
    userId: string, 
    timezone: string
  ): Promise<void> {
    const todo = await this.findTodoByIdOrShortId(todoId, userId);
    
    if (!todo) {
      await interaction.reply({ content: '❌ TODOが見つかりません。', ephemeral: true });
      return;
    }

    if (todo.userId !== userId) {
      await interaction.reply({ content: '❌ 他のユーザーのTODOは操作できません。', ephemeral: true });
      return;
    }

    switch (action) {
      case 'complete':
        await this.todoRepository.updateTodoStatus(todo.id, 'completed');
        await interaction.reply({ content: `🎉 TODO「${todo.content}」を完了しました！`, ephemeral: true });
        break;
        
      case 'start':
        await this.todoRepository.updateTodoStatus(todo.id, 'in_progress');
        await interaction.reply({ content: `🚀 TODO「${todo.content}」を開始しました！`, ephemeral: true });
        break;
        
      case 'edit':
        await interaction.reply({ 
          content: `✏️ TODO編集は \`!todo edit ${todo.id} <新しい内容>\` コマンドを使用してください。`, 
          ephemeral: true 
        });
        break;
        
      case 'delete':
        await this.todoRepository.deleteTodo(todo.id);
        await interaction.reply({ content: `🗑️ TODO「${todo.content}」を削除しました。`, ephemeral: true });
        break;
        
      default:
        await interaction.reply({ content: '❌ 未知の操作です。', ephemeral: true });
    }
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

      case 'help':
      case 'h':
      case 'ヘルプ':
        return { type: 'help' };

      default:
        return { type: 'help', error: `未知のコマンド「${command}」です。` };
    }
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
        // 複数一致の場合は最初の候補を返す（将来的には明確化機能を追加可能）
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

  /**
   * ページネーションインタラクションを処理
   */
  private async handlePaginationInteraction(
    interaction: ButtonInteraction, 
    action: string, 
    currentPage: number, 
    userId: string
  ): Promise<void> {
    const newPage = action === 'prev' ? currentPage - 1 : currentPage + 1;
    
    // 新しいページのTODO一覧を取得
    const activeTodos = await this.todoRepository.getTodosByStatusOptimized(userId, ['pending', 'in_progress']);
    
    const pageSize = 10;
    const totalPages = Math.ceil(activeTodos.length / pageSize);
    const startIndex = (newPage - 1) * pageSize;
    const pageTodos = activeTodos.slice(startIndex, startIndex + pageSize);

    // 新しいページのEmbedを生成
    const embed = createPaginatedEmbed(pageTodos.map(todo => ({
      id: todo.id,
      content: todo.content,
      status: todo.status,
      priority: todo.priority,
      due_date: todo.dueDate,
      created_at: todo.createdAt
    })), newPage, totalPages, activeTodos.length);

    // 新しいページのコンポーネントを生成
    const components = [];
    
    // ページネーションボタン
    components.push(this.createPaginationButtons(newPage, totalPages));
    
    // TODO操作ボタン（ページネーションがあるので最大4個）
    const maxTodos = Math.min(pageTodos.length, 4);
    
    for (let i = 0; i < maxTodos; i++) {
      const todo = pageTodos[i];
      const actionRow = createTodoActionButtons(todo.id, todo.status, startIndex + i);
      components.push(actionRow);
    }

    // インタラクションを更新
    await interaction.update({
      embeds: [embed],
      components
    });
  }

  /**
   * テスト用にcreatePageEmbedを公開
   */
  private createPaginatedEmbed(
    todos: Array<{
      id: string;
      content: string;
      status: string;
      priority: number;
      due_date?: string;
      created_at: string;
    }>,
    currentPage: number,
    totalPages: number,
    totalCount: number
  ): EmbedBuilder {
    return createPaginatedEmbed(todos, currentPage, totalPages, totalCount);
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