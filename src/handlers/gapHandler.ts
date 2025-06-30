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
import { IGapDetectionService } from '../services/gapDetectionService';
import { IActivityLogService } from '../services/activityLogService';
import { IUnifiedAnalysisService } from '../services/unifiedAnalysisService';

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
  // ボタンのカスタムID接頭辞
  private readonly BUTTON_PREFIX = 'gap_record_';
  
  // モーダルのカスタムID接頭辞
  private readonly MODAL_PREFIX = 'gap_modal_';

  constructor(
    private gapDetectionService: IGapDetectionService,
    private activityLogService: IActivityLogService,
    private unifiedAnalysisService: IUnifiedAnalysisService
  ) {}

  /**
   * ギャップ検出コマンドを処理
   */
  async handle(message: Message, userId: string, _args: string[], timezone: string): Promise<void> {
    try {
      console.log(`🔍 ギャップ検出開始: ${userId}`);

      // 今日の業務日を計算
      const businessInfo = this.activityLogService.calculateBusinessDate(timezone);
      const businessDate = businessInfo.businessDate;

      // 進行状況メッセージを送信
      const progressMessage = await message.reply('🔍 ギャップを検出中です...');

      // 分析結果を取得してギャップ検出を実行
      console.log(`📊 分析結果を取得中... (userId: ${userId}, businessDate: ${businessDate}, timezone: ${timezone})`);
      const analysisResult = await this.unifiedAnalysisService.analyzeDaily({
        userId,
        businessDate,
        timezone,
        forceRefresh: false // キャッシュを活用
      });

      console.log(`📊 分析結果取得完了: ${analysisResult.timeline.length}個のタイムライン`);
      const gaps = await this.gapDetectionService.detectGapsFromAnalysis(analysisResult, timezone);
      console.log(`✅ 分析結果ベースでギャップ検出完了: ${gaps.length}件`);

      if (gaps.length === 0) {
        // ギャップがない場合
        await progressMessage.edit('✅ 7:30〜18:30の間に15分以上の記録の空白はありませんでした。');
        return;
      }

      // ギャップがある場合、Embedで表示
      const embed = this.createGapEmbed(gaps, businessDate, timezone);
      const components = this.createGapButtons(gaps);

      await progressMessage.edit({
        content: '',
        embeds: [embed],
        components
      });

      // ボタンインタラクションのリスナーを設定
      this.setupInteractionListeners(progressMessage, userId, timezone, gaps);

      console.log(`🔍 ギャップ検出完了: ${gaps.length}件のギャップを検出`);
    } catch (error) {
      console.error('❌ ギャップ検出エラー:', error);
      const errorMessage = `❌ ギャップの検出中にエラーが発生しました\n\nエラー詳細: ${error instanceof Error ? error.message : String(error)}`;
      await message.reply(errorMessage);
    }
  }

  /**
   * ギャップ表示用のEmbedを作成
   */
  private createGapEmbed(gaps: any[], businessDate: string, _timezone: string): EmbedBuilder {
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
  private createGapButtons(gaps: any[]): ActionRowBuilder<ButtonBuilder>[] {
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    let currentRow = new ActionRowBuilder<ButtonBuilder>();
    let buttonCount = 0;

    gaps.forEach((gap, index) => {
      // ボタンのラベルを作成
      const label = `${gap.startTimeLocal} 〜 ${gap.endTimeLocal}`;
      
      // ボタンを作成
      const button = new ButtonBuilder()
        .setCustomId(`${this.BUTTON_PREFIX}${index}`)
        .setLabel(label)
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📝');

      currentRow.addComponents(button);
      buttonCount++;

      // 1行に最大5個のボタン
      if (buttonCount === 5) {
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
    gaps: any[]
  ): void {
    // 5分間のタイムアウト
    const collector = message.createMessageComponentCollector({
      time: 300000 // 5分
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

      // ボタンクリックの処理
      if (interaction.isButton() && interaction.customId.startsWith(this.BUTTON_PREFIX)) {
        await this.handleButtonClick(interaction as ButtonInteraction, gaps, timezone);
      }
    });

    collector.on('end', () => {
      // タイムアウト時はボタンを無効化
      const disabledComponents = message.components.map((row: any) => {
        const newRow = new ActionRowBuilder<ButtonBuilder>();
        if (row.components) {
          row.components.forEach((component: any) => {
            if (component.type === 2) { // ButtonComponent
              const button = ButtonBuilder.from(component).setDisabled(true);
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
    gaps: any[],
    timezone: string
  ): Promise<void> {
    // ギャップのインデックスを取得
    const gapIndex = parseInt(interaction.customId.replace(this.BUTTON_PREFIX, ''));
    const gap = gaps[gapIndex];

    if (!gap) {
      await interaction.reply({
        content: '❌ 無効なギャップです。',
        ephemeral: true
      });
      return;
    }

    // モーダルを作成
    const modal = this.createActivityModal(gap, gapIndex);
    
    // モーダルを表示
    await interaction.showModal(modal);

    // モーダル送信を待機
    try {
      const modalSubmit = await interaction.awaitModalSubmit({
        time: 300000, // 5分
        filter: (i) => i.customId === `${this.MODAL_PREFIX}${gapIndex}`
      });

      await this.handleModalSubmit(modalSubmit, gap, timezone);
    } catch (error) {
      // タイムアウトした場合は何もしない
      console.log('モーダルがタイムアウトしました');
    }
  }

  /**
   * 活動入力モーダルを作成
   */
  private createActivityModal(gap: any, index: number): ModalBuilder {
    const modal = new ModalBuilder()
      .setCustomId(`${this.MODAL_PREFIX}${index}`)
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
    gap: any,
    timezone: string
  ): Promise<void> {
    try {
      // 入力された活動内容を取得
      const activityContent = interaction.fields.getTextInputValue('activity_content');

      // ギャップの開始時刻を使用してログを記録
      const startTime = new Date(gap.startTime);
      const log = await this.activityLogService.recordActivity(
        interaction.user.id,
        activityContent,
        timezone,
        startTime.toISOString()
      );

      // 成功メッセージを送信
      await interaction.reply({
        content: `✅ ${gap.startTimeLocal} 〜 ${gap.endTimeLocal} の活動を記録しました:\n> ${activityContent}`,
        ephemeral: true
      });

      console.log(`📝 ギャップ活動を記録: ${log.id}`);
    } catch (error) {
      console.error('❌ 活動記録エラー:', error);
      await interaction.reply({
        content: '❌ 活動の記録中にエラーが発生しました。',
        ephemeral: true
      });
    }
  }
}