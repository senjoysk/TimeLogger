/**
 * 新サマリーコマンドハンドラー
 * 統合分析による日次サマリー生成
 */

import { Message } from 'discord.js';
import { toZonedTime, format } from 'date-fns-tz';
import { IUnifiedAnalysisService } from '../services/unifiedAnalysisService';
import { IActivityLogService } from '../services/activityLogService';
import {
  AnalysisRequest,
  DailyAnalysisResult,
  ActivityLogError
} from '../types/activityLog';

/**
 * サマリーコマンドの種類
 */
export type SummaryCommandType = 'today' | 'date' | 'help';

/**
 * サマリーコマンドの解析結果
 */
export interface ParsedSummaryCommand {
  type: SummaryCommandType;
  targetDate?: string;      // YYYY-MM-DD形式
  forceRefresh?: boolean;   // キャッシュを無視して再分析
  error?: string;           // パースエラーメッセージ
}

/**
 * 新サマリーハンドラーインターフェース
 */
export interface INewSummaryHandler {
  /**
   * サマリーコマンドを処理
   * @param message Discordメッセージ
   * @param userId ユーザーID
   * @param args コマンド引数
   * @param timezone ユーザーのタイムゾーン
   */
  handle(message: Message, userId: string, args: string[], timezone: string): Promise<void>;

  /**
   * コマンドの使用方法を表示
   * @param message Discordメッセージ
   */
  showHelp(message: Message): Promise<void>;
}

/**
 * NewSummaryHandlerの実装
 */
export class NewSummaryHandler implements INewSummaryHandler {
  constructor(
    private unifiedAnalysisService: IUnifiedAnalysisService,
    private activityLogService: IActivityLogService
  ) {}

  /**
   * サマリーコマンドを処理
   */
  async handle(message: Message, userId: string, args: string[], timezone: string): Promise<void> {
    try {
      console.log(`📊 サマリーコマンド処理開始: ${userId} ${args.join(' ')}`);

      // コマンドを解析
      const parsedCommand = this.parseSummaryCommand(args, timezone);

      if (parsedCommand.error) {
        await message.reply(`❌ ${parsedCommand.error}\n\n使用方法: \`!summary help\` でヘルプを確認してください。`);
        return;
      }

      // コマンドタイプ別に処理
      switch (parsedCommand.type) {
        case 'today':
        case 'date':
          await this.generateSummary(message, userId, parsedCommand, timezone);
          break;
        
        case 'help':
          await this.showHelp(message);
          break;
        
        default:
          await this.generateSummary(message, userId, { type: 'today' }, timezone);
      }
    } catch (error) {
      console.error('❌ サマリーコマンド処理エラー:', error);
      
      const errorMessage = error instanceof ActivityLogError 
        ? `❌ ${error.message}`
        : '❌ サマリー生成中にエラーが発生しました。';
        
      await message.reply(errorMessage);
    }
  }

  /**
   * サマリーを生成・表示
   */
  private async generateSummary(message: Message, userId: string, parsedCommand: ParsedSummaryCommand, timezone: string): Promise<void> {
    try {
      // 対象日を決定
      const targetDate = parsedCommand.targetDate || this.activityLogService.calculateBusinessDate(timezone).businessDate;

      // 進行状況メッセージを送信
      const progressMessage = await message.reply('🔄 分析中です。しばらくお待ちください...');

      // 分析リクエストを作成
      const analysisRequest: AnalysisRequest = {
        userId,
        businessDate: targetDate,
        timezone,
        forceRefresh: parsedCommand.forceRefresh || false
      };

      // 統合分析を実行
      const analysisResult = await this.unifiedAnalysisService.analyzeDaily(analysisRequest);

      // 結果をフォーマットして送信
      const formattedSummary = this.formatSummaryResult(analysisResult, timezone);
      
      await progressMessage.edit(formattedSummary);
      
      console.log(`📊 サマリー生成完了: ${userId} ${targetDate}`);
    } catch (error) {
      console.error('❌ サマリー生成エラー:', error);
      throw error instanceof ActivityLogError ? error :
        new ActivityLogError('サマリーの生成に失敗しました', 'GENERATE_SUMMARY_ERROR', { error });
    }
  }

  /**
   * 分析結果をDiscord用にフォーマット
   */
  private formatSummaryResult(result: DailyAnalysisResult, timezone: string): string {
    const sections: string[] = [];

    // ヘッダー
    const dateStr = this.formatBusinessDate(result.businessDate, timezone);
    sections.push(`📊 **${dateStr}の活動サマリー**`);
    sections.push(`📝 記録数: ${result.totalLogCount}件`);

    // 活動時間の概要
    if (result.timeDistribution.totalEstimatedMinutes > 0) {
      const totalHours = Math.floor(result.timeDistribution.totalEstimatedMinutes / 60);
      const totalMinutes = result.timeDistribution.totalEstimatedMinutes % 60;
      const timeText = totalHours > 0 ? `${totalHours}時間${totalMinutes}分` : `${totalMinutes}分`;
      
      sections.push(`⏱️ **総活動時間: ${timeText}**`);
      
      // 作業バランス
      if (result.insights.workBalance) {
        const balance = result.insights.workBalance;
        const focusPercent = Math.round(balance.focusTimeRatio * 100);
        const meetingPercent = Math.round(balance.meetingTimeRatio * 100);
        const breakPercent = Math.round(balance.breakTimeRatio * 100);
        
        sections.push(`📈 **作業バランス**`);
        sections.push(`🎯 集中作業: ${focusPercent}% | 🤝 会議: ${meetingPercent}% | ☕ 休憩: ${breakPercent}%`);
      }
    }

    // カテゴリ別時間集計
    if (result.categories.length > 0) {
      sections.push(`\n📂 **カテゴリ別時間集計**`);
      
      const sortedCategories = result.categories
        .sort((a, b) => b.estimatedMinutes - a.estimatedMinutes)
        .slice(0, 8); // 上位8カテゴリまで表示

      for (const category of sortedCategories) {
        const hours = Math.floor(category.estimatedMinutes / 60);
        const minutes = category.estimatedMinutes % 60;
        const timeText = hours > 0 ? `${hours}時間${minutes}分` : `${minutes}分`;
        
        const confidenceEmoji = this.getConfidenceEmoji(category.confidence);
        const subCategoryText = category.subCategory ? ` > ${category.subCategory}` : '';
        
        sections.push(`• **${category.category}${subCategoryText}**: ${timeText} ${confidenceEmoji}`);
        
        if (category.representativeActivities && category.representativeActivities.length > 0) {
          const activities = category.representativeActivities.slice(0, 2).join(', ');
          sections.push(`  └ ${activities}`);
        }
      }
    }

    // タイムライン（主要な活動のみ）
    if (result.timeline.length > 0) {
      sections.push(`\n⏰ **主要なタイムライン**`);
      
      const majorEvents = result.timeline
        .filter(event => event.confidence > 0.6 && 
          (new Date(event.endTime).getTime() - new Date(event.startTime).getTime()) >= 30 * 60 * 1000)
        .slice(0, 6); // 上位6イベント

      for (const event of majorEvents) {
        const startTime = new Date(event.startTime);
        const endTime = new Date(event.endTime);
        const startLocal = toZonedTime(startTime, timezone);
        const endLocal = toZonedTime(endTime, timezone);
        
        const startStr = format(startLocal, 'HH:mm', { timeZone: timezone });
        const endStr = format(endLocal, 'HH:mm', { timeZone: timezone });
        
        const confidenceEmoji = this.getConfidenceEmoji(event.confidence);
        
        sections.push(`${startStr}-${endStr}: **${event.category}** ${event.content} ${confidenceEmoji}`);
      }
    }

    // 警告・注意事項
    if (result.warnings.length > 0) {
      const importantWarnings = result.warnings.filter(w => w.severity !== 'low');
      
      if (importantWarnings.length > 0) {
        sections.push(`\n⚠️ **注意事項**`);
        
        for (const warning of importantWarnings.slice(0, 3)) {
          const severityEmoji = warning.severity === 'high' ? '🚨' : '⚠️';
          sections.push(`${severityEmoji} ${warning.message}`);
        }
      }
    }

    // 生産性スコアと洞察
    if (result.insights) {
      sections.push(`\n✨ **今日の振り返り**`);
      
      if (result.insights.productivityScore > 0) {
        const scoreEmoji = this.getProductivityEmoji(result.insights.productivityScore);
        sections.push(`${scoreEmoji} 生産性スコア: **${result.insights.productivityScore}**/100`);
      }

      if (result.insights.highlights && result.insights.highlights.length > 0) {
        sections.push(`🌟 **ハイライト**`);
        for (const highlight of result.insights.highlights.slice(0, 2)) {
          sections.push(`• ${highlight}`);
        }
      }

      if (result.insights.suggestions && result.insights.suggestions.length > 0) {
        sections.push(`💡 **改善提案**`);
        for (const suggestion of result.insights.suggestions.slice(0, 2)) {
          sections.push(`• ${suggestion}`);
        }
      }

      if (result.insights.motivation) {
        sections.push(`\n🎉 ${result.insights.motivation}`);
      }
    }

    // フッター情報
    const generatedTime = new Date(result.generatedAt);
    const generatedLocal = toZonedTime(generatedTime, timezone);
    const generatedStr = format(generatedLocal, 'HH:mm', { timeZone: timezone });
    
    sections.push(`\n🤖 ${generatedStr}に生成 | データ: ${result.totalLogCount}件のログ`);

    return sections.join('\n');
  }

  /**
   * 信頼度に基づく絵文字を取得
   */
  private getConfidenceEmoji(confidence: number): string {
    if (confidence >= 0.8) return '🎯'; // 高信頼度
    if (confidence >= 0.6) return '✅'; // 中信頼度
    if (confidence >= 0.4) return '📝'; // 低信頼度
    return '❓'; // 不明
  }

  /**
   * 生産性スコアに基づく絵文字を取得
   */
  private getProductivityEmoji(score: number): string {
    if (score >= 90) return '🚀'; // 非常に高い
    if (score >= 80) return '⭐'; // 高い
    if (score >= 70) return '👍'; // 良い
    if (score >= 60) return '📈'; // 普通
    if (score >= 50) return '📊'; // やや低い
    return '💤'; // 低い
  }

  /**
   * 業務日をユーザーフレンドリーにフォーマット
   */
  private formatBusinessDate(businessDate: string, timezone: string): string {
    try {
      const date = new Date(businessDate + 'T12:00:00');
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const businessDateOnly = businessDate;
      const todayStr = format(today, 'yyyy-MM-dd');
      const yesterdayStr = format(yesterday, 'yyyy-MM-dd');

      if (businessDateOnly === todayStr) {
        return '今日';
      } else if (businessDateOnly === yesterdayStr) {
        return '昨日';
      } else {
        const localDate = toZonedTime(date, timezone);
        return format(localDate, 'M月d日(E)', { timeZone: timezone });
      }
    } catch (error) {
      console.error('❌ 日付フォーマットエラー:', error);
      return businessDate;
    }
  }

  /**
   * コマンドの使用方法を表示
   */
  async showHelp(message: Message): Promise<void> {
    const helpMessage = `📊 **活動サマリーコマンド**

**基本的な使い方:**
\`!summary\` - 今日の活動サマリーを表示
\`!summary <日付>\` - 指定日のサマリーを表示
\`!summary refresh\` - キャッシュを無視して再分析

**使用例:**
\`!summary\` → 今日のサマリー
\`!summary 2025-06-27\` → 6月27日のサマリー
\`!summary yesterday\` → 昨日のサマリー
\`!summary refresh\` → 強制再分析

**日付指定方法:**
• \`YYYY-MM-DD\` 形式 (例: 2025-06-27)
• \`today\` または \`今日\`
• \`yesterday\` または \`昨日\`
• 相対指定: \`-1\` (1日前), \`-2\` (2日前)

**表示内容:**
📊 総活動時間・作業バランス
📂 カテゴリ別時間集計  
⏰ 主要なタイムライン
⚠️ 時間重複や未記録の警告
✨ 生産性スコアと改善提案

**注意事項:**
• 初回分析は時間がかかる場合があります
• ログが少ない場合は分析精度が低くなります
• 分析結果はキャッシュされ、高速表示されます`;

    await message.reply(helpMessage);
  }

  /**
   * サマリーコマンドを解析
   */
  private parseSummaryCommand(args: string[], timezone: string): ParsedSummaryCommand {
    // 引数がない場合は今日のサマリー
    if (args.length === 0) {
      return { type: 'today' };
    }

    const firstArg = args[0].toLowerCase();

    // ヘルプ表示
    if (firstArg === 'help' || firstArg === 'h' || firstArg === '?' || firstArg === 'ヘルプ') {
      return { type: 'help' };
    }

    // 強制リフレッシュ
    if (firstArg === 'refresh' || firstArg === 'reload' || firstArg === '更新') {
      return { type: 'today', forceRefresh: true };
    }

    // 今日
    if (firstArg === 'today' || firstArg === '今日') {
      return { type: 'today' };
    }

    // 昨日
    if (firstArg === 'yesterday' || firstArg === '昨日') {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const businessInfo = this.activityLogService.calculateBusinessDate(timezone, yesterday.toISOString());
      
      return { 
        type: 'date', 
        targetDate: businessInfo.businessDate 
      };
    }

    // 相対日付 (-1, -2 など)
    if (firstArg.match(/^-\d+$/)) {
      const daysBack = parseInt(firstArg.substring(1));
      if (daysBack > 0 && daysBack <= 30) {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() - daysBack);
        const businessInfo = this.activityLogService.calculateBusinessDate(timezone, targetDate.toISOString());
        
        return { 
          type: 'date', 
          targetDate: businessInfo.businessDate 
        };
      } else {
        return { 
          type: 'date', 
          error: '相対日付は1〜30日前まで指定できます。例: `-1`, `-7`' 
        };
      }
    }

    // 日付形式 (YYYY-MM-DD)
    if (firstArg.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const dateStr = firstArg;
      
      // 日付の妥当性チェック
      const date = new Date(dateStr + 'T12:00:00');
      if (isNaN(date.getTime())) {
        return { 
          type: 'date', 
          error: '無効な日付形式です。YYYY-MM-DD形式で入力してください。例: `2025-06-27`' 
        };
      }

      // 未来日チェック
      const today = new Date();
      if (date > today) {
        return { 
          type: 'date', 
          error: '未来の日付は指定できません。' 
        };
      }

      // 過去すぎる日付チェック（1年前まで）
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      if (date < oneYearAgo) {
        return { 
          type: 'date', 
          error: '1年以上前の日付は指定できません。' 
        };
      }

      return { 
        type: 'date', 
        targetDate: dateStr 
      };
    }

    // その他の形式
    return { 
      type: 'date', 
      error: `無効な日付指定です。使用できる形式:
• \`today\` / \`今日\`
• \`yesterday\` / \`昨日\`  
• \`YYYY-MM-DD\` (例: 2025-06-27)
• \`-数字\` (例: -1 は1日前)` 
    };
  }

  /**
   * サマリー生成の進行状況を表示
   */
  private async showProgress(message: Message, stage: string, current: number, total: number): Promise<void> {
    const progress = Math.round((current / total) * 100);
    const progressBar = '█'.repeat(Math.floor(progress / 10)) + '░'.repeat(10 - Math.floor(progress / 10));
    
    const progressText = `🔄 **分析中... ${progress}%**\n\`${progressBar}\`\n${stage}`;
    
    try {
      await message.edit(progressText);
    } catch (error) {
      // 編集に失敗した場合は無視（レート制限回避）
      console.warn('進行状況更新スキップ:', error);
    }
  }
}