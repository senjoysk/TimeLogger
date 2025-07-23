/**
 * Web管理アプリ用タイムゾーンミドルウェア（Cookieベース）
 */

import { Request, Response, NextFunction } from 'express';

// Expressのリクエストオブジェクトを拡張
declare global {
  namespace Express {
    interface Request {
      adminTimezone?: string;
    }
  }
}

/**
 * Cookieベースのタイムゾーンミドルウェア
 * シンプルにCookieから値を取得し、res.localsに設定
 */
export function createTimezoneMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Cookieからタイムゾーンを取得（デフォルト: Asia/Tokyo）
      const adminTimezone = req.cookies.adminTimezone || 'Asia/Tokyo';
      
      console.log(`[TimezoneMiddleware] Cookie timezone: ${adminTimezone}`);
      
      // リクエストとレスポンスローカル変数に設定
      req.adminTimezone = adminTimezone;
      res.locals.adminTimezone = adminTimezone;
      res.locals.supportedTimezones = ['Asia/Tokyo', 'Asia/Kolkata', 'UTC'];
      
      next();
    } catch (error) {
      console.error('タイムゾーンミドルウェアエラー:', error);
      
      // エラー時のフォールバック
      const fallbackTimezone = 'Asia/Tokyo';
      req.adminTimezone = fallbackTimezone;
      res.locals.adminTimezone = fallbackTimezone;
      res.locals.supportedTimezones = ['Asia/Tokyo', 'Asia/Kolkata', 'UTC'];
      
      next();
    }
  };
}