/**
 * Web管理アプリ用タイムゾーンAPIルーター（Cookieベース）
 */

import { Router, Request, Response } from 'express';

export function createTimezoneRouter(): Router {
  const router = Router();
  
  const supportedTimezones = ['Asia/Tokyo', 'Asia/Kolkata', 'UTC'];

  /**
   * タイムゾーン設定を更新（Cookieに保存）
   * POST /admin/timezone
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
      if (!supportedTimezones.includes(timezone)) {
        return res.status(400).json({
          success: false,
          error: '無効なタイムゾーンです'
        });
      }

      // Cookieに保存（1年間有効）
      res.cookie('adminTimezone', timezone, {
        maxAge: 365 * 24 * 60 * 60 * 1000, // 1年
        httpOnly: false, // JavaScriptからアクセス可能
        secure: process.env.NODE_ENV === 'production', // HTTPS環境でのみSecure
        sameSite: 'lax',
        path: '/admin'
      });

      console.log(`✅ タイムゾーン設定完了: ${timezone}`);
      
      res.json({
        success: true,
        timezone: timezone,
        message: 'タイムゾーンが更新されました'
      });

    } catch (error) {
      console.error('タイムゾーン更新エラー:', error);
      res.status(500).json({
        success: false,
        error: 'タイムゾーンの更新に失敗しました'
      });
    }
  });

  /**
   * 現在のタイムゾーン設定を取得
   * GET /admin/timezone
   */
  router.get('/timezone', (req: Request, res: Response) => {
    try {
      // Cookieから取得
      const timezone = req.cookies.adminTimezone || 'Asia/Tokyo';
      
      res.json({
        success: true,
        timezone: timezone,
        supportedTimezones: supportedTimezones
      });
    } catch (error) {
      console.error('タイムゾーン取得エラー:', error);
      res.json({
        success: true,
        timezone: 'Asia/Tokyo',
        supportedTimezones: supportedTimezones
      });
    }
  });

  return router;
}