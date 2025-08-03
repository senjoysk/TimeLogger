/**
 * SecurityService単体テスト
 * TDD Red Phase: 失敗するテストから開始
 */

import { SecurityService } from '../../../web-admin/services/securityService';
import { AdminEnvironment } from '../../../web-admin/types/admin';

describe('SecurityService', () => {
  let securityService: SecurityService;

  beforeEach(() => {
    securityService = new SecurityService();
  });

  describe('getEnvironment', () => {
    test('development環境では書き込み操作が許可される', () => {
      process.env.NODE_ENV = 'development';
      
      const env = securityService.getEnvironment();
      expect(env.env).toBe('development');
      expect(env.isReadOnly).toBe(false);
      expect(env.allowedOperations).toContain('write');
    });

    test('production環境では読み取り専用になる', () => {
      process.env.NODE_ENV = 'production';
      
      const env = securityService.getEnvironment();
      expect(env.env).toBe('production');
      expect(env.isReadOnly).toBe(true);
      expect(env.allowedOperations).not.toContain('write');
    });

    test('staging環境では書き込み操作が許可される', () => {
      process.env.NODE_ENV = 'staging';
      
      const env = securityService.getEnvironment();
      expect(env.env).toBe('staging');
      expect(env.isReadOnly).toBe(false);
      expect(env.allowedOperations).toContain('write');
    });
  });

  describe('validateOperation', () => {
    test('development環境では書き込み操作が許可される', () => {
      process.env.NODE_ENV = 'development';
      
      const isAllowed = securityService.validateOperation('write');
      expect(isAllowed).toBe(true);
    });

    test('production環境では書き込み操作が拒否される', () => {
      process.env.NODE_ENV = 'production';
      
      const isAllowed = securityService.validateOperation('write');
      expect(isAllowed).toBe(false);
    });

    test('全環境で読み取り操作は許可される', () => {
      ['development', 'staging', 'production'].forEach(env => {
        process.env.NODE_ENV = env;
        
        const isAllowed = securityService.validateOperation('read');
        expect(isAllowed).toBe(true);
      });
    });
  });

  describe('validateTableName', () => {
    test('許可されたテーブル名は有効', () => {
      const validTables = [
        'activity_logs',
        'user_settings',
        'daily_analysis_cache',
        'todo_tasks',
        'message_classifications',
        'timezone_change_notifications'
      ];

      validTables.forEach(tableName => {
        expect(securityService.validateTableName(tableName)).toBe(true);
      });
    });

    test('許可されていないテーブル名は無効', () => {
      const invalidTables = [
        'sqlite_master',
        'invalid_table',
        'DROP TABLE',
        'users',
        'passwords'
      ];

      invalidTables.forEach(tableName => {
        expect(securityService.validateTableName(tableName)).toBe(false);
      });
    });
  });

  describe('validateAuth', () => {
    test('正しい認証情報では認証成功', () => {
      process.env.ADMIN_USERNAME = 'admin';
      process.env.ADMIN_PASSWORD = 'password';
      
      const isValid = securityService.validateAuth('admin', 'password');
      expect(isValid).toBe(true);
    });

    test('間違った認証情報では認証失敗', () => {
      process.env.ADMIN_USERNAME = 'admin';
      process.env.ADMIN_PASSWORD = 'password';
      
      const isValid = securityService.validateAuth('wrong', 'credentials');
      expect(isValid).toBe(false);
    });

    test('認証情報が未設定の場合はエラー', () => {
      delete process.env.ADMIN_USERNAME;
      delete process.env.ADMIN_PASSWORD;
      
      expect(() => securityService.validateAuth('user', 'pass')).toThrow('認証情報が設定されていません');
    });
  });

  describe('sanitizeInput', () => {
    test('SQLインジェクション攻撃を防御', () => {
      const maliciousInput = "'; DROP TABLE users; --";
      const sanitized = securityService.sanitizeInput(maliciousInput);
      expect(sanitized).not.toContain('DROP TABLE');
    });

    test('通常の入力は正常に処理', () => {
      const normalInput = 'user123';
      const sanitized = securityService.sanitizeInput(normalInput);
      expect(sanitized).toBe('user123');
    });
  });
});