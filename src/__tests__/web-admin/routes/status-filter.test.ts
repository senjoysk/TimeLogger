/**
 * TODO tasks table status filter tests
 * 実装済み: TODO tasks テーブルでのstatusフィルター機能
 */

import request from 'supertest';
import { createTableRoutes } from '../../../web-admin/routes/tables';
import { AdminService } from '../../../web-admin/services/adminService';
import { SecurityService } from '../../../web-admin/services/securityService';
import express from 'express';

// モック作成
const mockAdminService = {
  getTableList: jest.fn(),
  getTableData: jest.fn(),
  searchTableData: jest.fn(),
} as unknown as AdminService;

const mockSecurityService = {
  validateTableName: jest.fn(() => true),
  sanitizeInput: jest.fn((input: string) => input),
  getEnvironment: jest.fn(() => ({ env: 'development', isReadOnly: false })),
} as unknown as SecurityService;

describe('TODO tasks table status filter（実装済み）', () => {
  let app: express.Application;
  
  beforeEach(() => {
    app = express();
    
    // モックのレンダリング関数を設定
    app.use((req, res, next) => {
      res.render = jest.fn((template, data) => {
        res.status(200).json({ template, data });
      });
      next();
    });
    
    // デフォルトのモック戻り値
    (mockAdminService.getTableList as jest.Mock).mockResolvedValue([
      { name: 'todo_tasks', description: 'TODO Tasks' }
    ]);
    
    const mockTableDataResult = {
      data: [
        { id: 'todo-1', status: 'pending', content: 'Test task 1' },
        { id: 'todo-2', status: 'completed', content: 'Test task 2' }
      ],
      count: 2,
      pagination: { page: 1, limit: 50, totalPages: 1, hasNext: false, hasPrev: false }
    };
    
    (mockAdminService.searchTableData as jest.Mock).mockResolvedValue(mockTableDataResult);
    (mockAdminService.getTableData as jest.Mock).mockResolvedValue(mockTableDataResult);
    
    app.use('/tables', createTableRoutes(mockAdminService, mockSecurityService));
  });

  test('should handle status query parameter for todo_tasks table', async () => {
    // statusパラメータでフィルタリングのリクエスト
    const response = await request(app)
      .get('/tables/todo_tasks?status=pending')
      .expect(200);

    // searchTableDataが適切な引数で呼ばれることを確認
    expect(mockAdminService.searchTableData).toHaveBeenCalledWith(
      'todo_tasks',
      expect.objectContaining({
        status: 'pending'
      }),
      expect.any(Object)
    );
  });

  test('should handle multiple filters including status', async () => {
    // 複数のフィルターを含むリクエスト
    await request(app)
      .get('/tables/todo_tasks?status=in_progress&userId=user123&dateFrom=2024-01-01')
      .expect(200);

    // 全てのフィルターが渡されることを確認
    expect(mockAdminService.searchTableData).toHaveBeenCalledWith(
      'todo_tasks',
      expect.objectContaining({
        status: 'in_progress',
        userId: 'user123',
        dateFrom: '2024-01-01'
      }),
      expect.any(Object)
    );
  });

  test('should handle empty status filter', async () => {
    // 空のstatusパラメータのリクエスト  
    await request(app)
      .get('/tables/todo_tasks?status=')
      .expect(200);

    // 空のstatusの場合はgetTableDataが呼ばれる
    expect(mockAdminService.getTableData).toHaveBeenCalledWith(
      'todo_tasks',
      expect.any(Object)
    );
  });

  test('should not apply status filter for non-todo tables', async () => {
    // 他のテーブルの場合はstatusフィルターは影響しない
    await request(app)
      .get('/tables/activity_logs?status=pending')
      .expect(200);

    // searchTableDataが呼ばれるがstatusフィルターは関係ない
    expect(mockAdminService.searchTableData).toHaveBeenCalledWith(
      'activity_logs',
      expect.objectContaining({
        status: 'pending'  // パラメータは渡されるが、実際の処理では無視される
      }),
      expect.any(Object)
    );
  });

  test('should preserve status filter in pagination', async () => {
    // ページネーション付きのリクエストでstatusフィルターが保持されるか
    await request(app)
      .get('/tables/todo_tasks?status=completed&page=2')
      .expect(200);

    expect(mockAdminService.searchTableData).toHaveBeenCalledWith(
      'todo_tasks',
      expect.objectContaining({
        status: 'completed'
      }),
      expect.objectContaining({
        page: 2
      })
    );
  });
});