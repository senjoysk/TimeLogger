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
      scheduled: false // 手動で開始
    });
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
 */
export class MockTimeProvider implements ITimeProvider {
  private mockDate: Date = new Date();

  constructor(initialDate?: Date) {
    if (initialDate) {
      this.mockDate = initialDate;
    }
  }

  now(): Date {
    return new Date(this.mockDate);
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
  }

  /**
   * 時間を進める（テスト用）
   */
  advanceTime(milliseconds: number): void {
    this.mockDate = new Date(this.mockDate.getTime() + milliseconds);
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

  info(message: string, meta?: any): void {
    if (this.shouldLog('info')) {
      console.log(`[INFO] ${message}`, meta ? JSON.stringify(meta) : '');
    }
  }

  error(message: string, error?: Error, meta?: any): void {
    if (this.shouldLog('error')) {
      console.error(`[ERROR] ${message}`, error?.stack || error?.message || '', meta ? JSON.stringify(meta) : '');
    }
  }

  warn(message: string, meta?: any): void {
    if (this.shouldLog('warn')) {
      console.warn(`[WARN] ${message}`, meta ? JSON.stringify(meta) : '');
    }
  }

  debug(message: string, meta?: any): void {
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
  public logs: Array<{ level: string; message: string; meta?: any; error?: Error }> = [];

  info(message: string, meta?: any): void {
    this.logs.push({ level: 'info', message, meta });
  }

  error(message: string, error?: Error, meta?: any): void {
    this.logs.push({ level: 'error', message, error, meta });
  }

  warn(message: string, meta?: any): void {
    this.logs.push({ level: 'warn', message, meta });
  }

  debug(message: string, meta?: any): void {
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