/**
 * 依存性注入用インターフェース定義
 * テスト可能性向上のための抽象化レイヤー
 */

import { Client, ClientOptions, Message } from 'discord.js';
import { Application } from 'express';

/**
 * Discord Bot インターフェース
 * Botの基本機能を抽象化
 */
export interface IDiscordBot {
  /**
   * プロンプトコマンドを処理
   * @param message Discordメッセージ
   * @param args コマンド引数
   * @param userId ユーザーID
   * @param timezone タイムゾーン
   */
  handlePromptCommand?(message: Message, args: string[], userId: string, timezone: string): Promise<void>;

  /**
   * ユーザーにメッセージを送信
   * @param userId ユーザーID
   * @param content メッセージ内容
   */
  sendMessageToUser?(userId: string, content: string): Promise<void>;

  /**
   * Botが初期化済みかどうか
   */
  isReady?(): boolean;

  /**
   * Bot設定の取得
   */
  getConfig?(): any;

  // TaskLoggerBot互換性のため追加
  [key: string]: any;
}

/**
 * Discord Clientファクトリーインターフェース
 * Discord APIクライアントの生成を抽象化
 */
export interface IClientFactory {
  /**
   * Discord Clientを生成
   * @param options Discord Client設定オプション
   * @returns Discord Clientインスタンス
   */
  create(options: ClientOptions): Client;
}

/**
 * スケジュールタスクインターフェース
 * Cronジョブの操作を抽象化
 */
export interface IScheduledTask {
  /**
   * スケジュールタスクを開始
   */
  start(): void;

  /**
   * スケジュールタスクを停止
   */
  stop(): void;

}

/**
 * スケジューラーサービスインターフェース
 * Cronスケジューリング機能を抽象化
 */
export interface ISchedulerService {
  /**
   * Cronスケジュールを作成
   * @param cronExpression Cron式
   * @param callback 実行するコールバック関数
   * @returns スケジュールタスクインスタンス
   */
  schedule(cronExpression: string, callback: () => void): IScheduledTask;

  /**
   * Cron式が有効かを検証
   * @param cronExpression 検証するCron式
   * @returns 有効性の真偽値
   */
  validate(cronExpression: string): boolean;
}

/**
 * 時間プロバイダーインターフェース
 * 時間・日付処理を抽象化（テスト時の時間制御に使用）
 */
export interface ITimeProvider {
  /**
   * 現在時刻を取得
   * @returns 現在のDate オブジェクト
   */
  now(): Date;

  /**
   * 指定タイムゾーンでの日時フォーマット
   * @param date フォーマットする日時
   * @param timezone タイムゾーン（例: 'Asia/Tokyo'）
   * @returns フォーマットされた日時文字列
   */
  format(date: Date, timezone: string): string;

  /**
   * 指定タイムゾーンでの今日の日付を取得
   * @param timezone タイムゾーン
   * @returns YYYY-MM-DD形式の日付文字列
   */
  getTodayString(timezone: string): string;

  /**
   * タイムゾーンを考慮した日時変換
   * @param date 変換する日時
   * @param timezone 変換先タイムゾーン
   * @returns 変換された日時
   */
  toZonedTime(date: Date, timezone: string): Date;
}

/**
 * HTTPサーバーファクトリーインターフェース
 * Expressアプリケーションの生成を抽象化
 */
export interface IServerFactory {
  /**
   * Expressアプリケーションを生成
   * @returns Expressアプリケーションインスタンス
   */
  create(): Application;
}

/**
 * ロガーインターフェース
 * ログ出力の抽象化
 */
export interface ILogger {
  /**
   * 情報ログ出力
   * @param message ログメッセージ
   * @param meta 追加のメタデータ
   */
  info(message: string, meta?: any): void;

  /**
   * エラーログ出力
   * @param message エラーメッセージ
   * @param error エラーオブジェクト
   * @param meta 追加のメタデータ
   */
  error(message: string, error?: Error, meta?: any): void;

  /**
   * 警告ログ出力
   * @param message 警告メッセージ
   * @param meta 追加のメタデータ
   */
  warn(message: string, meta?: any): void;

  /**
   * デバッグログ出力
   * @param message デバッグメッセージ
   * @param meta 追加のメタデータ
   */
  debug(message: string, meta?: any): void;
}

/**
 * 設定サービスインターフェース
 * アプリケーション設定の抽象化
 */
export interface IConfigService {
  /**
   * Discord Bot トークンを取得
   * @returns Botトークン
   */
  getDiscordToken(): string;

  /**
   * Gemini APIキーを取得
   * @returns APIキー
   */
  getGeminiApiKey(): string;

  /**
   * データベースパスを取得
   * @returns データベースファイルパス
   */
  getDatabasePath(): string;

  /**
   * デバッグモードの設定を取得
   * @returns デバッグモードの有効/無効
   */
  isDebugMode(): boolean;

  /**
   * デフォルトタイムゾーンを取得
   * @returns デフォルトタイムゾーン
   */
  getDefaultTimezone(): string;

  /**
   * HTTPサーバーポート番号を取得
   * @returns ポート番号
   */
  getServerPort(): number;

  /**
   * 設定値を検証
   * @returns 設定が有効かどうか
   */
  validate(): boolean;

  /**
   * 設定値を型安全に取得（ジェネリック版）
   * @param key 設定キー
   * @returns 設定値
   */
  get<T = unknown>(key: string): T | undefined;

  /**
   * 設定値を型安全に取得（オーバーロード版）
   */
  get(key: 'discordToken' | 'geminiApiKey' | 'databasePath' | 'environment' | 'logLevel' | 'defaultTimezone'): string;
  get(key: 'debugMode'): boolean;
  get(key: 'serverPort'): number;
  get(key: string): unknown;
}

/**
 * 依存性注入コンテナインターフェース
 * 依存関係の管理と注入を抽象化
 */
export interface IDependencyContainer {
  /**
   * 依存関係を登録
   * @param identifier 識別子
   * @param implementation 実装クラス/インスタンス
   */
  register<T>(identifier: symbol | string, implementation: T): void;

  /**
   * 依存関係を解決
   * @param identifier 識別子
   * @returns 登録された実装
   */
  resolve<T>(identifier: symbol | string): T;

  /**
   * シングルトンとして依存関係を登録
   * @param identifier 識別子
   * @param implementation 実装クラス/インスタンス
   */
  registerSingleton<T>(identifier: symbol | string, implementation: T): void;
}