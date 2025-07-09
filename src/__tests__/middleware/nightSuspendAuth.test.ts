/**
 * 夜間サスペンド機能用認証ミドルウェアテスト
 * TDD: Red Phase - 失敗するテストを先に書く
 */

import { Request, Response, NextFunction } from 'express';
import { nightSuspendAuthMiddleware } from '../../middleware/nightSuspendAuth';

// モックタイプ定義
interface MockRequest extends Partial<Request> {
  headers: {
    [key: string]: string | string[] | undefined;
  };
  path: string;
}

interface MockResponse extends Partial<Response> {
  status: jest.Mock;
  json: jest.Mock;
}

describe('🔴 Red Phase: 夜間サスペンド認証ミドルウェア', () => {
  let mockRequest: MockRequest;
  let mockResponse: MockResponse;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      headers: {},
      path: '/api/night-suspend'
    };
    
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    
    mockNext = jest.fn();
    
    // 環境変数をモック
    process.env.SHUTDOWN_TOKEN = 'test-shutdown-token';
    process.env.WAKE_TOKEN = 'test-wake-token';
    process.env.RECOVERY_TOKEN = 'test-recovery-token';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('認証トークンの検証', () => {
    test('Authorizationヘッダーが存在しない場合は401エラーを返す', async () => {
      mockRequest.headers = {};
      
      await nightSuspendAuthMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'No token provided'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('Bearer形式でないトークンの場合は401エラーを返す', async () => {
      mockRequest.headers = {
        authorization: 'Basic invalid-format'
      };
      
      await nightSuspendAuthMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'No token provided'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('無効なトークンの場合は403エラーを返す', async () => {
      mockRequest.headers = {
        authorization: 'Bearer invalid-token'
      };
      
      await nightSuspendAuthMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Invalid token'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('パス別トークン検証', () => {
    test('/api/night-suspend には SHUTDOWN_TOKEN が必要', async () => {
      mockRequest.path = '/api/night-suspend';
      mockRequest.headers = {
        authorization: 'Bearer test-shutdown-token'
      };
      
      await nightSuspendAuthMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    test('/api/wake-up には WAKE_TOKEN が必要', async () => {
      mockRequest.path = '/api/wake-up';
      mockRequest.headers = {
        authorization: 'Bearer test-wake-token'
      };
      
      await nightSuspendAuthMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    test('/api/morning-recovery には RECOVERY_TOKEN が必要', async () => {
      mockRequest.path = '/api/morning-recovery';
      mockRequest.headers = {
        authorization: 'Bearer test-recovery-token'
      };
      
      await nightSuspendAuthMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    test('間違ったトークンを使用した場合は403エラーを返す', async () => {
      mockRequest.path = '/api/night-suspend';
      mockRequest.headers = {
        authorization: 'Bearer test-wake-token'  // 間違ったトークン
      };
      
      await nightSuspendAuthMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Invalid token'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('未知のパスの処理', () => {
    test('未知のパスの場合は403エラーを返す', async () => {
      mockRequest.path = '/api/unknown-path';
      mockRequest.headers = {
        authorization: 'Bearer test-shutdown-token'
      };
      
      await nightSuspendAuthMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Invalid token'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('環境変数の不備', () => {
    test('環境変数が設定されていない場合は403エラーを返す', async () => {
      delete process.env.SHUTDOWN_TOKEN;
      
      mockRequest.path = '/api/night-suspend';
      mockRequest.headers = {
        authorization: 'Bearer test-shutdown-token'
      };
      
      await nightSuspendAuthMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Invalid token'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});