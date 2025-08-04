/**
 * SecurityService実装
 * セキュリティ管理サービス
 */

import { AdminEnvironment, AdminSecurityError } from '../types/admin';

export interface ISecurityService {
  getEnvironment(): AdminEnvironment;
  validateOperation(operation: string): boolean;
  validateTableName(tableName: string): boolean;
  validateAuth(username: string, password: string): boolean;
  sanitizeInput(input: string): string;
}

export class SecurityService implements ISecurityService {
  private readonly ALLOWED_TABLES = [
    'activity_logs',
    'user_settings',
    'daily_analysis_cache',
    'todo_tasks',
    'message_classifications'
  ];

  /**
   * 環境情報を取得
   */
  getEnvironment(): AdminEnvironment {
    const env = (process.env.NODE_ENV as 'development' | 'staging' | 'production') || 'development';
    const isReadOnly = env === 'production';
    
    const allowedOperations = ['read'];
    if (!isReadOnly) {
      allowedOperations.push('write');
    }

    return {
      env,
      isReadOnly,
      allowedOperations
    };
  }

  /**
   * 操作の許可チェック
   */
  validateOperation(operation: string): boolean {
    const environment = this.getEnvironment();
    return environment.allowedOperations.includes(operation);
  }

  /**
   * テーブル名の妥当性チェック
   */
  validateTableName(tableName: string): boolean {
    return this.ALLOWED_TABLES.includes(tableName);
  }

  /**
   * 認証情報の妥当性チェック
   */
  validateAuth(username: string, password: string): boolean {
    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminUsername || !adminPassword) {
      throw new AdminSecurityError('認証情報が設定されていません');
    }

    return username === adminUsername && password === adminPassword;
  }

  /**
   * 入力値のサニタイズ
   */
  sanitizeInput(input: string): string {
    // SQLインジェクション対策：基本的な危険な文字列を除去
    return input
      .replace(/[';\\]/g, '')  // セミコロンとバックスラッシュを除去
      .replace(/--/g, '')      // SQLコメントを除去
      .replace(/\/\*/g, '')    // SQLブロックコメント開始を除去
      .replace(/\*\//g, '')    // SQLブロックコメント終了を除去
      .replace(/DROP\s+TABLE/gi, '') // DROP TABLE文を除去
      .replace(/DELETE\s+FROM/gi, '') // DELETE FROM文を除去
      .replace(/UPDATE\s+SET/gi, '')  // UPDATE SET文を除去
      .trim();
  }
}