/**
 * ファクトリークラス群
 * 依存関係の生成と注入を担当
 */

import { Client, ClientOptions } from 'discord.js';
import * as cron from 'node-cron';
import express, { Application } from 'express';
import { toZonedTime, format } from 'date-fns-tz';

import {
  IClientFactory,
  ISchedulerService,
  IScheduledTask,
  ITimeProvider,
  IServerFactory,
  ILogger
} from '../interfaces/dependencies';

/**
 * Discord Clientファクトリー実装
 */
export class DiscordClientFactory implements IClientFactory {
  create(options: ClientOptions): Client {
    return new Client(options);
  }
}

/**
 * Cronスケジュールタスク実装
 */
class CronScheduledTask implements IScheduledTask {
  constructor(private task: cron.ScheduledTask) {}

  start(): void {
    this.task.start();
  }

  stop(): void {
    this.task.stop();
  }

}

/**
 * Cronスケジューラーサービス実装
 */
export class CronSchedulerService implements ISchedulerService {
  schedule(cronExpression: string, callback: () => void): IScheduledTask {
    const task = cron.schedule(cronExpression, callback, {
      scheduled: true, // 自動で開始
      timezone: 'UTC'
    });
    
    // 確実に開始するため明示的にstart()を呼び出し
    task.start();
    
    return new CronScheduledTask(task);
  }

  validate(cronExpression: string): boolean {
    return cron.validate(cronExpression);
  }
}

/**
 * 実時間プロバイダー実装
 */
export class RealTimeProvider implements ITimeProvider {
  now(): Date {
    return new Date();
  }

  format(date: Date, timezone: string): string {
    return format(date, 'yyyy-MM-dd HH:mm:ss', { timeZone: timezone });
  }

  getTodayString(timezone: string): string {
    const now = this.now();
    const zonedDate = this.toZonedTime(now, timezone);
    return format(zonedDate, 'yyyy-MM-dd', { timeZone: timezone });
  }

  toZonedTime(date: Date, timezone: string): Date {
    return toZonedTime(date, timezone);
  }
}

/**
 * テスト用時間プロバイダー実装
 * テスト時に任意の時間を設定可能
 * 時間進行機能付き
 */
export class MockTimeProvider implements ITimeProvider {
  private mockDate: Date = new Date();
  private progressionStartTime?: Date;
  private progressionStartRealTime?: Date;
  private progressionTimer?: NodeJS.Timeout;
  private isProgressing: boolean = false;

  constructor(initialDate?: Date) {
    if (initialDate) {
      this.mockDate = initialDate;
    }
  }

  now(): Date {
    if (this.isProgressing && this.progressionStartTime && this.progressionStartRealTime) {
      // 進行モード：開始時刻からの実経過時間を加算
      const realElapsed = Date.now() - this.progressionStartRealTime.getTime();
      return new Date(this.progressionStartTime.getTime() + realElapsed);
    } else {
      // 固定モード：設定された時刻をそのまま返す
      return new Date(this.mockDate);
    }
  }

  format(date: Date, timezone: string): string {
    return format(date, 'yyyy-MM-dd HH:mm:ss', { timeZone: timezone });
  }

  getTodayString(timezone: string): string {
    const zonedDate = this.toZonedTime(this.mockDate, timezone);
    return format(zonedDate, 'yyyy-MM-dd', { timeZone: timezone });
  }

  toZonedTime(date: Date, timezone: string): Date {
    return toZonedTime(date, timezone);
  }

  /**
   * モック時間を設定（テスト用）
   */
  setMockDate(date: Date): void {
    this.mockDate = date;
    
    // 進行モードの場合、新しい開始点として設定
    if (this.isProgressing) {
      this.progressionStartTime = new Date(date);
      this.progressionStartRealTime = new Date();
    }
  }

  /**
   * 時間を進める（テスト用・従来互換）
   */
  advanceTime(milliseconds: number): void {
    if (this.isProgressing) {
      // 進行モード中は進行開始時刻を調整
      if (this.progressionStartTime) {
        this.progressionStartTime = new Date(this.progressionStartTime.getTime() + milliseconds);
      }
    } else {
      // 固定モードでは従来通り
      this.mockDate = new Date(this.mockDate.getTime() + milliseconds);
    }
  }

  /**
   * 時間進行を開始
   */
  startTimeProgression(): void {
    if (!this.isProgressing) {
      this.progressionStartTime = new Date(this.mockDate);
      this.progressionStartRealTime = new Date();
      this.isProgressing = true;
      console.log(`⏰ MockTimeProvider: 時間進行開始 - ${this.progressionStartTime.toISOString()}`);
    }
  }

  /**
   * 時間進行を停止
   */
  stopTimeProgression(): void {
    if (this.isProgressing) {
      // 現在の進行時刻を固定時刻として保存
      this.mockDate = this.now();
      this.isProgressing = false;
      this.progressionStartTime = undefined;
      this.progressionStartRealTime = undefined;
      
      if (this.progressionTimer) {
        clearInterval(this.progressionTimer);
        this.progressionTimer = undefined;
      }
      
      console.log(`⏰ MockTimeProvider: 時間進行停止 - ${this.mockDate.toISOString()}`);
    }
  }

  /**
   * 進行状態を確認
   */
  isTimeProgressing(): boolean {
    return this.isProgressing;
  }
}

/**
 * Expressサーバーファクトリー実装
 */
export class ExpressServerFactory implements IServerFactory {
  create(): Application {
    return express();
  }
}

/**
 * コンソールロガー実装
 */
export class ConsoleLogger implements ILogger {
  private logLevel: string;

  constructor(logLevel: string = 'info') {
    this.logLevel = logLevel;
  }

  info(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('info')) {
      console.log(`[INFO] ${message}`, meta ? JSON.stringify(meta) : '');
    }
  }

  error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    if (this.shouldLog('error')) {
      console.error(`[ERROR] ${message}`, error?.stack || error?.message || '', meta ? JSON.stringify(meta) : '');
    }
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('warn')) {
      console.warn(`[WARN] ${message}`, meta ? JSON.stringify(meta) : '');
    }
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('debug')) {
      console.log(`[DEBUG] ${message}`, meta ? JSON.stringify(meta) : '');
    }
  }

  private shouldLog(level: string): boolean {
    const levels = ['error', 'warn', 'info', 'debug'];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    
    return messageLevelIndex <= currentLevelIndex;
  }
}

/**
 * テスト用ロガー実装
 * ログを記録してテストで検証可能
 */
export class MockLogger implements ILogger {
  public logs: Array<{ level: string; message: string; meta?: Record<string, unknown>; error?: Error }> = [];

  info(message: string, meta?: Record<string, unknown>): void {
    this.logs.push({ level: 'info', message, meta });
  }

  error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    this.logs.push({ level: 'error', message, error, meta });
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.logs.push({ level: 'warn', message, meta });
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.logs.push({ level: 'debug', message, meta });
  }

  /**
   * ログをクリア（テスト用）
   */
  clear(): void {
    this.logs = [];
  }

  /**
   * 特定レベルのログ数を取得（テスト用）
   */
  countLogs(level: string): number {
    return this.logs.filter(log => log.level === level).length;
  }
}

/**
 * ファクトリー作成用ヘルパー関数群
 */
export const createFactories = {
  /**
   * 本番用ファクトリーセットを作成
   */
  production: () => ({
    clientFactory: new DiscordClientFactory(),
    schedulerService: new CronSchedulerService(),
    timeProvider: new RealTimeProvider(),
    serverFactory: new ExpressServerFactory(),
    logger: new ConsoleLogger('info')
  }),

  /**
   * 開発用ファクトリーセットを作成
   */
  development: () => ({
    clientFactory: new DiscordClientFactory(),
    schedulerService: new CronSchedulerService(),
    timeProvider: new RealTimeProvider(),
    serverFactory: new ExpressServerFactory(),
    logger: new ConsoleLogger('debug')
  }),

  /**
   * テスト用ファクトリーセットを作成
   */
  test: (mockDate?: Date) => ({
    clientFactory: new DiscordClientFactory(),
    schedulerService: new CronSchedulerService(),
    timeProvider: new MockTimeProvider(mockDate),
    serverFactory: new ExpressServerFactory(),
    logger: new MockLogger()
  })
};