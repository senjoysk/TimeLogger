/**
 * ダッシュボードルーティング
 */

import { Router } from 'express';
import { AdminService } from '../services/adminService';
import { SecurityService } from '../services/securityService';

export function createDashboardRoutes(adminService: AdminService, securityService: SecurityService): Router {
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
            console.error(`Error getting summary for table ${table.name}:`, error);
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
        basePath: req.baseUrl || '',
        supportedTimezones: ['Asia/Tokyo', 'Asia/Kolkata', 'UTC'],
        adminTimezone: 'Asia/Tokyo'
      });
    } catch (error) {
      console.error('Dashboard error:', error);
      res.status(500).render('error', {
        title: 'Error',
        message: 'ダッシュボードの読み込みに失敗しました',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  return router;
}