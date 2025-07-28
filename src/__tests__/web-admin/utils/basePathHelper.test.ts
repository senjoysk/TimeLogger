/**
 * basePathヘルパー関数のテスト
 * 既存の実装パターン `req.app.locals.basePath || ''` の動作を検証
 */

describe('Test Setup', () => {
  test('環境設定が正しく行われている', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });
});

describe('basePath実装パターンのテスト', () => {
  /**
   * 既存コードで使用されているbasePathパターンをシミュレート
   */
  function getBasePath(mockReq: any): string {
    return mockReq?.app?.locals?.basePath || '';
  }

  /**
   * 既存コードで使用されているURL生成パターンをシミュレート
   */
  function generateActionUrl(path: string, mockReq: any): string {
    const basePath = getBasePath(mockReq);
    return `${basePath}${path}`;
  }

  describe('req.app.locals.basePath || "" パターン', () => {
    test('basePathが空文字列の場合', () => {
      const mockReq = {
        app: {
          locals: {
            basePath: ''
          }
        }
      };
      
      expect(getBasePath(mockReq)).toBe('');
      expect(generateActionUrl('/todos', mockReq)).toBe('/todos');
      expect(generateActionUrl('/todos/1', mockReq)).toBe('/todos/1');
    });

    test('basePathが/adminの場合', () => {
      const mockReq = {
        app: {
          locals: {
            basePath: '/admin'
          }
        }
      };
      
      expect(getBasePath(mockReq)).toBe('/admin');
      expect(generateActionUrl('/todos', mockReq)).toBe('/admin/todos');
      expect(generateActionUrl('/todos/1', mockReq)).toBe('/admin/todos/1');
    });

    test('basePathが設定されていない場合は空文字列', () => {
      const mockReq = {
        app: {
          locals: {}
        }
      };
      
      expect(getBasePath(mockReq)).toBe('');
      expect(generateActionUrl('/todos', mockReq)).toBe('/todos');
    });

    test('app.localsが存在しない場合は空文字列', () => {
      const mockReq = {
        app: {}
      };
      
      expect(getBasePath(mockReq)).toBe('');
      expect(generateActionUrl('/health', mockReq)).toBe('/health');
    });

    test('appが存在しない場合は空文字列', () => {
      const mockReq = {};
      
      expect(getBasePath(mockReq)).toBe('');
      expect(generateActionUrl('/health', mockReq)).toBe('/health');
    });
  });

  describe('実際の使用ケースシミュレーション', () => {
    test('TODO作成フォームのaction属性生成', () => {
      // AdminServer単体 (basePath = '')
      const adminReq = { app: { locals: { basePath: '' } } };
      expect(generateActionUrl('/todos', adminReq)).toBe('/todos');
      
      // IntegratedServer (basePath = '/admin')
      const integratedReq = { app: { locals: { basePath: '/admin' } } };
      expect(generateActionUrl('/todos', integratedReq)).toBe('/admin/todos');
    });

    test('TODO編集フォームのaction属性生成', () => {
      const todoId = '123';
      
      // AdminServer単体
      const adminReq = { app: { locals: { basePath: '' } } };
      expect(generateActionUrl(`/todos/${todoId}`, adminReq)).toBe('/todos/123');
      
      // IntegratedServer
      const integratedReq = { app: { locals: { basePath: '/admin' } } };
      expect(generateActionUrl(`/todos/${todoId}`, integratedReq)).toBe('/admin/todos/123');
    });

    test('TODO削除フォームのaction属性生成', () => {
      const todoId = '123';
      
      // AdminServer単体
      const adminReq = { app: { locals: { basePath: '' } } };
      expect(generateActionUrl(`/todos/${todoId}/delete`, adminReq)).toBe('/todos/123/delete');
      
      // IntegratedServer
      const integratedReq = { app: { locals: { basePath: '/admin' } } };
      expect(generateActionUrl(`/todos/${todoId}/delete`, integratedReq)).toBe('/admin/todos/123/delete'); 
    });

    test('リダイレクト先URL生成', () => {
      // TODO作成後のリダイレクト
      const adminReq = { app: { locals: { basePath: '' } } };
      const integratedReq = { app: { locals: { basePath: '/admin' } } };
      
      expect(generateActionUrl('/todos', adminReq)).toBe('/todos');
      expect(generateActionUrl('/todos', integratedReq)).toBe('/admin/todos');
    });

    test('ナビゲーションリンク生成', () => {
      const adminReq = { app: { locals: { basePath: '' } } };
      const integratedReq = { app: { locals: { basePath: '/admin' } } };
      
      // ダッシュボードリンク
      expect(generateActionUrl('/', adminReq)).toBe('/');
      expect(generateActionUrl('/', integratedReq)).toBe('/admin/');
      
      // テーブル一覧リンク
      expect(generateActionUrl('/tables', adminReq)).toBe('/tables');
      expect(generateActionUrl('/tables', integratedReq)).toBe('/admin/tables');
      
      // TODO管理リンク
      expect(generateActionUrl('/todos', adminReq)).toBe('/todos');
      expect(generateActionUrl('/todos', integratedReq)).toBe('/admin/todos');
    });

    test('開発ツールのリンク生成', () => {
      const adminReq = { app: { locals: { basePath: '' } } };
      const integratedReq = { app: { locals: { basePath: '/admin' } } };
      
      // 時刻シミュレーション
      expect(generateActionUrl('/tools/time-simulation', adminReq)).toBe('/tools/time-simulation');
      expect(generateActionUrl('/tools/time-simulation', integratedReq)).toBe('/admin/tools/time-simulation');
      
      // サマリーテスト
      expect(generateActionUrl('/tools/summary-test', adminReq)).toBe('/tools/summary-test');
      expect(generateActionUrl('/tools/summary-test', integratedReq)).toBe('/admin/tools/summary-test');
    });

    test('API URL生成（JavaScript内での使用）', () => {
      const adminReq = { app: { locals: { basePath: '' } } };
      const integratedReq = { app: { locals: { basePath: '/admin' } } };
      
      // サマリーテストAPI
      expect(generateActionUrl('/tools/api/summary-test/status', adminReq)).toBe('/tools/api/summary-test/status');
      expect(generateActionUrl('/tools/api/summary-test/status', integratedReq)).toBe('/admin/tools/api/summary-test/status');
      
      // 時刻シミュレーションAPI
      expect(generateActionUrl('/tools/api/time-simulation/current', adminReq)).toBe('/tools/api/time-simulation/current');
      expect(generateActionUrl('/tools/api/time-simulation/current', integratedReq)).toBe('/admin/tools/api/time-simulation/current');
    });
  });

  describe('エッジケースとエラーハンドリング', () => {
    test('nullやundefinedでもエラーにならない', () => {
      expect(() => getBasePath(null)).not.toThrow();
      expect(() => getBasePath(undefined)).not.toThrow();
      expect(getBasePath(null)).toBe('');
      expect(getBasePath(undefined)).toBe('');
    });

    test('異常なbasePathでも処理できる', () => {
      const mockReq = {
        app: {
          locals: {
            basePath: '/admin/'  // 末尾にスラッシュ
          }
        }
      };
      
      // 既存の実装では末尾スラッシュはそのまま結合される（これは現在の実装の動作）
      expect(generateActionUrl('/todos', mockReq)).toBe('/admin//todos');
    });

    test('空のpathでも処理できる', () => {
      const adminReq = { app: { locals: { basePath: '' } } };
      const integratedReq = { app: { locals: { basePath: '/admin' } } };
      
      expect(generateActionUrl('', adminReq)).toBe('');
      expect(generateActionUrl('', integratedReq)).toBe('/admin');
    });
  });

  describe('パフォーマンステスト', () => {
    test('大量のURL生成が高速に処理される', () => {
      const mockReq = { app: { locals: { basePath: '/admin' } } };
      const start = Date.now();
      
      // 10000回のURL生成をテスト
      for (let i = 0; i < 10000; i++) {
        generateActionUrl(`/todos/${i}`, mockReq);
      }
      
      const duration = Date.now() - start;
      
      // 100ms以内に完了することを確認（十分高速）
      expect(duration).toBeLessThan(100);
    });
  });
});