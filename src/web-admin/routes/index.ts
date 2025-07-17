/**
 * 管理Webアプリケーションのルーティング
 */

import { Router } from 'express';
import { AdminService } from '../services/adminService';
import { SecurityService } from '../services/securityService';
import { createTableRoutes } from './tables';
import { createDashboardRoutes } from './dashboard';
import { createTodoRouter } from './todos';
import { createTimeSimulationRouter } from './timeSimulation';
import { createSummaryTestRouter } from './summaryTest';

export function createRoutes(adminService: AdminService, securityService: SecurityService, databasePath: string, bot?: any): Router {
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

  // 開発ツール（GitHub Issue #37）
  router.use('/tools/api/time-simulation', createTimeSimulationRouter());
  router.use('/tools/api/summary-test', createSummaryTestRouter(bot));

  // 開発ツール管理画面
  router.get('/tools/time-simulation', (req, res) => {
    res.render('time-simulation', { title: '時刻シミュレーション' });
  });

  router.get('/tools/summary-test', (req, res) => {
    res.render('summary-test', { title: 'サマリーテスト' });
  });

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