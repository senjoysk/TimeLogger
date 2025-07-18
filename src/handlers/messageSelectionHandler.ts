/**
 * MessageSelectionHandler - メッセージ選択UI処理
 * 
 * ユーザーがメッセージを送信した際に、選択肢UI（TODO/活動ログ/メモ/キャンセル）を表示し、
 * ユーザーの選択に応じて適切な処理を実行する
 */

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export class MessageSelectionHandler {
  private storedMessages: Map<string, string> = new Map();

  constructor() {
    // 最小限の実装：メッセージ保存用Map初期化
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
    // 🟢 Green Phase: 全ボタン選択の最小限実装
    if (interaction.customId === 'select_TODO') {
      await interaction.update({
        content: '📋 TODOとして登録しました！',
        embeds: [],
        components: []
      });
    } else if (interaction.customId === 'select_ACTIVITY_LOG') {
      await interaction.update({
        content: '📝 活動ログとして記録しました！',
        embeds: [],
        components: []
      });
    } else if (interaction.customId === 'select_MEMO') {
      await interaction.update({
        content: '📄 メモとして保存しました！',
        embeds: [],
        components: []
      });
    } else if (interaction.customId === 'select_CANCEL') {
      await interaction.update({
        content: 'キャンセルしました。',
        embeds: [],
        components: []
      });
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