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