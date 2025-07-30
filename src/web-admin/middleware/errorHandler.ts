/**
 * エラーハンドリングミドルウェア
 */

import { Request, Response, NextFunction } from 'express';
import { AdminError, AdminSecurityError, AdminValidationError, AdminDatabaseError } from '../types/admin';
import { logger } from '../../utils/logger';

export function errorHandler(
  error: Error | AdminError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  logger.error('WEB_ADMIN', 'Admin Web App Error:', error as Error);

  // AdminErrorインターface実装チェック
  if (isAdminError(error)) {
    res.status(error.statusCode).render('error', {
      title: 'Error',
      message: error.message,
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      code: error.code
    });
    return;
  }

  // 未知のエラー
  res.status(500).render('error', {
    title: 'Internal Server Error',
    message: '内部サーバーエラーが発生しました',
    error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    code: 'INTERNAL_ERROR'
  });
}

function isAdminError(error: unknown): error is AdminError {
  return error !== null && 
    typeof error === 'object' && 
    'code' in error && 
    'statusCode' in error && 
    typeof (error as Record<string, unknown>).code === 'string' && 
    typeof (error as Record<string, unknown>).statusCode === 'number';
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}