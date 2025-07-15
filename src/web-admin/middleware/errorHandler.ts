/**
 * エラーハンドリングミドルウェア
 */

import { Request, Response, NextFunction } from 'express';
import { AdminError, AdminSecurityError, AdminValidationError, AdminDatabaseError } from '../types/admin';

export function errorHandler(
  error: Error | AdminError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  console.error('Admin Web App Error:', error);

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

function isAdminError(error: any): error is AdminError {
  return error && typeof error.code === 'string' && typeof error.statusCode === 'number';
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}