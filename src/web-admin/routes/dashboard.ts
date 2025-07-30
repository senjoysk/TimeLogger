/**
 * ダッシュボードルーティング
 */

import { Router } from 'express';
import { logger } from '../../utils/logger';
import { AdminService } from '../services/adminService';
import { IAdminService } from '../interfaces/adminInterfaces';
import { SecurityService, ISecurityService } from '../services/securityService';

export function createDashboardRoutes(adminService: IAdminService, securityService: ISecurityService): Router {
  const router = Router();

  // ダッシュボード表示
  router.get('/', async (req, res) => {
    try {
      const tables = await adminService.getTableList();
      const environment = securityService.getEnvironment();
      
      // 各テーブルの概要統計を取得
      const tableSummaries = await Promise.all(
        tables.map(async (table) => {
          try {
            const summary = await adminService.getTableSummary(table.name);
            return {
              ...table,
              ...summary
            };
          } catch (error) {
            logger.error('WEB_ADMIN', `Error getting summary for table ${table.name}:`, error);
            return {
              ...table,
              totalCount: 0,
              error: true
            };
          }
        })
      );

      res.render('dashboard', {
        title: 'TimeLogger Admin Dashboard',
        tables: tableSummaries,
        environment,
        basePath: req.app.locals.basePath || '',
        supportedTimezones: res.locals.supportedTimezones,
        adminTimezone: res.locals.adminTimezone
      });
    } catch (error) {
      logger.error('WEB_ADMIN', 'Dashboard error:', error);
      res.status(500).render('error', {
        title: 'Error',
        message: 'ダッシュボードの読み込みに失敗しました',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  return router;
}