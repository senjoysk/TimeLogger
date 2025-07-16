/**
 * 管理Webアプリケーションのルーティング
 */

import { Router } from 'express';
import { AdminService } from '../services/adminService';
import { SecurityService } from '../services/securityService';
import { createTableRoutes } from './tables';
import { createDashboardRoutes } from './dashboard';
import { createTodoRouter } from './todos';

export function createRoutes(adminService: AdminService, securityService: SecurityService, databasePath: string): Router {
  const router = Router();

  // すべてのレスポンスにbasePathを追加するミドルウェア
  router.use((req, res, next) => {
    res.locals.basePath = req.app.locals.basePath || '';
    next();
  });

  // ダッシュボード
  router.use('/', createDashboardRoutes(adminService, securityService));
  
  // テーブル関連
  router.use('/tables', createTableRoutes(adminService, securityService));
  
  // TODO管理
  router.use('/todos', createTodoRouter(databasePath));

  // ヘルスチェック
  router.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: securityService.getEnvironment()
    });
  });

  return router;
}