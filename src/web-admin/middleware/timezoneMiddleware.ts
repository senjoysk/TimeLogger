/**
 * Web管理アプリ用タイムゾーンミドルウェア
 */

import { Request, Response, NextFunction } from 'express';
import { ITimezoneService } from '../../services/interfaces/ITimezoneService';
import 'express-session';

// Expressのリクエストオブジェクトを拡張
declare global {
  namespace Express {
    interface Request {
      adminTimezone?: string;
      timezoneService?: ITimezoneService;
    }
  }
}

/**
 * Web管理アプリ用タイムゾーンミドルウェア
 */
export function createTimezoneMiddleware(timezoneService: ITimezoneService) {
  return (req: Request, res: Response, next: NextFunction) => {
    // セッションからタイムゾーン設定を取得
    const sessionTimezone = (req as any).session?.adminTimezone as string;
    
    // 管理者表示用タイムゾーンを解決
    req.adminTimezone = timezoneService.getAdminDisplayTimezone(sessionTimezone);
    req.timezoneService = timezoneService;
    
    // EJSテンプレート用のローカル変数を設定
    res.locals.adminTimezone = req.adminTimezone;
    res.locals.supportedTimezones = timezoneService.getSupportedTimezones();
    
    next();
  };
}