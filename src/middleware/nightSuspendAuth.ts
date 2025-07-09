/**
 * 夜間サスペンド機能用認証ミドルウェア
 * TDD: Green Phase - テストを通すための最小限の実装
 */

import { Request, Response, NextFunction } from 'express';

/**
 * 夜間サスペンド機能用認証ミドルウェア
 * 
 * パスごとに異なる認証トークンを検証：
 * - /api/night-suspend: SHUTDOWN_TOKEN
 * - /api/wake-up: WAKE_TOKEN
 * - /api/morning-recovery: RECOVERY_TOKEN
 */
export const nightSuspendAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Authorizationヘッダーからトークンを取得
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'No token provided'
      });
      return;
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    // パスに応じて必要なトークンを決定
    const pathTokenMap: { [key: string]: string | undefined } = {
      '/api/night-suspend': process.env.SHUTDOWN_TOKEN,
      '/api/wake-up': process.env.WAKE_TOKEN,
      '/api/morning-recovery': process.env.RECOVERY_TOKEN
    };
    
    const requiredToken = pathTokenMap[req.path];
    
    // トークンが一致しない場合は403エラー
    if (!requiredToken || token !== requiredToken) {
      res.status(403).json({
        error: 'Invalid token'
      });
      return;
    }
    
    // 認証成功時は次のミドルウェアに進む
    next();
    
  } catch (error) {
    console.error('認証ミドルウェアエラー:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
};