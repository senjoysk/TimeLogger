/**
 * 🟢 Green Phase: TodoInteractionHandler 実装
 * TDD開発: Discord UI操作とボタンインタラクション
 * 責任: ボタンインタラクション + ページネーション + UI操作
 */

import { ButtonInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { ITodoRepository } from '../repositories/interfaces';
import { Todo } from '../types/todo';
import { createPaginatedEmbed, createTodoActionButtons } from '../components/classificationResultEmbed';

/**
 * TodoInteractionHandlerインターフェース
 */
export interface ITodoInteractionHandler {
  /**
   * TODOアクションボタンを処理
   */
  handleTodoActionButton(
    interaction: ButtonInteraction, 
    action: string, 
    todoId: string, 
    userId: string, 
    timezone: string
  ): Promise<void>;
  
  /**
   * ページネーションインタラクションを処理
   */
  handlePaginationInteraction(
    interaction: ButtonInteraction, 
    action: string, 
    currentPage: number, 
    userId: string
  ): Promise<void>;
  
  /**
   * ページネーション用のボタンを生成
   */
  createPaginationButtons(currentPage: number, totalPages: number): ActionRowBuilder<ButtonBuilder>;
  
  /**
   * TODO番号ボタンを処理
   */
  handleTodoNumberButton(
    interaction: ButtonInteraction,
    userId: string
  ): Promise<void>;
}

/**
 * Discord UIボタンインタラクションハンドラー
 * 責任: TODOボタン操作、ページネーション、UI応答
 */
export class TodoInteractionHandler implements ITodoInteractionHandler {
  constructor(
    private todoRepository: ITodoRepository
  ) {}

  /**
   * TODOアクションボタンを処理
   */
  async handleTodoActionButton(
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
      await interaction.reply({ content: '❌ TODOが見つかりません。', ephemeral: true });
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
   * ページネーションインタラクションを処理
   */
  async handlePaginationInteraction(
    interaction: ButtonInteraction, 
    action: string, 
    currentPage: number, 
    userId: string
  ): Promise<void> {
    const newPage = action === 'prev' ? currentPage - 1 : currentPage + 1;
    
    // 新しいページのTODO一覧を取得
    const activeTodos = await this.todoRepository.getTodosByStatusOptimized(userId, ['pending', 'in_progress']);
    
    // 優先度でソート（高優先度→普通→低の順）
    activeTodos.sort((a, b) => {
      // 優先度が高い（1）ものを先に、低い（-1）ものを後に
      return b.priority - a.priority;
    });
    
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
    
    // 番号ボタンを作成（ページに応じた番号）
    const { createTodoNumberButtons } = await import('../components/classificationResultEmbed');
    const numberButtons = createTodoNumberButtons(pageTodos.length, startIndex);
    components.push(...numberButtons);

    // インタラクションを更新
    await interaction.update({
      embeds: [embed],
      components
    });
  }

  /**
   * ページネーション用のボタンを生成
   */
  createPaginationButtons(currentPage: number, totalPages: number): ActionRowBuilder<ButtonBuilder> {
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
   * TODO番号ボタンを処理
   */
  async handleTodoNumberButton(
    interaction: ButtonInteraction,
    userId: string
  ): Promise<void> {
    // カスタムIDから番号を取得
    const numberMatch = interaction.customId.match(/todo_number_(\d+)/);
    if (!numberMatch) {
      await interaction.reply({ 
        content: '❌ 無効なボタン操作です。', 
        ephemeral: true 
      });
      return;
    }

    const todoNumber = parseInt(numberMatch[1], 10);
    
    // アクティブなTODO一覧を取得
    const activeTodos = await this.todoRepository.getTodosByStatusOptimized(userId, ['pending', 'in_progress']);
    
    // 優先度でソート（高優先度→普通→低の順）
    activeTodos.sort((a, b) => {
      // 優先度が高い（1）ものを先に、低い（-1）ものを後に
      return b.priority - a.priority;
    });
    
    // 指定番号のTODOが存在するか確認
    if (todoNumber < 1 || todoNumber > activeTodos.length) {
      await interaction.reply({ 
        content: '❌ 指定されたTODOが見つかりません。', 
        ephemeral: true 
      });
      return;
    }

    // 指定番号のTODOを取得（配列は0ベースなので-1）
    const todo = activeTodos[todoNumber - 1];
    
    // TODO詳細のEmbedを作成
    const embed = new EmbedBuilder()
      .setTitle(`📋 TODO詳細 #${todoNumber}`)
      .setColor(0x0099ff)
      .setTimestamp()
      .addFields(
        { 
          name: '📝 内容', 
          value: todo.content, 
          inline: false 
        },
        { 
          name: '📊 ステータス', 
          value: this.getStatusDisplay(todo.status), 
          inline: true 
        },
        { 
          name: '🎯 優先度', 
          value: this.getPriorityDisplay(todo.priority), 
          inline: true 
        }
      );

    // 期日がある場合は追加
    if (todo.dueDate) {
      embed.addFields({ 
        name: '📅 期日', 
        value: todo.dueDate, 
        inline: true 
      });
    }

    // 作成日時を追加
    embed.addFields({ 
      name: '🕐 作成日時', 
      value: new Date(todo.createdAt).toLocaleString('ja-JP'), 
      inline: false 
    });

    // 操作ボタンを作成
    const actionRow = createTodoActionButtons(todo.id, todo.status);

    await interaction.reply({
      embeds: [embed],
      components: [actionRow],
      ephemeral: true
    });
  }

  /**
   * ステータスの表示文字列を取得
   */
  private getStatusDisplay(status: string): string {
    switch (status) {
      case 'pending':
        return '⏳ 待機中';
      case 'in_progress':
        return '🚀 進行中';
      case 'completed':
        return '✅ 完了';
      case 'cancelled':
        return '❌ キャンセル';
      default:
        return '❓ 不明';
    }
  }

  /**
   * 優先度の表示文字列を取得
   */
  private getPriorityDisplay(priority: number): string {
    switch (priority) {
      case 1:
        return '🔴 高';
      case 0:
        return '🟡 普通';
      case -1:
        return '🟢 低';
      default:
        return '🟡 普通';
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
}