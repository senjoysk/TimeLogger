/**
 * Express用統一エラーハンドリングミドルウェア
 * Web管理機能での冗長なtry-catch処理を削減
 */

import { Request, Response, NextFunction } from 'express';
import { AppError, ErrorHandler } from './errorHandler';
import { logger } from './logger';

/**
 * Express用エラーハンドリングミドルウェア
 * 全てのルートで統一されたエラー処理を提供
 */
export function expressErrorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // ヘッダーが既に送信されている場合は、Expressのデフォルトハンドラに委譲
  if (res.headersSent) {
    return next(error);
  }

  let statusCode = 500;
  let userMessage = 'サーバー内部エラーが発生しました。';

  if (error instanceof AppError) {
    // AppErrorの場合、適切なステータスコードとメッセージを設定
    switch (error.type) {
      case 'VALIDATION':
        statusCode = 400; // Bad Request
        userMessage = error.message;
        break;
      case 'AUTHENTICATION':
        statusCode = 401; // Unauthorized
        userMessage = '認証が必要です。';
        break;
      case 'NOT_FOUND':
        statusCode = 404; // Not Found
        userMessage = error.message;
        break;
      case 'DATABASE':
      case 'API':
      case 'SYSTEM':
      case 'DISCORD':
      case 'TIMEOUT':
      case 'CONFIGURATION':
      case 'NOT_IMPLEMENTED':
      default:
        statusCode = 500; // Internal Server Error
        userMessage = 'サーバー内部エラーが発生しました。';
        break;
    }

    // エラーをログに記録
    ErrorHandler.logError('EXPRESS', `${req.method} ${req.path} - ${error.message}`, error, {
      url: req.url,
      method: req.method,
      userId: req.body?.userId || 'unknown',
      userAgent: req.get('User-Agent')
    });
  } else {
    // 予期しないエラーの場合
    logger.error('EXPRESS', `予期しないエラー: ${req.method} ${req.path}`, error, {
      url: req.url,
      method: req.method,
      userAgent: req.get('User-Agent')
    });
  }

  // JSON形式でエラーレスポンスを返す
  res.status(statusCode).json({
    error: {
      message: userMessage,
      timestamp: new Date().toISOString(),
      path: req.path,
      method: req.method
    }
  });
}

/**
 * 非同期ルートハンドラー用ラッパー
 * async/awaitを使用するルートハンドラーのエラーを自動的にキャッチ
 */
export function asyncHandler<T extends Request = Request, U extends Response = Response>(
  fn: (req: T, res: U, next: NextFunction) => Promise<void>
) {
  return (req: T, res: U, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * API用エラーレスポンス作成ヘルパー
 */
export function createErrorResponse(message: string, statusCode: number = 500) {
  return {
    error: {
      message,
      timestamp: new Date().toISOString(),
      status: statusCode
    }
  };
}

/**
 * 404ハンドラーミドルウェア
 * 存在しないルートにアクセスした場合の処理
 */
export function notFoundHandler(req: Request, res: Response): void {
  logger.warn('EXPRESS', `404 Not Found: ${req.method} ${req.path}`, {
    url: req.url,
    method: req.method,
    userAgent: req.get('User-Agent')
  });

  res.status(404).json(createErrorResponse(
    `ルート ${req.method} ${req.path} が見つかりません。`,
    404
  ));
}