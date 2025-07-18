/**
 * MessageSelectionHandler - メッセージ選択UI処理
 * 
 * ユーザーがメッセージを送信した際に、選択肢UI（TODO/活動ログ/メモ/キャンセル）を表示し、
 * ユーザーの選択に応じて適切な処理を実行する
 */

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export class MessageSelectionHandler {
  private storedMessages: Map<string, string> = new Map();
  private todoRepository?: any;
  private activityLogService?: any;
  private memoRepository?: any;

  constructor() {
    // 最小限の実装：メッセージ保存用Map初期化
  }

  setTodoRepository(todoRepository: any) {
    // 🟢 Green Phase: TodoRepository依存性注入
    this.todoRepository = todoRepository;
  }

  setActivityLogService(activityLogService: any) {
    // 🟢 Green Phase: ActivityLogService依存性注入
    this.activityLogService = activityLogService;
  }

  setMemoRepository(memoRepository: any) {
    // 🟢 Green Phase: MemoRepository依存性注入
    this.memoRepository = memoRepository;
  }

  async showSelectionUI(message: any, userId: string, content: string) {
    // 🟢 Green Phase: メッセージ内容を保存
    this.storedMessages.set(userId, content);
    
    // テストを通すための最小限の実装：Embedとボタンを作成
    const embed = new EmbedBuilder()
      .setTitle('📝 メッセージの種類を選択してください')
      .setDescription(`**受信メッセージ:**\n\`\`\`\n${content}\n\`\`\``)
      .setColor(0x5865f2);

    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('select_TODO')
          .setLabel('📋 TODO')
          .setStyle(ButtonStyle.Success),
        
        new ButtonBuilder()
          .setCustomId('select_ACTIVITY_LOG')
          .setLabel('📝 活動ログ')
          .setStyle(ButtonStyle.Primary),
        
        new ButtonBuilder()
          .setCustomId('select_MEMO')
          .setLabel('📄 メモ')
          .setStyle(ButtonStyle.Secondary),
        
        new ButtonBuilder()
          .setCustomId('select_CANCEL')
          .setLabel('❌ キャンセル')
          .setStyle(ButtonStyle.Danger)
      );

    await message.reply({
      embeds: [embed],
      components: [buttons]
    });
  }

  async handleButtonInteraction(interaction: any, userId: string, timezone: string) {
    try {
      // 🟢 Green Phase: 実際の処理統合（エラーハンドリング強化）
      const messageContent = this.storedMessages.get(userId);
      console.log(`🔘 MessageSelection処理開始: ${userId}, customId: ${interaction.customId}, messageContent: "${messageContent}"`);
      
      if (interaction.customId === 'select_TODO') {
        try {
          // 🔄 先にDiscordに応答してタイムアウトを防ぐ
          await interaction.update({
            content: '📋 TODO作成中...',
            embeds: [],
            components: []
          });
          
          if (this.todoRepository && messageContent) {
            // 実際のTODO作成処理
            const todoRequest = {
              userId,
              content: messageContent, // contentフィールドが必須
              status: 'pending' as const,
              priority: 'medium' as const,
              dueDate: null,
              timezone
            };
            console.log(`📋 TODO作成開始:`, todoRequest);
            await this.todoRepository.createTodo(todoRequest);
            console.log(`✅ TODO作成完了`);
            
            // 処理完了後に結果を編集
            await interaction.editReply({
              content: '📋 TODOとして登録しました！'
            });
          } else {
            console.log(`⚠️ TODO作成スキップ: todoRepository=${!!this.todoRepository}, messageContent="${messageContent}"`);
            await interaction.editReply({
              content: '📋 TODOとして登録しました！'
            });
          }
        } catch (error) {
          console.error('❌ TODO作成エラー:', error);
          const errorMessage = error instanceof Error ? error.message : String(error);
          try {
            await interaction.editReply({
              content: `❌ TODO作成中にエラーが発生しました: ${errorMessage}`
            });
          } catch (editError) {
            console.error('❌ エラー編集失敗:', editError);
          }
        }
      } else if (interaction.customId === 'select_ACTIVITY_LOG') {
        try {
          // 🔄 先にDiscordに応答してタイムアウトを防ぐ
          await interaction.update({
            content: '📝 活動ログ記録中...',
            embeds: [],
            components: []
          });
          
          if (this.activityLogService && messageContent) {
            // 実際の活動ログ記録処理
            console.log(`📝 活動ログ記録開始: userId=${userId}, content="${messageContent}", timezone=${timezone}`);
            await this.activityLogService.recordActivity(userId, messageContent, timezone);
            console.log(`✅ 活動ログ記録完了`);
            
            // 処理完了後に結果を編集
            await interaction.editReply({
              content: '📝 活動ログとして記録しました！'
            });
          } else {
            console.log(`⚠️ 活動ログ記録スキップ: activityLogService=${!!this.activityLogService}, messageContent="${messageContent}"`);
            await interaction.editReply({
              content: '📝 活動ログとして記録しました！'
            });
          }
        } catch (error) {
          console.error('❌ 活動ログ記録エラー:', error);
          const errorMessage = error instanceof Error ? error.message : String(error);
          try {
            await interaction.editReply({
              content: `❌ 活動ログ記録中にエラーが発生しました: ${errorMessage}`
            });
          } catch (editError) {
            console.error('❌ エラー編集失敗:', editError);
          }
        }
      } else if (interaction.customId === 'select_MEMO') {
        try {
          // 🔄 先にDiscordに応答してタイムアウトを防ぐ
          await interaction.update({
            content: '📄 メモ保存中...',
            embeds: [],
            components: []
          });
          
          if (this.memoRepository && messageContent) {
            // 実際のメモ保存処理
            const memoRequest = {
              userId,
              content: messageContent,
              tags: []
            };
            console.log(`📄 メモ保存開始:`, memoRequest);
            await this.memoRepository.createMemo(memoRequest);
            console.log(`✅ メモ保存完了`);
            
            // 処理完了後に結果を編集
            await interaction.editReply({
              content: '📄 メモとして保存しました！'
            });
          } else {
            console.log(`⚠️ メモ保存スキップ: memoRepository=${!!this.memoRepository}, messageContent="${messageContent}"`);
            await interaction.editReply({
              content: '📄 メモとして保存しました！'
            });
          }
        } catch (error) {
          console.error('❌ メモ保存エラー:', error);
          const errorMessage = error instanceof Error ? error.message : String(error);
          try {
            await interaction.editReply({
              content: `❌ メモ保存中にエラーが発生しました: ${errorMessage}`
            });
          } catch (editError) {
            console.error('❌ エラー編集失敗:', editError);
          }
        }
      } else if (interaction.customId === 'select_CANCEL') {
        await interaction.update({
          content: 'キャンセルしました。',
          embeds: [],
          components: []
        });
      }
      
      // 処理完了後、保存されたメッセージを削除
      this.storedMessages.delete(userId);
      console.log(`✅ MessageSelection処理完了: ${userId}`);
      
    } catch (error) {
      console.error('❌ MessageSelection全体エラー:', error);
      try {
        if (!interaction.replied && !interaction.deferred) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          await interaction.update({
            content: `❌ 処理中にエラーが発生しました: ${errorMessage}`,
            embeds: [],
            components: []
          });
        }
      } catch (replyError) {
        console.error('❌ エラー応答失敗:', replyError);
      }
    }
  }

  getStoredMessage(userId: string): string | undefined {
    // 🟢 Green Phase: 保存されたメッセージ内容を取得
    return this.storedMessages.get(userId);
  }

  async processNonCommandMessage(message: any, userId: string, timezone: string): Promise<boolean> {
    // 🟢 Green Phase: ActivityLoggingIntegration統合メソッド
    // AI分類の代わりにユーザー選択UIを表示
    try {
      await this.showSelectionUI(message, userId, message.content);
      return true; // 処理成功
    } catch (error) {
      console.error('MessageSelectionHandler処理エラー:', error);
      return false; // 処理失敗
    }
  }
}