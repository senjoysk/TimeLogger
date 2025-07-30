/**
 * Web管理アプリ用タイムゾーンミドルウェア（Cookieベース）
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../../utils/logger';

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
      
      logger.debug('WEB_ADMIN', `[TimezoneMiddleware] Cookie timezone: ${adminTimezone}`);
      
      // リクエストとレスポンスローカル変数に設定
      req.adminTimezone = adminTimezone;
      res.locals.adminTimezone = adminTimezone;
      res.locals.supportedTimezones = ['Asia/Tokyo', 'Asia/Kolkata', 'UTC'];
      
      next();
    } catch (error) {
      logger.error('WEB_ADMIN', 'タイムゾーンミドルウェアエラー:', error as Error);
      
      // エラー時のフォールバック
      const fallbackTimezone = 'Asia/Tokyo';
      req.adminTimezone = fallbackTimezone;
      res.locals.adminTimezone = fallbackTimezone;
      res.locals.supportedTimezones = ['Asia/Tokyo', 'Asia/Kolkata', 'UTC'];
      
      next();
    }
  };
}