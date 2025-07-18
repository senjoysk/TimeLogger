/**
 * MessageSelectionHandler - メッセージ選択UI処理
 * 
 * ユーザーがメッセージを送信した際に、選択肢UI（TODO/活動ログ/メモ/キャンセル）を表示し、
 * ユーザーの選択に応じて適切な処理を実行する
 */

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export class MessageSelectionHandler {
  constructor() {
    // 最小限の実装：何もしない
  }

  async showSelectionUI(message: any, userId: string, content: string) {
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
}