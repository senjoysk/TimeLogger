/**
 * AI判定結果表示用のEmbedコンポーネント
 * Discord.jsを使用してインタラクティブな判定結果を表示
 */

import { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ColorResolvable
} from 'discord.js';
import { ClassificationResult, MessageClassification } from '../types/todo';

/**
 * 分類結果表示用Embedの設定
 */
interface ClassificationEmbedOptions {
  originalMessage: string;
  result: ClassificationResult;
  userId: string;
  timestamp?: Date;
}

/**
 * AI判定結果を表示するEmbedを生成
 */
export function createClassificationResultEmbed(options: ClassificationEmbedOptions): EmbedBuilder {
  const { originalMessage, result, timestamp = new Date() } = options;
  
  // 分類に応じた色とアイコンを設定
  const colorConfig = getClassificationColor(result.classification);
  
  // 信頼度の表示形式
  const confidencePercent = Math.round(result.confidence * 100);
  const confidenceBar = createConfidenceBar(result.confidence);
  
  // 基本的なEmbed構造
  const embed = new EmbedBuilder()
    .setTitle(`${colorConfig.icon} AI分析結果`)
    .setDescription(`**元のメッセージ**\n> ${originalMessage.substring(0, 200)}${originalMessage.length > 200 ? '...' : ''}`)
    .setColor(colorConfig.color)
    .setTimestamp(timestamp)
    .setFooter({ 
      text: 'この判定が正しければ確認ボタンを、間違っていれば正しい分類ボタンを押してください' 
    });

  // 分類結果フィールド
  embed.addFields({
    name: '🤖 AI判定',
    value: `**${getClassificationLabel(result.classification)}**`,
    inline: true
  });

  // 信頼度フィールド
  embed.addFields({
    name: '📊 信頼度',
    value: `${confidencePercent}%\n${confidenceBar}`,
    inline: true
  });

  // 判定理由
  if (result.reason) {
    embed.addFields({
      name: '💭 判定理由',
      value: result.reason,
      inline: false
    });
  }

  // TODO固有の情報
  if (result.classification === 'TODO') {
    const todoInfo: string[] = [];
    
    if (result.priority !== undefined) {
      const priorityLabel = getPriorityLabel(result.priority);
      todoInfo.push(`**優先度**: ${priorityLabel}`);
    }
    
    if (result.dueDateSuggestion) {
      todoInfo.push(`**期日候補**: ${result.dueDateSuggestion}`);
    }
    
    if (result.suggestedAction) {
      todoInfo.push(`**推奨アクション**: ${result.suggestedAction}`);
    }

    if (todoInfo.length > 0) {
      embed.addFields({
        name: '📋 TODO詳細',
        value: todoInfo.join('\n'),
        inline: false
      });
    }
  }

  return embed;
}

/**
 * 分類確認用のボタンを生成
 */
export function createClassificationButtons(
  sessionId: string,
  suggestedClassification: MessageClassification
): ActionRowBuilder<ButtonBuilder> {
  
  const buttons = new ActionRowBuilder<ButtonBuilder>();
  
  // 確認ボタン（AI判定が正しい場合）
  buttons.addComponents(
    new ButtonBuilder()
      .setCustomId(`confirm_${suggestedClassification.toLowerCase()}_${sessionId}`)
      .setLabel(`✅ ${getClassificationLabel(suggestedClassification)}として登録`)
      .setStyle(getButtonStyle(suggestedClassification))
  );

  // 他の分類オプション
  const alternatives: MessageClassification[] = ['TODO', 'MEMO', 'UNCERTAIN'];
  const alternativeButtons = alternatives
    .filter(alt => alt !== suggestedClassification)
    .slice(0, 2) // 最大2つの代替案
    .map(alt => 
      new ButtonBuilder()
        .setCustomId(`classify_${alt.toLowerCase()}_${sessionId}`)
        .setLabel(`${getClassificationIcon(alt)} ${getClassificationLabel(alt)}`)
        .setStyle(ButtonStyle.Secondary)
    );

  buttons.addComponents(...alternativeButtons);

  // 無視ボタン
  buttons.addComponents(
    new ButtonBuilder()
      .setCustomId(`ignore_${sessionId}`)
      .setLabel('❌ 無視')
      .setStyle(ButtonStyle.Danger)
  );

  return buttons;
}

/**
 * TODO一覧表示用のEmbedを生成
 */
export function createTodoListEmbed(
  todos: Array<{
    id: string;
    content: string;
    status: string;
    priority: number;
    due_date?: string;
    created_at: string;
  }>,
  userId: string
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('📋 TODO一覧')
    .setColor(0x00ff00)
    .setTimestamp()
    .setFooter({ text: 'ボタンをクリックしてTODOを操作できます' });

  if (todos.length === 0) {
    embed.setDescription('現在登録されているTODOはありません。\n新しいメッセージを送信してTODOを作成しましょう！');
    return embed;
  }

  // TODO項目を表示（最大10件）
  const displayTodos = todos.slice(0, 10);
  
  const todoList = displayTodos.map((todo, index) => {
    const priorityIcon = getPriorityIcon(todo.priority);
    const statusIcon = getStatusIcon(todo.status);
    const dueDate = todo.due_date ? ` (期日: ${todo.due_date})` : '';
    const shortId = todo.id.substring(0, 8); // ID前8文字を表示
    
    return `${index + 1}. \`${shortId}\` ${statusIcon} ${priorityIcon} ${todo.content}${dueDate}`;
  }).join('\n');

  embed.setDescription(todoList);

  if (todos.length > 10) {
    embed.addFields({
      name: '⚠️ 表示制限',
      value: `${todos.length - 10}件の追加のTODOがあります。`,
      inline: false
    });
  }

  return embed;
}

/**
 * TODO操作用のボタンを生成
 */
export function createTodoActionButtons(
  todoId: string,
  status: string,
  index?: number
): ActionRowBuilder<ButtonBuilder> {
  
  const buttons = new ActionRowBuilder<ButtonBuilder>();
  
  // 番号プレフィックスを生成（index が指定されている場合）
  const numberPrefix = index !== undefined ? `${index + 1}.` : '';
  
  if (status === 'pending' || status === 'in_progress') {
    buttons.addComponents(
      new ButtonBuilder()
        .setCustomId(`todo_complete_${todoId}`)
        .setLabel(`${numberPrefix}✅ 完了`)
        .setStyle(ButtonStyle.Success)
    );
  }

  if (status === 'pending') {
    buttons.addComponents(
      new ButtonBuilder()
        .setCustomId(`todo_start_${todoId}`)
        .setLabel(`${numberPrefix}🚀 開始`)
        .setStyle(ButtonStyle.Primary)
    );
  }

  buttons.addComponents(
    new ButtonBuilder()
      .setCustomId(`todo_edit_${todoId}`)
      .setLabel(`${numberPrefix}✏️ 編集`)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`todo_delete_${todoId}`)
      .setLabel(`${numberPrefix}🗑️ 削除`)
      .setStyle(ButtonStyle.Danger)
  );

  return buttons;
}

// =============================================================================
// ユーティリティ関数
// =============================================================================

/**
 * 分類に応じた色とアイコンを取得
 */
function getClassificationColor(classification: MessageClassification): { color: ColorResolvable; icon: string } {
  switch (classification) {
    case 'TODO':
      return { color: 0x00ff00, icon: '📋' }; // 緑
    // ACTIVITY_LOG case removed
    case 'MEMO':
      return { color: 0xffaa00, icon: '📄' }; // オレンジ
    case 'UNCERTAIN':
      return { color: 0x888888, icon: '❓' }; // グレー
    default:
      return { color: 0x888888, icon: '❓' };
  }
}

/**
 * 分類のラベルを取得
 */
function getClassificationLabel(classification: MessageClassification): string {
  switch (classification) {
    case 'TODO':
      return 'TODO';
    // ACTIVITY_LOG case removed
    case 'MEMO':
      return 'メモ';
    case 'UNCERTAIN':
      return '不明確';
    default:
      return '不明確';
  }
}

/**
 * 分類のアイコンを取得
 */
function getClassificationIcon(classification: MessageClassification): string {
  const config = getClassificationColor(classification);
  return config.icon;
}

/**
 * ボタンスタイルを取得
 */
function getButtonStyle(classification: MessageClassification): ButtonStyle {
  switch (classification) {
    case 'TODO':
      return ButtonStyle.Success;
    // ACTIVITY_LOG case removed
    case 'MEMO':
      return ButtonStyle.Secondary;
    case 'UNCERTAIN':
      return ButtonStyle.Secondary;
    default:
      return ButtonStyle.Secondary;
  }
}

/**
 * 信頼度バーを生成
 */
function createConfidenceBar(confidence: number): string {
  const length = 10;
  const filled = Math.round(confidence * length);
  const empty = length - filled;
  
  return '█'.repeat(filled) + '░'.repeat(empty);
}

/**
 * 優先度のラベルを取得
 */
function getPriorityLabel(priority: number): string {
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
 * 優先度のアイコンを取得
 */
function getPriorityIcon(priority: number): string {
  switch (priority) {
    case 1:
      return '🔴';
    case 0:
      return '🟡';
    case -1:
      return '🟢';
    default:
      return '🟡';
  }
}

/**
 * ステータスのアイコンを取得
 */
function getStatusIcon(status: string): string {
  switch (status) {
    case 'pending':
      return '⏳';
    case 'in_progress':
      return '🚀';
    case 'completed':
      return '✅';
    case 'cancelled':
      return '❌';
    default:
      return '❓';
  }
}

/**
 * ページネーション対応のTODO一覧Embedを生成
 */
export function createPaginatedEmbed(
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
  const embed = new EmbedBuilder()
    .setTitle(`📋 TODO一覧 (${(currentPage - 1) * 10 + 1}-${(currentPage - 1) * 10 + todos.length}/${totalCount}件) ページ ${currentPage}/${totalPages}`)
    .setColor(0x00ff00)
    .setTimestamp()
    .setFooter({ text: 'ボタンをクリックしてTODOを操作できます' });

  if (todos.length === 0) {
    embed.setDescription('現在のページにTODOはありません。');
    return embed;
  }

  // TODO項目を表示
  const todoList = todos.map((todo, index) => {
    const priorityIcon = getPriorityIcon(todo.priority);
    const statusIcon = getStatusIcon(todo.status);
    const dueDate = todo.due_date ? ` (期日: ${todo.due_date})` : '';
    const shortId = todo.id.substring(0, 8);
    const itemNumber = (currentPage - 1) * 10 + index + 1;
    
    return `${itemNumber}. \`${shortId}\` ${statusIcon} ${priorityIcon} ${todo.content}${dueDate}`;
  }).join('\n');

  embed.setDescription(todoList);
  return embed;
}

/**
 * セッションIDを生成
 * 注意: セッションIDには区切り文字（_）を含めないようにする
 */
export function generateSessionId(userId: string, timestamp: Date = new Date()): string {
  // タイムスタンプとランダム文字列を組み合わせた一意のIDを生成
  // 区切り文字を使わずに連結する
  const timeStr = timestamp.getTime().toString(36); // 36進数で短縮
  const randomStr = Math.random().toString(36).substring(2, 8);
  // userIdのハッシュ値を取得（簡易実装）
  const userHash = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0).toString(36);
  return `${userHash}${timeStr}${randomStr}`;
}