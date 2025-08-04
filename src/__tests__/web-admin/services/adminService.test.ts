/**
 * AdminService単体テスト
 * TDD Red Phase: 失敗するテストから開始
 */

import { AdminService } from '../../../web-admin/services/adminService';
import { IAdminRepository } from '../../../web-admin/interfaces/adminInterfaces';

describe('AdminService', () => {
  let adminService: AdminService;
  let mockRepository: jest.Mocked<IAdminRepository>;

  beforeEach(() => {
    mockRepository = {
      getTableNames: jest.fn(),
      getTableCount: jest.fn(),
      getTableData: jest.fn(),
      searchTableData: jest.fn(),
      getTableSchema: jest.fn(),
      // TODO管理メソッド
      createTodoTask: jest.fn(),
      updateTodoTask: jest.fn(),
      deleteTodoTask: jest.fn(),
      getTodoTaskById: jest.fn(),
      bulkUpdateTodoStatus: jest.fn(),
      bulkDeleteTodos: jest.fn(),
      getTodosByUserId: jest.fn(),
      getOverdueTodos: jest.fn(),
      bulkCreateTodos: jest.fn(),
    } as jest.Mocked<IAdminRepository>;
    
    adminService = new AdminService(mockRepository);
  });

  describe('getTableList', () => {
    test('全テーブル一覧を取得できる', async () => {
      // 期待するテーブル一覧
      const expectedTables = [
        { name: 'activity_logs', description: '活動ログテーブル' },
        { name: 'user_settings', description: 'ユーザー設定テーブル' },
        { name: 'daily_analysis_cache', description: '分析結果キャッシュテーブル' },
        { name: 'todo_tasks', description: 'TODOタスクテーブル' },
        { name: 'message_classifications', description: 'メッセージ分類履歴テーブル' }
      ];

      const result = await adminService.getTableList();
      expect(result).toEqual(expectedTables);
    });
  });

  describe('getTableData', () => {
    test('activity_logsテーブルのデータを取得できる', async () => {
      const mockData = [
        { id: '1', user_id: 'user1', content: 'テスト活動', created_at: '2024-01-01' },
        { id: '2', user_id: 'user2', content: 'テスト活動2', created_at: '2024-01-02' }
      ];

      mockRepository.getTableData.mockResolvedValue(mockData);
      mockRepository.getTableCount.mockResolvedValue(2);

      const result = await adminService.getTableData('activity_logs');
      expect(result.data).toEqual(mockData);
      expect(result.count).toBe(2);
    });

    test('ページネーション機能が動作する', async () => {
      const mockData = Array.from({ length: 50 }, (_, i) => ({
        id: `${i + 1}`,
        user_id: `user${i + 1}`,
        content: `テスト活動${i + 1}`,
        created_at: `2024-01-${String(i + 1).padStart(2, '0')}`
      }));

      mockRepository.getTableData.mockResolvedValue(mockData);
      mockRepository.getTableCount.mockResolvedValue(100);

      const result = await adminService.getTableData('activity_logs', { page: 1, limit: 50 });
      expect(result.data).toHaveLength(50);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(50);
    });

    test('不正なテーブル名の場合エラーを投げる', async () => {
      await expect(adminService.getTableData('invalid_table')).rejects.toThrow('許可されていないテーブル名です');
    });
  });

  describe('getTableSummary', () => {
    test('テーブル概要統計を取得できる', async () => {
      mockRepository.getTableCount.mockResolvedValue(100);

      const result = await adminService.getTableSummary('activity_logs');
      expect(result.tableName).toBe('activity_logs');
      expect(result.totalCount).toBe(100);
    });
  });

  describe('searchTableData', () => {
    test('user_idでフィルタリングできる', async () => {
      const mockData = [
        { id: '1', user_id: 'user1', content: 'テスト活動' }
      ];

      mockRepository.searchTableData.mockResolvedValue(mockData);

      const result = await adminService.searchTableData('activity_logs', { userId: 'user1' });
      expect(result.data).toEqual(mockData);
    });

    test('日付範囲でフィルタリングできる', async () => {
      const mockData = [
        { id: '1', user_id: 'user1', content: 'テスト活動', created_at: '2024-01-01' }
      ];

      mockRepository.searchTableData.mockResolvedValue(mockData);

      const result = await adminService.searchTableData('activity_logs', { 
        dateFrom: '2024-01-01',
        dateTo: '2024-01-31'
      });
      expect(result.data).toEqual(mockData);
    });
  });
});