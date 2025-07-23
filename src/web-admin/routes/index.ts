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
import { createTimezoneRouter } from './timezone';
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

  // タイムゾーンAPI（Cookieベース）
  router.use('/', createTimezoneRouter());

  // 開発ツール（GitHub Issue #37）- Production環境では無効化
  if (securityService.getEnvironment().env !== 'production') {
    router.use('/tools/api/time-simulation', createTimeSimulationRouter(bot));
    router.use('/tools/api/summary-test', createSummaryTestRouter(bot));

    // 開発ツール管理画面
    router.get('/tools/time-simulation', (req, res) => {
      res.render('time-simulation', { 
        title: '時刻シミュレーション',
        environment: securityService.getEnvironment(),
        basePath: req.app.locals.basePath || '',
        supportedTimezones: res.locals.supportedTimezones,
        adminTimezone: res.locals.adminTimezone
      });
    });

    router.get('/tools/summary-test', (req, res) => {
      res.render('summary-test', { 
        title: 'サマリーテスト',
        environment: securityService.getEnvironment(),
        basePath: req.app.locals.basePath || '',
        supportedTimezones: res.locals.supportedTimezones,
        adminTimezone: res.locals.adminTimezone
      });
    });
  } else {
    // Production環境では開発ツールのルートに対して明示的に404を返す
    // 時刻シミュレーションAPI関連のルート
    router.all('/tools/api/time-simulation/current', (_req, res) => {
      res.status(404).json({ error: 'Not Found' });
    });
    router.all('/tools/api/time-simulation/set', (_req, res) => {
      res.status(404).json({ error: 'Not Found' });
    });
    router.all('/tools/api/time-simulation/preset', (_req, res) => {
      res.status(404).json({ error: 'Not Found' });
    });
    router.all('/tools/api/time-simulation/reset', (_req, res) => {
      res.status(404).json({ error: 'Not Found' });
    });
    router.all('/tools/api/time-simulation/presets', (_req, res) => {
      res.status(404).json({ error: 'Not Found' });
    });
    router.all('/tools/api/time-simulation/timezones', (_req, res) => {
      res.status(404).json({ error: 'Not Found' });
    });
    router.all('/tools/api/time-simulation/reminder-test/users', (_req, res) => {
      res.status(404).json({ error: 'Not Found' });
    });
    router.all('/tools/api/time-simulation/reminder-test/send', (_req, res) => {
      res.status(404).json({ error: 'Not Found' });
    });
    
    // サマリーテストAPI関連のルート
    router.all('/tools/api/summary-test/status', (_req, res) => {
      res.status(404).json({ error: 'Not Found' });
    });
    
    // 開発ツール管理画面
    router.get('/tools/time-simulation', (_req, res) => {
      res.status(404).json({ 
        error: 'Not Found',
        message: 'このページは見つかりません'
      });
    });
    router.get('/tools/summary-test', (_req, res) => {
      res.status(404).json({ 
        error: 'Not Found',
        message: 'このページは見つかりません'
      });
    });
  }

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