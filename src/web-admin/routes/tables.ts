/**
 * テーブル関連ルーティング
 */

import { Router } from 'express';
import { AdminService } from '../services/adminService';
import { SecurityService } from '../services/securityService';

export function createTableRoutes(adminService: AdminService, securityService: SecurityService): Router {
  const router = Router();

  // テーブル一覧
  router.get('/', async (req, res) => {
    try {
      const tables = await adminService.getTableList();
      const environment = securityService.getEnvironment();

      res.render('table-list', {
        title: 'Table List',
        tables,
        environment,
        basePath: req.app.locals.basePath || '',
        supportedTimezones: ['Asia/Tokyo', 'Asia/Kolkata', 'UTC'],
        adminTimezone: 'Asia/Tokyo'
      });
    } catch (error) {
      console.error('Table list error:', error);
      res.status(500).render('error', {
        title: 'Error',
        message: 'テーブル一覧の読み込みに失敗しました',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // テーブル詳細
  router.get('/:tableName', async (req, res) => {
    try {
      const { tableName } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const userId = req.query.userId as string;
      const dateFrom = req.query.dateFrom as string;
      const dateTo = req.query.dateTo as string;
      const status = req.query.status as string;

      if (!securityService.validateTableName(tableName)) {
        return res.status(400).render('error', {
          title: 'Error',
          message: '許可されていないテーブル名です',
          error: `Table: ${tableName}`
        });
      }

      const environment = securityService.getEnvironment();
      
      // 検索条件があれば検索、なければ通常取得
      const hasFilters = userId || dateFrom || dateTo || status;
      let result;

      if (hasFilters) {
        const filters = {
          userId: userId ? securityService.sanitizeInput(userId) : undefined,
          dateFrom: dateFrom ? securityService.sanitizeInput(dateFrom) : undefined,
          dateTo: dateTo ? securityService.sanitizeInput(dateTo) : undefined,
          status: status ? securityService.sanitizeInput(status) : undefined
        };
        result = await adminService.searchTableData(tableName, filters, { page, limit });
      } else {
        result = await adminService.getTableData(tableName, { page, limit });
      }

      const tableInfo = (await adminService.getTableList()).find(t => t.name === tableName);

      res.render('table-detail', {
        title: `${tableInfo?.description || tableName} - Table Detail`,
        tableName,
        tableInfo,
        data: result.data,
        count: result.count,
        pagination: result.pagination,
        environment,
        basePath: req.app.locals.basePath || '',
        supportedTimezones: ['Asia/Tokyo', 'Asia/Kolkata', 'UTC'],
        adminTimezone: 'Asia/Tokyo',
        filters: {
          userId: userId || '',
          dateFrom: dateFrom || '',
          dateTo: dateTo || '',
          status: status || ''
        }
      });
    } catch (error) {
      console.error('Table detail error:', error);
      res.status(500).render('error', {
        title: 'Error',
        message: 'テーブル詳細の読み込みに失敗しました',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  return router;
}