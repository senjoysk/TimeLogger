import { ILogger } from './logger';

/**
 * モック用のロガー実装
 * テスト時に使用
 */
export class MockLogger implements ILogger {
  debug = jest.fn();
  info = jest.fn();
  warn = jest.fn();
  error = jest.fn();
  success = jest.fn();
}

/**
 * ロガーのモックを作成
 * テストで使用
 */
export function createMockLogger(): MockLogger {
  return new MockLogger();
}