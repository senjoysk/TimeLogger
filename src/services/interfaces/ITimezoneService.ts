/**
 * タイムゾーンサービスインターフェース（Cookieベース）
 * Web管理画面用の表示タイムゾーン管理を抽象化
 */

export interface ITimezoneService {
  /**
   * ユーザーのタイムゾーンを取得
   * 優先順位: ユーザー設定 > システムデフォルト
   * @param userId ユーザーID
   * @returns タイムゾーン文字列（例: 'Asia/Tokyo'）
   */
  getUserTimezone(userId: string): Promise<string>;
  
  /**
   * システムデフォルトタイムゾーンを取得
   * @returns デフォルトタイムゾーン文字列
   */
  getSystemTimezone(): string;

  /**
   * Web管理画面表示用タイムゾーンを取得（Cookieベース）
   * 優先順位: Cookie設定 > 環境変数 > システムデフォルト
   * @param cookieTimezone Cookieで設定されたタイムゾーン（オプション）
   * @returns 表示用タイムゾーン文字列
   */
  getAdminDisplayTimezone(cookieTimezone?: string): string;

  /**
   * サポートされるタイムゾーン一覧を取得
   * @returns サポートタイムゾーンの配列
   */
  getSupportedTimezones(): string[];

  /**
   * タイムゾーンの妥当性を検証
   * @param timezone 検証するタイムゾーン文字列
   * @returns 有効性の真偽値
   */
  validateTimezone(timezone: string): boolean;
}