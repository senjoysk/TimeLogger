/**
 * ギャップ検出コマンドハンドラー
 * 活動記録がない時間帯を検出して記録を促す
 */

import { 
  Message, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonInteraction,
  ModalSubmitInteraction,
  MessageComponentInteraction
} from 'discord.js';
import { IGapDetectionService, TimeGap } from '../services/gapDetectionService';
import { IActivityLogService } from '../services/activityLogService';

/**
 * ギャップハンドラーインターフェース
 */
export interface IGapHandler {
  /**
   * ギャップ検出コマンドを処理
   * @param message Discordメッセージ
   * @param userId ユーザーID
   * @param args コマンド引数
   * @param timezone ユーザーのタイムゾーン
   */
  handle(message: Message, userId: string, args: string[], timezone: string): Promise<void>;
}

/**
 * ギャップハンドラーの実装
 */
export class GapHandler implements IGapHandler {
  // 定数定義
  private static readonly BUTTON_PREFIX = 'gap_record_';
  private static readonly MODAL_PREFIX = 'gap_modal_';
  private static readonly INTERACTION_TIMEOUT = 300000; // 5分
  private static readonly MAX_BUTTONS_PER_ROW = 5;

  constructor(
    private gapDetectionService: IGapDetectionService,
    private activityLogService: IActivityLogService
  ) {}

  /**
   * ギャップ検出コマンドを処理
   */
  async handle(message: Message, userId: string, _args: string[], timezone: string): Promise<void> {
    try {
      const businessInfo = this.activityLogService.calculateBusinessDate(timezone);
      const businessDate = businessInfo.businessDate;

      // シンプルサマリーではギャップ機能を一時的に無効化
      await message.reply('🚧 シンプルサマリーではギャップ機能は使用できません。');
      return;

    } catch (error) {
      console.error('❌ ギャップ検出エラー:', error);
      const errorMessage = `❌ ギャップの検出中にエラーが発生しました\n\nエラー詳細: ${error instanceof Error ? error.message : String(error)}`;
      await message.reply(errorMessage);
    }
  }

  /**
   * ギャップ表示用のEmbedを作成
   */
  private createGapEmbed(gaps: TimeGap[], businessDate: string): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle('📋 未登録の時間帯')
      .setDescription('以下の時間帯の活動記録がありません。')
      .setColor(0xFF9800) // オレンジ色
      .setTimestamp();

    // 各ギャップを表示
    gaps.forEach((gap, index) => {
      const duration = gap.durationMinutes;
      const hours = Math.floor(duration / 60);
      const minutes = duration % 60;
      const durationText = hours > 0 ? `${hours}時間${minutes}分` : `${minutes}分`;

      embed.addFields({
        name: `${index + 1}. ${gap.startTimeLocal} 〜 ${gap.endTimeLocal}`,
        value: `⏱️ ${durationText}の空白`,
        inline: false
      });
    });

    embed.setFooter({ text: `${businessDate} の活動記録 • ボタンをクリックして記録を追加` });

    return embed;
  }

  /**
   * ギャップ記録用のボタンを作成
   */
  private createGapButtons(gaps: TimeGap[]): ActionRowBuilder<ButtonBuilder>[] {
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    let currentRow = new ActionRowBuilder<ButtonBuilder>();
    let buttonCount = 0;

    gaps.forEach((gap, index) => {
      const label = `${gap.startTimeLocal} 〜 ${gap.endTimeLocal}`;
      
      const button = new ButtonBuilder()
        .setCustomId(`${GapHandler.BUTTON_PREFIX}${index}`)
        .setLabel(label)
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📝');

      currentRow.addComponents(button);
      buttonCount++;

      if (buttonCount === GapHandler.MAX_BUTTONS_PER_ROW) {
        rows.push(currentRow);
        currentRow = new ActionRowBuilder<ButtonBuilder>();
        buttonCount = 0;
      }
    });

    // 最後の行を追加
    if (buttonCount > 0) {
      rows.push(currentRow);
    }

    return rows;
  }

  /**
   * インタラクションリスナーを設定
   */
  private setupInteractionListeners(
    message: Message, 
    userId: string, 
    timezone: string,
    gaps: TimeGap[]
  ): void {
    const collector = message.createMessageComponentCollector({
      time: GapHandler.INTERACTION_TIMEOUT
    });

    collector.on('collect', async (interaction: MessageComponentInteraction) => {
      // 同じユーザーからのインタラクションのみ処理
      if (interaction.user.id !== userId) {
        await interaction.reply({
          content: '❌ このボタンは他のユーザーのものです。',
          ephemeral: true
        });
        return;
      }

      if (interaction.isButton() && interaction.customId.startsWith(GapHandler.BUTTON_PREFIX)) {
        await this.handleButtonClick(interaction as ButtonInteraction, gaps, timezone);
      }
    });

    collector.on('end', () => {
      // タイムアウト時はボタンを無効化
      const disabledComponents = message.components.map((row) => {
        const newRow = new ActionRowBuilder<ButtonBuilder>();
        if ('components' in row && Array.isArray(row.components)) {
          row.components.forEach((component) => {
            if ('type' in component && component.type === 2) { // ButtonComponent
              const button = ButtonBuilder.from(component as any).setDisabled(true);
              newRow.addComponents(button);
            }
          });
        }
        return newRow;
      });

      message.edit({ components: disabledComponents }).catch(console.error);
    });
  }

  /**
   * ボタンクリックを処理
   */
  private async handleButtonClick(
    interaction: ButtonInteraction, 
    gaps: TimeGap[],
    timezone: string
  ): Promise<void> {
    const gapIndex = parseInt(interaction.customId.replace(GapHandler.BUTTON_PREFIX, ''));
    const gap = gaps[gapIndex];

    if (!gap) {
      await interaction.reply({
        content: '❌ 無効なギャップです。',
        ephemeral: true
      });
      return;
    }

    const modal = this.createActivityModal(gap, gapIndex);
    
    await interaction.showModal(modal);

    try {
      const modalSubmit = await interaction.awaitModalSubmit({
        time: GapHandler.INTERACTION_TIMEOUT,
        filter: (i) => i.customId === `${GapHandler.MODAL_PREFIX}${gapIndex}`
      });

      await this.handleModalSubmit(modalSubmit, gap, timezone);
    } catch (error) {
      // タイムアウト時は何もしない
    }
  }

  /**
   * 活動入力モーダルを作成
   */
  private createActivityModal(gap: TimeGap, index: number): ModalBuilder {
    const modal = new ModalBuilder()
      .setCustomId(`${GapHandler.MODAL_PREFIX}${index}`)
      .setTitle('活動内容を入力');

    // 時間帯を表示
    const timeRangeInput = new TextInputBuilder()
      .setCustomId('time_range')
      .setLabel('時間帯')
      .setStyle(TextInputStyle.Short)
      .setValue(`${gap.startTimeLocal} 〜 ${gap.endTimeLocal}`)
      .setRequired(false)
      .setPlaceholder('この時間帯の活動を記録します');

    // 活動内容入力欄
    const activityInput = new TextInputBuilder()
      .setCustomId('activity_content')
      .setLabel('何をしていましたか？')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('例: メール対応\n例: A社との打ち合わせ\n例: 資料作成')
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(1000);

    // モーダルに入力欄を追加
    const firstRow = new ActionRowBuilder<TextInputBuilder>().addComponents(timeRangeInput);
    const secondRow = new ActionRowBuilder<TextInputBuilder>().addComponents(activityInput);

    modal.addComponents(firstRow, secondRow);

    return modal;
  }

  /**
   * モーダル送信を処理
   */
  private async handleModalSubmit(
    interaction: ModalSubmitInteraction,
    gap: TimeGap,
    timezone: string
  ): Promise<void> {
    try {
      const activityContent = interaction.fields.getTextInputValue('activity_content');

      const startTime = new Date(gap.startTime);
      await this.activityLogService.recordActivity(
        interaction.user.id,
        activityContent,
        timezone,
        startTime.toISOString()
      );

      await interaction.reply({
        content: `✅ ${gap.startTimeLocal} 〜 ${gap.endTimeLocal} の活動を記録しました:\n> ${activityContent}`,
        ephemeral: true
      });
    } catch (error) {
      await interaction.reply({
        content: '❌ 活動の記録中にエラーが発生しました。',
        ephemeral: true
      });
    }
  }
}