/**
 * Web管理アプリ用タイムゾーンAPIルーター
 */

import { Router, Request, Response } from 'express';
import 'express-session';
// Express Request型の拡張を読み込み
import '../middleware/timezoneMiddleware';

export function createTimezoneRouter(): Router {
  const router = Router();

  /**
   * タイムゾーン設定を更新
   * POST /admin/api/timezone
   */
  router.post('/timezone', (req: Request, res: Response) => {
    try {
      const { timezone } = req.body;

      if (!timezone) {
        return res.status(400).json({
          success: false,
          error: 'タイムゾーンが指定されていません'
        });
      }

      // タイムゾーンの妥当性を検証
      if (!req.timezoneService?.validateTimezone(timezone)) {
        return res.status(400).json({
          success: false,
          error: '無効なタイムゾーンです'
        });
      }

      // セッションにタイムゾーンを保存
      (req as any).session!.adminTimezone = timezone;

      res.json({
        success: true,
        timezone: timezone,
        message: 'タイムゾーンが更新されました'
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'タイムゾーンの更新に失敗しました'
      });
    }
  });

  /**
   * 現在のタイムゾーン設定を取得
   * GET /admin/api/timezone
   */
  router.get('/timezone', (req: Request, res: Response) => {
    res.json({
      success: true,
      timezone: req.adminTimezone,
      supportedTimezones: req.timezoneService?.getSupportedTimezones()
    });
  });

  return router;
}