/**
 * TODO関連のユーティリティ関数
 */

/**
 * 優先度の値を検証する
 * @param value - 検証する値（文字列）
 * @returns 有効な優先度値（1, 0, -1）またはnull（無効な場合）
 */
export function validatePriority(value: string): number | null {
  const parsed = parseInt(value, 10);
  
  // 数値でない場合
  if (isNaN(parsed)) {
    return null;
  }
  
  // 有効な値（1, 0, -1）のみ許可
  if (parsed === 1 || parsed === 0 || parsed === -1) {
    return parsed;
  }
  
  return null;
}

/**
 * 優先度の表示ラベルを取得
 * @param priority - 優先度値
 * @returns 表示用ラベル
 */
export function getPriorityLabel(priority: number): string {
  switch (priority) {
    case 1:
      return '高（🔴）';
    case 0:
      return '普通（🟡）';
    case -1:
      return '低（🟢）';
    default:
      return '不明';
  }
}